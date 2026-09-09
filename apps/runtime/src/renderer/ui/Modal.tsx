import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { colors, cssVars } from '../theme.js';
import { Button, type ButtonVariant } from './Button.js';
import { useFocusTrap } from './focusTrap.js';
import { Icon } from './Icon.js';
import { Notice, type NoticeRole } from './Notice.js';

/**
 * The Runtime's modal primitive.
 *
 * Before this, four destructive/blocking decisions were asked with `window.confirm` and
 * `window.prompt`. A native dialog is the wrong instrument in a playout console: it is
 * chrome, not app — it renders in the browser's font at the browser's position, it cannot
 * carry the consequence of the act ("this clears anything on air") in the app's own
 * language, and on a machine running the Runtime full-screen it can land off the operator's
 * eyeline entirely. It also blocks the main thread, which stalls the OSC/state feed behind
 * it.
 *
 * This is the app's own surface: portalled to `document.body`, `role="dialog"` +
 * `aria-modal`, Escape to cancel, focus moved in on open and restored on close, and Tab
 * cycling trapped inside so the operator cannot tab onto an on-air button behind the scrim.
 * Backdrop click cancels, which is why the CANCEL path must always be the safe one.
 *
 * ── EVERY DIALOG'S CHROME COMES FROM HERE ───────────────────────────────────
 *
 * Header, close affordance, scrolling body, MESSAGE REGION and action row — all
 * five, so a dialog supplies a title, its content and its actions and nothing else.
 * Five dialogs had drifted into five designs (three close affordances, two title
 * cases, three action-row layouts) and a primitive four of them use while a fifth
 * hand-rolls is WORSE than no primitive: it reads as consistent while not being
 * consistent, which is exactly how those five arrived.
 *
 * THE ONE TITLE TREATMENT is `styles.title`, and the string a caller passes is
 * rendered verbatim — there is no `text-transform` here on purpose. So the
 * treatment is enforced by the primitive and the CASE is the caller's: dialogs use
 * SENTENCE case, which is what the majority already did. Do not pass a SHOUTING
 * title; `SERVER CONNECTION` and `AUDIT LOG` were the two exceptions and both were
 * brought to the majority rather than a third style being invented for them.
 *
 * WHAT IS DELIBERATELY *NOT* BUILT ON THIS PRIMITIVE, and must not be "finished"
 * later: `LockOverlay`. It is a full-screen LOCK, not a dialog. This primitive
 * gives every dialog a visible ✕, Escape-to-close and backdrop-click-to-close —
 * three ways out — and a lock screen with a way out is not a lock. Its scrim is
 * hand-rolled for that reason and that reason only.
 *
 * ⚠ `B-229` — THAT PARAGRAPH IS ABOUT THE EXITS, AND IT WAS READ AS BEING ABOUT
 * MORE. The lock does not take the ✕, Escape or the backdrop, and must not. It
 * DOES take the focus trap, which is the opposite kind of mechanism — an exit lets
 * the operator leave, and the trap stops focus leaving on its own. Reading the one
 * rule as the other left the lock inheriting neither, and Tab walked through a
 * 94 %-opaque lock screen onto a TAKE. The containment now lives in
 * `ui/focusTrap.ts` and both surfaces call it.
 */

