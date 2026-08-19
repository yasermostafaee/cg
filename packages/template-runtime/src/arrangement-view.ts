import {
  flattenElements,
  type ArrangementView,
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
    // which for a root-level element IS scene space. `scale` and `rotation` write a CSS
    // `transform` that the binding layer itself documents as overriding rather than
    // composing with the baseline — so they are deliberately not read here; a mask derived
    // from a half-applied transform would be worse than one derived from none.
    const left = numericPx(node.style.left);
    const top = numericPx(node.style.top);
    if (left === null && top === null) continue;
    const moved: LiveSourceRect = {
      x: left ?? box.x,
      y: top ?? box.y,
      width: box.width,
      height: box.height,
    };
    // Only when it actually moved — an identity override is work for every element on every
    // update, and a map that says "everything moved" cannot be read for what did.
    if (moved.x !== box.x || moved.y !== box.y) geometry[id] = moved;
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
