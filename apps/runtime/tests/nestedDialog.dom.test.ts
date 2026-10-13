// @vitest-environment jsdom
import { StrictMode, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../src/renderer/ui/Modal.js';
import { Button } from '../src/renderer/ui/Button.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `STATION-CHROME-01` §6 — **A DIALOG ON TOP OF A DIALOG.**
 *
 * Every Add and every Edit opens the same small second dialog, which means two modal
 * surfaces on screen at once for the first time in this app. `B-229` had just finished
 * giving the Runtime ONE focus trap; nesting it is the same shape of defect one layer up,
 * so it is red-first here.
 *
 * ── WHAT WAS ACTUALLY BROKEN, both measured before the fix ──────────────────
 *
 *  1. **THE OUTER TRAP FIGHTS THE INNER ONE.** `useFocusTrap` listens on `document` in the
 *     CAPTURE phase, so BOTH traps see every Tab. The outer one's `B-229` clause — "focus
 *     that is already outside is pulled back" — is true of focus sitting in the SUB-dialog,
 *     because the sub-dialog portals to `body` and is not a descendant of the outer one. So
 *     the outer trap yanks focus out of the dialog the operator is actually answering. The
 *     clause is right; what was missing is that only the TOP-MOST trap may act.
 *
 *  2. **ESCAPE CLOSES BOTH.** `Modal`'s handler calls `e.stopPropagation()` and its comment
 *     claims "Escape belongs to the top-most dialog". It does not: `stopPropagation` stops
 *     propagation to other NODES, and both handlers are registered on the SAME node
 *     (`document`), so the second one still runs. Only `stopImmediatePropagation` would
 *     stop a sibling listener — and even that would depend on registration order, which is
 *     mount order, which is not layer order in general. The fix is the same stack.
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
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

interface Spies {
  outerClose: ReturnType<typeof vi.fn>;
  innerClose: ReturnType<typeof vi.fn>;
}

/** An outer dialog with a button that opens a second one on top of it. */
function Nested({ outerClose, innerClose }: Spies): JSX.Element {
  const [sub, setSub] = useState(false);
  return createElement(
    Modal,
    {
      title: 'Outer',
      ariaLabel: 'Outer',
      onClose: outerClose,
      footer: createElement(Button, { onClick: () => undefined, children: 'Outer footer' }),
    },
    createElement(Button, {
      onClick: () => setSub(true),
      'aria-label': 'open sub',
      children: 'Add something',
    }),
    sub
      ? createElement(
          Modal,
          {
            title: 'Inner',
            ariaLabel: 'Inner',
            layer: 'sub' as const,
            onClose: () => {
              innerClose();
              setSub(false);
            },
            footer: createElement(Button, { onClick: () => undefined, children: 'Inner footer' }),
          },
          createElement('input', { 'aria-label': 'inner field' }),
        )
      : null,
  );
}

async function mount(spies: Spies): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(Nested, spies)));
  });
}

const dialogs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];

