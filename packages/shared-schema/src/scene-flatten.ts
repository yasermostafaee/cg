import type { Composition, Layer, MaskHole, Scene } from './scene.js';
import type { Element } from './elements.js';
import type { Transform } from './primitives.js';
import type { LiveSourceRect } from './live-source.js';
import { lessThanBeyondNoise } from './float-noise.js';
import { DEFAULT_LIVE_FIT_MODE, fitPictureToBox, type LiveFitMode } from './live-fit.js';
import { resolveVisibilityOf, type VisibilitySubject } from './visibility.js';

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
  /**
   * 🔴 **Everything between the scene root and this element that can HIDE it** — the LAYER
   * it sits on, then each `container` / `composition` instance, outermost → innermost.
   *
   * This exists to answer AO's first inherited question (`design.md` §6b), and it exists as
   * DATA rather than as a boolean because the answer depends on a context this walk does
   * not have: an ancestor's visibility is itself resolved through {@link resolveVisibility},
   * so an arrangement that hides a whole BOX hides everything inside it. Collapsing it to a
   * flag here would have to pick a context, and the wrong one is silent.
   */
  readonly ancestry: readonly VisibilitySubject[];
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
/**
 * A layer or an element, reduced to what {@link resolveVisibility} needs of it.
 *
 * ONE projection, used for both, because "can this hide what is under it" is one question
 * and a `Layer` and an `Element` answer it with the same two fields. A `Layer` has no
 * `hideDuringTransition` — layers are not authored per arrangement — and `undefined` is
 * exactly the right answer there rather than a `false` that looks like a decision.
 */
function subjectOf(node: {
  id: string;
  visible: boolean;
  hideDuringTransition?: boolean | undefined;
}): VisibilitySubject {
  return {
    id: node.id,
    visible: node.visible,
    ...(node.hideDuringTransition !== undefined
      ? { hideDuringTransition: node.hideDuringTransition }
      : {}),
  };
}

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
    ancestry: readonly VisibilitySubject[],
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
        ancestry,
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
          [...ancestry, subjectOf(el)],
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
          // The composition INSTANCE can hide its whole subtree, and so can the layer
          // INSIDE the composition that a child sits on — both go on the chain.
          walk(layer.children, [...ancestors, level], nextVisited, depth + 1, `${key}/`, [
            ...ancestry,
            subjectOf(el),
            subjectOf(layer),
          ]);
        }
      }
      // A `repeater` is deliberately NOT walked — see the docstring.
    }
  };

  for (const layer of scene.layers)
    walk(layer.children, [], new Set<string>(), 0, '', [subjectOf(layer)]);
  return out;
}

/**
 * Do two axis-aligned rects share any AREA? Touching edges do not count.
 *
 * ⚠ `B-180` — the strict `<` is spelled through {@link lessThanBeyondNoise}, so arithmetic dust
 * from the flattener's own divisions cannot register as a share. The OPERATOR is unchanged
 * (touching is still not sharing); only inputs that differ by less than the double's own noise
 * floor are treated as equal. One guard, used by all three copies of this predicate — this one,
 * and the two in the Designer's export preflight.
 */
function intersects(a: LiveSourceRect, b: LiveSourceRect): boolean {
  return (
    lessThanBeyondNoise(a.x, b.x + b.width) &&
    lessThanBeyondNoise(b.x, a.x + a.width) &&
    lessThanBeyondNoise(a.y, b.y + b.height) &&
    lessThanBeyondNoise(b.y, a.y + a.height)
  );
}

/**
 * 🔴 **`tasks.md` 4.2 — the ACTIVE arrangement, as the context every geometry and
 * visibility question is answered in.**
 *
 * `undefined` everywhere means "no arrangement, nothing transitioning", which resolves to
 * exactly today's behaviour — so every existing caller, every template authored before this
 * feature and every existing test is unchanged by its introduction.
 */
