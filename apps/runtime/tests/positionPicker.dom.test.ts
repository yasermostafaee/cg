// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState, StackItemStatus } from '@cg/shared-schema';
import { PositionPicker } from '../src/renderer/features/inspector/PositionPicker.js';
import { recordDefaultPosition } from '../src/renderer/features/stack/defaultPositionStore.js';

/**
 * R-011 — the per-item position picker: seeds from the template's manifest
 * default (centered fallback), sends exactly ONE stack.set-position on
 * Apply, and is LOCKED (all controls disabled, reason visible) while the
 * item is on air/unsettled.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  recordDefaultPosition('tpl-pos', undefined);
  vi.restoreAllMocks();
});

function item(status: StackItemStatus, pending = false): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-pos',
    fields: {},
    status,
    pending,
  };
}

function stubBridge(): { setPosition: Mock } {
  const setPosition = vi.fn(() => Promise.resolve({ ok: true }));
  const stub = { stack: { setPosition } };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { setPosition };
}

async function render(state: StackItemState): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(PositionPicker, { item: state })));
  });
  return container;
}

describe('PositionPicker — R-011', () => {
  it('seeds from the recorded manifest default', async () => {
    stubBridge();
    recordDefaultPosition('tpl-pos', { anchor: 'bottom-right', offset: { x: -10, y: -20 } });
    const el = await render(item('loaded'));
    const pressed = el.querySelector('button[aria-label="Anchor bottom-right"]');
    expect(pressed?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Position offset X"]')?.value).toBe(
      '-10',
    );
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Position offset Y"]')?.value).toBe(
      '-20',
    );
  });

  it('seeds CENTERED when the template declares no default', async () => {
    stubBridge();
    const el = await render(item('loaded'));
    expect(
      el.querySelector('button[aria-label="Anchor center"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Position offset X"]')?.value).toBe(
      '0',
    );
  });

  it('Apply sends exactly one stack.set-position with the picked anchor+offset', async () => {
    const { setPosition } = stubBridge();
    const el = await render(item('loaded'));
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Anchor top-right"]')?.click();
    });
    const dxInput = el.querySelector<HTMLInputElement>('input[aria-label="Position offset X"]');
    await act(async () => {
      // React reads the input value via the native setter path; simulate typing.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(dxInput, '-40');
      dxInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Apply position"]')?.click();
      await Promise.resolve();
    });
    expect(setPosition).toHaveBeenCalledTimes(1);
    expect(setPosition).toHaveBeenCalledWith({
      itemId: 'item-1',
      position: { anchor: 'top-right', offset: { x: -40, y: 0 } },
    });
  });

  it('locks — all controls disabled with the reason visible — while on air/unsettled', async () => {
    stubBridge();
    for (const status of ['playing', 'on-air', 'updating', 'exiting', 'unconfirmed'] as const) {
      const el = await render(item(status));
      expect(el.textContent).toContain('locked while on air');
      const buttons = el.querySelectorAll<HTMLButtonElement>('button');
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b.disabled).toBe(true);
      for (const i of el.querySelectorAll<HTMLInputElement>('input')) {
        expect(i.disabled).toBe(true);
      }
      container?.remove();
      container = null;
    }
    // pending also locks (unsettled), even on a resting status.
    const el = await render(item('loaded', true));
    expect(el.textContent).toContain('locked while on air');
  });

  it('editable while loaded-not-taken and while idle', async () => {
    stubBridge();
    for (const status of ['loaded', 'idle'] as const) {
      const el = await render(item(status));
      expect(el.textContent).not.toContain('locked while on air');
      expect(
        el.querySelector<HTMLButtonElement>('button[aria-label="Apply position"]')?.disabled,
      ).toBe(false);
      container?.remove();
      container = null;
    }
  });

  /**
   * R-022 — REHEARSING IS NOT ON AIR, and the lock must not treat it as though
   * it were. Rehearse is the state in which a graphic CANNOT reach air, and
   * position rehearsal is the whole reason `dev-r030-channel-raster` was run
   * before `dev-r022-rehearse`: a control that locked itself in exactly the
   * state it exists to serve would have made that ordering buy nothing.
   *
   * The lock is a function of the item's STATUS and `pending` only — rehearse
   * changes neither, so this holds by construction. Asserted anyway, because
   * "on air OR unsettled OR rehearsing" is a one-word edit away and the failure
   * would be silent: the operator would simply find the button greyed out.
   */
  it('is ENABLED on a rehearsing row and DISABLED on an on-air row', async () => {
    stubBridge();
    // A rehearsing row is a LOADED row that the bridge has interlocked; its
    // item status is untouched by rehearse.
    const rehearsing = await render(item('loaded'));
    expect(
      rehearsing.querySelector<HTMLButtonElement>('button[aria-label="Apply position"]')?.disabled,
    ).toBe(false);
    expect(rehearsing.textContent).not.toContain('locked while on air');
    container?.remove();
    container = null;

    const onAir = await render(item('on-air'));
    expect(
      onAir.querySelector<HTMLButtonElement>('button[aria-label="Apply position"]')?.disabled,
    ).toBe(true);
    expect(onAir.textContent).toContain('locked while on air');
  });
});

