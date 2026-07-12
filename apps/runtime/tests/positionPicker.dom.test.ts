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
});
