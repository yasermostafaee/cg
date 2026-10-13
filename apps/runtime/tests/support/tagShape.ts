import { expect } from 'vitest';
import { TAG_MARKER } from '@cg/ui';
import { TAG_CLASSES } from './tagClasses.js';

/**
 * 🔴 `TAG-NOT-BUTTON-07` §6 — THE GUARD'S ASSERTIONS, in one place so both apps ask the same
 * three questions of a rendered surface.
 *
 * ── WHY THIS IS NOT A COMPONENT SPEC ─────────────────────────────────────────────────────
 *
 * A spec that mounts only `Tag` proves that `Tag` is fine and nothing else. It cannot notice
 * the app quietly going back to a hand-spelled `<span className="cg-setup-tag">`, and it
 * cannot notice a tag being rebuilt on `Button` — which is the exact defect that survived two
 * rounds of style edits and a documented rule. So every caller passes a surface AS THE APP
 * RENDERS IT (the whole dialog, the whole console), and this sweeps what is actually there.
 *
 * ── THE THREE QUESTIONS ──────────────────────────────────────────────────────────────────
 *
 *   1. SHAPE — no tag is a `<button>`, carries `role="button"`, or is focusable.
 *   2. COVERAGE — every element wearing a tag-family CLASS also carries the marker. Without
 *      this the guard is one hand-written `<span>` away from being blind: an unmarked tag is
 *      invisible to question 1, so a regression would make the sweep smaller rather than red.
 *   3. NON-VACUITY — the surface produced at least `atLeast` tags. A negative observation
 *      needs a positive control: "no tag is a button" is TRUE and WORTHLESS of a surface that
 *      rendered no tags, which is what a selector typo, a renamed class or a pane that failed
 *      to mount all look like.
 */

export { TAG_CLASSES } from './tagClasses.js';

/** Sub-part classes (`__name`, `--warn`, …) are parts OF a tag, never tags themselves. */
function wearsTagClass(el: Element): boolean {
  const cls = el.getAttribute('class');
  if (cls === null) return false;
  return cls
    .split(/\s+/)
    .filter(Boolean)
    .some((c) => TAG_CLASSES.includes(c));
}

function describe(el: Element): string {
  const cls = el.getAttribute('class') ?? '';
  const text = (el.textContent ?? '').trim().slice(0, 40);
  return `<${el.tagName.toLowerCase()} class="${cls}">${text}`;
}

/**
 * Assert the tag contract over one rendered surface.
 *
 * @param where  Names the surface in the failure message — the reader must not have to guess
 *               which of several sweeps went red.
 * @param atLeast The positive control. Set it to what the surface really renders, so the
 *               number also fails if a pane stops rendering its tags at all.
 */
export function expectTagsAreNotButtons(root: ParentNode, where: string, atLeast: number): number {
  const tags = [...root.querySelectorAll(`[${TAG_MARKER}]`)];

  // 3. NON-VACUITY first — an empty sweep must fail here, not pass questions 1 and 2 silently.
  expect(
    tags.length,
    `${where}: rendered no tags at all — the sweep proves nothing`,
  ).toBeGreaterThanOrEqual(atLeast);

  // 1. SHAPE.
  const pressable = tags.filter(
    (el) =>
      el.tagName === 'BUTTON' ||
      el.getAttribute('role') === 'button' ||
      Number((el as HTMLElement).tabIndex) >= 0 ||
      el.hasAttribute('onclick'),
  );
  expect(
    pressable.map(describe),
    `${where}: a tag must not be a button, carry role="button", or be focusable`,
  ).toEqual([]);

  // 2. COVERAGE — a tag-classed element that never came through the primitive.
  const unmarked = [...root.querySelectorAll('*')].filter(
    (el) => wearsTagClass(el) && !el.hasAttribute(TAG_MARKER),
  );
  expect(
    unmarked.map(describe),
    `${where}: these wear a tag class but did not come through the Tag primitive`,
  ).toEqual([]);

  return tags.length;
}
