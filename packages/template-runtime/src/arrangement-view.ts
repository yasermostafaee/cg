import {
  resolveVisibilityOf,
  type ArrangementView,
  type Element,
  type Scene,
} from '@cg/shared-schema';

/*
 * 🔴 **`single-clock-look-switch` — `liveArrangementView` IS GONE, with its one consumer.**
 *
 * It read the page'"'"'s CURRENT layout back so the mask was computed against where the nodes
 * actually ARE rather than where the view said to put them. That was the page'"'"'s half of "the
 * hole the page punches and the fill the bridge sends are one computation" — and there is one
 * computation left, on the bridge'"'"'s side, so the read-back has nothing to reconcile.
 *
 * `applyArrangementToNodes` below is untouched: an arrangement still MOVES the boxes, and
 * `collectLiveSources` still reports where they went. What is gone is only the reading back.
 */

/**
 * 🔴 **Apply the ACTIVE ARRANGEMENT to the live nodes — the half `repunchLiveSourceHoles`
 * does not do.**
 *
 * ── WHY THIS EXISTS, AND WHY C1 DID NOT NOTICE IT WAS MISSING ───────────────
 *
 * C1 built `setArrangementView` to make the MASK follow a moved plate (UNIT B′), and it
 * does. But a mask that follows a box nothing moved follows it nowhere: `sceneMaskHoles`
 * consumes the geometry override, so C1's tests — which assert where the HOLE is — all
 * passed while the boxes themselves never budged. It took C2's acceptance test, which reads
 * the box's real rendered rect out of the preview iframe, to show that switching
 * arrangements changed nothing on screen.
 *
 * ⚠ **That is the exact shape this repo keeps paying for**, arrived at from a new
 * direction: a mechanism that is wired, tested and reachable, and still cannot do the thing
 * it exists for, because the tests all asked the question it DOES answer. The lesson worth
 * keeping is that C1's matrix asserted the mask and never the box.
 *
 * ── WHAT IT TOUCHES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────
 *
 * ONLY the elements an arrangement actually has an opinion about — those in `geometry`, plus
 * those it previously moved and no longer does (so switching back RESTORES). Every other
 * node is left exactly as the builder settled it.
 *
 * That restriction is load-bearing rather than tidiness: writing `width`/`height` onto an
 * AUTO-SIZED text element would destroy D-060's content sizing, and writing `display` onto
 * an element a lifespan gate has hidden would un-hide it mid-timeline. Touching only what
 * was named means neither can happen by accident.
 *
 * 🔴 Visibility goes through `resolveVisibilityOf` — the ONE function — never through a
 * local `if`. This is the third consumer of it and the rule is unchanged.
 */
export function applyArrangementToNodes(
  scene: Scene,
  rootElements: ReadonlyMap<string, HTMLElement>,
  view: ArrangementView | undefined,
  previous: ArrangementView | undefined,
): void {
  const authored = new Map<string, Element>();
  for (const layer of scene.layers) for (const el of layer.children) authored.set(el.id, el);

  const geometryIds = new Set([
    ...Object.keys(view?.geometry ?? {}),
    ...Object.keys(previous?.geometry ?? {}),
  ]);
  for (const id of geometryIds) {
    const node = rootElements.get(id);
    const el = authored.get(id);
    if (node === undefined || el === undefined) continue;
    // Present ⇒ the arrangement's cell. Absent ⇒ back to what the author drew: a switch to
    // "as authored" has to be a real restore, not a stuck last position.
    const rect = view?.geometry?.[id] ?? {
      x: el.transform.position.x,
      y: el.transform.position.y,
      width: el.transform.size.w,
      height: el.transform.size.h,
    };
    node.style.left = `${String(rect.x)}px`;
    node.style.top = `${String(rect.y)}px`;
    node.style.width = `${String(rect.width)}px`;
    node.style.height = `${String(rect.height)}px`;
  }

  const visibilityIds = new Set([
    ...Object.keys(view?.visibility ?? {}),
    ...Object.keys(previous?.visibility ?? {}),
  ]);
  for (const id of visibilityIds) {
    const node = rootElements.get(id);
    const el = authored.get(id);
    if (node === undefined || el === undefined) continue;
    const on = resolveVisibilityOf(
      {
        id,
        visible: el.visible,
        ...(el.hideDuringTransition !== undefined
          ? { hideDuringTransition: el.hideDuringTransition }
          : {}),
      },
      { arrangementVisibility: view?.visibility, transitioning: view?.transitioning },
    );
    node.style.display = on ? '' : 'none';
  }
}
