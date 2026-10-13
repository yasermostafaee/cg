import type { CSSProperties } from 'react';
import { cssVars } from '../../theme.js';
import {
  ROW_GEOMETRY,
  VERBS_GRID,
  densitySpec,
  gridTemplateColumns,
  type Density,
} from './layerTable.js';

/**
 * The Layers table's STICKY header — and the reason the row's verbs are allowed
 * to be glyphs.
 *
 * Two jobs, both load-bearing:
 *
 *  1. It names the columns ONCE, replacing the per-row `Template:` /
 *     `Description:` prefixes the reference product prints on every line. Thirty
 *     rows no longer repeat two words thirty times each.
 *  2. It prints the WORD above each verb glyph. Icon-only controls in a broadcast
 *     console are a real risk — this product's STOP (graceful) and CLEAR (hard
 *     kill) are the inverse of the reference product's, so a misread symbol is a
 *     graphic cut off air — and the header is what retires that risk. It is a
 *     THIRD channel alongside each button's own `aria-label` and tooltip, not a
 *     replacement for either: a screen-reader user never sees it, and a hovering
 *     operator should not have to look up to the header to confirm.
 *
 * It STICKS to the top of the channel's scroll area (below the tab strips), so it
 * is still there on row 28.
 *
 * The layout comes from `gridTemplateColumns(density)` — the same call every row
 * makes. Hand-writing the header's columns is the one thing that would let a
 * label drift away from the column it names.
 */

/**
 * The word above each verb glyph, in the order `layerRowActions` emits buttons.
 *
 * 🔴 **THE ADMISSION RULE — this list is one of the two places a violation is actually
 * made, so it is stated here as well as at `VERB_COUNT`.** A control joins the block ONLY
 * IF it is declared for EVERY row, and its head is added HERE in the same change that adds
 * the button. Availability may vary by STATE (a disabled button keeps its column, which is
 * the established pattern); PRESENCE may not vary by ROW — a conditional button shifts every
 * head to its right onto the wrong glyph, and this product's STOP/CLEAR inversion is exactly
 * where a misread costs a graphic.
 *
 * A control that is needed on some rows and not others goes to the row's CONTEXT MENU (or
 * the Inspector). Two controls have already arrived at that answer independently — R-048's
 * SOURCE swap and C-015 6.5f's plate AUDIO — and the count stayed at six both times. The
 * menu's own, deliberately DIFFERENT rule is recorded beside the C6 boundary in
 * `PlayoutPanel.tsx`; the two are not the same rule and must not be harmonised.
 */
const VERB_HEADS: readonly { label: string; title: string }[] = [
  {
    /*
      §5 — THE ONE HEAD THAT NAMES ITS COLUMN RATHER THAN A VERB.

      The first column is the LOAD/REMOVE toggle, and the head cannot be per-row:
      it is one word above thirty buttons, half of which are the other half. It
      read `LOAD`, so on every bound row a TRASH glyph sat under the word LOAD —
      the exact misreading the header exists to prevent, printed by the header
      itself.

      Naming the other verb would be the same defect mirrored, and naming both
      does not fit a 44px column. So it names the COLUMN: what this column is
      about is the row's ITEM — putting one on the row, or taking it off. The
      word is the product's own vocabulary (the confirm dialogs say "on-air
      item(s)", "Remove all items?"), it is true of both halves, and it is true
      of neither verb in particular, which is the point.

      Nothing is lost by it, because the head was never the only channel: each
      button still names ITSELF exactly through its own `aria-label` and tooltip,
      and the tooltip here states the toggle outright.
    */
    label: 'ITEM',
    title:
      'What is on this row: LOAD binds a template to an empty row, and once one is on it this button becomes REMOVE.',
  },
  { label: 'PLAY', title: 'Take the row’s graphic to air.' },
  {
    // R-022 — emitted by `layerRowActions` BETWEEN play and next, so it is
    // declared here in that position. Its absence did not merely omit a word: it
    // shifted every head to its right onto the wrong glyph.
    // ON PVW / OFF PVW on the button; the head names the constructive half, the
    // same rule the LOAD/REMOVE head above follows.
    label: 'ON PVW',
    title:
      'Render this row’s graphic locally in PREVIEW (PVW), with PLAY interlocked off. Nothing is sent to CasparCG. The button reads OFF PVW while the row is showing.',
  },
  { label: 'NEXT', title: 'Advance a multi-step template to its next step.' },
  {
    label: 'STOP',
    title:
      'Graceful exit — the template runs its own outro and stays loaded, so it can be taken again.',
  },
  {
    label: 'CLEAR',
    title:
      'Hard kill — the layer is cleared immediately with no outro, and the producer is destroyed.',
  },
];

