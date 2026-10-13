// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LockOverlay } from '../src/renderer/features/lock/LockOverlay.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — deletion guard item 15: THE LOCK'S NO-EXIT CONTRACT (`B-229`).
 *
 * 🔴🔴 The lock screen keeps its OWN chrome and is deliberately NOT on the modal primitive —
 * `Modal.tsx` gives every dialog a visible ✕, Escape-to-close and backdrop-click-to-close, and
 * _a lock with a way out is not a lock_. The reference draws its lock (`unlock-dialog`) on the
 * prototype's dialog primitive; `PROMPT.md` §9 forbids reading that as an argument, and Phase 9
 * took the reference's LOOK (the icon, `Console locked`, the PIN field, the full-width submit)
 * over the app's own chrome without taking the primitive. This file is the contract, asserted
 * as PROPERTIES so the look can change and the contract cannot:
 *
 *   1. it renders when engaged and not otherwise;
 *   2. it is not a `<dialog>` and carries no dismiss control — every control in it is the
 *      release path;
 *   3. Escape does nothing to it, and a press on the scrim does nothing to it;
 *   4. a wrong PIN is refused legibly and the overlay STAYS;
 *   5. the ONE way out is the bridge's release — the overlay leaves when, and only when,
 *      `engaged` goes false.
 *
 * The keyboard TRAP (Tab wraps, Shift+Tab wraps) is `lockOverlay.focusTrap.dom.test.ts`'s and
 * the real-engine containment is `e2e/lock-keyboard-containment.spec.ts`'s; neither is repeated.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

async function mount(
  engaged: boolean,
  onRelease = vi.fn(() => Promise.resolve({ ok: false, reason: 'pin-mismatch' as const })),
): Promise<{
  el: HTMLElement;
  onRelease: typeof onRelease;
  rerender: (engaged: boolean) => Promise<void>;
}> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  const render = async (e: boolean): Promise<void> => {
    await act(async () => {
      r.render(
        createElement(
          StrictMode,
          null,
          createElement(LockOverlay, { engaged: e, reason: 'operator', onRelease }),
        ),
      );
      await Promise.resolve();
    });
  };
  await render(engaged);
  return { el: container, onRelease, rerender: render };
}

const overlay = (el: HTMLElement): HTMLElement | null =>
  el.querySelector('[role="dialog"][aria-label="Lock screen"]');

describe('guard item 15 — the lock keeps its own chrome and its no-exit contract', () => {
  it('renders when engaged, with the reference LOOK: the title, the PIN field, one full-width submit', async () => {
    const { el } = await mount(true);
    const o = overlay(el);
    expect(o, 'the lock did not render while engaged').not.toBeNull();
    expect(o?.textContent).toContain('Console locked');
    expect(o?.querySelector('input[aria-label="PIN"]')).not.toBeNull();
    const submit = o?.querySelector('button');
    expect(submit?.textContent).toContain('Unlock console');
  });

  it('renders NOTHING when not engaged', async () => {
    const { el } = await mount(false);
    expect(overlay(el)).toBeNull();
  });

  it('is NOT on the modal primitive: not a <dialog>, no ✕, no dismiss — every control is the release path', async () => {
    const { el, onRelease } = await mount(true);
    const o = overlay(el) as HTMLElement;
    expect(o.tagName).not.toBe('DIALOG');
    expect(o.querySelector('dialog')).toBeNull();
    expect(o.querySelector('[aria-label*="lose" i], [aria-label*="ismiss" i]')).toBeNull();
    const buttons = [...o.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      await act(async () => {
        b.click();
        await Promise.resolve();
      });
    }
    // Each press went to the bridge's release — there is no button that does anything else.
    expect(onRelease).toHaveBeenCalledTimes(buttons.length);
  });

  it('🔴 Escape does nothing, and a press on the scrim does nothing', async () => {
    const { el, onRelease } = await mount(true);
    const o = overlay(el) as HTMLElement;
    await act(async () => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      o.querySelector('input')?.dispatchEvent(esc);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(overlay(el), 'Escape must not be a way out').not.toBeNull();
    await act(async () => {
      o.click();
      o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      o.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(overlay(el), 'the scrim must not be a way out').not.toBeNull();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('a wrong PIN is refused legibly and the overlay STAYS — retry is unlimited, exit is not', async () => {
    const { el, onRelease } = await mount(true);
    const o = overlay(el) as HTMLElement;
    const input = o.querySelector<HTMLInputElement>('input[aria-label="PIN"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    for (let n = 1; n <= 2; n++) {
      await act(async () => {
        setter?.call(input, '9999');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await Promise.resolve();
      });
    }
    expect(onRelease).toHaveBeenCalledTimes(2);
    expect(onRelease).toHaveBeenLastCalledWith('9999');
    expect(o.textContent).toContain('Incorrect PIN (2 attempts)');
    expect(overlay(el)).not.toBeNull();
  });

  it('the ONE way out: the overlay leaves when the lock state says released, and only then', async () => {
    const { el, rerender } = await mount(true);
    expect(overlay(el)).not.toBeNull();
    await rerender(false);
    expect(overlay(el)).toBeNull();
  });
});
