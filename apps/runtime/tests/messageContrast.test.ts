import { describe, expect, it } from 'vitest';
import { colors, cssVars } from '../src/renderer/theme.js';
import { AA_TEXT, contrastOf } from './support/contrast.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA R ADDENDUM B §B3(b) — **THE GUARD OVER EVERY OPERATOR MESSAGE.**
 *
 * ── WHY A GUARD AND NOT A COMMENT ───────────────────────────────────────────
 *
 * THREE components independently set `color: colors.error` on a dark panel and each measured
 * **2.08:1** — below even the 3:1 large-text floor. `Notice`'s header had already written down
 * that the token was a GROUND. Documentation adjacent to a defect does not prevent the defect;
 * only a guard does. This is the same lesson as `Tabs.tsx`, where the shorthand/longhand bug
 * was described twelve lines above the code still doing it.
 *
 * §B3(a) renamed the token so its name stops inviting the misuse (`colors.error` →
 * `colors.alarmFill`). This is the half that FAILS when someone does it anyway.
 *
 * ── THE THRESHOLD ───────────────────────────────────────────────────────────
 *
 * **WCAG AA for body text, 4.5:1** (`AA_TEXT`). A message is a SENTENCE read at body size, so
 * the 3.0 graphics floor does not apply to it — that floor is for MARKS, and
 * `LayerTableHeader`'s 11 px warning triangle uses it correctly. Choosing the graphic floor for
 * a paragraph is how an illegible sentence passes a guard that looks strict.
 *
 * ── THE INSTRUMENT IS PROVED, NOT ASSUMED ───────────────────────────────────
 *
 * A negative observation needs a positive control. The last case below plants the exact
 * 2.08:1 pairing this guard exists to catch and asserts that the SAME predicate rejects it —
 * so a future edit that neuters the check (a threshold typo, a parseColour that silently
 * returns black) fails there rather than passing everywhere.
 */