const styles = {
  header: {
    display: 'grid',
    alignItems: 'end',
    columnGap: ROW_GEOMETRY.columnGap,
    // The SAME horizontal padding the rows take, so the first column's edge is one
    // edge. It was a bare `12` here beside the model's own number — a second spelling.
    padding: `0.35rem ${ROW_GEOMETRY.headerPaddingX} 0.3rem`,
    // STICKY, so column names and verb words survive a scrolled list.
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
    // Opaque: rows scroll UNDER this, so any transparency shows them through it.
    //
    // `AUDIT-CLOSE-01` C2 — the reference's own rendered PAIR, ground and ink together.
    // Phase 3 took `--soft` alone (owner answer A6) because taking the ground without the
    // ink would have put the shared muted at 4.39:1; the pair clears AA at 4.74:1 without
    // moving `--r-text-muted` anywhere else in the app. On this ground the band is a
    // visible LID over the rows again — see `--r-layer-head-bg`.
    background: cssVars['--r-layer-head-bg'],
    borderBottom: `1px solid ${cssVars['--r-row-rule']}`,
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: cssVars['--r-layer-head-ink'],
    whiteSpace: 'nowrap' as const,
  },
  cell: { overflow: 'hidden', textOverflow: 'ellipsis' },
  /*
   * 🔴 THE FIVE TALLY STYLES THAT WERE HERE ARE GONE WITH THE TALLY (DELTA D5) — `count`,
   * `onAirCount`, `onAirCountStale`, `errorCount` and `errorTallyMark`. Deleted rather than left
   * for "when it comes back": an unreachable style object is the shape this repo has filed
   * four times, and it reads as a live decision to whoever finds it next.
   *
   * What was WORTH keeping travelled with them into `controls.css` — the contrast split in
   * particular. The number is TEXT and takes the error TEXT role; the mark beside it is a
   * GRAPHIC and takes the mark role, judged against 3.0 rather than 4.5. Two reds side by
   * side is the intended result: the loud one marks, the legible one reads.
   */
  verbHead: {
    textAlign: 'center' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '0.58rem',
    letterSpacing: '0.02em',
  },
} as const satisfies Record<string, CSSProperties>;

export function LayerTableHeader({ density }: { density: Density }): JSX.Element {
  const spec = densitySpec(density);
  return (
    <div style={{ ...styles.header, gridTemplateColumns: gridTemplateColumns(density) }} role="row">
      <span
        style={styles.cell}
        title="The row’s position, counting down from the top — the highest CasparCG layer is 1, because it draws over the others. It is also the row’s default name, and it is fixed to the layer: hiding a row never renumbers the rest."
      >
        #
      </span>
      {/*
        🔴 `CONSOLE-LOOK-06` DELTA D5 — THE TALLY IS NOT IN THIS HEAD ANY MORE.

        It was: `State 1 2`, the on-air count in the air colour and the in-error count in the
        error colour, both inside the STATE column head. The reference's header is
        `# / State / Name / Template / …` and nothing else, and its counts live in the SUB-BAR
        — measured, and it is the better place for a reason this console proved the hard way.

        ⚠ THE MOVE IS WHAT MAKES IT HONEST, not a deletion. `CONSOLE-LOOK-06` had already put
        an `N on air` chip in the sub-bar, so the same number was being stated twice, three
        inches apart, in two different type sizes — and the day they disagree the operator has
        no way to tell which one is lying. One fact, one place.

        ⭐ AND IT PAYS `B-224` BACK. That bug was width: `(1 on air) (2 in error)` needed 160 px
        of a 132 px cell, so the error count was CUT OFF and the owner's ruling was to drop the
        words and keep the numbers. The sub-bar is a full-width line with room for both, so the
        words come back with them — `2 on air` · `1 in error` — and the tooltip is no longer
        the only place the meaning is written. `B-213`'s rule is untouched and travels with
        them: two numbers that mean two things, never folded into one.
      */}
      <span
        style={styles.cell}
        title="What is on this layer right now: on air, ready, empty, occupied by another system, or unknown."
      >
        State
      </span>
      <span
        style={styles.cell}
        title="The layer’s name — its alias, the name you configured for it."
      >
        Name
      </span>
      {spec.showTemplate && (
        // Centred, matching the column's cells — a heading that sat left of a centred
        // column would read as belonging to the column before it.
        <span
          style={{ ...styles.cell, textAlign: 'center' }}
          title="The template loaded onto this row."
        >
          Template
        </span>
      )}
      {/* No DESCRIPTION column — see `LayerRow`: the wire's report moved into the
          state cell's tooltip, which carries it at every density. */}
      {/* No LAYER column — the real CasparCG layer number is in the Inspector and
          in each row's own tooltip / accessible name. */}
      <span style={VERBS_GRID}>
        {/* `data-verb-head` is the E2E's hook for the one invariant neither file
            can show on its own: exactly one head per verb BUTTON, in the same
            order. A mismatch puts a word above the wrong glyph — and this
            product's STOP/CLEAR are inverted from the reference product's. */}
        {VERB_HEADS.map((verb) => (
          <span key={verb.label} data-verb-head style={styles.verbHead} title={verb.title}>
            {verb.label}
          </span>
        ))}
      </span>
    </div>
  );
}
