/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TemplateInfo } from '@cg/shared-ipc';
import { TEMPLATE_TIMING_VERSION, type StackItemState } from '@cg/shared-schema';

/**
 * 🔴 **`TIMING-WIRE-22` §4 — THE CONSOLE'S TIMING SECTION.**
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
 * ── 🔴 `DELTA B4` — AND THIS SECTION SENDS NOTHING ──────────────────────────
 *
 * It stages into the draft store; `Update` spends the draft and `Discard` drops it. So the
 * bridge stub below is a TRIPWIRE rather than a subject: the cases assert `sent` is empty,
 * because the defect B4 exists to remove is a control that reaches toward air when the operator
 * merely looks away from it. The commit half is pinned in `timingDraftCommit.dom.test.ts`.
 */

const { TimingSection } = await import('../src/renderer/features/inspector/TimingSection.js');
const { __resetDraftsForTest, timingDraftOf } =
  await import('../src/renderer/features/inspector/draftStore.js');
const { __resetSentPassesForTest, recordSentPasses } =
  await import('../src/renderer/features/inspector/timingSent.js');

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
  __resetDraftsForTest();
  __resetSentPassesForTest();
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
  host.querySelector<HTMLInputElement>(`input[aria-label="${l}"]`);
const choice = (name: string): HTMLButtonElement | null => {
  for (const b of host.querySelectorAll<HTMLButtonElement>('button')) {
    if (b.textContent === name) return b;
  }
  return null;
};

/**
 * Type into a control, through React rather than around it.
 *
 * 🔴 `DELTA B3` — the box is `ui/NumericInput`, which is CONTROLLED: the text lives in React
 * state, not in the DOM node. A bare `el.value = …` writes a string the component overwrites on
 * its next render and never sees, so the draft would stay empty and every assertion about what
 * was staged would fail for a reason that has nothing to do with the product.
 *
 * ⚠ React installs its own `value` setter on the element to track changes, so assigning through
 * the element skips the tracker and `onChange` never fires. Calling the PROTOTYPE's setter
 * writes the DOM without touching the tracker, and the dispatched `input` then looks exactly
 * like a keystroke. Spelled out because its absence fails SILENTLY.
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

/**
 * Type, then LEAVE the control.
 *
 * ⚠ The event is `focusout`, NOT `blur`. React's `onBlur` is delegated at the root and `blur`
 * does not bubble, so `focusout` is what React actually listens for — a dispatched `blur`
 * reaches nothing and the handler never runs, which reads in a test exactly like a control that
 * does nothing on blur. Since `DELTA B4` doing nothing IS the contract, that confusion would be
 * fatal here: the tripwire below would pass having fired an event nobody listens for.
 */