export interface ArrangementView {
  /**
   * `elementId → the box INSTANCE's rect in this arrangement`, in SCENE pixels.
   *
   * A′ (§12.9.10) puts per-arrangement geometry on the box INSTANCE and never on the plate
   * element, which is what keeps `(templateId, plateId)` stable across a switch. Everything
   * inside the instance — the plate, its title, its frame — travels with it.
   */
  readonly geometry?: Readonly<Record<string, LiveSourceRect>> | undefined;
  /** The arrangement's per-element visibility opinions. Input 2 of `resolveVisibility`. */
  readonly visibility?: Readonly<Record<string, boolean>> | undefined;
  /**
   * ⚠ **Input 1 of `resolveVisibility`, as the PAGE currently has it** — the authored
   * `visible` AFTER `visible` bindings and lifespan gates have written to it. An absent key
   * means "nothing overrode it", and the scene's authored value stands.
   *
   * 🔴 **This is NOT a fourth notion of visibility, and the distinction matters.** It is
   * input 1 with a live source rather than a static one: a `visible` binding's whole job is
   * to retarget the authored value at playout, and a lifespan gate's is to withdraw it for
   * part of the timeline. Both are the authored value CHANGING, not a new opinion beside
   * it — which is exactly why they belong here and not in {@link visibility}, whose meaning
   * is "what the ARRANGEMENT says". Collapsing the two would make an arrangement appear to
   * have an opinion it never expressed.
   */
  readonly currentVisible?: Readonly<Record<string, boolean>> | undefined;
  /** Whether a transition into this arrangement is running. Half of input 3. */
  readonly transitioning?: boolean | undefined;
  /**
   * 🔴 **`B-174` / `SKEW-INTERSECT-01` — the state this view is switching AWAY FROM, for as
   * long as the two machines disagree.** Present ⇒ {@link sceneMaskHoles} punches
   * `outgoing ∩ entering` instead of `entering`; absent ⇒ exactly today's mask.
   *
   * ── WHY IT IS A VISIBILITY MAP AND NOT A LOOK ID ────────────────────────────
   *
   * This module knows nothing about looks — it is given a scene and told what is on screen.
   * A look id here would make the flattener learn the look model, and the same transition
   * would then be inexpressible for anything else that changes which plates are visible.
   * A second visibility map says the same thing in the vocabulary this function already has.
   *
   * ── WHY IT IS AN ARGUMENT AND NEVER STORED STATE ────────────────────────────
   *
   * ⚠ The transition mask is a SUBSET of the entering look's holes, so a page left in it
   * shows LESS picture than it should, forever, with no event scheduled to end it. It is
   * therefore one-shot by construction: `@cg/template-runtime` deliberately does not retain
   * it on the view it keeps, so the very next re-punch — a field update, a take, the
   * bridge's own settling tell — returns the page to the entering look's own holes.
   */
  readonly transitionFrom?: Readonly<Record<string, boolean>> | undefined;
}

/**
 * The axis-aligned affine that carries `from` onto `to`, or `null` when `from` has no area
 * to scale out of.
 *
 * This is the whole of "the box moved": an arrangement states where a box INSTANCE sits,
 * and everything under that instance is carried by the same map — which is why a title
 * needs no per-arrangement placement of its own (§12.9.10 point 5, the sixteen manual
 * placements that become four).
 */
function fitAffine(from: LiveSourceRect, to: LiveSourceRect): Affine | null {
  if (from.width === 0 || from.height === 0) return null;
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return { a: sx, b: 0, c: 0, d: sy, e: to.x - from.x * sx, f: to.y - from.y * sy };
}

/**
 * Re-place a flattened scene into the ACTIVE arrangement — `tasks.md` 4.2's "give
 * `sceneMaskHoles` CURRENT geometry, so a moved plate takes its hole with it".
 *
 * ── WHY THIS IS A POST-PASS AND NOT A CHANGE TO THE WALK ────────────────────
 *
 * An override states an element's SCENE rect. The walk composes PARENT-space transforms,
 * so applying an override inside it would mean inverting the ancestor chain to invent a
 * transform whose composed result is the wanted rect — anchor, rotation and scale included.
 * Mapping the finished rect is exact for the axis-aligned case, needs no such inversion,
 * and reuses `rectThrough` / `composeAffine` rather than adding a second geometry path.
 *
 * `toScene` is remapped alongside `rect`, and that is not incidental: `sceneMaskHoles`
 * pulls each hole back through `invert(toScene)`, so a rect that moved while its `toScene`
 * did not would punch the hole at the OLD position — the exact failure UNIT B′ exists to
 * fix, reintroduced by a half-applied fix.
 *
 * **NEAREST override wins.** For an element under an overridden ancestor, the ancestor's
 * map carries it; if the element itself is overridden, its own is the more specific
 * statement and takes precedence for it and for its own subtree.
 */
