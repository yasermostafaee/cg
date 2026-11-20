// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConsoleSourceCatalog, SourceDefinition } from '@cg/shared-ipc';
import type {
  AuthSessionState,
  NdiPreviewPacket,
  RuntimeBridge,
} from '../src/shared/runtime-bridge.js';
import { InputThumbnail } from '../src/renderer/features/sources/InputThumbnail.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { paintPvwPlatePictures } from '../src/renderer/features/monitors/pvwPlatePictures.js';
import {
  usePvwSourceFrames,
  type PvwSourceFrame,
} from '../src/renderer/features/monitors/usePvwSourceFrames.js';
import type { PlatePlacement } from '../src/renderer/features/monitors/livePlateGeometry.js';
import {
  LiveInputCheckProvider,
  useInputCheckSurface,
} from '../src/renderer/features/monitors/liveInputCheckContext.js';

vi.mock('../src/renderer/hooks/useLink.js', () => ({ useLink: () => 'live' }));
vi.mock('../src/renderer/hooks/useCanOperate.js', () => ({ useCanOperate: () => true }));
vi.mock('../src/renderer/hooks/useAuthSession.js', () => ({
  useAuthSession: () => ({ kind: 'signed-in' }),
}));

const source: SourceDefinition = {
  id: 'in-studio',
  name: 'Studio',
  channels: [1],
  origin: 'input',
  producer: { kind: 'route', channel: 9, layer: 12 },
};
const savedBridge = window.cg;

