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

/*
 * Spacing from the scale (`--r-space-*`), and the ORDERING is what does the work:
 * label→control is the smallest step, control→control one up, section→section the
 * largest. That gradient is what makes the parts group without a divider line
 * between every one of them.
 *
 * The GRID itself is in `controls.css` (`.cg-anchor-*`) — nine dots needed borders,
 * a selected fill and a hover, and inline styles cannot express the last two.
 */
const styles = {
  /** The grid and the nudge inputs side by side — one control, read left to right. */
  placement: {
    display: 'flex',
    gap: 'var(--r-space-4)',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
  },
  offsets: { display: 'flex', gap: 'var(--r-space-2)', alignItems: 'flex-start' },
  /** One nudge input with its own label ABOVE it, so the two never compete for a row. */
  offsetField: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--r-space-1)',
  },
  offsetLabel: {
    color: colors.textMuted,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  offsetInput: { width: '74px' },
  lock: { color: colors.textMuted, fontSize: 'var(--r-text-sm)' },
  /** Control→control is one step up from label→control inside the nudge fields. */
  actions: {
    display: 'flex',
    gap: 'var(--r-space-3)',
    alignItems: 'center',
    marginTop: 'var(--r-space-4)',
  },
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
    <div className="cg-inspector-section" aria-label="On-air position">
      <h2>POSITION</h2>
      <div style={styles.placement}>
        {/*
          A GRID, not nine loose dots. It used to render as nine free-floating
          glyphs in a bare `display: grid`, which communicated "here are nine
          things" and never "pick a corner" — the shape of the control has to say
          what the control is for, because a 3×3 of bordered cells IS a frame and
          a scatter of dots is not.

          The cells are BUTTONS still, so `aria-pressed`, the per-anchor
          accessible name and the keyboard path are all unchanged. Only the
          painting moves to `controls.css`, where a selected fill and a hover can
          actually be expressed.
        */}
        <div className="cg-anchor-grid" role="group" aria-label="Position anchor">
          {ANCHOR_GRID.flat().map((a) => (
            <Button
              key={a}
              variant="default"
              className="cg-anchor-cell"
              aria-label={`Anchor ${a}`}
              aria-pressed={a === anchor}
              disabled={locked}
              title={a}
              onClick={() => setAnchor(a)}
            >
              {/* The anchor POINT inside its cell. The cell's border draws the
                  frame; this marks where in the frame the graphic is pinned. */}
              <span className="cg-anchor-cell__dot" aria-hidden="true" />
            </Button>
          ))}
        </div>
        <div style={styles.offsets}>
          {/* `scrub` — the offsets are PIXEL magnitudes, which is exactly the value
              kind a horizontal drag suits: the operator nudges a graphic and watches
              the number move, rather than selecting text and retyping. Arrow keys give
              the same adjustment a keyboard, and Shift/Ctrl give fine and coarse steps.
              Matches the Designer's transform fields (owner request).

              THE WIDTH CHANGED AND THE GESTURE DID NOT. `scrub` is opt-in precisely
              because the same primitive serves the lock PIN, so it travels with the
              drag cursor and the keyboard steps — a narrower box must not quietly
              drop it, because an invisible gesture is one nobody uses. */}
          {/* A plain wrapper, NOT a `<label>`. These inputs are named by
              `aria-label` ("Position offset X"), which OUTRANKS a wrapping label —
              so a `<label>` would leave the visible text ("dx") different from the
              accessible name, the WCAG 2.5.3 mismatch, while adding no association
              that was missing. The a11y contract here is unchanged by this pass;
              only the stacking of the visible text is new. */}
          <div style={styles.offsetField}>
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
          </div>
          <div style={styles.offsetField}>
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
        </div>
      </div>
      <div style={styles.actions}>
        {/* ONE OF THE THREE ACCENTED ACTIONS (owner request), with Add item and
            Update — this is the action the POSITION section exists to perform.
            See `.cg-btn--accent` in `controls.css` for why colour may mean
            hierarchy here and must not on the layer table. */}
        <AsyncButton
          variant="accent"
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
