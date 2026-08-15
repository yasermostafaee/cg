import type { Composition, Layer, MaskHole, Scene } from './scene.js';
import type { Element } from './elements.js';
import type { Transform } from './primitives.js';
import type { LiveSourceRect } from './live-source.js';

/**
 * C-015 phase 6 / 1.5c — **the ONE walk that flattens a scene's elements to SCENE
 * pixels, and the ONE affine kernel underneath it.**
 *
 * ── WHY IT MOVED HERE ───────────────────────────────────────────────────────
 *
 * The flattener was module-private in `@cg/vcg-format`'s `live-sources.ts`, where
 * `collectLiveSources` used it to declare each plate's hole. 1.5c needs the SAME
 * geometry on the render side (`@cg/template-runtime`), and those two packages are
 * SIBLINGS — both depend on `@cg/shared-schema` and neither can see the other. So
 * this is 6.2a's move made a second time, for the same reason and with the same
 * rule: the hole the page PUNCHES and the hole the bridge FILLS must be one
 * computation, because a page that punches somewhere the bridge does not fill puts
 * the backdrop's own colour where the guest should be — and nothing on air says
 * which of the two was wrong.
 *
 * ── THE KERNEL IS AN AFFINE, AND `localToParent` IS DERIVED FROM IT ─────────
 *
 * `localToParent` (lifted verbatim from `off-frame.ts:50-60` in C-015) maps a point
 * FORWARD. 1.5c also needs the map BACKWARD — a plate's scene-px rect expressed in
 * the local box of some element below it — and an inverse cannot be spelled in the
 * point-mapping form. Rather than add a second, independently-derived inverse (the
 * exact shape this repo keeps paying for), the transform is expressed ONCE as a 2×3
 * affine and `localToParent` is re-exported as a thin application of it. The
 * equivalence is pinned by test, so the two can never drift.
 */