async function press(key: string, shiftKey = false): Promise<void> {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

/** Dispatch a key and hand back the event, so a caller can read `defaultPrevented`. */
function pressAndReport(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  act(() => {
    document.activeElement?.dispatchEvent(event);
  });
  return event;
}

async function openSub(): Promise<void> {
  const open = document.querySelector<HTMLButtonElement>('button[aria-label="open sub"]');
  if (open === null) throw new Error('no sub-dialog opener');
  /*
    ⚠ `.focus()` BEFORE `.click()`, and it is not ceremony: **jsdom's `click()` does not move
    focus**, while a real browser focuses a button when you press it. Without this line the
    sub-dialog's trap captures "what had focus before" as the OUTER dialog's ✕ — which is
    what the browser would never have — and the restore-focus assertion below would be
    measuring jsdom's omission rather than this app's behaviour.
  */
  await act(async () => {
    open.focus();
    open.click();
  });
}

describe('§6 — a dialog on top of a dialog', () => {
  it('opens the second dialog over the first, both still in the document', async () => {
    const spies = { outerClose: vi.fn(), innerClose: vi.fn() };
    await mount(spies);
    expect(dialogs()).toHaveLength(1);
    await openSub();
    expect(dialogs()).toHaveLength(2);
  });

  it('🔴 ESCAPE closes ONLY the top dialog', async () => {
    const spies = { outerClose: vi.fn(), innerClose: vi.fn() };
    await mount(spies);
    await openSub();
    await press('Escape');
    expect(spies.innerClose).toHaveBeenCalledTimes(1);
    expect(spies.outerClose, 'Escape reached the dialog behind the scrim').not.toHaveBeenCalled();
    // …and a SECOND Escape, now that the inner one is gone, does close the outer.
    expect(dialogs()).toHaveLength(1);
    await press('Escape');
    expect(spies.outerClose).toHaveBeenCalledTimes(1);
  });

  it('🔴 TAB stays inside the top dialog — the outer trap does not pull focus out of it', async () => {
    const spies = { outerClose: vi.fn(), innerClose: vi.fn() };
    await mount(spies);
    await openSub();
    const inner = dialogs()[1];
    expect(inner, 'the sub-dialog is the second dialog in the document').toBeDefined();

    /*
      🔴 CONTAINMENT IS NOT THE ASSERTION THAT MATTERS, and neither is ADVANCEMENT — not
      HERE. Both traps in this file's first spellings were wrong about what jsdom can see:

      · A CONTAINMENT check passes on the defect. With both traps live the outer one fires
        first and drags focus into the outer dialog; the inner one fires second, sees focus
        outside ITSELF, and drags it back. Focus does end up in the sub-dialog — while the
        operator's Tab achieved nothing, because he lands on the first control every time.
      · An ADVANCEMENT check cannot run here at all: **jsdom does not implement sequential
        focus navigation.** A `Tab` keydown moves nothing unless a listener moves it, so in
        jsdom "focus advanced" is only ever true when a TRAP moved it — the opposite of what
        it means in a browser.

      So what is measured here is the thing jsdom CAN see and the browser cannot easily be
      asked: **in the middle of the ring, nobody touches the event.** A trap that hijacks a
      mid-ring Tab is precisely the defect — the outer one did, calling `preventDefault` and
      re-homing focus on every press. `defaultPrevented === false` and an unmoved
      `activeElement` is that defect's absence, exactly.

      The operator-visible half — that Tab really does walk the sub-dialog's fields — is
      measured in a real browser, in `tests/e2e/add-dialog.spec.ts`.
    */
    const field = inner?.querySelector<HTMLElement>('input[aria-label="inner field"]');
    expect(field, 'the sub-dialog has a field to stand in the middle of the ring').toBeDefined();
    field?.focus();

    const mid = pressAndReport('Tab');
    expect(mid.defaultPrevented, 'a trap hijacked a mid-ring Tab').toBe(false);
    expect(document.activeElement, 'a trap re-homed focus mid-ring').toBe(field);

    // …and at the ENDS the top trap still wraps, which is the half that must keep working.
    const closeButton = inner?.querySelector<HTMLElement>('button');
    closeButton?.focus();
    const atStart = pressAndReport('Tab', true);
    expect(atStart.defaultPrevented, 'the top trap stopped wrapping at the first control').toBe(
      true,
    );
    expect(inner?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(closeButton);
  });

  it('focus RETURNS to the button that opened the sub-dialog when it closes', async () => {
    const spies = { outerClose: vi.fn(), innerClose: vi.fn() };
    await mount(spies);
    const opener = document.querySelector<HTMLButtonElement>('button[aria-label="open sub"]');
    await openSub();
    await press('Escape');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('open sub');
    expect(document.activeElement).toBe(opener);
  });

  it('POSITIVE CONTROL: with ONE dialog, Escape still closes it and Tab still wraps', async () => {
    // Without this the stack could be "nothing ever handles the key" and every assertion
    // above would pass vacuously.
    const spies = { outerClose: vi.fn(), innerClose: vi.fn() };
    await mount(spies);
    const outer = dialogs()[0];
    for (let i = 0; i < 6; i++) {
      await press('Tab');
      expect(outer?.contains(document.activeElement)).toBe(true);
    }
    await press('Escape');
    expect(spies.outerClose).toHaveBeenCalledTimes(1);
  });
});
