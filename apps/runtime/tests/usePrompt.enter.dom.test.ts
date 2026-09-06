// @vitest-environment jsdom
import { StrictMode, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrompt } from '../src/renderer/ui/useDialog.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * 🔴 **ENTER MUST NOT LEAVE A DEFAULT ACTION BEHIND IT (owner, 2026-09-06, from the plant).**
 *
 * Reported: the dialog's `Lock` BUTTON locks and closes the dialog; ENTER locked and left
 * the dialog OPEN, stacked on top of the lock screen.
 *
 * The chain: Enter closes the prompt → the `Modal` unmounts → the focus trap's cleanup
 * restores focus to the control that had it when the trap armed (the status bar's own
 * `🔒 Lock…` button) → the browser then runs the keydown's DEFAULT ACTION, and Enter on a
 * focused button is a CLICK. The prompt re-opens while the engage already in flight raises
 * the lock screen behind it.
 *
 * ⚠ It could not happen before `B-230`: focus used to be stolen to the ✕ on every keystroke,
 * so Enter never reached this handler. Fixing one focus defect exposed this one.
 *
 * ── WHAT THIS FILE ASSERTS, AND WHY IT IS NOT THE WHOLE STORY ───────────────
 *
 * The MECHANISM, deterministically and in milliseconds: the handler calls `preventDefault`,
 * so no default action survives the submit whatever receives focus next. jsdom cannot show
 * the OUTCOME — it runs no default actions and has no focus engine — and the outcome also
 * needs a real bridge, because the race is with socket latency (the offline mock resolves
 * `engage` fast enough that the button is already gone). That half is
 * `tests/e2e/lock-prompt-enter.spec.ts`.
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
  vi.restoreAllMocks();
});

/** A host that opens the prompt on mount and reports what it resolves with. */
function Host({ onResolved }: { onResolved: (v: string | null) => void }): JSX.Element {
  const { prompt, promptDialog } = usePrompt();
  useEffect(() => {
    void prompt({
      title: 'Lock the Runtime',
      label: 'Lock PIN (4–64 characters)',
      submitLabel: 'Lock',
      type: 'password',
      minLength: 4,
    }).then(onResolved);
  }, [prompt, onResolved]);
  return promptDialog ?? createElement('span');
}

async function render(onResolved: (v: string | null) => void): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(Host, { onResolved })));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('the prompt did not open');
  return dialog;
}

/** Type into the controlled field the way React sees a real keystroke. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

/** Press Enter on the field and report whether the default action was prevented. */
async function pressEnter(input: HTMLInputElement): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => {
    input.dispatchEvent(event);
    await Promise.resolve();
  });
  return event.defaultPrevented;
}

describe('usePrompt — Enter submits and leaves NO default action behind', () => {
  it('🔴 THE BUG: the Enter that submits is preventDefault-ed', async () => {
    const resolved = vi.fn();
    const dialog = await render(resolved);
    const input = dialog.querySelector<HTMLInputElement>('input');
    if (input === null) throw new Error('no field');

    await type(input, '1234');
    const prevented = await pressEnter(input);

    // ── the assertion that goes RED without the fix ────────────────────────
    // Unprevented, the browser activates whatever holds focus once the dialog closes —
    // which the trap has just restored to the button that OPENED it, re-opening the prompt.
    expect(prevented, 'the submit leaves a default action for the browser to run').toBe(true);

    // …and it still SUBMITS. A fix that swallowed the key would be worse than the bug.
    expect(resolved).toHaveBeenCalledWith('1234');
    expect(openDialog(), 'the dialog is still open after Enter').toBeNull();
  });

  it('a TOO-SHORT value neither submits nor prevents the default', async () => {
    /*
      The negative control, and it pins the ORDER of the guard: `preventDefault` must sit
      INSIDE the length rule, not above it. A blanket prevent would silently eat Enter on a
      dialog that is refusing to submit — the operator presses it, nothing happens, and
      nothing says why, which is the `minLength` rule's original defect restored.
    */
    const resolved = vi.fn();
    const dialog = await render(resolved);
    const input = dialog.querySelector<HTMLInputElement>('input');
    if (input === null) throw new Error('no field');

    await type(input, '12');
    const prevented = await pressEnter(input);

    expect(prevented).toBe(false);
    expect(resolved).not.toHaveBeenCalled();
    expect(openDialog(), 'a too-short PIN closed the dialog').not.toBeNull();
  });
});
