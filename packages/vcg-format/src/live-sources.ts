import type {
  Composition,
  Element,
  FieldBinding,
  LiveSourceDeclaration,
  LiveSourceRect,
  Scene,
  Transform,
} from '@cg/shared-schema';

/**
 * D-137 / C-015 — derive the runtime's Live Source DECLARATIONS from a scene.
 *
 * Runs ONCE, at import, beside `buildPlayoutMetadata`, for the reason §1 of
 * `live-source-multibox` design.md establishes: no `.vcg` ever reaches the
 * bridge, the bridge parses no HTML, and the scene is discarded after import
 * (`LibraryEntry` is `{ template, html }`). Anything the runtime will ever need
 * must be captured at that one moment.
 *
 * ── WHY NOT `frameAabb` ─────────────────────────────────────────────────────
 *
 * `apps/designer/src/renderer/state/off-frame.ts`'s `frameAabb` is the repo's
 * only other ancestor-composing flattener, and it is the wrong tool twice over:
 * it is Designer-RENDERER code, exported from no package (so the isomorphic
 * format package cannot reach it), and it composes LESS than a declaration
 * needs — a `composition` element hits its "static leaf" branch, so its children
 * are never walked and the instance's inner
 * `scale(size.w / comp.resolution.width, …)` is never applied. That is exactly
 * the D-119 shape a Live Source sits in.
 *
 * What IS reused is the arithmetic: {@link localToParent} below is `frameAabb`'s
 * per-level kernel (`off-frame.ts:50-60`), lifted verbatim, because the
 * `Scale·Rotate-about-anchor + translate` mapping is one rule and a second
 * spelling of it is how a preflight comes to disagree with a declaration about
 * where the same hole is.
 *
 * ── WHAT IT DOES NOT WALK, said out loud ────────────────────────────────────
 *
 * A `repeater` subtree is NOT walked. A repeater stamps rows at positions
 * computed at runtime, so a Live Source inside a repeater template has no static
 * scene-px rect to declare — and every stamp would carry the SAME source id, so
 * the stamps would fight over one live layer. Declaring the template's own
 * unstamped coordinates would be worse than declaring nothing: it is a rect no
 * stamp actually occupies. This is recorded rather than silently handled.
 */

/**
 * `frameAabb`'s per-level kernel (`off-frame.ts:50-60`), LIFTED — map an
 * element-local point (relative to the unscaled box top-left) through
 * `Scale·Rotate-about-anchor` + translate into the element's PARENT coordinate
 * system.
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

/**
 * One level of the ancestor chain.
 *
 * `preScale` is what `frameAabb` has no concept of and what makes this correct
 * for a nested Live Source: a COMPOSITION INSTANCE renders its referenced
 * composition into a `cg-comp-inner` div at `left/top: 0` with
 * `transform-origin: 0 0` and `scale(size.w / comp.resolution.width, size.h /
 * comp.resolution.height)` (`scene-builder.ts:258-260`). So a point in the
 * composition's own pixels is first multiplied by that scale to become a point
 * in the instance's element-local box, and only THEN goes through the instance's
 * own transform. A container level carries `preScale` (1, 1).
 */
interface AncestorLevel {
  transform: Transform;
  preScale: { x: number; y: number };
}

/** Map a point up ONE level: the level's own inner scale, then its transform. */
function levelToParent(level: AncestorLevel, lx: number, ly: number): { x: number; y: number } {
  return localToParent(level.transform, lx * level.preScale.x, ly * level.preScale.y);
}

/**
 * The scene-px AABB of an element's own box, folded outward through
 * `ancestors` (outermost → innermost).
 *
 * All four corners are mapped, not two, because a level may ROTATE: the AABB of
 * a rotated box is not the mapping of its top-left and bottom-right.
 */
