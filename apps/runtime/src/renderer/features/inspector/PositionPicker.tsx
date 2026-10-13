import { useSyncExternalStore } from 'react';
import { isOnAirStatus } from '@cg/shared-schema';
import type { PositionAnchor, StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { defaultPositionOf } from '../stack/defaultPositionStore.js';
import {
  draftsVersion,
  positionDraftOf,
  stagePosition,
  subscribeDrafts,
  type PositionDraft,
} from './draftStore.js';

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
  /*
   * 🔴 ONE GRID, SO EVERY CONTROL IN THIS SECTION SHARES AN EDGE — the owner, 2026-09-14:
   * «در قسمت پوزیشن دکمه‌ها و اینپوتها باید با هم هماهنگی داشته باشن و المانها نسبت به هم
   * تراز باشن و در جای مناسب قرار داشته باشن.»
   *
   * ── WHAT WAS ACTUALLY OUT OF LINE, measured in Chromium at 1280 × 800 ──────────────
   *
   * The section was a flex row (anchor grid + stacked fields) with the button on a
   * free-standing row beneath, and that arrangement gave the eye THREE left edges:
   *
   *     anchor grid   left   0    top  43
   *     dx / dy       left  112   top  43
   *     Apply         left   0    top 171
   *
   * So `Apply position` — the control that commits exactly those two boxes — sat under the
   * ANCHOR GRID, sharing an edge with the one thing it does not act on, and sharing none
   * with the two it does. A 12 px dead band sat between them on top of that.
   *
   * ── THE FIX IS STRUCTURAL, not a margin ───────────────────────────────────────────
   *
   * Two columns: the anchor grid spans both rows on the left; the fields and the button
   * stack in the right column, so they resolve to ONE left edge by construction rather than
   * by two paddings that agree today. `justify-content: start` keeps the block at the
   * section's left rather than spreading it across 370 px.
   *
   * ⚠ The column is `auto`, so it takes the width of its widest child — the BUTTON, at its
   * natural 112.3 — while the inputs keep the reference's measured 90 px cap inside it.
   * Left-aligned with equal heights is the harmony that matters here; forcing the two to one
   * width would mean either stretching the fields off the drawing's size or shrinking the
   * button into the corner §3 forbids.
   */
  placement: {
    display: 'grid',
    gridTemplateColumns: 'auto auto',
    justifyContent: 'start',
    columnGap: 'var(--r-space-4)',
    rowGap: 'var(--r-space-3)',
    alignItems: 'start',
  },
  /** The 3 × 3 grid pairs with the FIELDS, so it starts at their top and spans both rows. */
  anchorCell: { gridColumn: '1', gridRow: '1', alignSelf: 'start' },
  /*
   * 🔴 `MONITORS-01` — AUDIT ROW 30: the gap is `--r-space-2` (8), not `--r-space-3` (12).
   * Measured in Chromium at 1280 × 800, the reference's `.position-controls` renders
   * `gap: 8px`. Phase 5 argued "the scale's step", which is true of both — 8 and 12 are
   * BOTH steps on this scale — so the argument never chose between them and the drawing
   * did. It buys the two fields 4 px each.
   */
  /*
   * 🔴 STACKED — `INSPECTOR-DELTA` §3, the owner's call. The three controls used to share
   * one line, and in a 396 px panel that line was the complaint: two number boxes and a
   * two-word button competing for the same width, the button crowded against them.
   *
   * ⚠ **A DELIBERATE DEPARTURE FROM THE DRAWING, recorded as one** so a later parity pass
   * does not "restore" it. Measured in Chromium at 1280 × 800: the reference puts the anchor
   * grid, X, Y and `Apply position` on ONE grid row — `.position-controls` is 370 × 64,
   * `grid-template-columns: 66px 90.2969px 90.2969px 99.4062px`. Ours is now two stacked
   * fields beside the grid, with the button on its own row beneath.
   *
   * The CAP is the reference's own measured field width (`--r-insp-position-field-w`, 90 px
   * against the 90.3 it paints). Stacking removes the competition that stretched ours to
   * 120.86 × 32; WITHOUT the cap they would take the whole 370 px section instead, which is
   * further from the drawing than where they started.
   */
  /*
   * 🔴 LABEL BESIDE ITS INPUT, ON ONE LINE — the owner, 2026-09-14: «لیبل اینپوتهای
   * پوزیشن با خود اینپوتها در یه خط باشن بهتره و منظمتر دیده میشه.»
   *
   * A two-column grid — BOX, then label — so `dx` and `dy` align with each other, the two
   * boxes align with each other, and the pairing is read across rather than down.
   *
   * 🔴 **THE LABEL TRAILS ITS BOX, and that is the owner's reason rather than a taste
   * call** (2026-09-14): «لیبل‌ها در انتها باشن بهتره چون باعث میشه ابتدای دکمه با
   * ابتدای اینپوتها در یک راستا باشد.» With the labels leading, the boxes began one label-width
   * in and `Apply position` — which spans the row — began at the LABEL edge, so the button
   * and the boxes it commits started on two different verticals. Put the label last and the
   * box column IS column one: the button's start and the boxes' start become the same line
   * by construction.
   *
   * ⚠ The swap is in the DOM, not a CSS `order`. Only one element per row is focusable, so
   * tab order is untouched either way — but a visual order that disagrees with the source is
   * a trap for the next reader, and there is nothing here that requires one.
   *
   * The label column is `auto`: it takes the wider of the two words and no more.
   *
   * ⚠ The previous spelling stacked a label ABOVE each box and is gone; the reference does
   * the same thing (`X px` over its input), so this is a second deliberate departure from
   * the drawing on the owner's call, recorded beside the first.
   */
  offsets: {
    // Column 2 of the outer grid — beside the anchor pad.
    gridColumn: '2',
    gridRow: '1',
    display: 'grid',
    // BOX first, LABEL second — see the note above for why that order and not the other.
    gridTemplateColumns: 'var(--r-insp-position-field-w) auto',
    columnGap: 'var(--r-space-2)',
    /*
      ⚠ `--r-space-3` (12), and it is HALF OF A PAIR rather than a free choice: the two
      32 px boxes with 12 between them stand 76 px, which is exactly the anchor pad's
      24 + 2 + 24 + 2 + 24. That is what makes the pad's top and bottom edges land on the two
      boxes' own. Change one and the other has to be re-derived — `controls.css`
      (`.cg-anchor-grid`) carries the same warning from the other side.
    */
    rowGap: 'var(--r-space-3)',
    alignItems: 'center',
    justifyItems: 'start',
    minWidth: 0,
  },
  /*
   * `Apply position` ON ITS OWN ROW, at its own size — §3: "it must not shrink into a
   * corner". The row is `flex-start`, so the button is the width of its own words rather
   * than the section's.
   */
  applyRow: {
    // SPANS the label and box columns, so it starts on the edge every row here shares.
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--r-space-2)',
    flexWrap: 'wrap' as const,
    marginTop: 'var(--r-space-1)',
  },
  /**
   * One nudge input with its own label ABOVE it, so the two never compete for a row.
   *
   * ⚠ **SUPERSEDED, `INSPECTOR-DELTA` §3.** This said the two fields FILL the row between
   * the anchor grid and the button, growing with the panel — the reference's
   * `66px minmax(48px,1fr) minmax(48px,1fr) auto`. They are STACKED and CAPPED now, so they
   * neither share a row nor grow. The reference's own shape is recorded at `offsets` above;
   * the claim that ours matches it is the part that is no longer true.
   */
  /*
   * 🔴 `display: contents` — THE WRAPPER STAYS IN THE JSX AND LEAVES THE LAYOUT.
   *
   * Each field is still one element in the markup (its label and its box belong together,
   * and a reader should not have to pair them by eye), but a wrapper between the grid and
   * its cells would make each PAIR one cell and defeat the alignment entirely: the two
   * labels would size independently and the boxes would not line up. `display: contents`
   * promotes the label and the input into the parent grid while keeping the grouping.
   *
   * ⚠ It renders no box of its own, so it must carry no border, background or padding —
   * there would be nothing to paint them on.
   */
  offsetField: { display: 'contents' as const },
  /** The reference's label rank: 12 px, medium, the second ink — not the muted caption. */
  offsetLabel: {
    color: colors.textSecondary,
    fontSize: 'var(--r-insp-label-text)',
    fontWeight: 'var(--r-weight-medium)',
    lineHeight: 'var(--r-insp-label-line)',
    // Beside its box now, so it must not wrap mid-row and push the grid's rows apart.
    whiteSpace: 'nowrap' as const,
  },
  offsetInput: { width: '100%' },
  lock: {
    color: colors.textMuted,
    fontSize: 'var(--r-text-sm)',
    display: 'block',
    marginTop: 'var(--r-space-2)',
  },
} as const;

