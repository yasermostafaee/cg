import type { TemplateLiveSources } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { colors } from '../../theme.js';

/**
 * 🔴 **§14.5 / `tasks.md` 7.1 — THE LOOK PICKER. It IS the on-air readout AND the switch.**
 *
 * ── WHY A PICKER AND NOT A MENU ─────────────────────────────────────────────
 *
 * §12.8 decided this underneath two separate reversals and it survived both:
 * **always visible, state-carrying, no menu.** A menu hides the current state behind
 * a click, and the client's requirement is that the operator cannot be mistaken about
 * what is on air. So the control that SAYS which look is live is the same object that
 * CHANGES it — one glance, one action, and no third state where the readout and the
 * switch could disagree because there is only one of them.
 *
 * ── ONE-OF-N BY CONSTRUCTION ────────────────────────────────────────────────
 *
 * The picker offers only AUTHORED looks and exactly one is always marked, so the whole
 * old refusal family is not defended against — it is **unrepresentable**. Over-lit,
 * absent-count and all-off cannot be expressed here, which is what let §12.9.1's
 * count-shaped triggers retire rather than move (§14.5). ⚠ There is deliberately **no
 * "none" entry**: taking the row off air is the STOP/CLEAR verbs' job and always was,
 * and an all-off entry here would be a second, quieter way to do it.
 *
 * ── THE SWITCH IS THE CUT ───────────────────────────────────────────────────
 *
 * v1 is cut-only (§14.4 parks the other transition modes), so pressing a look IS the
 * immediate action — there is no mode to choose, nothing to wait for, and therefore
 * nothing to escape from. `tasks.md` 7.6 retired D3's escape for exactly this reason.
 *
 * ── COLOUR ─────────────────────────────────────────────────────────────────
 *
 * The selected segment wears `--r-accent-fill` with an inset ring, copied from the
 * anchor-cell grid (`controls.css`) — the repo's other one-of-N picker — because the
 * problem is identical: a fill alone reads as hover, and hover and selection are one
 * hue apart. **Not green:** green is the sacred ON AIR mark of the layer table's state
 * cell, and a look segment borrowing it would put a second, unrelated air claim on the
 * same row. Which look is selected is a SELECTION fact, and `--r-accent-fill`'s own
 * doc reserves it for exactly that.
 *
 * `aria-pressed` is what the CSS keys on, so the painting and the announcement can
 * never disagree about which look is live — the anchor cell's rule, inherited.
 */

/** A look, as the picker needs it: an id and something to call it. */
export interface LookOption {
  id: string;
  label: string;
}

/**
 * The authored looks of a template, or `null` when there is no picker to show.
 *
 * 🔴 **THE ABSENT-VS-EMPTY DISTINCTION IS LOAD-BEARING AND IT IS REAL.**
 * `buildTemplateLiveSources` spreads `looks` **only when the scene has a look group**
 * (`collectLookCarrier` returns `null` otherwise), so:
 *
 * - `looks === undefined` — no look group at all. A pre-LOOKS template, including
 *   every multi-box template authored against the arrangement carrier. It has nothing
 *   to pick and **must not be refused anything**; refusing it would take a station's
 *   whole pre-carrier rundown off air on upgrade.
 * - `looks === []` — a look group that authors ZERO looks. That is a broken template
 *   and `tasks.md` 7.5's single refusal trigger.
 * - `looks.length > 0` — the picker, with one segment per look.
 *
 * Returning `null` for the first two collapses them HERE, once, so no call site has to
 * remember which emptiness is which.
 */
export function lookOptionsOf(live: TemplateLiveSources | undefined): LookOption[] | null {
  const looks = live?.looks;
  if (looks === undefined || looks.length === 0) return null;
  return looks.map((l) => ({
    id: l.id,
    /*
      🔴 THE AUTHORED NAME. An earlier version labelled these by ORDINAL on the stated
      premise that “the carrier holds ids, not display names” — **which is false**:
      `TemplateLookSchema.name` is `z.string().min(1)`, REQUIRED, and it is what the author
      typed in the Designer. Numbering them threw away the one label that already means
      something to the operator (“WIDE”, “SOLO”) and replaced it with a position they would
      have to learn. The id still rides the tooltip and the accessible name for anyone who
      needs the authored handle.

      A long name widens the strip rather than the row: the line scrolls inside itself.
    */
    label: l.name,
  }));
}

const styles = {
  line: {
    // 🔴 SPANS EVERY COLUMN, and `1 / -1` rather than a number: the column COUNT changes
    // with density (the template column drops at compact/tight), so a numeric end line
    // would point at a different place on a narrow panel. This is also why the second
    // line costs the width model nothing — `minWidthFor` sums columns, and a spanning
    // child adds no column.
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    // Never widens the row: if the looks outgrow the panel the STRIP scrolls, rather
    // than the grid growing and pushing the verb block off the edge — the failure the
    // fixed-px column model exists to prevent.
    minWidth: 0,
    overflowX: 'auto' as const,
  },
  label: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: colors.textMuted,
    flex: '0 0 auto',
  },
  strip: { display: 'flex', gap: '0.25rem', flex: '0 0 auto' },
} as const;