afterEach(() => {
  window.cg = savedBridge;
  __resetSourcesForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('shares the native sender between PVW and a picker card without requesting Playout picture or audio', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly notify: (entries: { isIntersecting: boolean }[]) => void) {}
      observe(): void {
        this.notify([{ isIntersecting: true }]);
      }
      disconnect(): void {
        // Each test frame stays visible until its card unmounts.
      }
    },
  );
  const decode = vi.fn(async () => ({ width: 640, height: 360, close: vi.fn() }));
  vi.stubGlobal('createImageBitmap', decode);
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const pvw = vi.fn(async () => ({ frames: [] }));
  const thumbnails = vi.fn(async () => ({ frames: [] }));
  const audioLevels = vi.fn(async () => ({ readings: [] }));
  const startOnPlayout = vi.fn();
  const framesOut = { current: undefined as ReadonlyMap<string, PvwSourceFrame> | undefined };
  const origin = vi.fn();
  const picked = vi.fn();
  let send: ((packet: NdiPreviewPacket) => void) | undefined;
  let catalogChanged: ((catalog: ConsoleSourceCatalog) => void) | undefined;
  const authListeners = new Set<(next: AuthSessionState) => void>();
  let senderName = 'MTA (APASAI)';
  let authState: AuthSessionState = {
    kind: 'signed-in',
    principal: {
      sub: 'operator',
      name: 'Operator',
      roles: ['operator'],
      channels: '*',
      expiresAt: '2030-01-01T00:00:00Z',
      nameTruncated: false,
    },
    permittedChannels: [1],
  };
  const close = vi.fn();
  const openNdiStream = vi.fn(
    async (_name: string, subscribe: (packet: NdiPreviewPacket) => void) => {
      send = subscribe;
      return close;
    },
  );
  window.cg = {
    sourcePreviews: {
      pvw,
      thumbnails,
      audioLevels,
      openNdiStream,
      ndiTargets: vi.fn(async () => ({
        targets: [{ sourceId: source.id, kind: 'ndi', senderName, engine: 'B' }],
      })),
    },
    auth: {
      state: () => ({ ...authState }),
      onStateChanged: (listener: (next: AuthSessionState) => void) => {
        authListeners.add(listener);
        return () => {
          authListeners.delete(listener);
        };
      },
    },
    livePreview: { start: startOnPlayout },
    sources: {
      config: async () => ({ sources: [source] }),
      onConfigChanged: (listener: (catalog: ConsoleSourceCatalog) => void) => {
        catalogChanged = listener;
        return () => {
          catalogChanged = undefined;
        };
      },
      assignments: async () => ({ defaults: [], templateDefaults: [] }),
      onAssignmentsChanged: () => () => undefined,
    },
  } as unknown as RuntimeBridge;
  const stopStore = initSources(window.cg);
  function Stage({ visible }: { visible: boolean }): null {
    framesOut.current = usePvwSourceFrames(1, [source.id], visible, 'stage', false, [source.id]);
    return null;
  }
  function Card(): JSX.Element {
    const { inputCheck } = useInputCheckSurface(1);
    return createElement(InputThumbnail, {
      source,
      channel: 1,
      meterChannel: 1,
      inputCheck,
      onCheck: () => {
        picked(source.id);
        inputCheck?.start(source);
      },
      onPreviewEngineChange: origin,
    });
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = async (showPicker: boolean, visible: boolean): Promise<void> =>
    act(async () => {
      root.render(
        createElement(
          Fragment,
          null,
          createElement(Stage, { visible }),
          showPicker
            ? createElement(LiveInputCheckProvider, {
                channel: 1,
                locked: false,
                children: createElement(Card),
              })
            : null,
        ),
      );
    });
  try {
    await render(true, true);
    expect(openNdiStream).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Waiting for NDI');
    expect(origin).toHaveBeenLastCalledWith(undefined);
    expect(pvw).not.toHaveBeenCalled();
    expect(thumbnails).not.toHaveBeenCalled();
    expect(audioLevels).not.toHaveBeenCalled();
    await act(async () => {
      send?.({ kind: 'picture', bytes: new Uint8Array([1, 2, 3]) });
      await Promise.resolve();
    });
    expect(decode).toHaveBeenCalledOnce();
    expect(host.querySelector('canvas')?.width).toBe(640);
    expect(host.querySelector('canvas')?.hidden).toBe(false);
    expect(origin).toHaveBeenLastCalledWith('B');
    const select = host.querySelector<HTMLButtonElement>('[aria-label="Select input · Studio"]');
    expect(select).not.toBeNull();
    await act(async () => select?.click());
    expect(picked).toHaveBeenCalledWith(source.id);
    expect(startOnPlayout).not.toHaveBeenCalled();

    const frame = framesOut.current?.get(source.id);
    expect(frame).toMatchObject({
      engine: 'B',
      width: 640,
      height: 360,
      signal: 'present',
      isDirectNdi: true,
    });
    const plate: PlatePlacement = {
      plateId: 'studio',
      elementId: 'studio',
      sourceName: source.name,
      sourceId: source.id,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      cropEdges: true,
    };
    const node = document.createElement('div');
    node.dataset['cgLiveSource'] = plate.plateId;
    document.body.append(node);
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
    try {
      paintPvwPlatePictures(document, [plate], new Map([[source.id, frame!]]));
      expect(node.querySelector('canvas')?.width).toBe(640);
      expect(parseFloat(node.querySelector('canvas')?.style.width ?? '')).toBeCloseTo(177.777);
      await act(async () => {
        const pcm = new Int16Array(4800);
        pcm.fill(16384);
        send?.({ kind: 'audio', bytes: new Uint8Array(pcm.buffer) });
      });
      expect(
        host.querySelector('[data-source-audio-meter="measured"]')?.getAttribute('aria-label'),
      ).toContain('-6 dBFS');
    } finally {
      paintPvwPlatePictures(document, [plate], new Map());
      node.remove();
    }
    await render(false, true);
    expect(close).not.toHaveBeenCalled();
    await act(async () => send?.({ kind: 'no-signal' }));
    expect(framesOut.current?.get(source.id)?.signal).toBe('absent');
    expect(pvw).not.toHaveBeenCalled();
    expect(thumbnails).not.toHaveBeenCalled();
    expect(audioLevels).not.toHaveBeenCalled();
    expect(startOnPlayout).not.toHaveBeenCalled();
    await act(async () => {
      senderName = 'Studio 2 (APASAI)';
      catalogChanged?.({ sources: [source] });
    });
    expect(close).toHaveBeenCalledOnce();
    expect(openNdiStream).toHaveBeenCalledTimes(2);
    expect(openNdiStream.mock.calls[1]?.[0]).toBe(senderName);
    await act(async () => {
      authState = { kind: 'expired', name: 'Operator' };
      for (const listener of authListeners) listener(authState);
    });
    expect(close).toHaveBeenCalledTimes(2);
    expect(framesOut.current?.get(source.id)?.signal).not.toBe('present');
    expect(pvw).not.toHaveBeenCalled();
    expect(thumbnails).not.toHaveBeenCalled();
    expect(audioLevels).not.toHaveBeenCalled();
    await render(false, false);
    expect(close).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    stopStore();
  }
});
