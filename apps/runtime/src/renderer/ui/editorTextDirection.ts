/**
 * THE EDITOR'S text direction — `dir="auto"`, and the one place that decision lives.
 *
 * An operator typing Persian or Arabic into a field should see the caret and the text
 * behave right-to-left; typing Latin should stay left-to-right. `dir="auto"` is exactly
 * that: the browser applies the Unicode FIRST-STRONG-CHARACTER rule (UAX #9), which is
 * the rule being asked for, not an approximation of it.
 *
 * DO NOT HAND-ROLL A FIRST-CHARACTER TEST. A `text[0]` regex gets wrong every value
 * that opens with a directionally NEUTRAL character, and real field values do:
 *
 *   - `@IRIBNEWS` — `@` is neutral, the first STRONG character is Latin, so it must
 *     stay LTR. A naive check decides on the `@` and gets it backwards.
 *   - a value starting with a digit, a quote, a bracket or a space — all neutral.
 *
 * ── THE CONSTRAINT THAT MATTERS MORE THAN THE FEATURE ────────────────────────────
 *
 * This is EDITOR-ONLY presentation. The direction of the input box must NEVER reach
 * the staged value, the applied payload, the scene, or what renders on air — a
 * graphic's direction is an AUTHORED property (`element.direction`), set in the
 * Designer.
 *
 * If typing Persian into a field silently changed the rendered direction, the operator
 * would be re-authoring the graphic by editing its text, and every other row and
 * install using that template would inherit it. B-111 is on record for an RTL
 * confusion of this family: a fixed box with `align: 'start'` plus `rtl`
 * right-aligned its text and was reported as a runtime bug when the cause was
 * authored all along.
 *
 * `dir` is a DOM presentation attribute and is never read back into a value, so the
 * separation holds by CONSTRUCTION rather than by discipline. `inspector.dirAuto.dom.test.ts`
 * pins it: values round-trip byte-identically whichever direction was displayed, and
 * no editor pins a literal `rtl` / `ltr`.
 */
export const EDITOR_DIR = 'auto' as const;