const styles = {
  scrim: {
    position: 'fixed' as const,
    inset: 0,
    background: cssVars['--r-modal-scrim'],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  /** A dialog opened FROM a dialog: above it, and through a lighter scrim. */
  scrimSub: { background: cssVars['--r-modal-scrim-sub'], zIndex: 1001 },
  dialog: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    // `STATION-CHROME-02` §0 — from the token home. It was a bare `0.4rem`, which is a
    // radius spelled at a call site: the guard only reads `controls.css`, so this one had
    // no reviewer. Same corner, one declaration.
    borderRadius: cssVars['--r-modal-radius'],
    boxShadow: cssVars['--r-modal-shadow'],
    /*
      🔴 `REPAIR-03` B — FLUSH CHROME FOR EVERY SIZE, not only `fixed`.

      This was `padding: '1rem 1.25rem'` with a `0.75rem` gap, so the head, body and footer
      were three stacked blocks inside one padded box and none of them had an edge of its
      own. The reference draws a head BAND with its own ground and a rule under it, a body
      that owns its padding, and a footer BAND with its own ground and a rule over it — which
      is exactly the shape `fixed` already had. Generalising it is one treatment instead of
      two, not a second one.
    */
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
    color: colors.text,
    /**
     * Bounded by the VIEWPORT, so a dialog whose content grows with config —
     * thirty candidate layers rather than four — is capped by the screen and
     * scrolls inside itself, instead of running off the bottom where its Apply
     * button cannot be reached.
     */
    maxHeight: '88vh',
    minHeight: 0,
  },
  /**
   * 🔴 `STATION-CHROME-02` §2 — **THE FIXED FRAME.**
   *
   * A dialog whose HEIGHT is declared rather than derived from its content, and whose
   * chrome therefore goes FLUSH: no padding on the shell, a rule under the head, a rule
   * over the footer, and a body that owns its own edges so an internal rail can reach
   * them.
   *
   * ── WHY A HEIGHT, WHICH NO OTHER DIALOG HAS ─────────────────────────────
   *
   * Station setup is five sections behind five tabs, and their content lengths have
   * nothing to do with each other — Delimiters is five rows, Layers is thirty-four. With
   * an intrinsic height the dialog GREW AND SHRANK under the operator as he moved along
   * the rail: the frame he was aiming at, and everything he could see behind it, moved
   * on every press. That is the one property he notices immediately and no unit test
   * would have caught, so `station-setup-frame.spec.ts` measures the box on all five.
   *
   * ⚠ **A SHORT SECTION MUST NOT STRETCH TO FILL IT.** The empty space below Delimiters
   * is correct; growing a card to swallow it would be worse than the space. Only the
   * PANE is `flex: 1` — nothing inside it is.
   *
   * ⚠ `padding: 0` here means a `fixed` dialog's BODY has no padding either, and its
   * content is expected to bring its own (Station setup's rail and pane each do). That
   * is deliberate: a padded body cannot host a rail that touches the frame.
   */
  /*
   * 🔴 `MONITORS-01` — AUDIT ROWS 71 AND 74, AND WHY THEY LAND ON `fixed` RATHER THAN ON
   * THE PRIMITIVE.
   *
   * Row 71 is the reference's `.settings` frame: measured in Chromium at 1280 × 800 it
   * renders `border-radius: 16px` and
   * `box-shadow: 0 32px 100px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.2)` — a soft 100 px
   * lift plus a hairline ring — against this primitive's `--r-radius-md` (6) and
   * `--r-shadow-2` (`0 4px 16px`). Row 74 is that frame's title: 19 px / 650 against the
   * shared `1rem / 700`.
   *
   * ⚠ **THE REFERENCE HAS NO ONE NUMBER FOR THESE, so a primitive-wide change would be
   * inventing one.** Its own dialogs render `.settings` at radius 16 and the audio dialog
   * at 14 (audit row 70), and their titles at 19 px, 20 px and 22 px (rows 62, 74, 98). A
   * single value here would have to pick one of those and apply it to three surfaces the
   * drawing gives three values for. So these take the `-fixed` scope this file already
   * uses for every other Station-setup measurement — the frame that was actually measured
   * gets the numbers that were actually measured.
   *
   * ⚠ NOT taken, and out of this session by the owner's own scope: the modal WIDTH table
   * and the button family (audit rows 70, 87, 106).
   */
  dialogFixed: {
    padding: 0,
    gap: 0,
    height: cssVars['--r-modal-h-fixed'],
    maxHeight: cssVars['--r-modal-h-fixed'],
    borderRadius: cssVars['--r-modal-radius-fixed'],
    boxShadow: cssVars['--r-modal-shadow-fixed'],
  },
  /** The title row: heading on one side, the close affordance on the other. */
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    // `REPAIR-03` B — the reference's `.modal-head`: its own band, ground and rule.
    gap: cssVars['--r-modal-head-gap'],
    padding: cssVars['--r-modal-head-pad'],
    background: cssVars['--r-modal-head-bg'],
    borderBottom: `1px solid ${colors.border}`,
    boxSizing: 'border-box' as const,
    flexShrink: 0,
  },
  /**
   * `REPAIR-03` B — THE HEAD EMBLEM (audit rows 62, 72, 98, 113), a 42 px box holding one
   * glyph. Optional: the reference draws it on the picker, the import wizard, the audit log,
   * the audio dialog and Station setup, and deliberately NOT on its confirm dialog — a
   * question asked in words does not want a decorative mark beside it.
   */
  emblem: {
    width: cssVars['--r-modal-emblem-box'],
    height: cssVars['--r-modal-emblem-box'],
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: cssVars['--r-modal-emblem-radius'],
    background: cssVars['--r-modal-emblem-bg'],
    border: `1px solid ${cssVars['--r-modal-emblem-line']}`,
    color: cssVars['--r-modal-emblem-ink'],
  },
  /**
   * The fixed frame's head: its own padding, and the rule that separates it. Phase 7 took the
   * reference's `.settings-head` as rendered — a 90 px floor, `21px 28px` — from the token home.
   */
  titleRowFixed: {
    alignItems: 'center',
    /*
      ⚠ TRANSPARENT, and that is a restatement rather than an omission. `REPAIR-03` B gave
      the BASE head band the outer family's `#172230` ground; the reference's
      `.settings-head` has none — it sits on the frame's own surface — so the `fixed` frame
      must put it back to nothing or it would inherit a ground Phase 7 measured as absent.
    */
    background: 'transparent',
    gap: cssVars['--r-modal-head-gap-fixed'],
    minHeight: cssVars['--r-modal-head-min-h-fixed'],
    padding: cssVars['--r-modal-head-pad-fixed'],
    borderBottom: `1px solid ${colors.border}`,
    boxSizing: 'border-box' as const,
  },
  title: {
    // REPAIR-03 B — the reference's .modal-head title renders 18 px / 650; 650 resolves
    // to the 700 face on this app's static Exo 2 (A3), so 700 is what is spelled.
    fontSize: cssVars['--r-modal-title-text'],
    fontWeight: Number(cssVars['--r-weight-bold']),
    margin: 0,
  },
  /** `MONITORS-01` audit row 74 — the `fixed` frame's own title: 19 px / 650, as measured. */
  titleFixed: {
    fontSize: cssVars['--r-modal-title-text-fixed'],
    // The reference's `.settings-head h2` renders 650; on this app's static Exo 2 that
    // resolves to the 700 face (`REPAIR-03` A3), so the weight that renders is the one named.
    fontWeight: Number(cssVars['--r-weight-bold']),
  },
  /** The title and its subtitle stack; the close affordance stays on the row's far end. */
  titleStack: { display: 'flex', flexDirection: 'column' as const, minWidth: 0 },
  /**
   * `RUNTIME-REDESIGN-01` Phase 7 — the SUBTITLE under the title, the reference's
   * `.settings-subtitle` (13 px, muted, 3 px under). Optional: a dialog says WHAT it is scoped
   * to here — Station setup names its channel and primary — and most dialogs have nothing to
   * add. Not a message and not the body: it is chrome, pinned with the title.
   */
  subtitle: {
    margin: `${cssVars['--r-modal-subtitle-gap']} 0 0`,
    fontSize: cssVars['--r-modal-subtitle-text'],
    fontWeight: 400,
    lineHeight: 1.55,
    color: colors.textMuted,
  },
  /**
   * The body SCROLLS; the title and the footer do not. A dialog that asks a
   * destructive question must keep its buttons visible however long the content
   * is — scrolling the whole dialog would push Cancel off-screen.
   */
  body: {
    fontSize: '0.9rem',
    lineHeight: 1.5,
    color: colors.textMuted,
    overflowY: 'auto' as const,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    // REPAIR-03 B — the body owns its inset now that the frame is flush.
    padding: cssVars['--r-modal-body-pad'],
  },
  /**
   * §3 — THE MESSAGE REGION, PINNED TO THE ACTION ROW.
   *
   * A refusal explaining why an action did not happen must appear where the
   * operator is LOOKING when he takes the action. `Candidate layers` appended its
   * refusal to the bottom of the scrolling list, so with the list scrolled to the
   * top the operator pressed Apply, nothing happened, and the reason was below the
   * fold — he had to go looking for it. A refusal reported where nobody looks is,
   * in practice, a SILENT refusal, and that one guards an occupied layer.
   *
   * So it lives in the PRIMITIVE, outside `body`, immediately above `footer`. That
   * placement is the whole mechanism: being outside the scroll container is what
   * makes it unmissable, and being in the primitive is what stops a dialog putting
   * it somewhere unseen again.
   *
   * `flexShrink: 0` so a long body can never squeeze it away, and its OWN
   * `overflowY` so a long message cannot push the action row off the bottom
   * instead — the failure this fixes, one element over.
   *
   * It does NOT move the body's scroll position when it appears: the body is a
   * separate scroll container, so its `scrollTop` is untouched by a sibling
   * appearing. The operator is told something without losing his place.
   */
  message: {
    flexShrink: 0,
    maxHeight: '30vh',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
    /*
      `REPAIR-03` B — the reference's `.modal-foot`: its own band, ground, rule and FLOOR.

      ⚠ 72 px here is the OUTER `.modal` family's floor; `footerFixed` below keeps 74 px,
      which is the Station-setup frame's. Two families, two measured numbers, and neither is
      composed from what a section puts in it — see `--r-modal-foot-h-base`.
    */
    gap: cssVars['--r-modal-foot-gap'],
    padding: cssVars['--r-modal-foot-pad'],
    background: cssVars['--r-modal-foot-bg'],
    borderTop: `1px solid ${colors.border}`,
    minHeight: cssVars['--r-modal-foot-h-base'],
    boxSizing: 'border-box' as const,
  },
  /**
   * The fixed frame's footer BAR — its own padding, a rule above it, and the raised
   * surface that makes it read as chrome rather than as the last row of the content.
   * §2's assertion measures its top edge: it must not move as the tab changes.
   */
  footerFixed: {
    padding: cssVars['--r-modal-foot-pad-fixed'],
    gap: cssVars['--r-modal-foot-gap-fixed'],
    borderTop: `1px solid ${colors.border}`,
    /*
      Phase 7 — the DIALOG's own surface, as the reference paints its `.panel-foot`
      (`background:var(--surface)`), not the raised one: the rule above it is what separates
      it from the pane, and a raised band under a sunken pane read as a third surface.
    */
    background: colors.panel,
    /*
      🔴 A FLOOR, so the bar's height does not depend on whether this section has buttons.
      Without it a tab carrying none collapses the footer and its TOP EDGE moves — see
      `--r-modal-foot-h` for the measurement that forced this, and `styles.dialogFixed` for
      why a moving edge is the defect this frame exists to remove.
    */
    minHeight: cssVars['--r-modal-foot-h'],
    boxSizing: 'border-box' as const,
  },
  /** The fixed frame's body fills the frame; only the scroll container inside it scrolls. */
  bodyFixed: { flex: 1, padding: 0, gap: 0 },
  /**
   * 🔴 The pinned region, IN THE PANE'S COLUMN.
   *
   * This was `padding: '0.6rem 1rem 0'` — the flush frame's own inset, applied to a region
   * whose sibling body is a RAIL plus a PANE. So the card spanned both columns and its bottom
   * edge met the footer's top rule exactly. See `--r-modal-message-pad-fixed` for the
   * measurement and for why the inset lives in the token home rather than here.
   *
   * `paddingInlineStart` overrides the shorthand's inline-start only, and is logical rather
   * than physical so the inset follows the rail in an RTL document.
   */
  messageFixed: {
    padding: cssVars['--r-modal-message-pad-fixed'],
    paddingInlineStart: cssVars['--r-modal-message-inset-fixed'],
  },
} as const;