function blurAfterTyping(label: string, value: string): void {
  const el = type(label, value);
  act(() => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

/*
  🔴 **`PASSES-CYCLE-ONLY-26` (owner, 2026-09-16) — THE PASS CONTROLS EXIST ONLY UNDER MODE
  `Loop cycle`, so this fixture is a `loop-cycle` one.**

  It used to be `{mode: 'manual', loops: true}`, on the reasoning that `loops` is its own bit
  because the repeating scope is often a nested instance below a non-looping root. That
  reasoning was TRUE and the conclusion was wrong: the nested scope that loops is usually not
  the graphic. On the plant's news ticker it is a BLINKING DOT — the section read
  `Auto-out / Content-driven` while offering a count that reached only the dot, so `Count 2`
  made the dot blink twice and vanish.

  The controls now follow the mode the section STATES. `loops` is still on the record (it is
  what `templateTimingOf` derived) and is no longer what the controls are offered on.
*/
const LOOPS = {
  v: TEMPLATE_TIMING_VERSION,
  mode: 'loop-cycle',
  holdSource: 'timed',
  loops: true,
} as const;

/** The plant's news ticker: a content-driven crawl whose only `loop-cycle` scope is a dot. */
const TICKER = {
  v: TEMPLATE_TIMING_VERSION,
  mode: 'auto-out',
  holdSource: 'content-driven',
  loops: true,
  repeat: 'infinite',
} as const;

describe('🔴 PASSES-CYCLE-ONLY-26 — the pass controls follow the STATED mode', () => {
  /*
    ── THE OWNER'S OBSERVATION, AND WHY IT IS A LIE RATHER THAN A GAP ──────────────────────

    On `نوار خبر (روی آنتن)` the section read `Auto-out` / `Content-driven` and still showed
    `Until stop` / `Count`, a gap box and `Default (∞)`. Changing them did nothing he could
    see. Measured on the stored record (`c44d061f`, re-verified at HEAD): the root is
    `auto-out`/`content-driven` with a crawl of `repeat: 2`, and the ONLY `loop-cycle` scope in
    the whole template is a nested «چشمک» — a blinking dot, `holdMs: 0`, `repeat: 'infinite'`.

    `applyPassTiming` walks every scope and `setRemainingPasses` returns early on a non-cyclic
    one, so the count reached the DOT and nothing else. `Count 2` = the dot blinks twice and
    disappears. `Default (∞)` = the dot's count, stated on a graphic that ends after two crawl
    passes.

    A control that states another scope's number and silently steers a decoration is worse than
    no control: it is the console being confidently wrong, which is the one thing an operator
    cannot defend against.
  */
  const ROWS = [
    ['Manual', { v: TEMPLATE_TIMING_VERSION, mode: 'manual' }],
    ['Auto-out / Timed', { v: TEMPLATE_TIMING_VERSION, mode: 'auto-out', holdSource: 'timed' }],
    ['Static', { v: TEMPLATE_TIMING_VERSION, mode: 'static' }],
  ] as const;

  for (const [name, playout] of ROWS) {
    it(`${name} shows NO pass control and NO gap box`, () => {
      mount(row(), template(playout as never));
      expect(
        host.querySelector('[data-testid="timing-mode-fact"]'),
        'the row did not render',
      ).not.toBeNull();
      expect(choice('Until stop'), `${name} offered Until stop`).toBeNull();
      expect(choice('Count'), `${name} offered Count`).toBeNull();
      expect(byLabel('Passes'), `${name} offered a passes box`).toBeNull();
      expect(text(), `${name} stated a default count`).not.toContain('Default');
    });

    it(`${name} shows none even when something INSIDE it loops`, () => {
      // The ticker's shape: a non-looping root whose only cyclic scope is a nested decoration.
      // This is the case the old loops gate was built for, and it is exactly the wrong one.
      mount(row(), template({ ...(playout as object), loops: true, repeat: 'infinite' } as never));
      expect(choice('Until stop'), `${name} + a nested loop offered Until stop`).toBeNull();
      expect(byLabel('Passes'), `${name} + a nested loop offered a passes box`).toBeNull();
    });
  }

  it('🔴 the plant ticker that started this shows Mode and Hold and nothing else', () => {
    mount(row(), template(TICKER as never));
    expect(host.querySelector('[data-testid="timing-mode-fact"]')?.textContent).toBe('Auto-out');
    expect(host.querySelector('[data-testid="timing-hold-fact"]')?.textContent).toBe(
      'Content-driven',
    );
    expect(choice('Until stop')).toBeNull();
    expect(choice('Count')).toBeNull();
    expect(byLabel('Gap between passes')).toBeNull();
    expect(text()).not.toContain('∞');
  });

  it('Loop cycle + Timed KEEPS them', () => {
    mount(row(), template({ ...LOOPS } as never));
    expect(choice('Until stop'), 'a real loop lost its control').not.toBeNull();
  });

  it('Loop cycle + Content-driven KEEPS them — the HOLD does not decide', () => {
    // The rule is about MODE. A loop whose hold is content-driven still repeats, and its pass
    // count is still the operator's.
    mount(row(), template({ ...LOOPS, holdSource: 'content-driven' } as never));
    expect(choice('Until stop')).not.toBeNull();
  });

  it('Loop cycle keeps them even with the loops bit ABSENT from the record', () => {
    // The loops bit is no longer what they are offered on, so a record that never carried the bit
    // (or carried it false) must still get the controls when the mode says loop-cycle.
    mount(row(), template({ v: TEMPLATE_TIMING_VERSION, mode: 'loop-cycle' } as never));
    expect(choice('Until stop')).not.toBeNull();
  });
});

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
      expect(host.querySelector(`[data-testid="${id}"]`)?.className).toBe('cg-meta-chip');
    }
  });

  it('🔴 DELTA A6 — an OLD import says why, instead of vanishing', () => {
    // A control that disappears without a reason is the silence this product forbids: the
    // operator finds a control on one row and none on the next, with nothing accounting for it.
    mount(row(), template(undefined));
    expect(host.querySelector('[data-testid="timing-needs-reimport"]')?.textContent).toBe(
      'Timing controls appear after this template is re-imported.',
    );
    expect(host.querySelector('[data-testid="timing-mode-fact"]')).toBeNull();
  });

  it('🔴 DELTA B1.4 — a record from an OLDER derivation is refused, not displayed', () => {
    // It was derived by the entry-composition resolver, which published whichever panel a
    // per-composition export listed first. Those facts are WRONG, not old, and a console that
    // is confidently wrong is the one thing an operator cannot defend against.
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
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(byLabel('Passes remaining'), 'the on-air label is missing').not.toBeNull();
    expect(byLabel('Passes next take')).toBeNull();
  });

  it('OFF AIR the same field is the count for the NEXT TAKE', () => {
    mount(row({ status: 'idle', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(byLabel('Passes next take'), 'the off-air label is missing').not.toBeNull();
    expect(byLabel('Passes remaining')).toBeNull();
  });

  it('🔴 DELTA B2 — the section TEACHES NOTHING: no explanatory sentence survives', () => {
    /*
      The lines this pins the absence of are not a style preference. An operator surface states
      LABELS, VALUES, STATE FACTS and REFUSALS; a sentence explaining how the feature works is
      read once, never again, and then occupies the space a real message needs. The rule is
      CLAUDE.md's, under "Design system — interactive controls".

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
        expect(text(), `${String(re)} came back on a ${status} row`).not.toMatch(re);
      }
    }
  });
});

describe('🔴 DELTA A2 — on air the console states what it SENT, never a count it cannot see', () => {
  /*
    The pass counter lives in the page's controller inside CEF and NO return path carries it, so
    the console can only ever know what it sent. A number under "Passes remaining" is therefore
    a reading with a shelf life: one pass after "set 2" it still says 2 while ONE remains, and
    after the count runs out it says 2 over a graphic that has gone. It decays with nobody
    touching anything, which is the worst shape a false readout can have.
  */
  it('shows NO number in the box while on air', () => {
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    const box = byLabel('Passes remaining');
    expect(box?.value, 'a number here is a claim about the page that nothing backs').toBe('');
    expect(box?.placeholder, 'the same claim in lighter ink is the same claim').toBe('');
  });

  it('states what was sent, as a fact about the past', () => {
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-passes-sent"]')?.textContent).toBe(
      'Sent 2 more passes',
    );
  });

  it('🔴 owner 2026-09-15 — the NUMBER is the thing, so the number is what reads', () => {
    /*
      «Sent 5 more متنش باید مشخص‌تر باشه مخصوصاً عددش». The whole line was the muted caption
      ink, so the count was set in the same dim grey as the punctuation around it. The count is
      lifted out on its own element; the rest of the sentence stays a caption.
    */
    mount(row({ status: 'on-air', timingOverride: { repeat: 5 } }), template(LOOPS));
    const line = host.querySelector('[data-testid="timing-passes-sent"]')!;
    const strong = line.querySelector('strong');
    expect(strong, 'the count is not distinguished from the words around it').not.toBeNull();
    expect(strong?.textContent).toBe('5 more');

    /*
      …and it is actually PAINTED differently, not merely wrapped in an element that could be.
      An inline style is a value jsdom's cascade really resolves — the one class of visual claim
      golden rule 12c says this environment answers honestly — so this is a measurement here and
      not a stand-in for one.
    */
    const lineInk = getComputedStyle(line).color;
    const countInk = getComputedStyle(strong!).color;
    expect(countInk, 'the count is the same muted grey as the words around it').not.toBe('');
    expect(countInk, 'the count is the same muted grey as the words around it').not.toBe(lineInk);
  });

  it('carries the local time of an accepted send, and omits it when there is none', () => {
    // A count set from ANOTHER console has no time this browser can know, so the line says what
    // was sent and omits the when rather than timing the republish that carried it here.
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-passes-sent"]')?.textContent).toBe(
      'Sent 2 more passes',
    );
    recordSentPasses('item-1');
    mount(row({ status: 'on-air', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-passes-sent"]')?.textContent).toMatch(
      /^Sent 2 more passes · .+/,
    );
  });

  it('says so plainly when nothing has been sent this run', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    expect(host.querySelector('[data-testid="timing-passes-sent"]')?.textContent).toBe(
      'Nothing sent',
    );
  });

  it('🔴 answers in the two-state control’s own words — until stop, never the bare glyph', () => {
    /*
      The two-state control above this line says `Until stop`. A readout answering `∞` would be
      the label-in-two-places defect one surface along — and the glyph was taken off the control
      precisely because the owner could not read it.
    */
    mount(row({ status: 'on-air', timingOverride: { repeat: 'infinite' } }), template(LOOPS));
    const line = host.querySelector('[data-testid="timing-passes-sent"]');
    expect(line?.textContent).toBe('Sent until stop');
    expect(line?.textContent, 'the glyph came back in the readout').not.toMatch(/∞/);
  });

  it('OFF AIR the box shows the STORED count — that one IS a fact the console holds', () => {
    // The asymmetry is the point: the next take's count is stored and knowable; a running
    // page's remaining count is not.
    mount(row({ status: 'idle', timingOverride: { repeat: 2 } }), template(LOOPS));
    expect(byLabel('Passes next take')?.value).toBe('2');
    expect(host.querySelector('[data-testid="timing-passes-sent"]')).toBeNull();
  });
});

describe('§4 — inheritance is SHOWN as inheritance', () => {
  it('names the inherited count rather than showing a bare value', () => {
    mount(row(), template({ ...LOOPS, repeat: 3 } as never));
    expect(byLabel('Passes next take')?.placeholder).toBe('Default (3)');
  });

  it('an UNAUTHORED count selects Until stop — never an empty box meaning forever', () => {
    mount(row(), template(LOOPS));
    // With nothing authored and nothing stored, the STATE is the statement — which is stronger
    // than a placeholder naming it, and is why there is no count box to read here.
    expect(byLabel('Passes next take')).toBeNull();
    expect(choice('Until stop')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('the gap names its inherited value, and the FIELD carries the unit', () => {
    /*
      🔴 Owner, 2026-09-15: «برای گپ هم باید نشون داده بشه که مقدار بر اساس ثانیه هست مثل
      اینپوتهای دیزاینر». The unit used to live inside the placeholder, so it vanished the
      moment anyone typed — a unit stated at exactly the wrong moment. It is rendered beside the
      value now, the way the Designer's `speed [120] px/s` is, and is therefore visible while
      the operator is typing the number it applies to.
    */
    mount(row(), template({ ...LOOPS, delayMs: 2500 } as never));
    expect(byLabel('Gap between passes')?.placeholder).toBe('Default (2.5)');
    const unit = host.querySelector('.cg-num-unit .cg-unit');
    expect(unit?.textContent, 'the field does not say what the number is measured in').toBe('s');
  });

  it('🔴 and the unit is still there once a value is typed', () => {
    // The whole point of moving it out of the placeholder. Pinned separately because the
    // placeholder case above would go on passing if the unit only ever rendered when empty.
    mount(
      row({ timingOverride: { delayMs: 1500 } }),
      template({ ...LOOPS, delayMs: 2500 } as never),
    );
    expect(byLabel('Gap between passes')?.value).toBe('1.5');
    expect(host.querySelector('.cg-num-unit .cg-unit')?.textContent).toBe('s');
  });

  it('🔴 owner 2026-09-15 — the boxes are SHORT; they take short numeric values', () => {
    // «اینپوتها نیاز نیست اینقدر کشیده باشن چون فقط مقادیر عددی کوتاه میگیرن». A box stretched
    // to the panel's width says "type a lot here" about a value that is never long.
    // ⚠ jsdom has no layout, so the WIDTH itself cannot be measured here (golden rule 12c) —
    // what is pinned is that both boxes carry the class that sets it, and the class's own
    // declaration lives in `controls.css` where a stylesheet test can reach it.
    mount(row({ timingOverride: { repeat: 3 } }), template(LOOPS));
    expect(byLabel('Passes next take')?.className).toContain('cg-num-short');
    expect(
      host.querySelector('.cg-num-unit'),
      'the gap box is not the narrow unit field',
    ).not.toBeNull();
  });

  it('once the operator has stored a gap, the box shows it', () => {
    mount(
      row({ timingOverride: { delayMs: 1500 } }),
      template({ ...LOOPS, delayMs: 2500 } as never),
    );
    expect(byLabel('Gap between passes')?.value).toBe('1.5');
  });
});

describe('🔴 DELTA B4 — the section SENDS NOTHING; it stages', () => {
  it('🔴 a BLUR sends no command — the whole of B4 in one assertion', () => {
    /*
      Owner-observed and the reason B4 exists: a click anywhere else on the panel was a commit
      toward air. Every other Inspector edit waits for one press; timing was the only surface on
      which looking away was an action.
    */
    mount(row({ status: 'on-air', timingOverride: { repeat: 9 } }), template(LOOPS));
    blurAfterTyping('Passes remaining', '3');
    expect(sent, 'a blur reached toward air').toEqual([]);
    expect(timingDraftOf('item-1')?.passes, 'the edit was not staged either').toEqual({
      kind: 'count',
      text: '3',
    });
    expect(errors).toEqual([]);
  });

  it('🔴 and the typed value STAYS VISIBLE, which is the other half of what was wrong', () => {
    // The box used to clear itself on blur, so the number was gone before the operator could
    // check it — the edit was destroyed and sent in one gesture.
    mount(row({ status: 'on-air', timingOverride: { repeat: 9 } }), template(LOOPS));
    blurAfterTyping('Passes remaining', '3');
    expect(byLabel('Passes remaining')?.value).toBe('3');
  });

  it('stages what was typed, as the value a press would carry', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    // A template that loops forever and a row storing nothing IS `Until stop`, so there is no
    // count box until the operator says they want one. That is the two-state contract, not a
    // missing control — and this line is the shape of every count edit on such a row.
    act(() => choice('Count')?.click());
    type('Passes remaining', '3');
    expect(timingDraftOf('item-1')?.passes).toEqual({ kind: 'count', text: '3' });
  });

  it('stages the gap in SECONDS as typed, not rounded into a number', () => {
    // `"1."` is a state a round trip through a number would flatten under the cursor.
    mount(row(), template(LOOPS));
    type('Gap between passes', '1.');
    expect(timingDraftOf('item-1')?.gapSeconds).toBe('1.');
    expect(byLabel('Gap between passes')?.value).toBe('1.');
  });

  it('a Persian-typed count is normalised before it is staged', () => {
    // What the house primitive is FOR. This console is operated on a Persian keyboard, and a
    // raw box staged `۳` for a parser that reads it as nonsense.
    mount(row({ status: 'on-air' }), template(LOOPS));
    act(() => choice('Count')?.click());
    type('Passes remaining', '۳');
    expect(timingDraftOf('item-1')?.passes).toEqual({ kind: 'count', text: '3' });
  });

  it('a Persian DECIMAL gap normalises too — ٫ is not a digit', () => {
    mount(row(), template(LOOPS));
    type('Gap between passes', '۱٫۵');
    expect(timingDraftOf('item-1')?.gapSeconds).toBe('1.5');
  });
});

describe('🔴 DELTA B4 — Until stop / Count is a LABELLED two-state choice', () => {
  it('the bare ∞ is gone, and both states are named in words', () => {
    // Owner-observed: the `∞` was not understood. Nothing said whether it was the state the row
    // was IN or an action pressing it would take.
    mount(row(), template(LOOPS));
    expect(choice('∞'), 'the bare glyph is still there').toBeNull();
    expect(choice('Until stop')).not.toBeNull();
    expect(choice('Count')).not.toBeNull();
  });

  it('SHOWS which one is selected, which is the thing a toggle exists to carry', () => {
    mount(row(), template(LOOPS));
    expect(choice('Until stop')?.getAttribute('aria-pressed')).toBe('true');
    expect(choice('Count')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('a STORED count selects Count without anyone having pressed it', () => {
    mount(row({ timingOverride: { repeat: 3 } }), template(LOOPS));
    expect(choice('Count')?.getAttribute('aria-pressed')).toBe('true');
    expect(choice('Until stop')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('choosing Until stop is a DRAFT, not a send', () => {
    mount(row({ status: 'on-air', timingOverride: { repeat: 3 } }), template(LOOPS));
    act(() => choice('Until stop')?.click());
    expect(sent, 'choosing a state reached toward air').toEqual([]);
    // The remembered text rides along (it is '' on air, where no count is shown); what the
    // press will CARRY is the kind, and that is what this asserts.
    expect(timingDraftOf('item-1')?.passes?.kind).toBe('until-stop');
    expect(choice('Until stop')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('the count box belongs to Count and is not rendered beside Until stop', () => {
    // A box that cannot affect anything is the R-021 stage-2b anti-pattern, and a DISABLED one
    // would be the greyed control this section refuses on the facts above it.
    mount(row({ timingOverride: { repeat: 3 } }), template(LOOPS));
    expect(byLabel('Passes next take')).not.toBeNull();
    act(() => choice('Until stop')?.click());
    expect(byLabel('Passes next take')).toBeNull();
  });

  it('switching to Count keeps the number already in the box', () => {
    mount(row({ timingOverride: { repeat: 3 } }), template(LOOPS));
    type('Passes next take', '7');
    act(() => choice('Until stop')?.click());
    act(() => choice('Count')?.click());
    expect(byLabel('Passes next take')?.value, 'the round trip ate the number').toBe('7');
  });
});

describe('§4 — 0 is an instruction; a non-count is REFUSED with a reason', () => {
  it('stages 0 rather than treating it as empty', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    act(() => choice('Count')?.click());
    blurAfterTyping('Passes remaining', '0');
    expect(timingDraftOf('item-1')?.passes).toEqual({ kind: 'count', text: '0' });
    expect(errors, '0 was refused — it is an instruction').toEqual([]);
  });

  it('stages a gap of 0, which means no gap', () => {
    mount(row(), template(LOOPS));
    blurAfterTyping('Gap between passes', '0');
    expect(timingDraftOf('item-1')?.gapSeconds).toBe('0');
    expect(errors).toEqual([]);
  });

  it('REFUSES a non-count with a reason — never a silent rewrite', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    act(() => choice('Count')?.click());
    blurAfterTyping('Passes remaining', 'two');
    expect(errors[0], 'refused without saying why').toMatch(/not a pass count/i);
    expect(sent, 'nonsense reached toward air').toEqual([]);
  });

  it('🔴 and a refusal LEAVES THE TEXT for the operator to correct', () => {
    // The old control cleared the box on refusal, so the operator was told their value was
    // wrong and simultaneously deprived of it. What stops nonsense reaching air is
    // `timingPassesOf`, not the clearing.
    mount(row({ status: 'on-air' }), template(LOOPS));
    act(() => choice('Count')?.click());
    blurAfterTyping('Passes remaining', 'two');
    expect(byLabel('Passes remaining')?.value).toBe('two');
  });

  it('refuses a negative count rather than clamping it up', () => {
    mount(row({ status: 'on-air' }), template(LOOPS));
    act(() => choice('Count')?.click());
    blurAfterTyping('Passes remaining', '-1');
    expect(errors).toHaveLength(1);
  });

  it('refuses a gap that is not seconds', () => {
    mount(row(), template(LOOPS));
    blurAfterTyping('Gap between passes', '-2');
    expect(errors[0]).toMatch(/not a gap in seconds/i);
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
    expect(choice('Until stop')).toBeNull();
  });
});