/** A 2×3 affine, in CSS `matrix(a, b, c, d, e, f)` order: `x' = a·x + c·y + e`. */
export interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY_AFFINE: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `m ∘ n` — apply `n` first, then `m`. */
export function composeAffine(m: Affine, n: Affine): Affine {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function applyAffine(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/**
 * The inverse, or `null` when the matrix is SINGULAR — a level scaled to zero on
 * either axis. `null` is a first-class answer: a collapsed element paints nothing,
 * so there is no space to express a hole in, and the caller must not invent one.
 */
export function invertAffine(m: Affine): Affine | null {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0 || !Number.isFinite(det)) return null;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

/**
 * An element's own `Transform`, as the affine mapping its LOCAL box coordinates
 * (relative to the unscaled box's top-left) into its PARENT's coordinates:
 * `Scale · Rotate-about-anchor`, then translate.
 */
export function transformToParent(t: Transform): Affine {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const a = t.scale.x * cos;
  const b = t.scale.y * sin;
  const c = -t.scale.x * sin;
  const d = t.scale.y * cos;
  const ax = t.anchor.x * t.size.w;
  const ay = t.anchor.y * t.size.h;
  return {
    a,
    b,
    c,
    d,
    e: t.position.x + ax - (a * ax + c * ay),
    f: t.position.y + ay - (b * ax + d * ay),
  };
}

/**
 * `frameAabb`'s per-level kernel (`off-frame.ts:50-60`) — map an element-local
 * point through `Scale·Rotate-about-anchor` + translate into the PARENT's frame.
 *
 * Kept as the named entry point it has always been, but now DERIVED from
 * {@link transformToParent} rather than spelled out a second time.
 */
export function localToParent(t: Transform, lx: number, ly: number): { x: number; y: number } {
  return applyAffine(transformToParent(t), lx, ly);
}

/**
 * One level of the ancestor chain.
 *
 * `preScale` is what `frameAabb` has no concept of and what makes this correct for
 * a nested Live Source: a COMPOSITION INSTANCE renders its referenced composition
 * into a `cg-comp-inner` div at `left/top: 0` with `transform-origin: 0 0` and
 * `scale(size.w / comp.resolution.width, size.h / comp.resolution.height)`
 * (`scene-builder.ts`'s `buildComposition`). So a point in the composition's own
 * pixels is first multiplied by that scale to become a point in the instance's
 * element-local box, and only THEN goes through the instance's own transform. A
 * container level carries `preScale` (1, 1).
 */
export interface AncestorLevel {
  readonly transform: Transform;
  readonly preScale: { readonly x: number; readonly y: number };
}

/** A level's full contribution: its own inner scale, then its transform. */
function levelAffine(level: AncestorLevel): Affine {
  return composeAffine(transformToParent(level.transform), {
    a: level.preScale.x,
    b: 0,
    c: 0,
    d: level.preScale.y,
    e: 0,
    f: 0,
  });
}

/**
 * The composed LOCAL → SCENE affine for an element sitting under `ancestors`
 * (outermost → innermost). A point travels inward-to-outward, so the element's own
 * transform is applied FIRST and the outermost level LAST.
 */
export function elementToScene(el: Element, ancestors: readonly AncestorLevel[]): Affine {
  let m = transformToParent(el.transform);
  for (let i = ancestors.length - 1; i >= 0; i--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    m = composeAffine(levelAffine(ancestors[i]!), m);
  }
  return m;
}

/** The axis-aligned bounding box of a `w × h` box mapped through `m`. */
function boxAabb(m: Affine, w: number, h: number): LiveSourceRect {
  return rectThrough(m, { x: 0, y: 0, width: w, height: h });
}

/** The AABB of `rect`'s four corners mapped through `m`. */
function rectThrough(m: Affine, rect: LiveSourceRect): LiveSourceRect {
  const corners: readonly (readonly [number, number])[] = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of corners) {
    const p = applyAffine(m, lx, ly);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The scene-px AABB of an element's own box, folded outward through `ancestors`.
 *
 * All four corners are mapped, not two, because a level may ROTATE: the AABB of a
 * rotated box is not the mapping of its top-left and bottom-right.
 */
export function sceneRect(el: Element, ancestors: readonly AncestorLevel[]): LiveSourceRect {
  return boxAabb(elementToScene(el, ancestors), el.transform.size.w, el.transform.size.h);
}

/** One element, as the walk found it. */
export interface FlatElement {
  readonly element: Element;
  /** The element's own box, flattened to SCENE pixels through its full ancestor chain. */
  readonly rect: LiveSourceRect;
  /** LOCAL → SCENE. Kept so a consumer can map the other way without re-walking. */
  readonly toScene: Affine;
  /** The ancestor chain that produced `toScene`, outermost → innermost. */
  readonly ancestors: readonly AncestorLevel[];
  /**
   * Composition-instance path + element id — UNIQUE per rendered copy, where the
   * element id alone is not: the same authored child inside a composition instanced
   * TWICE has two DOM copies at two different scene positions. Root elements key as
   * their bare id.
   */
  readonly key: string;
  /** Composition nesting depth, bounded exactly as the builder bounds it. */
  readonly depth: number;
}

/**
 * How siblings are ordered.
 *
 * - `'document'` — the authored array order. This is `collectLiveSources`'s
 *   contract: it makes the declaration array stable across exports of an unchanged
 *   scene, and it must not change.
 * - `'paint'` — sorted by `zIndex`, which is what `buildLayer` actually appends in
 *   and therefore what "above" means on screen. `Array.sort` is stable, so equal
 *   `zIndex` falls back to document order — the same tiebreak the builder gets.
 */
export type SiblingOrder = 'document' | 'paint';

/**
 * Bounds the composition recursion exactly as `scene-builder.ts` does, so a
 * declaration is derived from the same subtree the page actually renders.
 */
const MAX_COMPOSITION_DEPTH = 8;

/**
 * Every element in `scene`, flattened to scene pixels through its full ancestor
 * chain — containers AND composition instances, the latter including the
 * instance's inner scale.
 *
 * ⚠ **A `repeater` subtree is NOT walked**, and that is deliberate rather than an
 * omission. A repeater stamps rows at positions computed at RUN time, so nothing
 * inside one has a static scene-px rect; declaring the template's own unstamped
 * coordinates would name a rect no stamp actually occupies.
 */
export function flattenElements(scene: Scene, order: SiblingOrder = 'document'): FlatElement[] {
  const byId = new Map<string, Composition>();
  for (const c of scene.compositions ?? []) byId.set(c.id, c);

  const out: FlatElement[] = [];
  const walk = (
    children: readonly Element[],
    ancestors: readonly AncestorLevel[],
    visited: ReadonlySet<string>,
    depth: number,
    prefix: string,
  ): void => {
    const ordered =
      order === 'paint' ? [...children].sort((a, b) => a.zIndex - b.zIndex) : children;
    for (const el of ordered) {
      const key = `${prefix}${el.id}`;
      out.push({
        element: el,
        rect: sceneRect(el, ancestors),
        toScene: elementToScene(el, ancestors),
        ancestors,
        key,
        depth,
      });
      if (el.type === 'container') {
        walk(
          el.children,
          [...ancestors, { transform: el.transform, preScale: { x: 1, y: 1 } }],
          visited,
          depth,
          prefix,
        );
        continue;
      }
      if (el.type === 'composition') {
        const comp = byId.get(el.compositionId);
        // The same three guards the builder applies before rendering an instance: a
        // missing reference, an over-deep chain and a cycle all render the empty box,
        // so they contribute nothing here either.
        if (comp === undefined || depth >= MAX_COMPOSITION_DEPTH || visited.has(el.compositionId)) {
          continue;
        }
        const preScale = {
          x: comp.resolution.width === 0 ? 1 : el.transform.size.w / comp.resolution.width,
          y: comp.resolution.height === 0 ? 1 : el.transform.size.h / comp.resolution.height,
        };
        const level: AncestorLevel = { transform: el.transform, preScale };
        const nextVisited = new Set(visited).add(el.compositionId);
        const layers: readonly Layer[] = comp.layers;
        for (const layer of layers) {
          walk(layer.children, [...ancestors, level], nextVisited, depth + 1, `${key}/`);
        }
      }
      // A `repeater` is deliberately NOT walked — see the docstring.
    }
  };

  for (const layer of scene.layers) walk(layer.children, [], new Set<string>(), 0, '');
  return out;
}

/** Do two axis-aligned rects share any AREA? Touching edges do not count. */
function intersects(a: LiveSourceRect, b: LiveSourceRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * ⭐ **§9a-Z — WHICH ELEMENT CARRIES WHICH HOLES.** `scene → key → the holes that
 * element must punch, in ITS OWN local box coordinates.`
 *
 * ── THE RULE, WHICH IS THE OWNER'S AND NOT A DERIVATION ─────────────────────
 *
 * > Mask by Z-ORDER, not by a declared role. Each element is masked with the union
 * > of the rects of the plates ABOVE it in the scene's existing element order.
 * > Elements above all plates are not masked.
 *
 * It needs no new schema concept and no Designer control — *"a declared-backdrop
 * flag that someone forgets to set is a silent black plate on air"* — and it fixes
 * the real bug in the naive "mask everything below a plate" reading: **a caption
 * authored ABOVE a guest box survives**, because it is above the plate in z-order.
 * A name super over a live guest is ordinary broadcast, and the simpler rule ate it.
 *
 * ── THE PUNCH IS UNCONDITIONAL (§9a-Z, as CORRECTED) ────────────────────────
 *
 * Every DECLARED plate punches. Whether a plate is ASSIGNED a live source is an
 * INSTALLATION fact — the element carries only a symbolic `routeKey`, and this mask
 * is baked at export, before any installation is known. A condition belongs in the
 * mask ONLY IF it can be evaluated from the SCENE ALONE: visibility, lifecycle
 * range, geometry and z-order qualify; assignment does not. 6.7's named refusal is
 * the single authority on an unsourced plate.
 *
 * `visible: false` therefore DOES suppress a plate's hole (a scene fact), while an
 * unassigned plate still punches (an installation fact).
 *
 * ── THE COORDINATE SPACE, AND WHY IT IS THE ELEMENT'S OWN ───────────────────
 *
 * A CSS mask applies in the element's OWN box, BEFORE its transform and before
 * every ancestor's — so those transforms map the mask exactly as they map the paint
 * and must not be applied twice. Each hole is therefore the plate's SCENE rect
 * pulled back through `invert(element.toScene)`.
 *
 * That pull-back is EXACT for every axis-aligned chain at any nesting depth or
 * scale. ⚠ Where the masked element's chain ROTATES, the pulled-back scene AABB is
 * a rotated quad and is re-bounded — an OVER-punch, never an under-punch, so the
 * live picture is never cropped by it.
 */
export function sceneMaskHoles(scene: Scene): Map<string, MaskHole[]> {
  const flat = flattenElements(scene, 'paint');

  // Paint order is the array order of `flat`: `flattenElements` emits an element
  // before its children and sorts siblings by `zIndex`, which is exactly what
  // `buildLayer` appends. So "above" is simply "at a higher index".
  const plates = flat
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => f.element.type === 'video-placeholder' && f.element.visible);

  const holes = new Map<string, MaskHole[]>();
  if (plates.length === 0) return holes;

  for (let i = 0; i < flat.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const target = flat[i]!;
    // A container / composition paints NOTHING itself, and masking one would mask
    // its whole subtree — including any element the author put ABOVE the plate
    // inside it. Their children are enumerated separately and masked on their own.
    if (target.element.type === 'container' || target.element.type === 'composition') continue;
    const above = plates.filter((p) => p.index > i && intersects(p.f.rect, target.rect));
    if (above.length === 0) continue;
    const toLocal = invertAffine(target.toScene);
    // A collapsed element (scaled to zero on an axis) paints nothing, so there is no
    // space to express a hole in. `null` here means NO MASK, not an empty one.
    if (toLocal === null) continue;
    holes.set(
      target.key,
      above.map(({ f }) => {
        const local = rectThrough(toLocal, f.rect);
        return { x: local.x, y: local.y, width: local.width, height: local.height };
      }),
    );
  }
  return holes;
}
