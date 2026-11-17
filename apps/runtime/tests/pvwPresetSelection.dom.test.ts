// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ControlLiveLayoutSchema, controlLiveLayoutFocusLookId } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { itemWith, renderLayerRow, templateWith, type RenderedRow } from './support/layerRow.js';
import {
  __resetDraftsForTest,
  preservePreviewLookPin,
  previewLookPin,
  pruneDrafts,
  setPreviewLookPin,
} from '../src/renderer/features/inspector/draftStore.js';

const rect = { x: 0, y: 0, width: 1920, height: 1080 };
const layout = ControlLiveLayoutSchema.parse({
  id: 'tpl-1',
  name: 'Interview',
  resolution: { width: 1920, height: 1080 },
  frameRate: 25,
  frames: [
    { id: 'host', sourceId: 'src-host', title: 'Host' },
    { id: 'guest', sourceId: 'src-guest', title: 'Guest' },
  ],
  presets: [
    {
      id: 'solo',
      name: 'Solo',
      frameIds: ['host'],
      arrangement: 'side-by-side',
      horizontalGap: 0,
      verticalGap: 0,
      reverse: false,
      hiddenTitles: [],
      hiddenFocusTitles: [],
    },
    {
      id: 'duo',
      name: 'Duo',
      frameIds: ['host', 'guest'],
      arrangement: 'side-by-side',
      horizontalGap: 0,
      verticalGap: 0,
      reverse: false,
      hiddenTitles: [],
      hiddenFocusTitles: [],
    },
  ],
  defaultPresetId: 'solo',
  background: { kind: 'color', color: '#000000' },
  effects: {
    focus: { motion: 'cut', fade: false, durationMs: 400 },
    switch: { mode: 'cut', durationMs: 400, direction: 'left' },
  },
});
function info(control: boolean): TemplateInfo {
  return templateWith({
    ...(control ? { controlLiveLayout: layout } : {}),
    liveSources: {
      resolution: { width: 1920, height: 1080 },
      defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
      sources: [{ elementId: 'host-element', sourceId: 'host', rect, dynamic: false }],
      looks: [
        { id: 'solo', name: 'Solo', entered: { mode: 'cut' }, rects: { host: rect } },
        { id: 'duo', name: 'Duo', entered: { mode: 'cut' }, rects: { host: rect } },
      ],
      defaultLookId: 'solo',
    },
  });
}
let row: RenderedRow | null = null;
afterEach(async () => {
  await row?.unmount();
  row = null;
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

it.each([false, true])(
  'off-air row chooses the first PGM preset and preserves PVW (New live layout=%s)',
  async (control) => {
    row = await renderLayerRow({
      item: itemWith('loaded', { activeLookId: 'solo' }),
      template: info(control),
      rehearsing: true,
    });
    let acknowledge: (result: { ok: true }) => void = () => {
      throw new Error('No pending preset');
    };
    const request = new Promise<{ ok: true }>((resolve) => {
      acknowledge = resolve;
    });
    const select = vi.fn<RuntimeBridge['stack']['setActiveLook']>().mockReturnValue(request);
    window.cg.stack.setActiveLook = select;
    const button = row.container.querySelector<HTMLButtonElement>('[data-look-id="duo"]');
    expect(button?.disabled).toBe(false);
    expect(row.container.querySelector('[data-look-picker]')?.textContent).toMatch(/PGM\s*· FIRST/);
    await act(() => button?.click());
    expect(select).toHaveBeenCalledWith({ itemId: 'item-1', lookId: 'duo' });
    expect(previewLookPin('item-1')).toBe('solo');
    // A new Inspector cue made during the PGM request owns PVW after its acknowledgement too.
    act(() => setPreviewLookPin('item-1', 'duo'));
    await act(async () => acknowledge({ ok: true }));
    expect(previewLookPin('item-1')).toBe('duo');
    pruneDrafts({ ready: true, liveItemIds: new Set(['item-1']) });
    expect(previewLookPin('item-1')).toBe('duo');
  },
);

it.each([false, true])(
  'on-air row re-press never overwrites the Inspector PVW cue (New live layout=%s)',
  async (control) => {
    setPreviewLookPin('item-1', 'solo');
    row = await renderLayerRow({
      item: itemWith('on-air', { activeLookId: 'duo' }),
      template: info(control),
      rehearsing: true,
    });
    const select = vi.fn<RuntimeBridge['stack']['setActiveLook']>().mockResolvedValue({ ok: true });
    window.cg.stack.setActiveLook = select;
    const button = row.container.querySelector<HTMLButtonElement>('[data-look-id="duo"]');
    await act(async () => button?.click());
    await act(async () => button?.click());
    expect(select).toHaveBeenCalledTimes(2);
    expect(previewLookPin('item-1')).toBe('solo');
    expect(row.container.querySelector('[data-look-picker]')?.textContent).toMatch(/PGM\s*· NOW/);
  },
);

it('on-air row Focus also stays independent of PVW', async () => {
  setPreviewLookPin('item-1', 'solo');
  row = await renderLayerRow({
    item: itemWith('on-air', { activeLookId: 'duo' }),
    template: info(true),
    rehearsing: true,
  });
  const select = vi.fn<RuntimeBridge['stack']['setActiveLook']>().mockResolvedValue({ ok: true });
  window.cg.stack.setActiveLook = select;
  const button = row.container.querySelector<HTMLButtonElement>(
    '[aria-label="Focus plate 2 in Programme"]',
  );
  expect(button).not.toBeNull();
  await act(async () => button?.click());
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({ lookId: controlLiveLayoutFocusLookId('duo', 'guest') }),
  );
  expect(previewLookPin('item-1')).toBe('solo');
});

it('preserves per-row PVW cues through unconfirmed snapshots and removes them only with the row', () => {
  preservePreviewLookPin('item-1', 'solo');
  preservePreviewLookPin('item-1', 'duo');
  expect(previewLookPin('item-1')).toBe('solo');
  setPreviewLookPin('item-2', 'duo');
  pruneDrafts({ ready: false });
  expect(previewLookPin('item-1')).toBe('solo');
  pruneDrafts({ ready: true, liveItemIds: new Set(['item-2']) });
  expect(previewLookPin('item-1')).toBeUndefined();
  expect(previewLookPin('item-2')).toBe('duo');
});