/**
 * §2 — WHAT A DIALOG'S BUTTON IS FOR, not what colour someone picked for it.
 *
 * Three roles, and the ROLE decides the treatment. The dialogs had been choosing
 * colours per dialog, which is how `SERVER CONNECTION`'s `APPLY` came to wear the
 * solid amber that means *this will interrupt something* while being an ordinary
 * save — and a signal spent on a non-destructive action is a signal drained
 * everywhere it is real.
 *
 * ── WHY `destructive` IS THE SOLID AMBER AND NOT THE RED OUTLINE ───────────
 *
 * Both existed: `caution-strong` is a SOLID amber fill, `danger` is a transparent
 * red OUTLINE that only fills on hover. The solid one is the louder of the two at
 * rest, which is what matters for a button the operator's eye must land on.
 *
 * Picking `danger` would have made `Clear all` quieter — turning a filled button
 * into an outline — which is precisely the "neutralising it in the name of
 * consistency" the owner forbade. Picking the solid amber leaves `Clear all`
 * EXACTLY as it is and makes the `Remove` confirms LOUDER than their old outline.
 * So no safety signal weakens in either direction, which is the tie-breaker.
 *
 * `cancel` is `neutral` and never `ghost`: neutral must not mean INVISIBLE. A
 * ghost has no fill and no border and reads as a line of static text — the picker's
 * Cancel was one, and an operator could not tell it was pressable.
 */
