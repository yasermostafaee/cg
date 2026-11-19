// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConsoleSourceCatalog } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { SourcePicker } from '../src/renderer/features/sources/SourcePicker.js';
import { createMediaThumbnailLoader } from '../src/renderer/features/sources/MediaThumbnail.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { authStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import { closePicker, openPicker } from './support/sourcePicker.js';

const JPEG = 'data:image/jpeg;base64,/9j/';
const catalog: ConsoleSourceCatalog = {
  sources: ['a', 'b'].map((suffix): ConsoleSourceCatalog['sources'][number] => ({
    id: `md-clip-${suffix}`,
    name: `Clip ${suffix}`,
    origin: 'media',
    producer: { kind: 'media', file: `Clips/${suffix}.mov` },
    media: { durationMs: 5000 },
  })),
};
let root: Root;
let host: HTMLElement;
let previous: RuntimeBridge;
let emitCatalog: (next: ConsoleSourceCatalog) => void;
const mediaThumbnail = vi.fn<RuntimeBridge['sources']['mediaThumbnail']>();
const mediaOpen = vi.fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  previous = window.cg;
  mediaThumbnail.mockReset();
  mediaThumbnail.mockResolvedValue({ ok: true, dataUrl: JPEG, engine: 'B' });
  mediaOpen.mockReset();
  const auth = authStub();
  const caps = auth.capabilities();
  window.cg = {
    auth: { ...auth, capabilities: () => ({ ...caps, sourcePresence: true }) },
    link: {
      status: () => 'live',
      bridgeAddress: () => 'station.example.test:5280',
      onStatusChanged: () => () => undefined,
    },
    connections: { onConfigChanged: () => () => undefined },
    sourcePreviews: { mediaOpen },
    sources: {
      config: async () => catalog,
      assignments: async () => ({ assignments: [] }),
      onConfigChanged: (handler: (next: ConsoleSourceCatalog) => void) => {
        emitCatalog = handler;
        return () => undefined;
      },
      onAssignmentsChanged: () => () => undefined,
      refresh: async () => ({ ok: true }),
      mediaSearch: async () => ({
        ok: true,
        items: [{ id: 'md-clip-a', name: 'Clip a', durationMs: 5000 }],
        total: 1,
        nextCursor: null,
      }),
      presence: async ({ sourceIds }: { sourceIds: string[] }) => ({
        engines: ['A', 'B'],
        sources: Object.fromEntries(sourceIds.map((id) => [id, { A: 'present', B: 'present' }])),
      }),
      mediaThumbnail,
    },
  } as unknown as RuntimeBridge;
  __resetSourcesForTest();
  initSources(window.cg);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  clearPortals();
  __resetSourcesForTest();
  window.cg = previous;
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function render(value = 'md-clip-a', inherited = false, channel = 1): Promise<HTMLElement> {
  await act(async () => {
    root.render(
      createElement(SourcePicker, {
        value: inherited ? '' : value,
        channel,
        choices: [{ value: '', label: 'Default', names: value }],
        onChange: () => undefined,
        'aria-label': 'Plate source',
      }),
    );
  });
  await flush();
  return host.querySelector<HTMLElement>('[role="combobox"]')!;
}

function providers(field: HTMLElement): string[] {
  return [...field.querySelectorAll('[data-source-preview-provider]')].map(
    (badge) => badge.getAttribute('data-source-presence-server')!,
  );
}

async function decode(field: HTMLElement): Promise<void> {
  const image = field.querySelector('img');
  expect(image).not.toBeNull();
  await act(async () => image?.dispatchEvent(new Event('load')));
}