interface Props {
  looks: readonly LookOption[];
  /** The look the row is SHOWING, resolved by the bridge. */
  activeId: string | undefined;
  /** Disabled reason, or `undefined` when the switch can be sent. */
  refusal: string | undefined;
  onPick: (lookId: string) => void;
  /** For the accessible name — the operator's word for this row. */
  rowName: string;
  /**
   * 🔴 **WHAT THIS PRESS CHANGES — the PREVIEW, or AIR.** (`B-151`, owner patch 2026-08-21.)
   *
   * There is ONE control and one call: `stack.set-active-look`, whose effect follows the
   * ROW's state — a rehearsing row is off air, so the bridge records the look and sends
   * nothing; an on-air row gets the cut. A duplicate picker above PVW was built and removed
   * on the owner's correction, because _"the same LOOK buttons on the row already worked for
   * PVW too"_ and two controls for one operation is this repo's two-spellings defect.
   *
   * ⚠ But a control whose effect depends on state is only safe if the operator can READ that
   * state, and the client's requirement is that they cannot be mistaken. The row's state cell
   * already says REHEARSING or ON AIR; this makes the picker say the same thing about
   * ITSELF, at the point of action, so the answer is in the control the hand is on rather
   * than in a cell three columns away.
   *
   * ⚠ These two are MUTUALLY EXCLUSIVE by the R-022 interlock — rehearse is refused for an
   * on-air row and a take is refused for a rehearsing one — so there is no third state where
   * the label would have to hedge.
   */
  target: 'air' | 'preview';
}

export function LookPicker({
  looks,
  activeId,
  refusal,
  onPick,
  rowName,
  target,
}: Props): JSX.Element {
  const preview = target === 'preview';
  return (
    <div
      style={styles.line}
      data-look-picker=""
      data-look-target={target}
      role="group"
      aria-label={preview ? `Preview look for ${rowName}` : `Look for ${rowName}`}
    >
      {/*
        The label IS the target statement. `PVW LOOK` rather than a badge or a colour: this
        row already spends its colour vocabulary on air state, and a new hue here would be a
        second thing to learn. The word the operator already reads on the PVW panel is the
        word that appears on the control that drives it.
      */}
      <span style={styles.label}>{preview ? 'PVW LOOK' : 'LOOK'}</span>
      <span style={styles.strip}>
        {looks.map((look) => {
          const live = look.id === activeId;
          return (
            <Button
              key={look.id}
              /*
                🔴 `neutral`, NOT `verb`. `.cg-btn--verb` sets `width: 100%` — COLUMN geometry,
                sized by the header so a verb’s word sits over its glyph — and the `icon`
                variant exists precisely because that “stretches anything that is not in a
                sized column”. These segments are in a flex strip, not a column. `neutral` is
                the documented contract for a TEXT button and carries no accent, which is what
                the row wants: the row’s STATE owns colour, and selection is painted by
                `.cg-look-cell[aria-pressed]` instead.
              */
              variant="neutral"
              className="cg-look-cell"
              // The CSS keys on this, so the paint and the announcement are one fact.
              aria-pressed={live}
              disabled={refusal !== undefined}
              {...(refusal !== undefined ? { title: refusal } : { title: look.id })}
              /*
                🔴 “CURRENT”, never “on air”. The picker says which LOOK is selected; whether
                the row is on air is the state cell’s claim and its alone. An off-air row’s
                picker announcing “on air” would be a second, unbacked air claim on the same
                row — the same reason the segments do not wear green.
              */
              // `B-151` — and the TARGET, so a screen reader gets the same answer the label
              // gives sighted operators: this press changes the preview, or it changes air.
              aria-label={
                `${preview ? 'Preview look' : 'Look'} ${look.label} (${look.id})` +
                `${live ? ' — current' : ''}`
              }
              data-look-id={look.id}
              onClick={() => {
                /*
                  🔴 **A RE-PRESS IS SENT, and an earlier version of this dropped it.**

                  The tempting guard is `if (!live)`: re-issuing the look already showing
                  would run a reconcile and a CG UPDATE for an unchanged picture. It is
                  refused for one reason, and `tasks.md` 7.9 SHARPENED that reason rather than
                  retiring it.

                  A marked segment now means the page was genuinely told this look (7.9 fused
                  the bridge’s record to the successful telling), so it can no longer be
                  marked while nothing moved. What it CAN be is marked while the FILLS sat
                  elsewhere: a switch whose reconcile landed and whose `CG UPDATE` did not
                  leaves the producers on the new geometry and the row recorded on the look
                  the page is still punching. The bridge’s own refusal says exactly that —
                  *“its holes are still on the previous look… Re-issue the switch”* — and the
                  segment it points the operator at is the one already marked live.

                  So a re-press is not a redundant re-assert. It is the repair: it reconciles
                  the fills back onto the look the holes are on. A guard would have made the
                  one remedy the bridge names unreachable, on the control it names it about.
                */
                onPick(look.id);
              }}
            >
              {look.label}
            </Button>
          );
        })}
      </span>
    </div>
  );
}
