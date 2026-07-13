import { useState } from 'react';
import type { PositionAnchor, StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { defaultPositionOf } from '../stack/defaultPositionStore.js';

/** Row-major 3×3 anchor grid (the 9-point Position model). */
const ANCHOR_GRID: readonly (readonly PositionAnchor[])[] = [
  ['top-left', 'top-center', 'top-right'],
  ['mid-left', 'center', 'mid-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

const styles = {
  section: {
    marginTop: '0.5rem',
    borderTop: `1px solid #2b3044`,
    paddingTop: '0.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 2rem)',
    gap: '0.25rem',
  },
  offsets: { display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' },
  offsetLabel: { color: colors.textMuted },
  offsetInput: { width: '5rem' },
  lock: { color: colors.textMuted, fontSize: '0.8rem' },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
} as const;

/** The on-air lock mirrors the bridge's set-position refusal predicate. */
export function isPositionLocked(item: StackItemState): boolean {
  return (
    item.pending ||
    item.status === 'playing' ||
    item.status === 'on-air' ||
    item.status === 'updating' ||
    item.status === 'exiting' ||
    item.status === 'unconfirmed'
  );
}

/**
 * R-011 — the per-item on-air position picker: a 3×3 anchor grid + x/y
 * pixel-offset nudge, seeded from the template's manifest default (recorded
 * at import; centered when the template declares none). An explicit Apply
 * sends ONE `stack.set-position` to the bridge — refusals surface inline.
 * LOCKED while the item is on air/unsettled (position is fixed once taken —
 * Option A cannot reposition on air without a re-serve flash), mirroring
 * the bridge's authoritative refusal; editable while loaded-not-taken and
 * idle. Callers key this component by itemId so switching items re-seeds.
 */
export function PositionPicker({ item }: { item: StackItemState }): JSX.Element {
  const seed = defaultPositionOf(item.templateId);
  const [anchor, setAnchor] = useState<PositionAnchor>(seed.anchor);
  const [dx, setDx] = useState(String(seed.offset.x));
  const [dy, setDy] = useState(String(seed.offset.y));
  const locked = isPositionLocked(item);

  const offset = (raw: string): number => {
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) ? n : 0;
  };

  return (
    <div style={styles.section} aria-label="On-air position">
      <h2
        style={{
          fontSize: '0.85rem',
          fontWeight: 700,
          color: colors.textMuted,
          letterSpacing: '0.05em',
          margin: 0,
        }}
      >
        POSITION
      </h2>
      <div style={styles.grid} role="group" aria-label="Position anchor">
        {ANCHOR_GRID.flat().map((a) => (
          <Button
            key={a}
            variant={a === anchor ? 'secondary' : 'ghost'}
            aria-label={`Anchor ${a}`}
            aria-pressed={a === anchor}
            disabled={locked}
            title={a}
            onClick={() => setAnchor(a)}
          >
            {a === anchor ? '◉' : '·'}
          </Button>
        ))}
      </div>
      <div style={styles.offsets}>
        <span style={styles.offsetLabel}>dx</span>
        <input
          className="cg-field"
          style={styles.offsetInput}
          type="number"
          value={dx}
          disabled={locked}
          onChange={(e) => setDx(e.target.value)}
          aria-label="Position offset X"
        />
        <span style={styles.offsetLabel}>dy</span>
        <input
          className="cg-field"
          style={styles.offsetInput}
          type="number"
          value={dy}
          disabled={locked}
          onChange={(e) => setDy(e.target.value)}
          aria-label="Position offset Y"
        />
      </div>
      <div style={styles.actions}>
        <AsyncButton
          variant="secondary"
          aria-label="Apply position"
          disabled={locked}
          run={() =>
            window.cg.stack
              .setPosition({
                itemId: item.itemId,
                position: { anchor, offset: { x: offset(dx), y: offset(dy) } },
              })
              .then((r) => ({
                accepted: r.ok,
                ...(r.reason !== undefined ? { errorCode: r.reason } : {}),
              }))
          }
        >
          Apply position
        </AsyncButton>
        {locked && <span style={styles.lock}>locked while on air</span>}
      </div>
    </div>
  );
}
