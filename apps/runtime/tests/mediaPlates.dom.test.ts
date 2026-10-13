// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { MediaPlateState, SourceAssignments, SourceCatalog } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LooksBindingsSection } from '../src/renderer/features/inspector/LooksBindingsSection.js';
import { formatRemaining } from '../src/renderer/features/sources/MediaPlayback.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { itemWith, templateWith } from './support/layerRow.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * 🔴 `MEDIA-PLATES-01` §2 — **A CLIP'S `Playback` WHERE IT IS BOUND, AND ITS TRANSPORT ON AN ON-AIR
 * ROW**, in Look inputs.
 *
 * What is pinned is the markup and what reaches the bridge: which plate gets which control, what the
 * panel holds (and, as an ABSENCE, that it holds no prose), the remaining time only when the server
 * reported it, and the verbs a press sends. Every absence has its positive control on the same
 * render. Geometry — the panel hanging from its button, inside the viewport — is the e2e's
 * (`media-plates.spec.ts`), because jsdom has no layout (golden rule 12c).
 */

const PROMO = 'md-m-promo';

const CATALOG: SourceCatalog = {
  sources: [
    {
      id: 'in-studio-1',
      name: 'Studio 1',
      origin: 'input',
      producer: { kind: 'ndi', source: 'S1' },
    },
    {
      id: PROMO,
      name: 'پرومو',
      origin: 'media',
      producer: { kind: 'media', file: 'C:/Media/promo.mp4' },
      media: { durationMs: 30_000, lastBoundAt: '2026-09-28T08:00:00.000Z' },
    },
  ],
  layerRange: { start: 60, end: 79 },
};

/** The owner's case: the input in box 1, the clip in box 2. */
const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'tpl-1', plateId: 'l-1', sourceId: 'in-studio-1' },
    { templateId: 'tpl-1', plateId: 'l-2', sourceId: PROMO },
  ],
};

const rect = (x: number) => ({ x, y: 0, width: 960, height: 1080 });

const TEMPLATE = templateWith({
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      { elementId: 'e1', sourceId: 'l-1', rect: rect(0), dynamic: false },
      { elementId: 'e2', sourceId: 'l-2', rect: rect(960), dynamic: false },
    ],
    looks: [
      {
        id: 'two',
        name: '2-box',
        entered: { mode: 'cut' },
        rects: { 'l-1': rect(0), 'l-2': rect(960) },
      },
    ],
    defaultLookId: 'two',
  },
} as Partial<Parameters<typeof templateWith>[0]>);

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = '';
  __resetSourcesForTest();
  __resetDraftsForTest();
  vi.restoreAllMocks();
  delete (globalThis as unknown as { window: { cg?: object } }).window.cg;
});

const clip = (over: Partial<MediaPlateState> = {}): MediaPlateState => ({
  itemId: 'item-1',
  plateId: 'l-2',
  channel: 1,
  layer: 61,
  remainingMs: 11_200,
  paused: false,
  ended: false,
  loop: false,
  ...over,
});

interface Bridge {
  readonly setMediaPlayback: ReturnType<typeof vi.fn>;
  readonly mediaPlateTransport: ReturnType<typeof vi.fn>;
}