export function applyArrangementGeometry(
  flat: readonly FlatElement[],
  geometry: Readonly<Record<string, LiveSourceRect>> | undefined,
): FlatElement[] {
  if (geometry === undefined || Object.keys(geometry).length === 0) return [...flat];

  // The AUTHORED scene rect of every element an override could name. Read before anything
  // is moved, because every map is measured from where the scene actually put the box.
  const authored = new Map<string, LiveSourceRect>();
  for (const f of flat) if (!authored.has(f.element.id)) authored.set(f.element.id, f.rect);

  const affineFor = (id: string): Affine | null => {
    const to = geometry[id];
    const from = authored.get(id);
    if (to === undefined || from === undefined) return null;
    return fitAffine(from, to);
  };

  return flat.map((f) => {
    // Nearest first: the element itself, then its ancestry innermost → outermost.
    const chain = [f.element.id, ...[...f.ancestry].reverse().map((a) => a.id)];
    for (const id of chain) {
      const m = affineFor(id);
      if (m === null) continue;
      return { ...f, rect: rectThrough(m, f.rect), toScene: composeAffine(m, f.toScene) };
    }
    return f;
  });
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
/**
 * ⭐ `C-028` — **what one plate's fit is driven by, as the PAGE receives it.**
 *
 * Structurally the bridge's `CgPlateFit`, and deliberately declared here as its own
 * type: this module is below `control-payload.ts` in every sense that matters (it is
 * pure geometry and knows nothing about a wire), and a mask that imported the transport's
 * type would be a mask coupled to the transport.
 */
export interface PlateFitFacts {
  /** The source's display aspect, or `null` for NO FIT — the hole stays at the box. */
  readonly aspect: number | null;
  /** The resolved mode. */
  readonly mode: LiveFitMode;
}

/**
 * `C-028` — plate id (`routeKey`) → the facts its fit is driven by.
 *
 * 🔴 **This is the one thing the mask CANNOT derive from the scene**, and saying so is
 * the point of the type. `sceneMaskHoles`'s own rule is that a condition belongs in the
 * mask only if it can be evaluated from the SCENE ALONE — which is why the aspect and
 * the mode arrive as an ARGUMENT rather than being read off the element here. Under
 * `D-147` the ASSIGNED source outranks the author for the aspect, and the assignment is
 * an installation fact; deriving it from the element here while the bridge derives it
 * from the source is `B-149` exactly: two machines, two aspects, one hole.
 */
export type PlateFits = ReadonlyMap<string, PlateFitFacts>;

export function sceneMaskHoles(
  scene: Scene,
  view: ArrangementView | undefined = undefined,
  fits: PlateFits | undefined = undefined,
): Map<string, MaskHole[]> {
  const flat = applyArrangementGeometry(flattenElements(scene, 'paint'), view?.geometry);
  /**
   * 🔴 `tasks.md` 4.1 + 4.5 — visibility comes from the ONE function, and it is asked about
   * the plate AND about everything that can hide it.
   *
   * **AO's first inherited question, answered as a MECHANISM (`design.md` §6b):** an
   * INVISIBLE ANCESTOR now suppresses the punch. It did not before — the filter tested
   * `visible` on the PLATE alone, so a plate on a hidden LAYER, in a hidden container, or
   * inside a hidden box still punched a hole through everything below it. AO left that
   * alone because the page and the bridge still AGREED (both acted on the hidden plate).
   * An arrangement that hides a whole BOX is precisely the case where they stop agreeing:
   * the box is gone, its hole is not, and what shows through the hole is nothing at all —
   * §1's crosstalk arriving from inside one template.
   */
  const live = (subject: VisibilitySubject): VisibilitySubject => {
    const override = view?.currentVisible?.[subject.id];
    return override === undefined ? subject : { ...subject, visible: override };
  };
  /**
   * ⭐ `B-174` / `SKEW-INTERSECT-01` — **the plate set UNDER ONE STATED VISIBILITY, so the
   * SAME walk can be asked about two look states instead of one.**
   *
   * The transition mask needs the outgoing look's plates and the entering look's plates, and
   * the one thing it must never do is derive them two different ways: the whole of §6/§12.2
   * is that the hole the page punches and the hole the bridge fills are ONE computation, and
   * a second, "just for the transition" plate walk beside this one is precisely how the two
   * would come to disagree about a hidden ancestor, a fit mode or a paint-order tie.
   *
   * ⚠ The arrangement map is passed IN rather than read from `view`, and that is the whole
   * mechanism: `resolveVisibility` ranks the arrangement's opinion ABOVE the authored value,
   * so handing it the outgoing look's map makes this walk answer for that look even though
   * `currentVisible` (read back from the DOM by `liveArrangementView`) already says the
   * outgoing instance is `display: none`.
   */
  const platesUnder = (
    arrangementVisibility: Readonly<Record<string, boolean>> | undefined,
  ): { f: FlatElement; index: number; punch: LiveSourceRect }[] => {
    const context = { arrangementVisibility, transitioning: view?.transitioning };
    const onScreen = (f: FlatElement): boolean =>
      resolveVisibilityOf(live({ ...f.element }), context) &&
      f.ancestry.every((a) => resolveVisibilityOf(live(a), context));
    return flat
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.element.type === 'video-placeholder' && onScreen(f))
      .map(({ f, index }) => ({ f, index, punch: punchRect(f) }));
  };

  // Paint order is the array order of `flat`: `flattenElements` emits an element
  // before its children and sorts siblings by `zIndex`, which is exactly what
  // `buildLayer` appends. So "above" is simply "at a higher index".
  /**
   * ⭐ `C-028` — **THE HOLE IS THE PICTURE, NOT THE BOX.**
   *
   * 🔴 Under `contain` the picture covers only part of its box. A hole left at the BOX
   * rect would leave the margin a TRANSPARENT HOLE with no picture behind it — and what
   * shows through is the channel behind the CG layer: **BLACK, which is exactly what the
   * client rejected.** The feature would deliver the opposite of its own requirement.
   * Punching at the fitted rect makes the template's own background fill the margin for
   * free: no new compositing, no second layer, no extra command.
   *
   * ⚠ And under `cover` this must give back the BOX unchanged — `fitPictureToBox`'s
   * `visible` is `picture ∩ box`, which is the box itself when the picture covers it.
   * The same call therefore serves both modes without a branch here, which is what stops
   * a `cover` hole drifting from what shipped.
   *
   * The `intersects` test above still runs on the BOX rect, deliberately: which elements
   * a plate masks is a z-order-and-overlap question about the authored layout, and
   * narrowing it to the fitted picture would un-mask a backdrop the plate still sits on
   * top of the moment a source's aspect changed.
   */
  const punchRect = (f: FlatElement): LiveSourceRect => {
    const el = f.element;
    if (el.type !== 'video-placeholder') return f.rect;
    // `B-183` — an UNASSIGNED plate names no source, so no bridge fact can be keyed to it.
    // Absent reads exactly like "no facts for this plate", which is the branch below.
    const fit = el.routeKey === undefined ? undefined : fits?.get(el.routeKey);
    // No facts for this plate ⇒ the SCENE's own statement. `expectedAspect` is what the
    // author declared this hole is designed for, which is the honest answer for an
    // authoring preview and for a page the bridge has not spoken to yet; absent, the
    // aspect is `null` and there is no fit at all — the hole is the box, as today.
    const aspect = fit?.aspect ?? el.expectedAspect ?? null;
    const mode = fit?.mode ?? el.fitMode ?? DEFAULT_LIVE_FIT_MODE;
    return fitPictureToBox(f.rect, aspect, mode).visible;
  };

  const plates = platesUnder(view?.visibility);
  /**
   * 🔴 `SKEW-INTERSECT-01` — **the OUTGOING look's plates, present only while a switch is in
   * flight.** `undefined` is the ordinary case and every line below falls back to exactly
   * today's behaviour for it.
   */
  const outgoing =
    view?.transitionFrom === undefined ? undefined : platesUnder(view.transitionFrom);

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
    /*
      🔴 `SKEW-INTERSECT-01` — **THE TRANSITION MASK, computed in SCENE pixels and pulled
      back ONCE, exactly as the ordinary mask is.**

      Every pixel this leaves open is inside a hole of BOTH looks, so it is backed by a
      picture whether the fills have moved yet or not — which is the entire guarantee. The
      UNION was the other candidate and is the opposite: it opens every pixel EITHER look
      punches, and a pixel the outgoing look does not fill is the channel showing through.
      Black on air, in the shape of the entering look's boxes.

      Pairwise, because a hole set is a UNION of rects and `(A ∪ B) ∩ (C ∪ D)` is the union
      of the four pairwise intersections. `intersects` is the same noise-aware predicate the
      z-order filter uses, so a pair that merely touches produces no sliver.
    */
    const punches =
      outgoing === undefined
        ? above.map((p) => p.punch)
        : intersectPunches(
            above.map((p) => p.punch),
            outgoing
              .filter((p) => p.index > i && intersects(p.f.rect, target.rect))
              .map((p) => p.punch),
          );
    /*
      An EMPTY result is a real answer and is NOT a special case: two looks whose plates
      barely overlap leave this element with no hole at all for the length of the window, so
      the template's own backdrop covers where both pictures will be. That is a picture the
      author drew, held for a field or two — the alternative it replaces is the channel.
    */
    if (punches.length === 0) continue;
    const toLocal = invertAffine(target.toScene);
    // A collapsed element (scaled to zero on an axis) paints nothing, so there is no
    // space to express a hole in. `null` here means NO MASK, not an empty one.
    if (toLocal === null) continue;
    holes.set(
      target.key,
      punches.map((punch) => {
        // `punch`, not `f.rect` — the FITTED rect (C-028). Pulled back through the same
        // inverse as before: the fit happens in SCENE px and the pull-back is a plain
        // affine, so the two compose in either order.
        const local = rectThrough(toLocal, punch);
        return { x: local.x, y: local.y, width: local.width, height: local.height };
      }),
    );
  }
  return holes;
}

