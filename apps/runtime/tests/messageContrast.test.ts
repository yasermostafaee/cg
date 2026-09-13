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
