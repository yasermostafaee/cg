import type { Composition, Element, Layer, Scene, Transform } from '@cg/shared-schema';
import { compositionClosure } from '@cg/shared-schema';

/**
 * D-071 Phase A — EXPORT-ONLY filter: drop fully-off-frame STATIC elements from an
 * already-D-086-scoped scene so they don't bloat the package (their image bytes are
 * never gathered, one fewer node renders). The OUTPUT is unchanged — off-frame
 * content is already clipped invisible by the runtime's `.cg-stage { overflow:
 * hidden }`; this only removes the dead weight.
 *
 * The rule is deliberately CONSERVATIVE ("when in doubt, KEEP" — never drop content
 * that could ever reach the frame). An element is dropped IFF ALL hold:
 *   1. it has NO geometry animation track (position/size/scale/rotation), AND
 *   2. none of its (recursed) ancestor containers are animated — guaranteed by
 *      construction: we only recurse into STATIC containers, never animated ones, AND
 *   3. it is not a repeater nor inside a repeater TEMPLATE composition (stamping can
 *      place rows at on-frame positions), AND
 *   4. its rotated/scaled AABB — composed through its static ancestor transforms —
 *      lies STRICTLY outside its own composition's frame `[0,0,W,H]` (touching or
 *      crossing an edge = partially-on = KEEP; degenerate/non-finite = KEEP).
 *
 * `editSceneOf` (the canvas projection) and Save (`JSON.stringify(scene)`) never call
 * this, so off-frame STAGING shapes stay visible/editable and persist in `.cg.json`.
 */

/** Geometry-affecting (AABB-moving) animation track keys. Keyframing any of these
 *  means the box can move/resize/rotate onto the frame over the timeline. */
const GEOMETRY_TRACKS = [
  'position.x',
  'position.y',
  'size.w',
  'size.h',
  'scale.x',
  'scale.y',
  'rotation',
] as const;

function hasGeometryAnimation(el: Element): boolean {
  const tracks = el.animation?.tracks;
  if (tracks === undefined) return false;
  return GEOMETRY_TRACKS.some((k) => tracks[k] !== undefined);
}

/**
 * Mirror of `features/canvas/geometry.ts` `localToScene`: map an element-local point
 * (relative to the unscaled box top-left) through `Scale·Rotate-about-anchor` +
 * translate into the element's PARENT coordinate system. Kept self-contained (pure,
 * no cross-feature import) so this export filter is independently testable.
 */
function localToParent(t: Transform, lx: number, ly: number): { x: number; y: number } {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = lx - t.anchor.x * t.size.w;
  const oy = ly - t.anchor.y * t.size.h;
  return {
    x: t.position.x + t.anchor.x * t.size.w + t.scale.x * (ox * cos - oy * sin),
    y: t.position.y + t.anchor.y * t.size.h + t.scale.y * (ox * sin + oy * cos),
  };
}

interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Frame-space AABB of `el`, folding its 4 local corners outward through the static
 *  ancestor container transforms (`ancestors` is outermost→innermost). */
function frameAabb(el: Element, ancestors: readonly Transform[]): Aabb {
  const { w, h } = el.transform.size;
  const corners: readonly [number, number][] = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of corners) {
    let p = localToParent(el.transform, lx, ly);
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      p = localToParent(ancestors[i]!, p.x, p.y);
    }
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * True when `el` (with its static ancestor transforms) is STRICTLY outside the frame
 * `[0,0,frameW,frameH]`. Touching/crossing an edge (partially-on) and a degenerate or
 * non-finite box both return false (KEEP).
 */
export function isFullyOffFrame(
  el: Element,
  ancestors: readonly Transform[],
  frameW: number,
  frameH: number,
): boolean {
  const { w, h } = el.transform.size;
  if (!(w > 0) || !(h > 0)) return false; // degenerate box → keep
  const { minX, minY, maxX, maxY } = frameAabb(el, ancestors);
  if (![minX, minY, maxX, maxY].every((n) => Number.isFinite(n))) return false;
  return maxX < 0 || minX > frameW || maxY < 0 || minY > frameH;
}

function filterChildren(
  children: readonly Element[],
  ancestors: readonly Transform[],
  frameW: number,
  frameH: number,
): Element[] {
  const out: Element[] = [];
  for (const el of children) {
    // Guard 3 — a repeater stamps rows at computed positions; keep it whole.
    if (el.type === 'repeater') {
      out.push(el);
      continue;
    }
    // Guards 1/2 — anything that can move/resize/rotate onto the frame is kept
    // whole (a container with a geometry track keeps its entire subtree).
    if (hasGeometryAnimation(el)) {
      out.push(el);
      continue;
    }
    if (el.type === 'container') {
      // A static container fully off-frame takes its whole subtree off → drop.
      if (isFullyOffFrame(el, ancestors, frameW, frameH)) continue;
      // Otherwise recurse — its ancestor chain stays all-static by construction.
      out.push({
        ...el,
        children: filterChildren(el.children, [...ancestors, el.transform], frameW, frameH),
      });
      continue;
    }
    // Static leaf — drop iff its (ancestor-composed, rotated) AABB is fully off.
    if (isFullyOffFrame(el, ancestors, frameW, frameH)) continue;
    out.push(el);
  }
  return out;
}

function filterLayers(layers: readonly Layer[], frameW: number, frameH: number): Layer[] {
  return layers.map((l) => ({ ...l, children: filterChildren(l.children, [], frameW, frameH) }));
}

/**
 * Composition ids that are REPEATER TEMPLATES (referenced by any repeater anywhere,
 * plus everything reachable from them). Their elements are kept whole — a row the
 * repeater stamps can land on-frame, so off-frame-in-template-coords proves nothing.
 */
function repeaterTaintedComps(scene: Scene): Set<string> {
  const seeds = new Set<string>();
  const scan = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'repeater') seeds.add(el.compositionId);
      else if (el.type === 'container') scan(el.children);
    }
  };
  for (const l of scene.layers) scan(l.children);
  for (const c of scene.compositions ?? []) for (const l of c.layers) scan(l.children);
  const tainted = new Set<string>();
  for (const seed of seeds) {
    tainted.add(seed);
    for (const d of compositionClosure(scene, seed)) tainted.add(d);
  }
  return tainted;
}

/**
 * Drop fully-off-frame static elements from an already-D-086-scoped scene. Applied
 * per-doc: the projected top-level frame plus each non-repeater-template closure
 * composition, EACH against its OWN `resolution`. Pass the FULL `scene` (for the
 * repeater-template detection) and the `scoped` projection to filter.
 */
export function dropFullyOffFrameForExport(scene: Scene, scoped: Scene): Scene {
  const tainted = repeaterTaintedComps(scene);
  const filterComp = (c: Composition): Composition =>
    tainted.has(c.id)
      ? c
      : { ...c, layers: filterLayers(c.layers, c.resolution.width, c.resolution.height) };
  return {
    ...scoped,
    layers: filterLayers(scoped.layers, scoped.resolution.width, scoped.resolution.height),
    compositions: (scoped.compositions ?? []).map(filterComp),
  };
}
