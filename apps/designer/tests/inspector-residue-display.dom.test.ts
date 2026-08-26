/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RealtimeNumberInput } from '../src/renderer/features/inspector/controls.js';

/**
 * ⭐ **`B-180`'s fourth acceptance bullet — THE INSPECTOR DISPLAY, and the DECISION not to
 * change it.**
 *
 * `B-180` names the display as part of the offence: a stored `124.00000000000001` prints as
 * `124`, so *"the only numeric surface the author has agrees with them that the box is where
 * they put it"* while the Export refuses over the difference. The brief requires the question
 * decided either way and the decision pinned by value. **The decision is: leave it alone.**
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 *  1. **Half 1 stops the display ever having to lie about a NEW drag.** A drag now commits a
 *     whole scene pixel at every zoom, and `formatNumberDisplay` prints an integer exactly
 *     (`Number.isInteger(v) → String(v)`). The value that made the display misleading is no
 *     longer produced.
 *  2. **Half 2 removes the CONSEQUENCE for residue already stored** in a project saved before
 *     this fix. `B-180`'s complaint is precisely that the display CONTRADICTED a refusal —
 *     take the refusal away and the rounded reading is no longer contradicting anything; it
 *     describes a box that now behaves exactly as it reads.
 *  3. **An honest display would be a REGRESSION in `B-180`'s own scenario.** Printing
 *     `124.00000000000001` in a narrow Inspector cell, for a box the author placed correctly
 *     and which now exports fine, converts invisible dust into visible alarm and invites the
 *     author to "fix" a number that is not wrong.
 *
 * 🔴 **The claim that decision rests on, verified rather than assumed.** "Rounded display" is
 * only harmless while the rounded text cannot BECOME the value. It cannot: `onChange` — which
 * fires solely on real typing — is the only path that commits from the buffer. `onBlur` merely
 * resyncs it, and Arrow up/down computes from `props.value`, never from the displayed text. A
 * session that assumed otherwise nearly filed a second defect for a round-trip that does not
 * happen; the third test below is what settles it, and what turns red if a later refactor makes
 * blur commit.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

/** Mount one number input at `value` and hand back the element plus the commit spy. */
function mount(value: number): { input: HTMLInputElement; onCommit: ReturnType<typeof vi.fn> } {
  container = document.createElement('div');
  document.body.appendChild(container);
  const onCommit = vi.fn();
  root = createRoot(container);
  act(() => {
    root!.render(createElement(RealtimeNumberInput, { value, onCommit, ariaLabel: 'X position' }));
  });
  const input = container.querySelector('input');
  if (input === null) throw new Error('no input rendered');
  return { input, onCommit };
}

describe('B-180 — the Inspector display keeps rounding, and that is the decision', () => {
  it('🔴 a stored residue value still reads as the whole number the author typed', () => {
    // Pinned by VALUE, as the brief requires. This is the exact reading `B-180` complains
    // about; it is retained deliberately, for the three reasons in the file docstring.
    expect(mount(124.00000000000001).input.value).toBe('124');
  });

  it('a genuinely fractional authored value is NOT hidden — the rounding is to 2 dp', () => {
    // The control that keeps assertion 1 meaningful: the display is not "always integers". A
    // number the author can see and typed is shown, so `D-122`'s "typed values are real values"
    // promise still holds at the only surface that reports them.
    expect(mount(124.5).input.value).toBe('124.5');
  });

  it('🔴 focus and blur WITHOUT typing commits nothing — the display cannot become the value', () => {
    /*
      The load-bearing assertion. Leaving a rounded display in place is only safe while the
      rounded TEXT cannot be written back to the model; if a blur committed the buffer, opening
      an old project and tabbing through the Inspector would quietly rewrite every value to 2 dp
      — a far worse defect than the one `B-180` reports. It does not, and this pins it.
    */
    const { input, onCommit } = mount(124.567);
    expect(input.value).toBe('124.57'); // …the display really is lossy, so the risk is real…
    act(() => {
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled(); // …and it is never taken.
  });
});
