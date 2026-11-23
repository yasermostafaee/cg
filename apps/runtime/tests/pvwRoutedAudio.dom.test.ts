// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LivePreviewHandle, LivePreviewStatus, SourceDefinition } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import {
  LiveInputCheckProvider,
  useInputCheckSurface,
} from '../src/renderer/features/monitors/liveInputCheckContext.js';
import { usePvwRoutedAudio } from '../src/renderer/features/monitors/usePvwRoutedAudio.js';

const source: SourceDefinition = {
  id: 'studio',
  name: 'Studio',
  origin: 'input',
  channels: [1],
  producer: { kind: 'route', channel: 9, layer: 12 },
};
const other = { ...source, id: 'camera', name: 'Camera' };
const priorBridge = window.cg;
const audioUrl = 'https://bridge.test/input-preview/opaque/audio?ticket=ticket';
const handleStatus = (handle: LivePreviewHandle, state: LivePreviewStatus['state']) => ({
  channel: handle.channel,
  previewId: handle.previewId,
  sourceName: 'Studio',
  state,
  dbFs: null,
});
const noSubscription = () => () => undefined;

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
let audio: ReturnType<typeof usePvwRoutedAudio>;
let foreign: ReturnType<typeof useInputCheckSurface>['inputCheck'];
const issued = vi.fn(async () => audioUrl);
const end = vi.fn(async () => ({ ok: true }));
const events: string[] = [];
const schedule = vi.fn();
const close = vi.fn(async () => undefined);

class AudioContextFixture {
  readonly currentTime = 0;
  readonly destination = {};
  readonly close = close;

  async resume(): Promise<void> {
    events.push('resume');
  }

  createBuffer(_count: number, length: number, sampleRate: number) {
    const samples = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => samples };
  }

  createBufferSource() {
    return { connect: () => undefined, start: schedule };
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('AudioContext', AudioContextFixture);
  vi.useFakeTimers();
  vi.clearAllMocks();
  events.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.cg = priorBridge;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function attachBridge(start: (handle: LivePreviewHandle) => Promise<LivePreviewStatus>) {
  window.cg = {
    link: { status: () => 'live', onStatusChanged: noSubscription },
    auth: {
      state: () => ({
        kind: 'signed-in',
        principal: { roles: ['operator'] },
        permittedChannels: [1],
      }),
      onStateChanged: noSubscription,
    },
    fixedLayers: { banks: async () => [], onBanksChanged: noSubscription },
    channelSettings: {
      get: async () => ({ settings: [], observed: [] }),
      onChanged: noSubscription,
    },
    stationChannels: { list: async () => ({ channels: [] }), onChanged: noSubscription },
    lock: { state: async () => ({ engaged: false }), onStateChanged: noSubscription },
    livePreview: {
      start,
      status: async (handle: LivePreviewHandle) => handleStatus(handle, 'ready'),
      stop: end,
      url: issued,
    },
  } as unknown as RuntimeBridge;
}

function installPcm() {
  const wav = new Uint8Array(44 + 2_400 * 4);
  const view = new DataView(wav.buffer);
  view.setUint32(0, 0x52494646);
  view.setUint32(8, 0x57415645);
  view.setUint32(12, 0x666d7420);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 48_000, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461);
  const cancelled = vi.fn();
  const fetchAudio = vi.fn(
    async (_url: string, init: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(wav);
            init.signal?.addEventListener('abort', () => {
              cancelled();
              controller.close();
            });
          },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetchAudio);
  return { cancelled, fetchAudio };
}

function Probe({ enabled }: { enabled: boolean }): null {
  audio = usePvwRoutedAudio(1, enabled);
  foreign = useInputCheckSurface(1).inputCheck;
  return null;
}

async function render(enabled = true) {
  await act(async () =>
    root.render(
      createElement(LiveInputCheckProvider, {
        channel: 1,
        locked: false,
        children: createElement(Probe, { enabled }),
      }),
    ),
  );
}

it('opens only the selected ready input audio and releases it when PVW is hidden', async () => {
  const ready = vi.fn(async (handle: LivePreviewHandle) => {
    events.push('lease');
    return handleStatus(handle, 'connecting');
  });
  attachBridge(ready);
  const { cancelled, fetchAudio } = installPcm();
  await render();
  expect(audio).toMatchObject({ available: true, audible: false, pending: false });
  expect(ready).not.toHaveBeenCalled();

  await act(async () => audio.start(source));
  expect(events).toEqual(['resume', 'lease']);
  expect(audio).toMatchObject({ sourceId: source.id, audible: false, pending: true });
  expect(issued).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(audio).toMatchObject({ sourceId: source.id, audible: true, pending: false });
  const lease = ready.mock.calls[0]?.[0];
  expect(issued.mock.calls).toEqual([[{ channel: 1, previewId: lease?.previewId }, 'audio']]);
  expect(fetchAudio).toHaveBeenCalledTimes(1);
  expect(schedule).toHaveBeenCalledTimes(1);

  await render(false);
  expect(audio).toMatchObject({ available: false, audible: false, pending: false });
  expect(end.mock.calls).toEqual([[{ channel: 1, previewId: lease?.previewId }]]);
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('rejects stale audio readiness and does not stop a different check surface', async () => {
  let late: ((view: LivePreviewStatus) => void) | undefined;
  const start = vi.fn((handle: LivePreviewHandle) =>
    start.mock.calls.length === 1
      ? new Promise<LivePreviewStatus>((resolve) => {
          late = resolve;
        })
      : Promise.resolve(handleStatus(handle, 'ready')),
  );
  attachBridge(start);
  const { fetchAudio } = installPcm();
  await render();
  await act(async () => audio.start(source));
  const first = start.mock.calls[0]?.[0];
  if (first === undefined) throw new Error('No initial input-preview handle was requested.');
  await act(async () => foreign?.start(other));
  const replacement = start.mock.calls[1]?.[0];
  expect(replacement?.previewId).not.toBe(first.previewId);
  expect(audio).toMatchObject({
    sourceId: source.id,
    pending: false,
    audible: false,
    failure: 'The input preview ended.',
  });
  await act(async () => late?.(handleStatus(first, 'ready')));
  expect(issued).not.toHaveBeenCalled();
  expect(fetchAudio).not.toHaveBeenCalled();
  expect(end.mock.calls).toEqual([[{ channel: 1, previewId: first.previewId }]]);
  expect(close).toHaveBeenCalledTimes(1);
});

it('ends the local session when the ready input stops delivering PCM', async () => {
  const start = vi.fn(async (handle: LivePreviewHandle) => handleStatus(handle, 'ready'));
  attachBridge(start);
  const { cancelled } = installPcm();
  await render();
  await act(async () => audio.start(source));
  expect(audio.audible).toBe(true);

  await act(async () => vi.advanceTimersByTimeAsync(2_500));
  expect(audio).toMatchObject({
    sourceId: source.id,
    audible: false,
    pending: false,
    failure: 'The input preview stopped delivering sound.',
  });
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
});
