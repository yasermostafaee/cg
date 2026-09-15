/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TemplateInfo } from '@cg/shared-ipc';
import { TEMPLATE_TIMING_VERSION, type StackItemState } from '@cg/shared-schema';

/**
 * 🔴 **`TIMING-WIRE-22` §4 — THE CONSOLE'S TIMING SECTION.**
 *
 * Three claims, and the second is the one the previous session could not build:
 *
 *  1. `mode` and `hold` are FACTS — `Tag`s, never inputs and never DISABLED inputs (ADR 0009).
 *     A greyed box tells the operator they lack a permission; the truth is the value was never
 *     theirs to set.
 *  2. **THE COUNT'S LABEL CHANGES WITH THE STATE.** On air it is PASSES REMAINING FROM NOW; off
 *     air it is the count for the next take. Same field, two meanings — a field labelled
 *     "repeat" in both states is how an operator asks for two more passes and gets two total.
 *  3. Inheritance is SHOWN as inheritance — `Default (∞)`, never a bare `∞` — so a value the
 *     operator chose can be told from one they were given.
 *
 * ⚠ And §2's rule: the control never displays a number the template has not accepted. It renders
 * from the row's PUBLISHED `timingOverride`, which the bridge writes only after a set it
 * accepted, so a refused set leaves the display showing what air is doing without anything
 * having to put it back.
 */

const { TimingSection } = await import('../src/renderer/features/inspector/TimingSection.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const sent: unknown[] = [];
const errors: string[] = [];

vi.mock('../src/renderer/features/status/commandFeedback.js', () => ({
  reportCommandError: (m: string) => {
    errors.push(m);
  },
}));

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  sent.length = 0;
  errors.length = 0;
  (globalThis as unknown as { window: { cg: unknown } }).window.cg = {
    stack: {
      setPassTiming: (req: unknown) => {
        sent.push(req);
        return Promise.resolve({ ok: true });
      },
    },
  };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function template(playout?: TemplateInfo['playout']): TemplateInfo {
  return {
    templateId: 'looper',
    templateType: 'looper',
    fields: [],
    ...(playout !== undefined ? { playout } : {}),
  } as TemplateInfo;
}

function row(over: Partial<StackItemState> = {}): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'looper',
    fields: {},
    status: 'idle',
    pending: false,
    ...over,
  } as unknown as StackItemState;
}

function mount(item: StackItemState, info: TemplateInfo | null | undefined): void {
  act(() => {
    root.render(createElement(TimingSection, { item, info }));
  });
}

const text = (): string => host.textContent ?? '';
const byLabel = (l: string): HTMLInputElement | null =>
  host.querySelector<HTMLInputElement>(`[aria-label="${l}"]`);

/**
 * Type a value and commit it.
 *
 * ⚠ The event is `focusout`, NOT `blur`. React's `onBlur` is delegated at the root and `blur`
 * does not bubble, so it is `focusout` that React actually listens for — a dispatched `blur`
 * reaches nothing and the handler never runs, which reads in a test exactly like a control that
 * sends nothing.
 *
 * 🔴 `DELTA B3` — **AND THE VALUE GOES IN THROUGH REACT, NOT AROUND IT.**
 *
 * The box is now `ui/NumericInput`, which is CONTROLLED: the typed text lives in React state,
 * not in the DOM node. A bare `el.value = …` therefore writes a string the component overwrites
 * on its next render and never sees — the commit handler would read an empty draft and send
 * nothing, and every assertion about what was sent would fail for a reason that has nothing to
 * do with the product.
 *
 * ⚠ React installs its own `value` setter on the element to track changes, so assigning through
 * the element skips the tracker and `onChange` never fires. Calling the PROTOTYPE's setter
 * writes the DOM without touching the tracker, and the dispatched `input` then looks exactly
 * like a keystroke. This is the same defeat-the-tracker step every controlled-input test needs;
 * it is spelled out here because its absence fails SILENTLY.
 */
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

