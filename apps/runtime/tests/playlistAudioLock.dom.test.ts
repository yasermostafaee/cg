// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { PLAYLIST_AUDIO_LOCKED_REASON, type LiveLayerState } from '@cg/shared-ipc';
import { LivePlateAudioDialog } from '../src/renderer/features/layers/LivePlateAudioDialog.js';
import { PlateAudioStrip } from '../src/renderer/features/layers/PlateAudioStrip.js';
import { liveLayerRow } from '../src/renderer/features/layers/liveLayerRows.js';
import { LOCKED_PILL } from '../src/renderer/features/layers/plateAudio.js';
import { operatorRowName } from '../src/renderer/ui/operatorNaming.js';
import { itemWith, templateWith } from './support/layerRow.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` C (`R-075`) — **A BOX SHOWING THE PLAYOUT'S PLAYLIST OUTPUT IS LOCKED AT 0 ON
 * EVERY AUDIO SURFACE**: the LIVE PLATES strip and the row's audio dialog disable ON, OFF, SOLO and the
 * fader with `Programme sound is already on air`, and its pill reads `Locked · 0`. CONTROL, in every
 * case: a camera plate beside it keeps its controls. (The bridge refuses a raise too —
 * `route-plates.integration.test.ts`.)
 */

const TEMPLATE = templateWith({
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 0, y: 0, width: 400, height: 225 },
        dynamic: false,
      },
      {
        elementId: 'el-2',
        sourceId: 'guest-2',
        rect: { x: 600, y: 0, width: 400, height: 225 },
        dynamic: false,
      },
    ],
  },
});
const NAME = operatorRowName(
  { itemId: 'item-1', templateId: 'tpl-1', slot: { channel: 1, layer: 70 } },
  null,
  new Map([[TEMPLATE.templateId, TEMPLATE]]),
);
const LOCKED = (plateId: string): boolean => plateId === 'guest-1';

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  clearPortals();
  vi.restoreAllMocks();
});

function mount(element: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(element);
  });
  return host;
}

describe('the audio dialog', () => {
  it('🔴 the playlist plate’s fader, ON, OFF and SOLO are disabled with the reason, and it reads `Locked · 0` — control: the camera plate’s are live', () => {
    mount(
      createElement(LivePlateAudioDialog, {
        item: itemWith('on-air'),
        template: TEMPLATE,
        name: NAME,
        audioLockedOf: LOCKED,
        onApplyVolumes: () => Promise.resolve({ ok: true, refused: [] }),
        onClose: () => undefined,
      }),
    );
    const row = (plate: string): Element | null =>
      openDialog()?.querySelector(`[data-audio-plate="${plate}"]`) ?? null;
    const locked = row('guest-1');
    expect(locked?.getAttribute('data-plate-audio-state')).toBe(LOCKED_PILL.label);
    const slider = locked?.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider?.disabled).toBe(true);
    expect(slider?.title).toBe(PLAYLIST_AUDIO_LOCKED_REASON);
    expect(slider?.value).toBe('0');
    for (const label of ['ON', 'OFF', 'SOLO']) {
      const b = [...(locked?.querySelectorAll('button') ?? [])].find(
        (x) => x.textContent === label,
      );
      expect(b?.disabled, label).toBe(true);
      expect(b?.title, label).toBe(PLAYLIST_AUDIO_LOCKED_REASON);
    }
    // CONTROL — the camera plate beside it.
    const camera = row('guest-2');
    expect(camera?.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(false);
    const on = [...(camera?.querySelectorAll('button') ?? [])].find((x) => x.textContent === 'ON');
    expect(on?.disabled).toBe(false);
  });
});

describe('the LIVE PLATES strip', () => {
  const layer = (sourceId: string, layerNo: number): LiveLayerState => ({
    channel: 1,
    layer: layerNo,
    itemId: 'item-1',
    sourceId,
    role: 'fill',
    producer: '"route://1-7"',
    held: false,
    unverified: false,
  });
  const row = (sourceId: string, layerNo: number) =>
    liveLayerRow(
      layer(sourceId, layerNo),
      { row: 'Bed 59', detail: null },
      null,
      () => 0,
      () => null,
      (_itemId, plateId) => LOCKED(plateId),
    );

  it('🔴 the row view reads `Locked · 0` for the playlist plate — control: `Silent` for the camera', () => {
    expect(row('guest-1', 60).audio).toMatchObject({ pill: LOCKED_PILL, locked: true });
    expect(row('guest-2', 61).audio?.pill.label).toBe('Silent');
    expect(row('guest-2', 61).audio?.locked).toBeUndefined();
  });

  it('🔴 every control of the strip is disabled with the reason — control: the camera strip is live', () => {
    const el = mount(
      createElement(PlateAudioStrip, {
        row: row('guest-1', 60),
        siblings: ['guest-1', 'guest-2'],
        refusal: undefined,
        onApply: () => Promise.resolve({ ok: true, refused: [] }),
      }),
    );
    const slider = el.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider?.disabled).toBe(true);
    expect(slider?.title).toBe(PLAYLIST_AUDIO_LOCKED_REASON);
    for (const b of [...el.querySelectorAll('button')]) {
      expect(b.disabled, b.textContent ?? '').toBe(true);
      expect(b.title, b.textContent ?? '').toBe(PLAYLIST_AUDIO_LOCKED_REASON);
    }
    expect(el.querySelector('.cg-plate-pill-label')?.textContent).toBe('Locked · 0');
    act(() => root?.unmount());
    host?.remove();
    const camera = mount(
      createElement(PlateAudioStrip, {
        row: row('guest-2', 61),
        siblings: ['guest-1', 'guest-2'],
        refusal: undefined,
        onApply: () => Promise.resolve({ ok: true, refused: [] }),
      }),
    );
    expect(camera.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(false);
    expect([...camera.querySelectorAll('button')].every((b) => !b.disabled)).toBe(true);
  });
});
