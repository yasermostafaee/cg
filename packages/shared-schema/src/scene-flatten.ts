import type { Composition, Layer, Scene } from './scene.js';
import type { Element } from './elements.js';
import type { Transform } from './primitives.js';
import type { LiveSourceRect } from './live-source.js';
import type { VisibilitySubject } from './visibility.js';

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

/*
 * ⚠ **`single-clock-look-switch` — the local `intersects` went with `sceneMaskHoles`, which
 * was its only caller here.** Its rule is not withdrawn and its two other copies are
 * untouched: `B-180`'s `lessThanBeyondNoise` spelling of the strict `<` still guards the
 * Designer's export preflight, which is where the arithmetic-dust case was found. What is
 * gone is a third copy with nothing left to test.
 */

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

/*
 * 🔴 **`single-clock-look-switch` — `sceneMaskHoles`, `intersectPunches`, `PlateFits` and
 * `PlateFitFacts` ARE GONE, and the §9a-Z rule they implemented is not refuted.**
 *
 * The rule was the owner's: _"Mask by Z-ORDER, not by a declared role. Each element is masked
 * with the union of the rects of the plates ABOVE it in the scene's existing element order."_
 * It was correct for a page composited ON TOP of its plates, which is what every reading of it
 * assumed. A plate-bearing package now loads onto the LOW bank and its pictures are composited
 * over it, so no element of the page is ever in front of a plate and there is nothing left to
 * punch through.
 *
 * `intersectPunches` (`SKEW-INTERSECT-01`) went with it for the same reason, one step further
 * along: it existed to narrow the holes to `outgoing ∩ entering` while the two clocks
 * disagreed, and with no holes there is nothing to intersect. `ArrangementView.transitionFrom`,
 * its only input, is gone from this file too.
 *
 * ⚠ **Nothing about the `.vcg` format changes with them.** These functions ran in the BROWSER,
 * at build and at re-punch; `collectLiveSources` — the thing that does cross into the package —
 * records plate rects and never held a hole.
 *
 * `applyArrangementGeometry` above SURVIVES and is unchanged: a moved plate still has to take
 * its geometry with it, and that is now read by `collectLiveSources` for the bridge's
 * `MIXER FILL` rather than by a mask.
 */

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