/**
 * B-072 — the picker seeds from the APPLIED override (published in item state
 * by the bridge), falling back to the manifest default only when the item has
 * none. Before this, the default was the ONLY seed source: a reselect
 * re-seeded the picker to the default even though the override was live on
 * air, so the UI lied — and a re-Apply of that stale display silently
 * overwrote the correct on-air position with the default.
 */
describe('PositionPicker — B-072 override read-back', () => {
  const OVERRIDE = { anchor: 'bottom-right' as const, offset: { x: -10, y: -20 } };

  function withOverride(): StackItemState {
    return { ...item('loaded'), position: OVERRIDE };
  }

  it('seeds from the APPLIED override, not the manifest default', async () => {
    stubBridge();
    // The template ALSO has a manifest default — the override must win.
    recordDefaultPosition('tpl-pos', { anchor: 'top-left', offset: { x: 5, y: 5 } });
    const el = await render(withOverride());
    expect(
      el.querySelector('button[aria-label="Anchor bottom-right"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      el.querySelector('button[aria-label="Anchor top-left"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Position offset X"]')?.value).toBe(
      '-10',
    );
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Position offset Y"]')?.value).toBe(
      '-20',
    );
  });

  it('an item with NO override still seeds from the manifest default', async () => {
    stubBridge();
    recordDefaultPosition('tpl-pos', { anchor: 'top-left', offset: { x: 5, y: 5 } });
    const el = await render(item('loaded'));
    expect(
      el.querySelector('button[aria-label="Anchor top-left"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Position offset X"]')?.value).toBe(
      '5',
    );
  });

  it('survives a deselect → reselect (the remount re-seeds from the override)', async () => {
    stubBridge();
    recordDefaultPosition('tpl-pos', { anchor: 'top-left', offset: { x: 5, y: 5 } });
    // Mount, unmount (deselect), mount again (reselect) — the picker is keyed
    // by itemId, so this is exactly what the Inspector does.
    await render(withOverride());
    container?.remove();
    container = null;
    const el = await render(withOverride());
    expect(
      el.querySelector('button[aria-label="Anchor bottom-right"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('BLAST-RADIUS GUARD: re-Apply without editing sends the OVERRIDE, never the default', async () => {
    const { setPosition } = stubBridge();
    recordDefaultPosition('tpl-pos', { anchor: 'top-left', offset: { x: 5, y: 5 } });
    const el = await render(withOverride());

    // The operator reselects and — touching nothing — presses Apply. This used
    // to send the manifest default and destroy the correct on-air position.
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Apply position"]')?.click();
      await Promise.resolve();
    });

    expect(setPosition).toHaveBeenCalledTimes(1);
    expect(setPosition).toHaveBeenCalledWith({ itemId: 'item-1', position: OVERRIDE });
    // Explicitly NOT the manifest default, and NOT centered.
    expect(setPosition).not.toHaveBeenCalledWith({
      itemId: 'item-1',
      position: { anchor: 'top-left', offset: { x: 5, y: 5 } },
    });
    expect(setPosition).not.toHaveBeenCalledWith({
      itemId: 'item-1',
      position: { anchor: 'center', offset: { x: 0, y: 0 } },
    });
  });
});