/**
 * The on-air lock, which is R-011's refusal asked from the UI side.
 *
 * ⚠ It KEEPS ITS NAME AND DELEGATES, where `isOnAirOrUnsettled` was deleted outright —
 * and the difference is real rather than a lapse. That one was a SYNONYM for the shared
 * predicate, so it was a second name for one rule; this one names a different question
 * ("is the position control locked") that today happens to be answered by that rule. What
 * it must not do is re-derive the answer: it used to spell the six terms out, mirroring
 * `setPosition`'s own inline copy rather than the canonical predicate, so the lock and the
 * refusal were two derivations that agreed by luck (`operator-surface` §5(B)).
 */
export function isPositionLocked(item: StackItemState): boolean {
  return isOnAirStatus(item);
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
  /*
   * `RUNTIME-REDESIGN-01` PHASE 5 — THE DRAFT LIVES IN THE STORE, NOT HERE.
   *
   * This was three `useState`s. The picker is keyed by item so that switching items
   * re-seeds it — and that same remount threw away whatever the operator had staged but not
   * applied: move the anchor, glance at another row, come back, and the anchor was where the
   * bridge last put it. Every other staged edit in the panel survives that round trip through
   * `draftStore`; the position now does too (its header there says why it is a separate map
   * and why DISCARD leaves it alone). The seed rule is unchanged (B-072): a draft when one is
   * staged, else the APPLIED override, else the manifest default.
   */
  useSyncExternalStore(subscribeDrafts, draftsVersion);
  const draft: PositionDraft = positionDraftOf(item.itemId) ?? {
    anchor: seed.anchor,
    x: String(seed.offset.x),
    y: String(seed.offset.y),
  };
  const { anchor, x: dx, y: dy } = draft;
  const stage = (patch: Partial<PositionDraft>): void =>
    stagePosition(item.itemId, { ...draft, ...patch });
  const setAnchor = (next: PositionAnchor): void => stage({ anchor: next });
  const setDx = (next: string): void => stage({ x: next });
  const setDy = (next: string): void => stage({ y: next });
  const locked = isPositionLocked(item);

  const offset = (raw: string): number => {
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) ? n : 0;
  };

  /**
   * STAGED-BUT-UNAPPLIED, said the same way a dynamic field says it (owner
   * request). Position was the one editable thing in this panel that changed
   * silently: an operator could move the anchor, look away, and have no way to
   * tell whether that had reached air — while every field beside it carries a
   * dirty mark for exactly that question.
   *
   * COMPARED AGAINST THE SEED, which is the APPLIED value (`item.position`, the
   * bridge's own published state) falling back to the manifest default — the same
   * precedence B-072 established for what this picker displays. So this cannot
   * drift from what Apply would overwrite: it is dirty exactly when pressing Apply
   * would change something.
   *
   * It clears by ITSELF when the applied value catches up, because the seed is
   * re-read from the item on every render. No local "clean" flag to get stuck.
   */
  const dirty =
    anchor !== seed.anchor || offset(dx) !== seed.offset.x || offset(dy) !== seed.offset.y;

  return (
    <div className="cg-inspector-section" aria-label="On-air position">
      {/* Sentence case in the source; the CAPS are the stylesheet's — see `Inspector.tsx`. */}
      <h2>
        Position
        {/* The SAME mark a dirty field carries, from the same class — so "not
            applied yet" looks identical wherever it appears in this panel. */}
        {dirty && (
          <span className="cg-dirty-dot" aria-label="Position has unapplied changes">
            ●
          </span>
        )}
      </h2>
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
        <div
          className="cg-anchor-grid"
          style={styles.anchorCell}
          role="group"
          aria-label="Position anchor"
        >
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
        <div className="cg-position-row" style={styles.offsets}>
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
            <span style={styles.offsetLabel}>dx</span>
          </div>
          <div style={styles.offsetField}>
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
            <span style={styles.offsetLabel}>dy</span>
          </div>
          {/*
            🔴 `Apply position` IS GONE — the owner, 2026-09-14: «دکمه apply position فقط یه
            مرحله اضافیه و همون دکمه update باید پوزیشن رو هم اعمال کنه و همچنین discard هم
            روش کار کنه.»

            The row has ONE commit now: UPDATE sends the text, the plates, the per-look
            composition and the placement, and DISCARD drops all four. `applyDraft` carries
            the position on `stack.setPosition` exactly as this button did — the wire did not
            move, the control did.

            ⚠ The section keeps its own DIRTY DOT (on the heading above). It is not
            redundant with the commit bar's chip: the chip says this ROW has something
            staged, the dot says WHICH SECTION it is in, and on a panel that scrolls the
            second question is the one the operator is actually asking.
          */}
        </div>
      </div>
      {/* BELOW the row, not inside it: it is a note about why the controls above are
          inert, and a note that sits in the control row changes the row's height as
          it appears and disappears. */}
      {locked && <span style={styles.lock}>locked while on air</span>}
    </div>
  );
}