/**
 * `SKEW-INTERSECT-01` — every non-empty pairwise intersection of two hole sets, in the space
 * they are both expressed in.
 *
 * Exported so the geometry can be asserted directly rather than only through a rendered
 * scene: the whole claim of the transition mask is that its output is a SUBSET of both
 * inputs, and a subset claim wants a test that can name the rects.
 */
export function intersectPunches(
  entering: readonly LiveSourceRect[],
  outgoing: readonly LiveSourceRect[],
): LiveSourceRect[] {
  const out: LiveSourceRect[] = [];
  for (const a of entering) {
    for (const b of outgoing) {
      if (!intersects(a, b)) continue;
      const x = Math.max(a.x, b.x);
      const y = Math.max(a.y, b.y);
      const right = Math.min(a.x + a.width, b.x + b.width);
      const bottom = Math.min(a.y + a.height, b.y + b.height);
      out.push({ x, y, width: right - x, height: bottom - y });
    }
  }
  return out;
}

// ───────────────── STAMPED SCOPES: the plates the walk deliberately never sees ─────────────────

/** One Live Source plate found inside a scope this module does not walk. */
export interface StampedLiveSource {
  /** The `video-placeholder` element. */
  readonly element: Element;
  /** Which kind of stamped scope swallowed it. */
  readonly scope: 'sequence' | 'repeater';
  /** The `sequence` / `repeater` element that contains it. */
  readonly scopeElementId: string;
}

