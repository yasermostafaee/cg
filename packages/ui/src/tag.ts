/**
 * 🔴 `TAG-NOT-BUTTON-07` — **THE SHAPE MUST MATCH THE BEHAVIOUR.**
 *
 * A TAG is a non-interactive mark: a fact the surface is stating, not an affordance. A thing
 * that does nothing when pressed must not be a button, must not be focusable, and must carry
 * no hover or active treatment. Its complement is just as binding: a thing that DOES something
 * is a real `<button>`, keyboard-reachable, with a visible focus state — even when it is
 * chip-shaped. This module owns the first half.
 *
 * ── WHY THE CONTRACT LIVES IN `@cg/ui` AND THE COMPONENT DOES NOT ────────────────────────
 *
 * `@cg/ui` is TOKENS-ONLY by CLAUDE.md, and components live app-local. So the two halves are
 * split along that line: the CONTRACT (this marker, these geometry tokens, and the one global
 * rule in `theme.css` that enforces inertness) is shared — the Designer renders through it too
 * — while the element that carries it is each app's own `renderer/ui/Tag.tsx`. Neither app can
 * drift from the rule, and the package still has no React dependency.
 *
 * ── WHY A MARKER ATTRIBUTE RATHER THAN A CLASS ───────────────────────────────────────────
 *
 * A class would collide: the Runtime already ships a `.cg-tag` (the audit/picker badge) whose
 * values are its own, and a second global `.cg-tag` would silently repaint it. More
 * importantly the marker is what makes the GUARD non-vacuous — a spec can sweep the surface AS
 * THE APP RENDERS IT for `[data-cg-tag]` and ask of every hit whether it is a button, rather
 * than mounting one component and proving only that that component is fine while the app
 * quietly stopped using it.
 *
 * ⚠ The marker states a CONTRACT, not an appearance. Each app keeps its own tag treatment;
 * nothing here paints, so adopting it moves no pixel.
 */

/** The attribute every tag carries. Spread `tagProps` rather than spelling it. */
export const TAG_MARKER = 'data-cg-tag';

/**
 * Props that make an element a tag. Spread onto the element — one spelling, so a typo cannot
 * silently produce an unmarked tag the guard then fails to see.
 */
export const tagProps = Object.freeze({ [TAG_MARKER]: '' } as const);

/**
 * ARIA roles a tag may carry. Deliberately an ALLOWLIST of non-interactive roles rather than a
 * ban on `button`: a status readout legitimately wants `role="status"` and an icon-only mark
 * wants `role="img"`, while `role="button"` on a thing that does nothing is exactly the defect
 * this module exists to prevent. A closed union means the compiler refuses the bad one at the
 * call site, before any test runs.
 */
export type TagRole = 'status' | 'img' | 'note' | 'term';

/**
 * The tag's geometry, measured off the reference (`09-channel-settings.html`) in Chromium at
 * 1280 × 800 rather than read off a stylesheet — its `.tag` renders 28 px tall on `5px 8px` at
 * 12 px, radius 6, against its `.btn` at 40 px / `9px 15px` / 14 px / radius 8. Shorter,
 * quieter, flatter: the size difference IS the signal that one can be pressed and the other
 * cannot.
 *
 * ⚠ Weight is the reference's `550`, which resolves to the 600 face — the bundled family ships
 * five static faces and has no 550, so a half step renders as the whole step above it.
 */
export const tag = {
  paddingBlock: '5px',
  paddingInline: '8px',
  radius: '6px',
  fontSize: '12px',
  fontWeight: '600',
  lineHeight: '1.3',
} as const;