export type ModalActionRole = 'primary' | 'destructive' | 'cancel';

const ROLE_VARIANT: Record<ModalActionRole, ButtonVariant> = {
  primary: 'primary',
  destructive: 'caution-strong',
  cancel: 'neutral',
};

/**
 * The variant for a role, for the few actions that cannot be a plain `Button` —
 * `AsyncButton`, which owns its own busy/success/error rendering. Exported so those
 * callers resolve the treatment from the SAME table rather than re-picking a colour,
 * which is the drift this whole section exists to end.
 */
export function modalActionVariant(role: ModalActionRole): ButtonVariant {
  return ROLE_VARIANT[role];
}

/**
 * One action button in a dialog's action row.
 *
 * `data-modal-role` is emitted so a test can assert that a role resolves to ONE
 * treatment across every dialog — on the role and the class, never on a hex value,
 * for the same reason `data-row-state` exists on the layer row.
 */
export function ModalAction({
  /*
    NAMED `actionRole` AND NOT `role`, deliberately. `role` is the ARIA attribute:
    a prop of that name on a component that spreads the rest of its props onto a
    real `<button>` is one refactor away from emitting `role="cancel"` — an invalid,
    non-abstract ARIA role — and the a11y lint flags every call site meanwhile.
    The concept is still THE ROLE; only the prop name gets out of ARIA's way.
  */
  actionRole,
  children,
  ...rest
}: {
  actionRole: ModalActionRole;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <Button variant={ROLE_VARIANT[actionRole]} data-modal-role={actionRole} {...rest}>
      {children}
    </Button>
  );
}

