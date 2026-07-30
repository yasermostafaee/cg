import { useState } from 'react';
import type { PositionAnchor, StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { defaultPositionOf } from '../stack/defaultPositionStore.js';
import { reportCommandError } from '../status/commandFeedback.js';

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
 * pixel-offset nudge. An explicit Apply sends ONE `stack.set-position` to the
 * bridge — refusals surface inline. LOCKED while the item is on air/unsettled
 * (position is fixed once taken — Option A cannot reposition on air without a
 * re-serve flash), mirroring the bridge's authoritative refusal; editable
 * while loaded-not-taken and idle. Callers key this component by itemId so
 * switching items re-seeds.
 *
 * B-072 — it seeds from the item's APPLIED override (published in its state by
 * the bridge), and from the template's manifest default (recorded at import;
 * centered when the template declares none) only when there is no override. It
 * used to seed from the default ALWAYS: a reselect then re-seeded the picker to
 * the default even though the override was live on air, so the UI lied about
 * what was applied — and a re-Apply of that stale display silently overwrote a
 * correct on-air position with the default.
 */
export function PositionPicker({ item }: { item: StackItemState }): JSX.Element {
  // B-072 — seed from the APPLIED override the bridge publishes, falling back
  // to the manifest default only when the item has none. Same precedence as
  // the on-air boot (override → manifest default → centered), so the picker
  // shows what the graphic actually does. The override comes from the item's
  // published state — never a renderer-local store, which would go stale on
  // reload/reconnect and miss delete-on-remove.
  const seed = item.position ?? defaultPositionOf(item.templateId);
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
        {/* `scrub` — the offsets are PIXEL magnitudes, which is exactly the value
            kind a horizontal drag suits: the operator nudges a graphic and watches
            the number move, rather than selecting text and retyping. Arrow keys give
            the same adjustment a keyboard, and Shift/Ctrl give fine and coarse steps.
            Matches the Designer's transform fields (owner request). */}
        <span style={styles.offsetLabel}>dx</span>
        <NumericInput
          className="cg-field"
          style={styles.offsetInput}
          decimal
          scrub={{ step: 1 }}
          value={dx}
          disabled={locked}
          onValueChange={setDx}
          aria-label="Position offset X"
        />
        <span style={styles.offsetLabel}>dy</span>
        <NumericInput
          className="cg-field"
          style={styles.offsetInput}
          decimal
          scrub={{ step: 1 }}
          value={dy}
          disabled={locked}
          onValueChange={setDy}
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
          // #334 — a refusal surfaces as the command TOAST, not pinned inline beside the
          // control where its wrapped text bloated this narrow panel. `setPosition` does
          // NOT self-report (unlike `applyDraft`), so this is the report, not a suppressor.
          // The MESSAGE is unchanged: the button already mapped `r.reason` through
          // `errorCodeMessage`, and the toast carries that same mapping — only its
          // placement moves.
          onError={reportCommandError}
        >
          Apply position
        </AsyncButton>
        {locked && <span style={styles.lock}>locked while on air</span>}
      </div>
    </div>
  );
}