function type(label: string, value: string): HTMLInputElement {
  const el = byLabel(label);
  if (el === null) throw new Error(`no control labelled "${label}"`);
  act(() => {
    nativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return el;
}

function commit(label: string, value: string): void {
  const el = type(label, value);
  act(() => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

/*
  🔴 `loops` IS ITS OWN BIT, and this fixture says so deliberately. The row's `mode` is the
  ROOT's — often `manual` — while the scope that repeats is a nested instance below it, so the
  section cannot derive "does this loop" from the mode. The realistic shape is therefore a
  non-looping mode WITH `loops: true`, which is what `logo-bug` actually is.
*/
const LOOPS = {
  v: TEMPLATE_TIMING_VERSION,
  mode: 'manual',
  holdSource: 'timed',
  loops: true,
} as const;

describe('§4 — mode and hold are FACTS, never inputs', () => {
  it('states them, and offers no control for either', () => {
    mount(row(), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-mode-fact"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="timing-hold-fact"]')).not.toBeNull();
    // Not a disabled input — there is NO input. The strongest form of refusing is not existing.
    expect(byLabel('Mode')).toBeNull();
    expect(byLabel('Hold')).toBeNull();
  });

  it('the fact is a Tag, which cannot be made pressable', () => {
    mount(row(), template(LOOPS));
    const fact = host.querySelector('[data-testid="timing-mode-fact"]')!;
    expect(fact.tagName).toBe('SPAN');
    expect(fact.hasAttribute('data-cg-tag')).toBe(true);
    expect(fact.getAttribute('role')).toBeNull();
  });

  it('🔴 DELTA B2 — the fact is the WORD; its long form is on the title', () => {
    /*
      These read "Loop cycle — repeats in → hold → out" on the panel. An operator reading a row
      under pressure wants the NAME of the thing; the sentence explaining it is an explanation,
      and an explanation on a chip is prose wearing a value's clothes.
    */
    mount(row(), template({ ...LOOPS, mode: 'loop-cycle' } as never));
    const fact = host.querySelector('[data-testid="timing-mode-fact"]')!;
    expect(fact.textContent).toBe('Loop cycle');
    expect(fact.getAttribute('title'), 'the long form was dropped, not relocated').toBe(
      'Repeats in → hold → out',
    );
    const hold = host.querySelector('[data-testid="timing-hold-fact"]')!;
    expect(hold.textContent).toBe('Timed');
    expect(hold.getAttribute('title')).toBe('Holds for a duration');
  });

  it('🔴 DELTA B3 — the facts wear the Inspector house chip, not a class nothing declares', () => {
    // `cg-fact` was invented here and no stylesheet ever declared it, so the two facts rendered
    // as bare text while every other stated value on this panel is a chip. A class with no rule
    // fails in exactly the way a green gate cannot see (golden rule 12).
    mount(row(), template(LOOPS));
    for (const id of ['timing-mode-fact', 'timing-hold-fact']) {
      expect(host.querySelector('[data-testid="' + id + '"]')?.className).toBe('cg-meta-chip');
    }
  });

  it('🔴 DELTA A6 — an OLD import says why, instead of vanishing', () => {
    // A control that disappears without a reason is the silence this product forbids: the
    // operator finds a control on one row and none on the next, with nothing accounting for it.
    mount(row(), template(undefined));
    expect(host.querySelector('[data-testid="timing-needs-reimport"]')?.textContent).toBe(
      'Timing controls appear after this template is re-imported.',
    );
    // …and it still states nothing it cannot know, and offers nothing it cannot carry.
    expect(host.querySelector('[data-testid="timing-mode-fact"]')).toBeNull();
    expect(byLabel('Passes next take')).toBeNull();
  });

  it('🔴 DELTA B1.4 — a record from an OLDER derivation is refused, not displayed', () => {
    /*
      Stale facts here are WRONG, not old. Before `v: 2` the block was derived from the entry
      composition with a `comps[0]` fallback, so a per-composition export published whichever
      panel was listed first — the plant's crawler read `static / timed` (a clock panel's) over
      `auto-out / content-driven`. A console that is confidently wrong is the one thing an
      operator cannot defend against, so an unversioned record gets the re-import sentence.
    */
    mount(row(), template({ mode: 'loop-cycle', holdSource: 'timed', loops: true } as never));
    expect(host.querySelector('[data-testid="timing-needs-reimport"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="timing-mode-fact"]')).toBeNull();
  });

  it('says nothing at all while the Inspector is still FETCHING the template', () => {
    // `null` is "not known yet", not "known to be old". Flashing a re-import notice at every row
    // selection would make the sentence noise, and noise is how a real one stops being read.
    mount(row(), null);
    expect(text()).toBe('');
  });
});

describe('🔴 §4 — the count says what it will do in the state it is in', () => {
  it('ON AIR it is passes REMAINING FROM NOW, and the LABEL is what says so', () => {
    /*
      DELTA B2 — the label carries the contract; the two sentences that used to explain it are
      gone. What "remaining" means is documented in ADR 0009 and taught in training, not on the
      panel. This test therefore pins the LABEL, which is the thing the operator reads.
    */
    mount(row({ status: 'on-air' }), template(LOOPS));
    expect(byLabel('Passes remaining'), 'the on-air label is missing').not.toBeNull();
    expect(byLabel('Passes next take')).toBeNull();
  });

  it('OFF AIR the same field is the count for the NEXT TAKE', () => {
    mount(row({ status: 'idle' }), template(LOOPS));
    expect(byLabel('Passes next take'), 'the off-air label is missing').not.toBeNull();
    expect(byLabel('Passes remaining')).toBeNull();
  });

  it('🔴 DELTA B2 — the section TEACHES NOTHING: no explanatory sentence survives', () => {
    /*
      The five lines this pins the absence of are not a style preference. An operator surface
      states LABELS, VALUES, STATE FACTS and REFUSALS; a sentence explaining how the feature
      works is read once, never again, and then occupies the space a real message needs. The
      rule is CLAUDE.md's, under "Design system — interactive controls".

      Pinned as an ABSENCE because that is the direction this regresses in: the next person to
      touch the panel adds one helpful line, and nothing fails.
    */
    const REMOVED = [
      /Set by the template/i,
      /the pass on screen is not counted/i,
      /count this row will run/i,
      /Dead air between repeats/i,
      /delays the first showing/i,
      /Takes effect from the next pass/i,
      /Applies from the next take/i,
    ];
    for (const status of ['on-air', 'idle'] as const) {
      mount(row({ status }), template(LOOPS));
      for (const re of REMOVED) {
        expect(text(), String(re) + ' came back on a ' + status + ' row').not.toMatch(re);
      }
    }
  });
});

describe('🔴 DELTA A2 — on air the console states what it SENT, never a count it cannot see', () => {
  /*
    The pass counter lives in the page's controller inside CEF and NO return path carries it, so
    the console can only ever know what it sent. A numeric placeholder under "Passes remaining"
    is therefore a reading with a shelf life: one pass after "set 2" it still says 2 while ONE
    remains, and after the count runs out it says 2 over a graphic that has gone. It decays with
    nobody touching anything, which is the worst shape a false readout can have.
  */
  it('shows NO number in the box while on air', () => {
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(
      byLabel('Passes remaining')?.placeholder,
      'a number here is a claim about the page that nothing backs',
    ).toBe('');
  });

  it('states what was sent, as a fact about the past', () => {
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    const sent = host.querySelector('[data-testid="timing-passes-sent"]');
    expect(sent?.textContent).toMatch(/^Sent 2 more/);
  });

  it('says so plainly when nothing has been sent this run', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-passes-sent"]')?.textContent).toBe(
      'Nothing sent',
    );
  });

  it('spells infinite the one way', () => {
    mount(row({ status: 'on-air', timingOverride: { repeat: 'infinite' } }), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-passes-sent"]')?.textContent).toMatch(
      /^Sent ∞ more/,
    );
  });

  it('OFF AIR the placeholder stays — that one IS a stored fact the console holds', () => {
    // The asymmetry is the point: the next take's count is stored and knowable; a running
    // page's remaining count is not.
    mount(row({ status: 'idle', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(byLabel('Passes next take')?.placeholder).toBe('2');
    expect(host.querySelector('[data-testid="timing-passes-sent"]')).toBeNull();
  });
});

describe('§4 — inheritance is SHOWN as inheritance', () => {
  it('names the inherited count rather than showing a bare value', () => {
    mount(row(), template({ ...LOOPS, repeat: 3 }));
    expect(byLabel('Passes next take')?.placeholder).toBe('Default (3)');
  });

  it('an UNAUTHORED count reads Default (∞) — never an empty box meaning forever', () => {
    // §5's rule, on this surface: an empty field that means "forever" is the kind of silence
    // this product forbids.
    mount(row(), template(LOOPS));
    expect(byLabel('Passes next take')?.placeholder).toBe('Default (∞)');
  });

  it('the gap names its inherited value in seconds', () => {
    mount(row(), template({ ...LOOPS, delayMs: 2000 }));
    expect(byLabel('Gap between passes')?.placeholder).toBe('Default (2 s)');
  });

  it('once the operator sets one, it is no longer shown as a default', () => {
    mount(row({ timingOverride: { repeat: 2 } }), template({ ...LOOPS, repeat: 3 }));
    expect(byLabel('Passes next take')?.placeholder).toBe('2');
  });
});

describe('§4 — 0 is an instruction; a non-count is REFUSED with a reason', () => {
  it('sends 0 rather than treating it as empty', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    commit('Passes remaining', '0');
    expect(sent).toEqual([{ itemId: 'item-1', passes: 0 }]);
    expect(errors, '0 was refused — it is an instruction').toEqual([]);
  });

  it('sends a gap of 0, which means no gap', () => {
    mount(row(), template(LOOPS));
    commit('Gap between passes', '0');
    expect(sent).toEqual([{ itemId: 'item-1', delayMs: 0 }]);
  });

  it('REFUSES a non-count with a reason and sends nothing — never a silent rewrite', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    commit('Passes remaining', 'two');
    expect(sent, 'a nonsense value reached the wire').toEqual([]);
    expect(errors[0], 'refused without saying why').toMatch(/not a pass count/i);
  });

  it('refuses a negative count rather than clamping it up', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    commit('Passes remaining', '-1');
    expect(sent).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('accepts ∞ as keep-going', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    commit('Passes remaining', '∞');
    expect(sent).toEqual([{ itemId: 'item-1', passes: 'infinite' }]);
  });

  it('🔴 DELTA B3 — a PERSIAN-typed count reaches the wire as a number', () => {
    /*
      What the house primitive is FOR, and what the raw <input> here never did. This console is
      operated on a Persian keyboard: `۳` typed into a raw box arrived as `۳`, `parsePasses`
      read it as not-a-count, and the operator was told their own digit was nonsense. R-020's
      normalisation lives inside `ui/NumericInput`, so adopting the primitive fixes it here and
      at every future numeric field without anyone remembering to.
    */
    mount(row({ status: 'on-air' }), template(LOOPS));
    commit('Passes remaining', '۳');
    expect(sent, 'a Persian digit was refused as nonsense').toEqual([
      { itemId: 'item-1', passes: 3 },
    ]);
    expect(errors).toEqual([]);
  });

  it('🔴 DELTA B3 — and a Persian DECIMAL gap does too', () => {
    // ٫ (U+066B) is the Persian decimal separator, which `latinDigits` alone does not cover —
    // it is the `decimal` prop that handles it, so the gap box must declare one.
    mount(row(), template(LOOPS));
    commit('Gap between passes', '۱٫۵');
    expect(sent).toEqual([{ itemId: 'item-1', delayMs: 1500 }]);
  });
});

describe('§4 — the controls exist only where they mean something', () => {
  it('a non-looping template gets the facts and no pass controls', () => {
    // A gap BETWEEN passes is meaningless where there is only ever one pass; a control that can
    // only no-op is the anti-pattern R-021 stage 2b named.
    mount(
      row(),
      template({ v: TEMPLATE_TIMING_VERSION, mode: 'auto-out', holdSource: 'timed' } as never),
    );
    expect(host.querySelector('[data-testid="timing-mode-fact"]')).not.toBeNull();
    expect(byLabel('Passes next take')).toBeNull();
    expect(byLabel('Gap between passes')).toBeNull();
  });
});