/**
 * §3 — THE MESSAGE ROLES, and the same rule as the action roles: the ROLE decides
 * the treatment, so a dialog says what KIND of thing it is telling the operator and
 * never what colour to say it in.
 *
 * `refusal` — why the last action did not happen. `notice` — a neutral statement
 * about what did (`Applied. All listeners remain loopback-only.`). Two roles,
 * because two treatments already existed and each was earning its keep; the three
 * unreadable red spellings were not a third role, they were the same role written
 * down badly. See {@link Notice} for the measured ratios.
 */
export type ModalMessageRole = NoticeRole;

/** One message in the pinned region. Strings, deliberately — see `ModalProps.message`. */
export interface ModalMessage {
  role: ModalMessageRole;
  /** The rule, or the outcome. One sentence. */
  text: string;
  /** The specifics, when there are any — the bridge's own message, which names the layer. */
  detail?: string;
}

interface ModalProps {
  /**
   * SENTENCE case, not shouting — see the module note. The primitive supplies the
   * one treatment; the string supplies the words.
   */
  title: string;
  /**
   * `RUNTIME-REDESIGN-01` Phase 7 — one line under the title saying what this dialog is SCOPED
   * to (Station setup: `Channel 1 · Primary A`). Chrome, pinned with the title, rendered
   * `[data-modal-subtitle]`; see `styles.subtitle`. Pass nodes so a name can sit in its own
   * `<bdi>` (golden rule 11).
   */
  subtitle?: ReactNode;
  /**
   * 🔴 `REPAIR-03` B — THE HEAD EMBLEM (audit rows 62, 72, 98, 113): one lucide icon in a
   * 42 px box at the start of the head band, as the reference draws it on the picker, the
   * import wizard, the audit log, the audio dialog and Station setup.
   *
   * ⚠ OPTIONAL ON PURPOSE, and the omission is a decision the drawing makes too: its own
   * `#confirm-dialog` has none. A confirmation asks a question in words and a decorative mark
   * beside a destructive one is furniture where the sentence is the whole content. So a
   * dialog that ASKS gets no emblem; a dialog that is a PLACE gets one.
   */
  emblem?: LucideIcon;
  /**
   * The action buttons, built from {@link ModalAction} so the role decides the
   * treatment. CANCEL first in DOM order — the row is right-aligned, so first in
   * DOM is LEFTMOST and the primary/destructive action lands in the same corner of
   * every dialog. It is also the safe default for focus and for Tab order.
   */
  footer: ReactNode;
  /**
   * §3 — WHY THE LAST ACTION DID NOT HAPPEN, pinned beside the action row.
   *
   * Never rendered into `children`: that is the scrolling body, and a refusal the
   * operator has to scroll to find is a silent one. See `styles.message`.
   *
   * ── IT IS NOT A `ReactNode` ANY MORE, AND THAT IS THE FIX ──────────────────
   *
   * It was, and every one of the four dialogs that used it passed a node carrying
   * its OWN style — three of them `color: colors.error`, which measures 2.08:1 on
   * this dialog's surface. The region was adopted; the treatment was not, because
   * a `ReactNode` prop asks each caller to decide what a message looks like, and
   * four callers gave four answers.
   *
   * So the region takes DATA. `text` and `detail` are strings and there is no seam
   * to pass a `style` through: the ROLE decides the treatment and {@link Notice}
   * is where that decision is written down — exactly as {@link ModalActionRole}
   * decides a button's. An array is accepted because `Server connection` genuinely
   * has more than one thing to say at once (Apply is blocked AND a port is
   * invalid); the region stacks them and owns the spacing.
   */
  message?: ModalMessage | readonly ModalMessage[];
  /** Cancel — Escape, backdrop click, and the dialog's own dismiss all route here. */
  onClose: () => void;
  children?: ReactNode;
  ariaLabel?: string;
  /**
   * How wide the dialog is. `prose` (the default) is the ~460px column that reads well
   * for a confirm question; `wide` is the two-column-plus width.
   *
   * ── THE CRITERION IS THE COMPARISON, NOT THE MARKUP ─────────────────────
   *
   * This used to say `wide` is "for dialogs carrying a TABLE of per-row controls, which
   * at prose width wrap into an unreadable stack" — and the TEMPLATE PICKER met that
   * description while being `prose`, which made the sentence false about the tree it was
   * describing. The picker was not the defect; the criterion was.
   *
   * It named an IMPLEMENTATION where the deciding property is whether the operator reads
   * DOWN A COLUMN — comparing one row against another — which is what alignment across
   * rows is for and what prose width destroys. The fixed-bank config dialog has that
   * (thirty layers × checkbox + alias + observed state, scanned down the list); the
   * picker does not (one name and one action per row, read one row at a time), so it
   * stacks into a column at prose width and loses nothing.
   *
   * Stated that way the rule returns the width every dialog already has. The full
   * requirement is in `openspec/specs/runtime-ui` — this comment points at it rather
   * than being the only place it exists, which is the drift the whole
   * `runtime-modal-contract` change was written to end.
   *
   * ⭐ `fixed` is the third, and it is a FRAME rather than a width: a declared height as
   * well as a declared width, and flush chrome to go with them. Its criterion is narrow —
   * a dialog whose content is SWITCHED rather than scrolled, so that an intrinsic height
   * would move the frame under the operator as he switches. Station setup's five tabs are
   * the only case today. Do not reach for it to make a dialog "look important"; see
   * `styles.dialogFixed`.
   *
   * ⭐ `ledger` is the fourth, and it is a WIDTH again, not a frame: a dialog that IS a table
   * read across many columns — the audit log, whose one row carries a time, an actor, an
   * action, names over ids over a refused line, and an outcome. `RUNTIME-REDESIGN-01` Phase 8
   * took it from `03-audit-log.html` as rendered (`--r-modal-w-ledger`, 1222 at 1280). Its
   * height stays intrinsic and its table scrolls, which is exactly why it is not `fixed`.
   *
   * ⭐ `library` is the fifth, added by `RUNTIME-REPAIR-04`, and it is a width too — a
   * dialog that reads a list DOWN one column while describing the destination ACROSS
   * another. The template picker is the only case, and it is the reference's own BASE
   * `.modal` width (`--r-modal-w-library`, 1120 at 1280) rather than a width invented for
   * it. It is not `wide`: `wide` IS the audio dialog's 860 and two other dialogs wear it.
   *
   * ⭐ `import` is the sixth, added by `RUNTIME-REPAIR-05`: the reference's own
   * `#import-dialog`, 750 px, a dialog that does ONE station-level thing and needs
   * room for a drop target rather than for a list. Measured by opening it.
   */
  size?: 'prose' | 'wide' | 'fixed' | 'ledger' | 'library' | 'import';
  /**
   * `STATION-CHROME-01` §6 — which LAYER this dialog is on.
   *
   * `sub` is a dialog opened FROM another dialog: every Add and every Edit. It stacks
   * above the base layer and lays a lighter scrim, so the dialog underneath stays visible
   * and the operator can see he is one step deeper rather than somewhere else.
   *
   * ⚠ It is a z-index and a scrim, and NOTHING about the keyboard. Which surface owns
   * Escape and Tab is decided by the trap STACK in `focusTrap.ts` — arm order, not a prop
   * — so a caller cannot get the two out of step by forgetting this.
   */
  layer?: 'base' | 'sub';
}