async function render(
  options: { item?: StackItemState; media?: readonly MediaPlateState[] } = {},
): Promise<{ el: HTMLElement; bridge: Bridge }> {
  const bridge: Bridge = {
    setMediaPlayback: vi.fn(() => Promise.resolve({ ok: true })),
    mediaPlateTransport: vi.fn(() => Promise.resolve({ ok: true })),
  };
  initSources({
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve(ASSIGNMENTS),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
    },
  } as unknown as Parameters<typeof initSources>[0]);
  (globalThis as unknown as { window: { cg: object } }).window.cg = fillBridgeStub({
    sources: { setMediaPlayback: bridge.setMediaPlayback },
    stack: { mediaPlateTransport: bridge.mediaPlateTransport },
    liveLayers: {
      mediaState: () => Promise.resolve([...(options.media ?? [])]),
      onMediaStateChanged: () => () => undefined,
    },
  });
  await act(async () => {
    await Promise.resolve();
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const item = options.item ?? itemWith('on-air', { activeLookId: 'two' });
  await act(async () => {
    root?.render(createElement(LooksBindingsSection, { item, info: TEMPLATE, channel: 1 }));
  });
  // The pull of the clips' state settles.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { el: host, bridge };
}

const press = async (button: Element | null): Promise<void> => {
  await act(async () => {
    (button as HTMLButtonElement | null)?.click();
    await Promise.resolve();
  });
};

it('🔴 a clip bound in Look inputs carries `Playback`; control: the live input beside it carries none', async () => {
  const { el } = await render();
  const playback = el.querySelectorAll('[data-media-playback]');
  expect(playback).toHaveLength(1);
  expect(playback[0]?.getAttribute('data-media-playback')).toBe(PROMO);
  // Its name is the clip's, in the button's accessible name; its tooltip is the one word.
  expect(playback[0]?.getAttribute('aria-label')).toBe('Playback: پرومو');
  expect(playback[0]?.getAttribute('title')).toBe('Playback');
});

it('🔴 the panel is headed by the clip’s NAME and holds Loop and When hidden — and NO prose', async () => {
  const { el } = await render();
  await press(el.querySelector('[data-media-playback]'));
  const panel = document.querySelector(`[data-media-playback-panel="${PROMO}"]`);
  expect(panel, 'the panel opened').not.toBeNull();
  expect(panel?.querySelector('h3')?.textContent).toBe('پرومو');
  const loop = panel?.querySelector('[data-media-loop] input') as HTMLInputElement | null;
  expect(loop?.checked, 'Loop is off by default').toBe(false);
  const choices = [...(panel?.querySelectorAll('[data-media-when-hidden]') ?? [])];
  expect(choices.map((b) => b.textContent)).toEqual(['Pause', 'Restart', 'Keep playing']);
  expect(choices.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  // 🔴 THE ABSENCE the operator-surface rule is pinned by: every word in the panel is a label, a
  // value or a choice. The next person to add "one helpful line" reddens this.
  expect(panel?.textContent).toBe('پروموLoopWhen hiddenPauseRestartKeep playing');
});

it('🔴 a choice applies AT ONCE and station-wide — the clip’s catalogue id, both settings', async () => {
  const { el, bridge } = await render();
  await press(el.querySelector('[data-media-playback]'));
  await press(document.querySelector('[data-media-when-hidden="continue"]'));
  expect(bridge.setMediaPlayback).toHaveBeenLastCalledWith({
    mediaId: PROMO,
    loop: false,
    whenHidden: 'continue',
  });
  await press(document.querySelector('[data-media-loop] input'));
  expect(bridge.setMediaPlayback).toHaveBeenLastCalledWith({
    mediaId: PROMO,
    loop: true,
    whenHidden: 'pause',
  });
});

it('🔴 on an ON-AIR row a clip gets Pause and Restart, `−0:12`, and a press reaches the bridge', async () => {
  const { el, bridge } = await render({ media: [clip()] });
  const transport = el.querySelector('[data-media-transport="l-2"]');
  expect(transport, 'the clip’s transport').not.toBeNull();
  const play = transport?.querySelector('[data-media-transport-play]');
  expect(play?.getAttribute('title')).toBe('Pause');
  expect(transport?.querySelector('[data-media-transport-restart]')?.getAttribute('title')).toBe(
    'Restart',
  );
  // 11.2 s left reads −0:12: whole seconds, rounded UP, as a countdown shows them.
  expect(transport?.querySelector('[data-media-remaining]')?.textContent).toBe('\u22120:12');
  expect(transport?.textContent).not.toContain('Paused');
  expect(transport?.textContent).not.toContain('Ended');
  await press(play ?? null);
  expect(bridge.mediaPlateTransport).toHaveBeenCalledWith({
    itemId: 'item-1',
    plateId: 'l-2',
    action: 'pause',
  });
  await press(transport?.querySelector('[data-media-transport-restart]') ?? null);
  expect(bridge.mediaPlateTransport).toHaveBeenLastCalledWith({
    itemId: 'item-1',
    plateId: 'l-2',
    action: 'restart',
  });
  // Control: the live input beside it has no transport — the bridge reports no clip there.
  expect(el.querySelector('[data-media-transport="l-1"]')).toBeNull();
});

it('🔴 `Paused` and `Ended` are FACTS; a paused clip offers Play', async () => {
  const { el, bridge } = await render({ media: [clip({ paused: true, ended: true })] });
  const transport = el.querySelector('[data-media-transport="l-2"]');
  const play = transport?.querySelector('[data-media-transport-play]');
  expect(play?.getAttribute('title')).toBe('Play');
  const tags = [...(transport?.querySelectorAll('.cg-source-tag') ?? [])].map((t) => t.textContent);
  expect(tags).toEqual(['Paused', 'Ended']);
  // Facts, never controls: a Tag cannot be pressed or focused.
  for (const tag of transport?.querySelectorAll('.cg-source-tag') ?? []) {
    expect(tag.tagName).toBe('SPAN');
    expect(tag.hasAttribute('tabindex')).toBe(false);
  }
  await press(play ?? null);
  expect(bridge.mediaPlateTransport).toHaveBeenCalledWith({
    itemId: 'item-1',
    plateId: 'l-2',
    action: 'play',
  });
});

it('🔴 no remaining time without the server’s report — no number at all; control: with it, `−0:30`', async () => {
  const { el } = await render({ media: [clip({ remainingMs: undefined })] });
  const transport = el.querySelector('[data-media-transport="l-2"]');
  expect(transport, 'the transport is still offered').not.toBeNull();
  expect(transport?.querySelector('[data-media-remaining]')).toBeNull();
  expect(transport?.textContent ?? '').not.toMatch(/\d/);
  expect(formatRemaining(30_000)).toBe('\u22120:30');
});

it('🔴 an OFF-AIR row gets no transport, even with a clip seated; control: its Playback stays', async () => {
  const { el } = await render({
    item: itemWith('loaded', { activeLookId: 'two' }),
    media: [clip()],
  });
  expect(el.querySelector('[data-media-transport]')).toBeNull();
  expect(el.querySelector('[data-media-playback]')).not.toBeNull();
});
