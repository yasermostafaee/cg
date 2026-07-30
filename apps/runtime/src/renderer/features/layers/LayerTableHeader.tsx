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
    // The first column is the LOAD/REMOVE toggle: LOAD on an empty row, REMOVE
    // once something is on it. One header word cannot name both, so it names the
    // constructive half and the tooltip states the toggle outright — each button
    // still names ITSELF exactly, through its own label and tooltip.
    label: 'LOAD',
    title: 'LOAD on an empty row; once a template is on the row this button becomes REMOVE.',
  },
  { label: 'PLAY', title: 'Take the row’s graphic to air.' },
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
    background: colors.panelMuted,
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
}: {
  density: Density;
  /** How many rows are ON AIR right now — shown beside `State`, in the air colour. */
  onAirCount: number;
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
          <span style={styles.onAirCount} aria-label={`${String(onAirCount)} items on air`}>
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
        {VERB_HEADS.map((verb) => (
          <span key={verb.label} style={styles.verbHead} title={verb.title}>
            {verb.label}
          </span>
        ))}
      </span>
    </div>
  );
}