/** Every class that renders a SENTENCE to the operator, as an ink-on-ground pair. */
const MESSAGE_CLASSES: readonly { name: string; ink: string; ground: string }[] = [
  {
    // The refusal banner and Station setup's notice — `Notice`'s `refusal` role.
    name: 'Notice refusal',
    ink: cssVars['--r-caution-text'],
    ground: cssVars['--r-notice-fill'],
  },
  {
    // …and its quieter second line, which carries the bridge's own specifics.
    name: 'Notice refusal detail',
    ink: colors.text,
    ground: cssVars['--r-notice-fill'],
  },
  {
    /*
      🔴 THE SETUP NOTICE, on its OWN ground — added 2026-09-13 with the ink unification.
      A ratio is a property of TWO values, so unifying the ink across two surfaces means
      measuring it on BOTH grounds, not once. Station setup keeps its own ground
      (); only the ink moved.
    */
    name: 'Station setup notice',
    ink: cssVars['--r-caution-text'],
    ground: cssVars['--r-setup-notice-bg'],
  },
  {
    name: 'Notice neutral',
    ink: cssVars['--r-notice-neutral-text'],
    ground: cssVars['--r-notice-neutral-bg'],
  },
  {
    name: 'Notice neutral detail',
    ink: colors.textMuted,
    ground: cssVars['--r-notice-neutral-bg'],
  },
  {
    // The success toast — the reference's mint pair.
    name: 'command success toast',
    ink: cssVars['--r-toast-ok-ink'],
    ground: cssVars['--r-toast-ok-bg'],
  },
  {
    /*
      The air alarms: the connection, raster, output-missing and failover banners. These are
      the sites `alarmFill` is FOR — a ground, with the fill ink on top. Included because the
      guard's subject is "every message class", and a rule that skipped the alarms would leave
      the loudest sentences on the console unmeasured.
    */
    name: 'air alarm banner',
    ink: cssVars['--r-ink-on-fill'],
    ground: colors.alarmFill,
  },
  {
    /*
      🔴 `MODAL-CHROME-10` §3 — THE CONSOLE CONFIRM'S DESTRUCTIVE BUTTON, now RED, measured
      on ITS OWN GROUND. A word on a button the operator presses under pressure is a sentence
      by this guard's standard, and the reversal that made it red is exactly the kind of edit
      that moves an ink onto a ground it was never measured against.
    */
    name: 'confirm destructive (console) at rest',
    ink: cssVars['--r-ink-on-fill'],
    ground: cssVars['--r-danger-confirm-bg'],
  },
  {
    // …and on HOVER, which is a different ground and therefore a different ratio.
    name: 'confirm destructive (console) on hover',
    ink: cssVars['--r-ink-on-fill'],
    ground: cssVars['--r-danger-confirm-hover-bg'],
  },
  {
    /*
      ⚠ THE SUB-DIALOG'S HALF OF THE SAME FAMILY, added with it. The reversal harmonised the
      two, so the two weights are measured together — one of them moving without the other is
      the drift the harmonisation exists to prevent.
    */
    name: 'confirm destructive (Station setup) at rest',
    ink: cssVars['--r-setup-danger-ink'],
    ground: cssVars['--r-setup-danger-bg'],
  },
  {
    /*
      🔴 `MODAL-CHROME-10` ADDENDUM D §D3 — THE DESTRUCTIVE CONFIRM'S EMBLEM, which is now on
      EVERY destructive confirm rather than the three that opted in. A glyph is a MARK and the
      3:1 graphics floor would be the defensible one for it — this guard holds it to the 4.5
      TEXT floor anyway, because it clears it and a mark that clears the stricter floor cannot
      be argued down later.
    */
    name: 'destructive confirm emblem',
    ink: cssVars['--r-danger-text'],
    ground: cssVars['--r-danger-bg'],
  },
  {
    /*
      🔴 `MODAL-CHROME-10` §2(a) — THE SELECTED FILTER CHIP, which stopped being violet.
      A chip is a WORD on a fill, and the blue it moved to is a pair this guard had never
      measured: the look segment adopted it for a segment's ink, and a filter chip is a
      second surface wearing it.
    */
    name: 'selected filter chip',
    ink: cssVars['--r-look-btn-sel-ink'],
    ground: cssVars['--r-look-btn-sel-bg'],
  },
  /*
    🔴 `PLATES-AUDIO-11` §3 AND ITS DELTA — **THE PLATE AUDIO STATE WORDS, EVERY INK ON BOTH
    GROUNDS.**

    A state word is a SENTENCE by this guard's standard: it is the operator's only account of
    why a guest he can see cannot be heard. Three inks now carry those words — the amber that
    `held` and `Not seated` share, the green that `audible` took on 2026-09-14, and the muted
    grey `silent` kept — and each is measured on BOTH surfaces' grounds, because a ratio is a
    property of two values (§4.1) and moving an ink is exactly the edit that lands it on a
    ground nobody measured.

    ⚠ The two grounds resolve alike TODAY (`--r-surface` and `--r-table-row-hover` are both
    `colors.panel`). They are still listed separately, because that is a coincidence a retune
    breaks and the guard would then be measuring one surface while claiming two.
  */
  ...(
    [
      ['audible', cssVars['--r-audible-text']],
      ['held / not seated', cssVars['--r-caution-text']],
      ['silent', colors.textMuted],
    ] as const
  ).flatMap(([state, ink]) => [
    { name: `plate audio — ${state} (audio dialog body)`, ink, ground: cssVars['--r-surface'] },
    {
      name: `plate audio — ${state} (plate row, hovered)`,
      ink,
      ground: cssVars['--r-table-row-hover'],
    },
  ]),
];

describe('§B3(b) — every operator message clears AA for body text', () => {
  for (const { name, ink, ground } of MESSAGE_CLASSES) {
    it(`${name} is legible on its own ground`, () => {
      const ratio = contrastOf(ink, ground);
      expect(
        ratio,
        `${name}: ${ink} on ${ground} reads ${ratio.toFixed(2)}:1, below AA ${String(AA_TEXT)}:1`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  /**
   * 🔴 THE POSITIVE CONTROL. This is the pairing three components shipped: the alarm GROUND
   * used as an INK, on the modal surface. If this ever passes, the guard above has stopped
   * measuring anything and its greens mean nothing.
   */
  it('🔴 REJECTS the 2.08:1 pairing the rename exists to prevent', () => {
    const planted = contrastOf(colors.alarmFill, cssVars['--r-surface']);
    expect(planted, 'the historical misuse still measures what it measured').toBeCloseTo(2.08, 1);
    expect(planted, 'the guard must reject it').toBeLessThan(AA_TEXT);
  });
});
