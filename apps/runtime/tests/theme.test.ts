import { describe, expect, it } from 'vitest';
import { airStateVisual, badgeTone, colors, cssVars, readyDetail } from '../src/renderer/theme.js';

/**
 * B-044 — pin the badge mapping for the states the pending-intent contract
 * depends on. Without this, dropping the `unconfirmed` branch would silently
 * fall through to the IDLE default — hiding the operator-facing "command
 * result unknown" signal that is the whole point of the bounded expiry.
 */
describe('airStateVisual — B-044 badge states', () => {
  it("renders the explicit 'unconfirmed' bounded-timeout state (never the IDLE fallthrough)", () => {
    expect(airStateVisual('unconfirmed', false)).toEqual({
      color: colors.pending,
      icon: '?',
      label: 'UNCONFIRMED',
    });
  });

  it('keeps the transient and settled visuals distinct', () => {
    expect(airStateVisual('updating', false).label).toBe('UPDATING');
    expect(airStateVisual('playing', true).label).toBe('TAKING');
    expect(airStateVisual('playing', false).label).toBe('ON AIR');
  });
});

/**
 * `idle` and `loaded` are ONE presented state — READY — by owner decision: the
 * operator cannot perceive the difference, and showing two states for one
 * perception is false precision.
 *
 * These pin BOTH halves of that decision, because the second half is what keeps it
 * honest. The difference is real — a `loaded` row plays immediately, an `idle` row
 * has to build its producer on CasparCG first, which takes time and can fail — so
 * if the presentation collapses without the explanation surviving somewhere, a slow
 * take starts reading as a bug.
 */
describe('airStateVisual / readyDetail — the READY merge', () => {
  it('presents `idle` and `loaded` identically: same word, same icon, same colour', () => {
    expect(airStateVisual('idle', false)).toEqual(airStateVisual('loaded', false));
    expect(airStateVisual('idle', false).label).toBe('READY');
    expect(badgeTone('idle', false)).toBe(badgeTone('loaded', false));
  });

  it('keeps the difference reachable, and distinguishable, in the detail text', () => {
    const idle = readyDetail('idle');
    const loaded = readyDetail('loaded');
    expect(idle).toBeDefined();
    expect(loaded).toBeDefined();
    expect(idle).not.toBe(loaded);
    // The one fact an operator needs when a take is slow or fails: this row had to
    // load first. Asserted on the substance, not the phrasing.
    expect(idle).toMatch(/nothing is on the layer yet/i);
    expect(loaded).toMatch(/immediately/i);
  });

  it('offers no detail for states that are not READY — it would be noise', () => {
    expect(readyDetail('on-air')).toBeUndefined();
    expect(readyDetail('error')).toBeUndefined();
  });
});

/**
 * B-086 — the link-down "unverifiable" badge is muted "WAS ON AIR": NEVER the broadcast AIR
 * COLOUR of an ON AIR claim (the wire no longer backs it), NEVER the amber of B-044's
 * `unconfirmed` (a different, item-scoped condition).
 *
 * Says "air colour", not "red": on-air is GREEN now (owner decision, see `theme.ts`). The
 * assertions below are role-based and so were unaffected by that move — which is exactly why
 * the PROSE has to be corrected by hand, and why re-wording R-006/B-087 in the PRD is recorded
 * in DEBT.md as owed. A rule written about a colour the product no longer uses protects nothing.
 */
describe('airStateVisual / badgeTone — B-086 unverified', () => {
  it("renders 'unverified' as muted 'WAS ON AIR'", () => {
    expect(airStateVisual('unverified', false)).toEqual({
      color: colors.textMuted,
      icon: '◌',
      label: 'WAS ON AIR',
    });
  });

  it('tones it muted grey — not the on-air role, not the unconfirmed amber', () => {
    expect(badgeTone('unverified', false)).toBe('idle'); // the --r-text-muted grey role
    expect(badgeTone('unverified', false)).not.toBe('onair');
    expect(badgeTone('unverified', false)).not.toBe(badgeTone('unconfirmed', false)); // 'attention'
    // pending never turns it into a spinner/red — it is a resting state.
    expect(badgeTone('unverified', true)).toBe('idle');
  });
});

