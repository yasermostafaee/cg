import type { CSSProperties } from 'react';
import { colors } from '../../theme.js';
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

/** The word above each verb glyph, in the order `layerRowActions` emits buttons. */
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
    padding: `0.35rem ${String(12)}px 0.3rem`,
    // STICKY, so column names and verb words survive a scrolled list.
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
    // Opaque: rows scroll UNDER this, so any transparency shows them through it.
    // Exact value specified by the owner, and a literal rather than a token
    // because it is this header's own colour — it is deliberately lighter than
    // both row backgrounds so the sticky band reads as a lid on the list rather
    // than as one more row of it.
    background: 'rgb(45 55 69)',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
  },
  cell: { overflow: 'hidden', textOverflow: 'ellipsis' },
  /**
   * The on-air tally beside `State`. The sacred air colour, and one of only two
   * places allowed to use it (the row's state mark is the other) — it is a genuine
   * air claim about the channel, not decoration.
   */
  onAirCount: {
    color: colors.onAir,
    fontWeight: 700,
    // 14px, per the owner — larger than the ~10px header type around it without
    // dominating the row. This is the one number a control room wants from the whole
    // list ("how much of my output is live?"), so it is sized to be read at a glance
    // rather than hunted for.
    fontSize: '14px',
    lineHeight: 1,
  },
  /**
   * …and the same number with its confidence withdrawn (§4). Muted, keeping its
   * size and its parentheses — the count is unchanged, only the claim that a
   * server is confirming it. B-081's tone, reused rather than a new grey.
   */
  onAirCountStale: { color: colors.textMuted },
  verbHead: {
    textAlign: 'center' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '0.58rem',
    letterSpacing: '0.02em',
  },
} as const satisfies Record<string, CSSProperties>;

export function LayerTableHeader({
  density,
  onAirCount,
  unverifiable = false,
}: {
  density: Density;
  /** How many rows are ON AIR right now — shown beside `State`, in the air colour. */
  onAirCount: number;
  /**
   * §4 — neither hop can back that count right now, so it stops wearing the air
   * colour.
   *
   * IT IS NOT RENAMED and it is not hidden. It remains a count of what our list
   * says is on air, which is still the most useful number on the screen and still
   * true of our model; what it can no longer do is assert that a server confirmed
   * it. This is the sacred air colour's own rule — B-081's "the look of health we
   * cannot currently verify" — applied to the one other place entitled to wear it.
   */
  unverifiable?: boolean;
}): JSX.Element {
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
        STATE, with a running count of how many rows are ON AIR — in the air colour,
        because it IS an air claim and this is one of the two places entitled to wear
        that green (the row's own state mark being the other).

        It answers the question a control room asks of the whole list rather than of
        one row: "how much of my graphics output is live right now?" Previously that
        needed counting green marks down a thirty-row list.

        Rendered ONLY when the count is non-zero. A permanent `(0)` would be noise on
        the resting state, and — worse — it would put the air colour on screen at all
        times, which is exactly how a colour reserved for one meaning stops being
        noticed.
      */}
      <span
        style={styles.cell}
        title="What is on this layer right now: on air, ready, empty, occupied by another system, or unknown."
      >
        State
        {onAirCount > 0 && (
          <span
            style={
              unverifiable ? { ...styles.onAirCount, ...styles.onAirCountStale } : styles.onAirCount
            }
            aria-label={`${String(onAirCount)} items on air`}
            {...(unverifiable ? { 'data-unverifiable': '' } : {})}
            {...(unverifiable
              ? {
                  title:
                    'What this console believes is on air. CasparCG cannot be reached, so nothing is confirming it right now.',
                }
              : {})}
          >
            {' '}
            ({onAirCount})
          </span>
        )}
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