it.each([false, true])(
  'does not fetch a closed media binding picture (inherited: %s)',
  async (inherited) => {
    const field = await render('md-clip-a', inherited);
    expect(field.querySelector('img, video, [data-source-audio-meter]')).toBeNull();
    expect(providers(field)).toEqual([]);
    expect(field.querySelectorAll('[data-source-presence-state="present"]')).toHaveLength(2);
    expect(mediaThumbnail).not.toHaveBeenCalled();
    const panel = await openPicker(field);
    expect(panel.querySelector('[data-picker-media="md-clip-a"]')).not.toBeNull();
    const choice = panel.querySelector<HTMLElement>('[data-picker-choice]')!;
    await flush();
    await decode(choice);
    expect(providers(choice)).toEqual(['B']);
    expect(mediaThumbnail).toHaveBeenCalledTimes(1);
    await closePicker();
    expect(providers(field)).toEqual([]);
    expect(mediaOpen).not.toHaveBeenCalled();
  },
);

it('clears the modal poster provider on source, channel and same-id definition changes', async () => {
  const field = await render();
  const panel = await openPicker(field);
  const choice = panel.querySelector<HTMLElement>('[data-picker-choice]')!;
  await flush();
  await decode(choice);
  expect(providers(choice)).toEqual(['B']);
  mediaThumbnail.mockResolvedValue({ ok: true, dataUrl: JPEG, engine: 'A' });
  await render('md-clip-b');
  expect(providers(choice)).toEqual([]);
  await decode(choice);
  expect(providers(choice)).toEqual(['A']);
  await render('md-clip-b', false, 2);
  expect(providers(choice)).toEqual([]);
  await decode(choice);
  expect(providers(choice)).toEqual(['A']);
  await act(async () =>
    emitCatalog({
      ...catalog,
      sources: catalog.sources.map((source) =>
        source.id === 'md-clip-b'
          ? { ...source, producer: { kind: 'media', file: 'Clips/replaced-b.mov' } }
          : source,
      ),
    }),
  );
  await flush();
  expect(providers(choice)).toEqual([]);
  await decode(choice);
  expect(providers(choice)).toEqual(['A']);
  expect(
    mediaThumbnail.mock.calls.map(([request]) => request).filter(({ id }) => id === 'md-clip-b'),
  ).toEqual([
    { id: 'md-clip-b', channel: 1 },
    { id: 'md-clip-b', channel: 2 },
    { id: 'md-clip-b', channel: 2 },
  ]);
});

it('discards a late modal poster from a previous channel and never invents an engine', async () => {
  let late: ((value: { ok: true; dataUrl: string; engine: 'B' }) => void) | undefined;
  mediaThumbnail.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        late = resolve;
      }),
  );
  const field = await render();
  const panel = await openPicker(field);
  const choice = panel.querySelector<HTMLElement>('[data-picker-choice]')!;
  mediaThumbnail.mockResolvedValue({ ok: true, dataUrl: JPEG });
  await render('md-clip-a', false, 2);
  await decode(choice);
  expect(providers(choice)).toEqual([]);
  await act(async () => late?.({ ok: true, dataUrl: JPEG, engine: 'B' }));
  await flush();
  expect(providers(choice)).toEqual([]);
  expect(choice.querySelectorAll('img')).toHaveLength(1);
  await act(async () => choice.querySelector('img')?.dispatchEvent(new Event('error')));
  expect(choice.querySelector('img')).toBeNull();
  expect(providers(choice)).toEqual([]);
});

it('cannot relabel a new B poster when an evicted older A read finishes', async () => {
  let late: ((value: { ok: true; dataUrl: string; engine: 'A' }) => void) | undefined;
  mediaThumbnail.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        late = resolve;
      }),
  );
  const load = createMediaThumbnailLoader(1);
  const old = load('md-clip-a');
  await flush();
  for (let i = 0; i < 64; i++) await load(`md-other-${String(i)}`);
  expect(await load('md-clip-a')).toBe(JPEG);
  expect(load.origin?.('md-clip-a')).toBe('B');
  late?.({ ok: true, dataUrl: JPEG, engine: 'A' });
  expect(await old).toBeNull();
  expect(load.origin?.('md-clip-a')).toBe('B');
  expect(await load('md-clip-a')).toBe(JPEG);
});