/**
 * 🔴 **`multibox-layout-switch` `tasks.md` 4.6 — every Live Source plate sitting inside a
 * STAMPED scope, which is a template that is broken in a way nothing currently says.**
 *
 * ── WHY IT LIVES HERE, BESIDE THE WALK THAT CAUSES IT ───────────────────────
 *
 * {@link flattenElements} descends into `container` and `composition` and into nothing else.
 * That is deliberate and documented — a `repeater` stamps rows at positions computed at RUN
 * time, and a `sequence` swaps its items over time, so nothing inside either has a static
 * scene-px rect to declare. The consequence, which was NOT deliberate, is that a plate in
 * one is **invisible to both sides at once**: `collectLiveSources` declares nothing, so the
 * bridge seats no producer; `sceneMaskHoles` punches nothing, so the backdrop stays solid.
 *
 * ⚠ **The two failures cancel, and that is exactly what makes this worth refusing.** The
 * page looks intact — no black hole, no error — and the plate simply is not there. An
 * operator assigning a source to it sees the assignment accepted and nothing reach air, with
 * no message anywhere naming the cause. A refusal at authoring time is the only point where
 * this is cheap to say.
 *
 * A second reason, specific to this feature: a stamp would carry the SAME `sourceId` on
 * every copy, so N stamps would fight over one live layer even if the geometry existed.
 *
 * Reported rather than thrown — the caller decides whether it is an export error or a
 * warning, and the Designer's preflight already owns that vocabulary.
 */
