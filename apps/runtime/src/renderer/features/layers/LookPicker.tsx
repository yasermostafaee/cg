import type { TemplateInfo } from '@cg/shared-ipc';
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
export function lookOptionsOf(template: TemplateInfo | null): LookOption[] | null {
  const looks = template?.liveSources?.looks;
  if (looks === undefined || looks.length === 0) return null;
  return looks.map((l, i) => ({
    id: l.id,
    // The carrier holds ids, not display names. An ordinal is a stable, glanceable
    // label an operator can call over talkback ("go to look 2"), and the id rides the
    // accessible name and the tooltip for anyone who needs the authored handle.
    label: `${String(i + 1)}`,
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
}

export function LookPicker({ looks, activeId, refusal, onPick, rowName }: Props): JSX.Element {
  return (
    <div style={styles.line} data-look-picker="" role="group" aria-label={`Look for ${rowName}`}>
      <span style={styles.label}>LOOK</span>
      <span style={styles.strip}>
        {looks.map((look) => {
          const live = look.id === activeId;
          return (
            <Button
              key={look.id}
              variant="verb"
              className="cg-look-cell"
              // The CSS keys on this, so the paint and the announcement are one fact.
              aria-pressed={live}
              disabled={refusal !== undefined}
              {...(refusal !== undefined ? { title: refusal } : { title: look.id })}
              aria-label={`Look ${look.label} (${look.id})${live ? ' — on air' : ''}`}
              data-look-id={look.id}
              onClick={() => {
                // A no-op re-press is dropped here rather than sent: re-issuing the look
                // already on air would run a reconcile and a CG UPDATE for nothing, and
                // on a cut that is a visible re-assert of an unchanged picture.
                if (!live) onPick(look.id);
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
