import type { Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import * as s from './InspectorPanel.css.js';
import * as cls from './ArrangementsSection.css.js';

/**
 * ⭐ **`multibox-layout-switch` C2 (`tasks.md` 5.5) — D4's HIDE-WHILE-TRANSITIONING flag,
 * authored BESIDE THE ELEMENT.**
 *
 * ── WHY PER-ELEMENT AND NOT PER-ARRANGEMENT ─────────────────────────────────
 *
 * The distinction being authored is a property of the ELEMENT: a box title should leave
 * during the move so the rearrange does not look messy, while a logo inside the multi-box
 * must not blink on every switch. An arrangement-level flag would force one answer for
 * everything the arrangement contains, and the first template with both a title and a logo
 * would have to pick which one is wrong.
 *
 * ── 🔴 IT IS AN INPUT, NOT A BOOLEAN THE RENDERER READS ─────────────────────
 *
 * This control writes `hideDuringTransition`, which is the THIRD input to
 * `resolveVisibility` and is read in exactly one place. Nothing in the Designer or the
 * runtime tests it directly — a local `if (el.hideDuringTransition)` at a point of use is
 * smaller, looks obviously correct in isolation, and is precisely the breach `visibility.ts`
 * exists to prevent.
 *
 * The section appears only when the composition HAS arrangements: a flag about transitions
 * between arrangements is noise on a template that has none, and an affordance that does
 * nothing teaches the author that the feature does nothing.
 */
export function ArrangementElementSection({
  element,
  scene,
}: {
  element: Element;
  scene: Scene;
}): JSX.Element | null {
  /**
   * 🔴 Shown when the PROJECT uses arrangements anywhere — not only when the OPEN
   * composition has them.
   *
   * Measured by eye (session AX): a box's TITLE lives inside the BOX composition, and the
   * arrangements live on the composition that INSTANCES it. Scoping this to the active
   * document therefore hid the flag on exactly the element D4 was written for — _"a box
   * title should leave during the move"_ — and showed it only on the box instance, where it
   * is far less useful. The narrow test was correct-looking and wrong.
   */
  const usesArrangements =
    (scene.arrangements?.length ?? 0) > 0 ||
    (scene.compositions ?? []).some((c) => (c.arrangements?.length ?? 0) > 0);
  if (!usesArrangements) return null;
  const on = element.hideDuringTransition ?? false;
  return (
    <CollapseSection title="Arrangement" defaultExpanded={on}>
      <div className={s.row} style={{ display: 'block' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={on}
            aria-label="Hide this element while the arrangement is changing"
            onChange={(e) =>
              designerStore.updateElement(element.id, {
                hideDuringTransition: e.target.checked,
              } as Partial<Element>)
            }
          />
          <span style={{ color: colors.text, fontSize: '0.7rem' }}>
            Hide while the arrangement is changing
          </span>
        </label>
      </div>
      <p className={cls.hint}>
        {on
          ? 'This element leaves for the length of the transition and comes back when it lands — the usual choice for a box title.'
          : 'This element stays on screen throughout the move — the usual choice for a logo, which should not blink on every switch.'}
      </p>
    </CollapseSection>
  );
}