export function liveSourcesInStampedScopes(scene: Scene): StampedLiveSource[] {
  const byId = new Map<string, Composition>();
  for (const c of scene.compositions ?? []) byId.set(c.id, c);

  const found: StampedLiveSource[] = [];
  const seenScopes = new Set<string>();

  /** Walk everything under a scope that IS stamped, collecting plates at any depth. */
  const collect = (
    children: readonly Element[],
    scope: 'sequence' | 'repeater',
    scopeElementId: string,
    depth: number,
    visited: ReadonlySet<string>,
  ): void => {
    if (depth > MAX_COMPOSITION_DEPTH) return;
    for (const el of children) {
      if (el.type === 'video-placeholder') {
        found.push({ element: el, scope, scopeElementId });
        continue;
      }
      if (el.type === 'container') {
        collect(el.children, scope, scopeElementId, depth, visited);
        continue;
      }
      if (el.type === 'composition') {
        const comp = byId.get(el.compositionId);
        if (comp === undefined || visited.has(el.compositionId)) continue;
        const next = new Set(visited).add(el.compositionId);
        for (const layer of comp.layers) {
          collect(layer.children, scope, scopeElementId, depth + 1, next);
        }
      }
    }
  };

  /** Walk the ORDINARY tree, looking for stamped scopes to hand to `collect`. */
  const walk = (
    children: readonly Element[],
    depth: number,
    visited: ReadonlySet<string>,
  ): void => {
    if (depth > MAX_COMPOSITION_DEPTH) return;
    for (const el of children) {
      if (el.type === 'repeater') {
        const comp = byId.get(el.compositionId);
        if (comp !== undefined && !seenScopes.has(el.id)) {
          seenScopes.add(el.id);
          for (const layer of comp.layers) {
            collect(
              layer.children,
              'repeater',
              el.id,
              depth + 1,
              new Set(visited).add(el.compositionId),
            );
          }
        }
        continue;
      }
      if (el.type === 'sequence') {
        if (!seenScopes.has(el.id)) {
          seenScopes.add(el.id);
          for (const item of el.items) {
            if (item.kind !== 'composition') continue;
            const comp = byId.get(item.compositionId);
            if (comp === undefined) continue;
            for (const layer of comp.layers) {
              collect(
                layer.children,
                'sequence',
                el.id,
                depth + 1,
                new Set(visited).add(item.compositionId),
              );
            }
          }
        }
        continue;
      }
      if (el.type === 'container') {
        walk(el.children, depth, visited);
        continue;
      }
      if (el.type === 'composition') {
        const comp = byId.get(el.compositionId);
        if (comp === undefined || depth >= MAX_COMPOSITION_DEPTH || visited.has(el.compositionId)) {
          continue;
        }
        const next = new Set(visited).add(el.compositionId);
        for (const layer of comp.layers) walk(layer.children, depth + 1, next);
      }
    }
  };

  for (const layer of scene.layers) walk(layer.children, 0, new Set<string>());
  return found;
}