/**
 * 🔴 TWO GREENS IS A RULE, NOT AN OVERSIGHT — and this is where a later phase trips over it.
 *
 * The owner's approved reference (`docs/ui-reference/runtime-redesign/`) spends ONE mint on
 * `.badge.live`, `.badge.success` and the footer's `healthy` — the same colour for "this is
 * on air" and for "this connection is fine". **The console does not, and here the drawing is
 * wrong and the console is right** (owner, 2026-09-08). An operator must never read "the
 * bridge is fine" as "this row is on air", and the standing decision that alarm severity
 * follows AIR-CRITICALITY cannot survive one hue carrying both meanings: if healthy and
 * on-air are the same green, "is anything on air?" stops being answerable by looking.
 *
 * ⚠ THE ASSERTION IS THAT THEY DIFFER, NOT WHAT EITHER IS. A test pinning
 * `rgb(44 255 122)` would go red the next time the palette is tuned while saying nothing
 * about the property that matters — the `PROMPT.md` §11 rule, and the one `splashCss` had
 * to be rewritten for in Phase 2. So: vivid saturated = ON AIR, pastel mint = healthy, and
 * the only thing pinned is that no phase has collapsed them into one value.
 */
describe('the air green and the healthy green are two colours, permanently', () => {
  it('🔴 --r-onair is NOT the OK/healthy ink, in any of the three roles that carry it', () => {
    // Non-empty FIRST, then identity: a red-first assertion against a constant that does not
    // exist is `expect(undefined).toBe(undefined)` (`PROMPT.md` §11).
    expect(cssVars['--r-onair']).toBeTruthy();
    expect(cssVars['--r-success']).toBeTruthy();
    expect(cssVars['--r-ok-text']).toBeTruthy();
    for (const ok of ['--r-success', '--r-ok-text'] as const) {
      expect(cssVars['--r-onair'], `${ok} collapsed onto the air green`).not.toBe(cssVars[ok]);
    }
    // …and the TS-side name for the same colour, which is what the layer row reads.
    expect(colors.onAir).toBeTruthy();
    expect(colors.onAir).not.toBe(cssVars['--r-success']);
    expect(colors.onAir).not.toBe(cssVars['--r-ok-text']);
  });

  it('POSITIVE CONTROL: the comparison can fail — it is not comparing a value with itself', () => {
    // Without this, `not.toBe` could be passing because one side is undefined.
    expect(cssVars['--r-onair']).toBe(colors.onAir);
    expect(cssVars['--r-ok-text']).toBe(cssVars['--r-success']);
  });
});

/**
 * PHASE 2A — ONE TOKEN WAS DOING TWO JOBS WITH TWO DIFFERENT FLOORS.
 *
 * `rgb(255 28 28)` measured below the 4.5 AA TEXT floor on four of the six grounds this
 * palette puts it on, and above the 3.0 GRAPHIC floor on all six. The owner's reading was
 * that the ink was never wrong — it was being asked two questions — so the answer is a
 * SPLIT and not a re-tune: the mark keeps his value byte for byte, and the word takes the
 * reference's own red, which the palette already carried.
 *
 * What is asserted is the PROPERTY (the two roles are distinct, and the error state hands
 * each of them to the half it belongs to), plus the ONE literal the owner fixed by name.
 */
describe('the error red is a MARK and a WORD, and they are not the same red', () => {
  it('the mark keeps the owner’s value byte for byte', () => {
    // The one literal worth pinning: `RUNTIME-FIX-0904` chose it and Phase 2A did not lift,
    // darken or derive it. If it ever moves it must be because he moved it.
    expect(colors.errorMark).toBe('rgb(255 28 28)');
    expect(cssVars['--r-error-mark']).toBe(colors.errorMark);
  });

  it('🔴 the two roles are DISTINCT — a word may not be painted with the mark', () => {
    expect(colors.errorText).toBeTruthy();
    expect(cssVars['--r-error-text']).toBe(colors.errorText);
    expect(colors.errorText, 'the split collapsed back to one red').not.toBe(colors.errorMark);
  });

  it('the ERROR state hands the MARK to the icon and the WORD to the label', () => {
    const v = airStateVisual('error', false);
    expect(v.icon).toBe('✕');
    expect(v.label).toBe('ERROR');
    expect(v.color, 'the ✕ is a graphic and takes the mark').toBe(colors.errorMark);
    expect(v.labelColor, 'the word is text and takes the legible ink').toBe(colors.errorText);
  });

  it('every OTHER state leaves labelColor absent, so its word inherits its mark', () => {
    // The split must not leak: a state whose mark and word may legitimately be one colour
    // has to keep inheriting, or this becomes a second place where hues can disagree.
    for (const status of [
      'on-air',
      'playing',
      'idle',
      'loaded',
      'unverified',
      'exiting',
    ] as const) {
      expect(airStateVisual(status, false).labelColor, status).toBeUndefined();
    }
  });
});