/** `STATION-CHROME-02` §2 — the frames, resolved from the token home and never spelled here. */
const WIDTHS: Record<'prose' | 'wide' | 'fixed' | 'ledger' | 'library' | 'import', string> = {
  prose: cssVars['--r-modal-w-prose'],
  wide: cssVars['--r-modal-w-wide'],
  fixed: cssVars['--r-modal-w-fixed'],
  ledger: cssVars['--r-modal-w-ledger'],
  library: cssVars['--r-modal-w-library'],
  import: cssVars['--r-modal-w-import'],
};

export function Modal({
  title,
  subtitle,
  emblem,
  footer,
  message,
  onClose,
  children,
  ariaLabel,
  size = 'prose',
  layer: layerLevel = 'base',
}: ModalProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  /** `STATION-CHROME-02` §2 — one read of the frame decision, four places apply it. */
  const fixed = size === 'fixed';
  /*
   * `MONITORS-01` audit row 74 — the `fixed` frame takes the drawing's own 19 px / 650 for
   * its title; every other dialog keeps the one shared treatment. Composed here rather than
   * at the two `<h2>` sites so the subtitle and no-subtitle branches cannot drift apart.
   */
  const titleStyle = fixed ? { ...styles.title, ...styles.titleFixed } : styles.title;
  // One shape downstream, so the region never has to ask which form it was given.
  const messages: readonly ModalMessage[] =
    message === undefined ? [] : Array.isArray(message) ? message : [message as ModalMessage];

  /*
    🔴 `B-230` — THE TRAP IS ARMED ONCE, AND THAT IS THE FIX AS MUCH AS THE SHARING IS.

    This used to be one effect that did three things — move focus in, wrap Tab, handle
    Escape — with `[onClose]` for its dependency list. Every caller passes `onClose` as an
    inline arrow, so its identity changes on EVERY render, so the effect tore down and set
    up again on every keystroke. Its setup moves focus. Typing one character into a
    dialog's field therefore threw focus onto the ✕, which is why `usePrompt`'s `autoFocus`
    looked "defeated by the primitive": it was not a race at mount, it was focus being
    taken again on every commit.

    Splitting them fixes it structurally rather than by tuning a dependency list: the trap
    arms once (`useFocusTrap`, deps `[enabled]`), and the ESCAPE handler — which moves no
    focus and is therefore free to re-register — keeps reading the latest `onClose`.

    ⭐ `data-modal-autofocus` is how a dialog nominates where focus LANDS, resolved INSIDE
    the trap rather than by a competing `autoFocus` attribute. One thing moves focus, so
    there is no race to win: see `usePrompt`, the one caller that needs it.
  */
  const layer = useFocusTrap(ref, true, { initialFocusSelector: '[data-modal-autofocus]' });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      /*
        🔴 `STATION-CHROME-01` §6 — ESCAPE BELONGS TO THE TOP-MOST DIALOG, and until this
        change that sentence was a COMMENT rather than a mechanism.

        It used to read "Capture-phase + stop: Escape belongs to the top-most dialog" above
        a bare `e.stopPropagation()`. That is not what `stopPropagation` does: it stops the
        event reaching other NODES, and every dialog registers this handler on the SAME node
        (`document`), so a second dialog's handler still ran. With an Add dialog open over
        Station setup, one Escape closed BOTH — the operator lost the settings dialog he was
        working in because he cancelled a small form on top of it.

        `layer.isTop()` reads the shared trap stack, so the answer is the same one the TAB
        trap gives — one notion of "which surface owns the keyboard", not two that can drift.
        `stopPropagation` stays for the ordinary case (a key must not reach the console
        behind the scrim); it is simply no longer load-bearing for the nesting.
      */
      if (!layer.isTop()) return;
      e.stopPropagation();
      onClose();
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose, layer]);

  return createPortal(
    <div
      style={layerLevel === 'sub' ? { ...styles.scrim, ...styles.scrimSub } : styles.scrim}
      role="presentation"
      data-modal-layer={layerLevel}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* The scrim cancels; a click INSIDE the dialog must not. */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        data-modal-size={size}
        style={{
          ...styles.dialog,
          ...(fixed ? styles.dialogFixed : {}),
          width: WIDTHS[size],
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={fixed ? { ...styles.titleRow, ...styles.titleRowFixed } : styles.titleRow}>
          {/*
            🔴 `REPAIR-03` B — THE HEAD EMBLEM (audit rows 62, 72, 98, 113).

            Optional, and `aria-hidden` through `Icon`'s own default: it is a MARK, not a
            control and not information. The dialog's name is its title, which is what the
            accessible name comes from; an emblem that announced itself would make every
            dialog open with a decorative word before its own.
          */}
          {emblem !== undefined && (
            <span style={styles.emblem} data-modal-emblem="">
              <Icon icon={emblem} size={Number.parseFloat(cssVars['--r-modal-emblem-glyph'])} />
            </span>
          )}
          {subtitle === undefined ? (
            <h2 style={titleStyle}>{title}</h2>
          ) : (
            <div style={styles.titleStack}>
              <h2 style={titleStyle}>{title}</h2>
              <p style={styles.subtitle} data-modal-subtitle="">
                {subtitle}
              </p>
            </div>
          )}
          {/*
            THE CLOSE AFFORDANCE, in the primitive so EVERY modal has one.

            Escape and a backdrop click already dismissed, but neither is visible: an
            operator who does not know them had to find the Cancel button, and a dialog
            with no obvious way out is one somebody force-reloads the console to escape.

            It routes to `onClose`, which is the CANCEL path — the same one Escape and
            the backdrop take. That is why it is safe for it to be the first focusable
            element in the dialog (the focus-on-open below lands here now): the thing
            focus lands on is the harmless one, which is exactly the invariant the
            footer's "cancel first in DOM order" rule was protecting.
          */}
          <Button
            variant="ghost"
            aria-label="Close"
            title="Close (Escape)"
            onClick={onClose}
            className="cg-modal-close"
          >
            <Icon icon={X} size={16} />
          </Button>
        </div>
        {children !== undefined && (
          <div
            style={
              /*
                `RUNTIME-REPAIR-04` — `library` is FLUSH like `fixed`, and for the same reason:
                its body is a two-column layout whose divider must reach the head band and the
                footer, as the reference's `.template-layout` does. The inset moves to the
                columns, which is where the reference puts it (`.template-tools{padding:20px
                24px 14px}`).

                ⚠ This is decided HERE and not in `controls.css`, because the padding is an
                INLINE style: a `[data-modal-size='library'] .cg-modal-body` rule loses to it
                every time, silently, and the column just renders 44 px narrow.
              */
              size === 'fixed' || size === 'library'
                ? { ...styles.body, ...styles.bodyFixed }
                : styles.body
            }
            className="cg-modal-body"
            data-modal-body=""
          >
            {children}
          </div>
        )}
        {/*
          §3 — OUTSIDE `body`, ABOVE `footer`. The order of these two elements IS
          the fix: a message rendered into `children` above would scroll away with
          the content, which is the defect.

          The ARIA role sits on each `Notice`, not on this wrapper: a refusal is an
          `alert` and a neutral outcome is a `status`, and a wrapper that announced
          both as one would re-flatten the distinction the roles exist to keep.
        */}
        {messages.length > 0 && (
          <div
            style={fixed ? { ...styles.message, ...styles.messageFixed } : styles.message}
            className="cg-modal-message"
            data-modal-message=""
          >
            {messages.map((m, i) => (
              <Notice
                key={`${m.role}:${String(i)}`}
                noticeRole={m.role}
                text={m.text}
                {...(m.detail !== undefined ? { detail: m.detail } : {})}
              />
            ))}
          </div>
        )}
        <div
          style={fixed ? { ...styles.footer, ...styles.footerFixed } : styles.footer}
          className="cg-modal-footer"
        >
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
