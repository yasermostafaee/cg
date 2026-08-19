import {
  flattenElements,
  resolveVisibilityOf,
  type ArrangementView,
  type Element,
  type LiveSourceRect,
  type Scene,
} from '@cg/shared-schema';

/**
 * ⭐ **`multibox-layout-switch` `tasks.md` 4.2 / 4.3 — read the page's CURRENT state back
 * into an {@link ArrangementView}, so the re-punch pass masks what is on screen NOW rather
 * than what the scene was authored as.**
 *
 * ── WHY IT READS THE DOM AND NOT THE FIELD VALUES ───────────────────────────
 *
 * Three different mechanisms move an element's visibility at playout — the authored
 * `visible`, a `visible` binding, and a `lifespan` gate — and all three converge on ONE
 * expression of the answer: `style.display`. `applyBaseStyles` writes it at build, the
 * binding writes it on update, the gate writes it per frame. Re-deriving each of them from
 * field values would be a second implementation of all three, and the first one to drift
 * would put the mask somewhere the paint is not.
 *
 * So this reads what those mechanisms ACTUALLY WROTE. It is the same argument the flattener
 * itself is built on: the hole the page punches and the hole the bridge fills must be one
 * computation, and here the page is the thing being asked.
 *
 * ⚠ **SCOPE — the ROOT scope only, and this is a real limit rather than an oversight.**
 * `currentVisible` and `geometry` are keyed by ELEMENT ID, and the same authored element
 * inside a composition instanced twice has two DOM copies that can legitimately differ. One
 * id cannot answer for both. Root-level elements are where every plate and every box
 * instance sits under A′, so this covers the cases the feature has; a per-instance override
 * needs a per-instance key, which is a carrier change and is not this session's.
 */
export function liveArrangementView(
  scene: Scene,
  rootElements: ReadonlyMap<string, HTMLElement>,
  base: ArrangementView | undefined = undefined,
): ArrangementView {
  const authored = new Map<string, LiveSourceRect>();
  for (const f of flattenElements(scene)) {
    // Root-level only: `ancestry` is `[layer]` for an element sitting directly on a layer.
    if (f.ancestry.length === 1 && !authored.has(f.element.id)) authored.set(f.element.id, f.rect);
  }

  const currentVisible: Record<string, boolean> = { ...(base?.currentVisible ?? {}) };
  const geometry: Record<string, LiveSourceRect> = { ...(base?.geometry ?? {}) };

  for (const [id, node] of rootElements) {
    currentVisible[id] = node.style.display !== 'none';

    const box = authored.get(id);
    if (box === undefined) continue;
    // A `transform` binding on `x` / `y` writes absolute `left` / `top` in PARENT space,
    // which for a root-level element IS scene space.
    //
    // 🔴 **`B-149` — WIDTH AND HEIGHT ARE READ HERE TOO, and leaving them out was a hole on
    // air.** `applyArrangementToNodes` writes all four properties, so a cell that RESIZES a
    // box wrote `width`/`height` that nothing read back: this took the cell's POSITION and
    // the AUTHORED SIZE, and — worse than merely ignoring the cell — it OVERWROTE the correct
    // entry already in `base.geometry` whenever it detected a move. A box authored larger
    // than its cell then punched the backdrop far outside its own picture, opening the live
    // layer where no box exists: the crosstalk this feature was built to eliminate.
    //
    // ⚠ `scale` and `rotation` remain deliberately UNREAD, and that is a DIFFERENT case
    // rather than the same one half-applied: they are written into a CSS `transform` that the
    // binding layer itself documents as OVERRIDING the baseline rather than composing with
    // it, so a mask derived from one would be worse than a mask derived from none.
    // `width`/`height` carry no such ambiguity — they are plain px, written by this module.
    const left = numericPx(node.style.left);
    const top = numericPx(node.style.top);
    const width = numericPx(node.style.width);
    const height = numericPx(node.style.height);
    if (left === null && top === null && width === null && height === null) continue;
    const moved: LiveSourceRect = {
      x: left ?? box.x,
      y: top ?? box.y,
      width: width ?? box.width,
      height: height ?? box.height,
    };
    // Only when it actually differs — an identity override is work for every element on every
    // update, and a map that says "everything moved" cannot be read for what did.
    //
    // ⚠ SIZE is compared as well as position. Comparing position alone meant a cell that only
    // RESIZED a box produced no override at all.
    if (
      moved.x !== box.x ||
      moved.y !== box.y ||
      moved.width !== box.width ||
      moved.height !== box.height
    ) {
      geometry[id] = moved;
    }
  }

  return {
    ...base,
    currentVisible,
    ...(Object.keys(geometry).length > 0 ? { geometry } : {}),
  };
}

/** `"120px"` → `120`; anything that is not a plain px length → `null`. */
function numericPx(value: string): number | null {
  if (!value.endsWith('px')) return null;
  const n = Number(value.slice(0, -2));
  return Number.isFinite(n) ? n : null;
}

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
