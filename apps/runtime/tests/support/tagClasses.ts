/**
 * 🔴 `TAG-NOT-BUTTON-07` §6 — the class names that mean "this is a tag" in the Runtime.
 *
 * Its own module, with NO test-runner import, because BOTH guards need it and they run in
 * different worlds: the jsdom guard imports it directly (`support/tagShape.ts`) and the
 * Playwright guard hands it to `page.evaluate` to run inside the browser. A second copy is how
 * one of them comes to know about a tag class the other does not, and a guard that does not
 * know about a class is blind to exactly the tag someone hand-spelled.
 *
 * ⚠ A NEW TAG TREATMENT MUST BE ADDED HERE. This list is what makes the COVERAGE check work —
 * without it a tag that loses its marker simply disappears from the sweep, making the result
 * smaller instead of red. That is not a hypothetical: the planted-red run for §6 passed the
 * marker-only sweep and was caught only by this list.
 *
 * ⚠ DELIBERATE OMISSIONS. `cg-code-chip` is inline `<code>` inside a sentence — semantic
 * markup, not a mark on a surface. `cg-plate-count` is muted text with no box (`controls.css`),
 * a count rather than a chip. Neither is a tag, and adding them would force a `<code>` element
 * to pretend to be one.
 */
export const TAG_CLASSES: readonly string[] = [
  'cg-setup-tag',
  'cg-setup-card-tag',
  'cg-setup-server-chip',
  'cg-tag',
  'cg-pill',
  'cg-badge',
  'cg-chip-draft',
  'cg-chip-audio',
  'cg-meta-chip',
  'cg-file-chip',
  'cg-plate-pill',
];
