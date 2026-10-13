// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { LockOverlay } from '../src/renderer/features/lock/LockOverlay.js';

/**
 * `B-229` — **THE LOCK HELD THE POINTER AND NOT THE KEYBOARD.**
 *
 * `LockOverlay` puts a 94 %-opaque scrim over the whole window and its own docstring
 * claims an air-safety contract: _"while engaged, all input is captured by the overlay;
 * the stack rows underneath cannot receive clicks."_ Clicks, yes — the scrim is `position:
 * fixed; inset: 0`, so the pointer genuinely cannot reach through it. **Tab could.** The
 * overlay had no key handler of any kind, nothing in the app sets `inert`, and the rows
 * behind it stayed in the document's sequential focus order — so an operator (or a cat on
 * a keyboard) could Tab onto a TAKE and press Space on a locked console.
 *
 * ── WHY THE PRIMITIVE'S TRAP WAS NOT ALREADY HERE ───────────────────────────
 *
 * `Modal.tsx` explains that `LockOverlay` deliberately does NOT use the modal primitive:
 * _"This primitive gives every dialog a visible ✕, Escape-to-close and
 * backdrop-click-to-close — three ways out — and a lock screen with a way out is not a
 * lock."_ That is right, and it justifies not inheriting the three EXITS. It never
 * justified not inheriting the TRAP, which is the half that keeps focus off the controls
 * behind the scrim — the two are independent, and conflating them is what left the lock
 * with neither.
 *
 * So the trap now lives in `ui/focusTrap.ts` and BOTH surfaces call it: the modal composes
 * it with its exits, the lock composes it alone. One implementation, because a second copy
 * of a focus trap is how the two come to disagree about what "focusable" means.
 *
 * ── WHAT IS ASSERTED, AND THE HONEST LIMIT OF IT ────────────────────────────
 *
 * jsdom does NOT implement sequential focus navigation: pressing Tab in jsdom moves
 * nothing, so a test that dispatched Tab and then asserted `document.activeElement` had
 * not become the TAKE button would pass against the BROKEN code too. It would be a test
 * that cannot fail, which is worse than no test.
 *
 * What is asserted here is the MECHANISM that produces the containment — the overlay
 * handles the key, wraps at both ends, and calls `preventDefault` so the browser's own
 * navigation never runs. Each of those is a property the old code did not have.
 *
 * 🔴 **THE TRUE IN-BROWSER ASSERTION IS NOT OWED — it exists**, in
 * `tests/e2e/lock-keyboard-containment.spec.ts`, where a real focus engine Tabs twenty
 * times against a real stack and asserts the active element never leaves the overlay, with
 * a negative control proving the check can fail.
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

/**
 * The overlay, mounted with a genuine on-air control BEFORE it in the document — which is
 * the arrangement that matters. `LockOverlay` is rendered as the last child of `<main>`,
 * so everything the operator must not reach is EARLIER in focus order: a Shift+Tab out of
 * the overlay's first control is the short path onto a TAKE, and it is the one the wrap
 * has to close.
 */
async function mountLocked(): Promise<{ take: HTMLButtonElement; overlay: HTMLElement }> {
  container = document.createElement('div');
  document.body.appendChild(container);

  const take = document.createElement('button');
  take.textContent = 'TAKE';
  take.id = 'on-air-take';
  document.body.insertBefore(take, container);

  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(LockOverlay, {
          engaged: true,
          onRelease: () => Promise.resolve({ ok: false, reason: 'pin-mismatch' as const }),
        }),
      ),
    );
    await Promise.resolve();
  });

  const overlay = container.querySelector<HTMLElement>('[role="dialog"]');
  if (overlay === null) throw new Error('the lock overlay did not render');
  return { take, overlay };
}

/** Dispatch a Tab on `document`, the way a browser would, and report `defaultPrevented`. */
function pressTab(shiftKey = false): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

function focusables(overlay: HTMLElement): HTMLElement[] {
  return [
    ...overlay.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];
}

describe('B-229 — the lock traps the keyboard, not only the pointer', () => {
  it('🔴 THE BUG: Tab off the LAST control wraps back inside instead of leaving the overlay', async () => {
    const { overlay } = await mountLocked();
    const nodes = focusables(overlay);
    expect(nodes.length, 'the overlay has focusable controls at all').toBeGreaterThan(1);

    const last = nodes[nodes.length - 1];
    last?.focus();
    expect(document.activeElement).toBe(last);

    const prevented = pressTab();
    // The browser's own Tab must never run — that is what would land on the TAKE behind
    // the scrim. Preventing it is the mechanism, not a detail of it.
    expect(prevented, 'the overlay did not handle Tab at all').toBe(true);
    expect(document.activeElement, 'focus left the overlay').toBe(nodes[0]);
  });

  it('🔴 THE BUG, the other way: Shift+Tab off the FIRST control wraps to the last', async () => {
    // This is the SHORT path onto an on-air control: the overlay is the last thing in the
    // document, so one Shift+Tab from its first field walks straight back into the stack.
    const { overlay } = await mountLocked();
    const nodes = focusables(overlay);
    const first = nodes[0];
    first?.focus();
    expect(document.activeElement).toBe(first);

    const prevented = pressTab(true);
    expect(prevented, 'the overlay did not handle Shift+Tab at all').toBe(true);
    expect(document.activeElement, 'focus left the overlay backwards').toBe(
      nodes[nodes.length - 1],
    );
  });

  it('moves focus INTO the overlay when the lock engages, so the trap starts armed', async () => {
    // A trap that only acts on Tab is useless if focus was on a TAKE when the lock came
    // down: the first key the operator presses would be read by the control behind the
    // scrim. The overlay already focused its PIN field on engage; this pins it, because
    // the wrap logic below depends on focus STARTING inside.
    const { overlay } = await mountLocked();
    expect(overlay.contains(document.activeElement)).toBe(true);
  });

  it('🔴 THE INVERSE: released, it handles nothing — the app gets its keyboard back', async () => {
    // The half that is not about safety and is exactly as important: an unlock must
    // restore every control immediately, with no reload. A trap that outlived `engaged`
    // would be a console nobody could type into, which is a worse outage than the bug.
    const { overlay } = await mountLocked();
    const nodes = focusables(overlay);
    const outside = document.getElementById('on-air-take');
    if (outside === null) throw new Error('the on-air control is missing');

    await act(async () => {
      root?.render(
        createElement(
          StrictMode,
          null,
          createElement(LockOverlay, {
            engaged: false,
            onRelease: () => Promise.resolve({ ok: true }),
          }),
        ),
      );
      await Promise.resolve();
    });

    expect(container?.querySelector('[role="dialog"]'), 'the overlay is gone').toBeNull();
    outside.focus();
    expect(document.activeElement).toBe(outside);
    // Nothing intercepts Tab any more, so the browser's own navigation runs.
    expect(pressTab(), 'a released lock is still eating Tab').toBe(false);
    expect(document.activeElement, 'a released lock is still moving focus').toBe(outside);
    expect(nodes.length).toBeGreaterThan(0);
  });
});
