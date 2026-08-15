import { flattenElements } from '@cg/shared-schema';
import type { FieldBinding, LiveSourceDeclaration, Scene } from '@cg/shared-schema';

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
 * ⭐ **The flattener now lives in `@cg/shared-schema` (`scene-flatten.ts`), and this
 * module CONSUMES it rather than owning it.**
 *
 * It was module-private here, which was correct while `collectLiveSources` was its
 * only caller. 1.5c gave it a second one: the RENDER side punches the same holes
 * this side declares, and `@cg/template-runtime` cannot see this package. The hole
 * the page punches and the hole the bridge fills have to be ONE computation —
 * otherwise the backdrop's own colour lands where the guest should be and nothing
 * on air says which of the two was wrong.
 *
 * What is preserved exactly: `'document'` sibling order, so the declaration array
 * stays stable across exports of an unchanged scene; the un-walked `repeater`
 * subtree; and the three composition guards.
 */

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

  const out: LiveSourceDeclaration[] = [];
  for (const flat of flattenElements(scene, 'document')) {
    const el = flat.element;
    if (el.type !== 'video-placeholder') continue;
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
      rect: flat.rect,
      ...(el.expectedAspect !== undefined ? { expectedAspect: el.expectedAspect } : {}),
      dynamic: roles?.has('fill') ?? false,
    });
  }
  return out;
}