function sceneRect(el: Element, ancestors: readonly AncestorLevel[]): LiveSourceRect {
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
  // `ancestors` is outermost → innermost; a point travels the other way.
  const chain = [...ancestors].reverse();
  for (const [lx, ly] of corners) {
    let p = localToParent(el.transform, lx, ly);
    for (const level of chain) {
      p = levelToParent(level, p.x, p.y);
    }
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Bounds the composition recursion exactly as `scene-builder.ts:87` does, so a
 * declaration is derived from the same subtree the page actually renders. A
 * cyclic reference is blocked at author time and again here, by the visited set.
 */
const MAX_COMPOSITION_DEPTH = 8;

/**
 * Every `live-source-id` binding in the project, as `elementId → roles`.
 *
 * Both the root scene and each composition carry their own `bindings`, and
 * element ids are unique per project, so ONE flat index over all of them is
 * unambiguous — and it answers the question for an element wherever the walk
 * later meets it, including through a composition instance whose bindings live
 * on the composition rather than on the root.
 */
function dynamicRoleIndex(scene: Scene): Map<string, Set<'fill' | 'key'>> {
  const index = new Map<string, Set<'fill' | 'key'>>();
  const add = (bindings: readonly FieldBinding[] | undefined): void => {
    for (const b of bindings ?? []) {
      if (b.target.kind !== 'live-source-id') continue;
      const roles = index.get(b.target.elementId) ?? new Set<'fill' | 'key'>();
      roles.add(b.target.role);
      index.set(b.target.elementId, roles);
    }
  };
  add(scene.bindings);
  for (const c of scene.compositions ?? []) add(c.bindings);
  return index;
}

/**
 * Every Live Source in `scene`, flattened to SCENE pixels through its full
 * ancestor chain — containers AND composition instances, the latter including
 * the instance's inner scale.
 *
 * Emission order is document order (depth-first, layers in order), which makes
 * the declaration array stable across exports of an unchanged scene.
 */
export function collectLiveSources(scene: Scene): LiveSourceDeclaration[] {
  const dynamicRoles = dynamicRoleIndex(scene);
  const byId = new Map<string, Composition>();
  for (const c of scene.compositions ?? []) byId.set(c.id, c);

  const out: LiveSourceDeclaration[] = [];
  const walk = (
    children: readonly Element[],
    ancestors: readonly AncestorLevel[],
    visited: ReadonlySet<string>,
    depth: number,
  ): void => {
    for (const el of children) {
      if (el.type === 'video-placeholder') {
        const roles = dynamicRoles.get(el.id);
        // ⚠ `keySourceId` / `keyDynamic` are DELIBERATELY NOT EMITTED (owner,
        // 2026-08-10; design.md §1a). A template declares ONE symbolic id, and
        // whether it resolves to a single device or to a fill/key DEVICE PAIR is
        // a property of the installation's MAPPING. Both fields survive on the
        // schemas so stored scenes and persisted `TemplateInfo` records keep
        // parsing; emitting them here would carry a scene's guess about a plant
        // it cannot see all the way to the bridge, where it would compete with
        // the mapping that actually knows.
        out.push({
          elementId: el.id,
          sourceId: el.routeKey,
          rect: sceneRect(el, ancestors),
          ...(el.expectedAspect !== undefined ? { expectedAspect: el.expectedAspect } : {}),
          dynamic: roles?.has('fill') ?? false,
        });
        continue;
      }
      if (el.type === 'container') {
        walk(
          el.children,
          [...ancestors, { transform: el.transform, preScale: { x: 1, y: 1 } }],
          visited,
          depth,
        );
        continue;
      }
      if (el.type === 'composition') {
        const comp = byId.get(el.compositionId);
        // Same three guards the builder applies before rendering an instance
        // (`scene-builder.ts:259-265`): a missing reference, an over-deep chain
        // and a cycle all render the empty box, so they declare nothing either.
        if (comp === undefined || depth >= MAX_COMPOSITION_DEPTH || visited.has(el.compositionId)) {
          continue;
        }
        const preScale = {
          x: comp.resolution.width === 0 ? 1 : el.transform.size.w / comp.resolution.width,
          y: comp.resolution.height === 0 ? 1 : el.transform.size.h / comp.resolution.height,
        };
        const level: AncestorLevel = { transform: el.transform, preScale };
        const nextVisited = new Set(visited).add(el.compositionId);
        for (const layer of comp.layers) {
          walk(layer.children, [...ancestors, level], nextVisited, depth + 1);
        }
      }
      // A `repeater` is deliberately NOT walked — see the module docstring.
    }
  };

  for (const layer of scene.layers) walk(layer.children, [], new Set<string>(), 0);
  return out;
}
