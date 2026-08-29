import {
  defaultLookOf,
  deriveLookSources,
  flattenElements,
  lookGroupOf,
  resolveDefaultPosition,
} from '@cg/shared-schema';
import type {
  FieldBinding,
  FlatElement,
  LiveFitMode,
  LiveSourceArrangement,
  LiveSourceDeclaration,
  LiveSourceRect,
  LookTransition,
  Scene,
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
 * A plate's **BOX** — the OUTERMOST `composition` instance it sits inside, or `null` when it
 * sits in no composition at all.
 *
 * Outermost rather than nearest, because an ARRANGEMENT positions the boxes the scene itself
 * contains: a composition nested inside a box is part of that box's own design and travels
 * with it. `null` is the ordinary single-plate template — every template that exists today —
 * and it takes part in no arrangement.
 */
function boxIdOf(plate: FlatElement, boxes: ReadonlySet<string>): string | null {
  // `ancestry` is outermost → innermost and begins with the LAYER, which is never a box.
  for (const a of plate.ancestry) if (boxes.has(a.id)) return a.id;
  return null;
}

/** Where `inner` sits inside `outer`, as fractions of `outer` on each axis. */
function relativeRect(inner: LiveSourceRect, outer: LiveSourceRect): LiveSourceRect | null {
  if (outer.width === 0 || outer.height === 0) return null;
  return {
    x: (inner.x - outer.x) / outer.width,
    y: (inner.y - outer.y) / outer.height,
    width: inner.width / outer.width,
    height: inner.height / outer.height,
  };
}

/**
 * 🔴 **`tasks.md` 5.2 — the ARRANGEMENTS, as the runtime receives them.**
 *
 * Derived here, once, at import, beside `collectLiveSources` and for the same reason: no
 * `.vcg` reaches the bridge and the scene is discarded after import. **The `.vcg` FORMAT is
 * unchanged** — arrangements are read out of the scene the package already carried, exactly
 * as the declarations are.
 *
 * The runtime does not receive the arrangement's per-element `visibility` map: that is a
 * PAGE fact (it decides what the page paints and what it punches, through
 * `resolveVisibility`), and the bridge neither paints nor punches. Sending it would put a
 * second, un-actioned copy of the visibility rule on the wire.
 */
export function collectArrangements(scene: Scene): LiveSourceArrangement[] {
  return (scene.arrangements ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    cells: a.cells.map((c) => ({ ...c })),
    isDefault: a.isDefault,
    transition: a.transition,
  }));
}

/**
 * Every Live Source in `scene`, flattened to SCENE pixels through its full
 * ancestor chain — containers AND composition instances, the latter including
 * the instance's inner scale.
 *
 * Emission order is document order (depth-first, layers in order), which makes
 * the declaration array stable across exports of an unchanged scene.
 *
 * ── 🔴 IS A HIDDEN PLATE DECLARED? YES — AND THAT IS NOW A DECISION ─────────
 *
 * **AO's second inherited question** (`design.md` §6b), which §12.9.7 records the tree as
 * answering **by accident**: this function has no visibility filter while `sceneMaskHoles`
 * does, so a hidden plate has always been DECLARED but has never PUNCHED. That is very
 * nearly the wanted behaviour — reached by nobody deciding it.
 *
 * **It is decided now, and it stays yes.** A declaration is the template's plate SET, and
 * the plate set is what `(templateId, plateId)` assignment is keyed to (§0.3). Making it
 * depend on visibility would mean:
 *
 * - a plate hidden in the ACTIVE arrangement drops out of the declaration, so the operator's
 *   assignment for it has nothing to attach to and is lost on the next switch — the exact
 *   thing A′ was chosen to make impossible; and
 * - §12.4's HELD state becomes unreachable. A source with no cell in the target arrangement
 *   is held **muted and idle on its band layer**, which requires the bridge to still know
 *   about it. An undeclared plate cannot be held; it can only be torn down.
 *
 * ⚠ **So the two sides are deliberately asymmetric, and this is the sentence to keep:**
 * **visibility governs the PUNCH, never the DECLARATION.** The punch is a per-frame fact
 * about what is on screen and is resolved through `resolveVisibility` — including the
 * arrangement's opinion and D4's transition flag. The declaration is a static fact about
 * what the template HAS, and it is arrangement-independent by design. They were the same
 * shape by coincidence before; they are the same shape on purpose now.
 */
export function collectLiveSources(scene: Scene): LiveSourceDeclaration[] {
  const dynamicRoles = dynamicRoleIndex(scene);

  const flattened = flattenElements(scene, 'document');
  // Every ROOT-level composition instance is a candidate BOX, with its authored scene rect.
  // Root-level because that is what an arrangement's cells position (A′, §12.9.10).
  const boxRects = new Map<string, LiveSourceRect>();
  for (const f of flattened) {
    if (f.element.type === 'composition' && f.depth === 0 && f.ancestry.length === 1) {
      boxRects.set(f.element.id, f.rect);
    }
  }
  const boxIds: ReadonlySet<string> = new Set(boxRects.keys());

  const out: LiveSourceDeclaration[] = [];
  for (const flat of flattened) {
    const el = flat.element;
    if (el.type !== 'video-placeholder') continue;
    /*
      ⭐ `B-183` — an UNASSIGNED plate DECLARES NOTHING, so it contributes no entry.

      A declaration's whole content is `sourceId`; a plate that has not been pointed at a
      source has no id to put there, and inventing one is exactly the defect `B-183` removes.
      Skipping here is not a silent swallow: `live-source-unset` refuses the EXPORT with
      a message that names the plate, so the author is told by the surface built for it rather
      than by a missing line in a carrier they never read.
    */
    if (el.routeKey === undefined) continue;
    const roles = dynamicRoles.get(el.id);
    // ⚠ `keySourceId` / `keyDynamic` are DELIBERATELY NOT EMITTED (owner,
    // 2026-08-10; design.md §1a). A template declares ONE symbolic id, and
    // whether it resolves to a single device or to a fill/key DEVICE PAIR is
    // a property of the installation's MAPPING. Both fields survive on the
    // schemas so stored scenes and persisted `TemplateInfo` records keep
    // parsing; emitting them here would carry a scene's guess about a plant
    // it cannot see all the way to the bridge, where it would compete with
    // the mapping that actually knows.
    // superseded by LOOKS — deleted in phase 2 (`tasks.md` §1b's deletion clause): the
    // box-fraction pair below is A′'s carrier, kept functional through the one-session
    // coexistence window because the Designer's shipped UI still authors arrangements.
    const boxId = boxIdOf(flat, boxIds);
    const boxRect = boxId === null ? undefined : boxRects.get(boxId);
    const boxRelativeRect = boxRect === undefined ? null : relativeRect(flat.rect, boxRect);
    out.push({
      elementId: el.id,
      sourceId: el.routeKey,
      rect: flat.rect,
      ...(el.expectedAspect !== undefined ? { expectedAspect: el.expectedAspect } : {}),
      // `C-028` — omitted when absent rather than defaulted to `contain` here. The
      // default belongs at the ONE resolution point (the bridge's mode chain), and a
      // carrier that spelled it out would be a second place the default lives.
      ...(el.fitMode !== undefined ? { fitMode: el.fitMode } : {}),
      dynamic: roles?.has('fill') ?? false,
      ...(boxRelativeRect !== null ? { boxRelativeRect } : {}),
    });
  }
  return out;
}

/**
 * 🔴 **The WHOLE Live Source carrier for one scene — the block `TemplateInfo.liveSources`
 * carries — assembled in ONE place.**
 *
 * It was assembled at the call site, which was fine while the block had three fields that
 * one line each produced. `tasks.md` 5.2 adds a fourth that must be derived in step with the
 * others, and a block assembled by hand at the call site is a block whose next field gets
 * added at one call site and forgotten at the next — the "extend the list, forget the
 * mutator" shape this repo keeps paying for.
 *
 * ⚠ **ALWAYS EMITTED, including with an EMPTY `sources` and an EMPTY `arrangements`.** That
 * is what makes an ABSENT block mean "imported before this existed" rather than "has none";
 * collapsing the two would let a template with real holes reach air with nothing composited
 * behind them (`liveSourceCarrierState`).
 *
 * `defaultPosition` is the RESOLVED authored default via the canonical
 * `resolveDefaultPosition`, never a local `{ anchor: 'center' }`: the page falls through to
 * that same function, and two spellings of "centred" is how the composited box comes to sit
 * somewhere the transparent hole is not.
 */
/** One LOOK as the carrier emits it — mirrors shared-ipc's `TemplateLookSchema`. */
export interface TemplateLookCarrier {
  id: string;
  name: string;
  entered: LookTransition;
  rects: Record<string, LiveSourceRect>;
  /**
   * ⭐ `B-178` — **the AUTHOR's fit mode for each source IN THIS LOOK**, taken from the plate
   * ELEMENT that serves that `routeKey` here.
   *
   * 🔴 It sits beside {@link rects} and not on the declaration because it is the SAME KIND OF
   * FACT: a property of the pairing of a picture with a BOX, and the box is per-look. One
   * `routeKey` appears in every look in a differently-shaped box, so a per-source mode would
   * have to be wrong in one of them — the argument `C-028` already used to refuse a
   * per-catalog-source home, applied one level in.
   *
   * A source ABSENT from this map authored nothing; that is a THIRD STATE and it must survive
   * the wire, because `B-178`'s whole subject is that "nobody said" was indistinguishable from
   * "the author chose `contain`". Never defaulted here — the default belongs at the one place
   * that resolves the mode.
   */
  fits: Record<string, LiveFitMode>;
}

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 1C — **the SOURCE-KEYED carrier for a scene
 * with a multi-frame group.**
 *
 * When a group exists, the per-ELEMENT emission of {@link collectLiveSources} is the wrong
 * carrier: the same source referenced in two looks would be TWO declarations sharing one
 * `sourceId`, which the bridge seats as two producers on one route (`design.md` §14.3
 * claim 1 — double-seat + first-match addressing). This derivation is source-keyed by
 * construction:
 *
 * - **`sources`** — ONE declaration per DERIVED source. 🔴 `B-188`: the group no longer
 *   declares a list, so this is `deriveLookSources(scene)` — the distinct `routeKey`s the
 *   plates carry, in document order of first use. **The set is unchanged by that switch**: this
 *   loop already dropped every declared source no look placed, and only recorded rects for
 *   plates whose key was declared, so `used ⊆ declared` and the carrier was always exactly the
 *   derived set. Only the ORDER moved, from the author's declaration order to first use.
 *   **`expectedAspect` and `dynamic` are now read off the plate ELEMENT** — the first one
 *   serving that key in document order, the same element whose id `elementId` already names, so
 *   the two facts cannot describe different elements. ⚠ `fitMode` stays per-look beside the
 *   rects (`B-178`, {@link TemplateLookCarrier.fits}): a fit is a property of a picture in a
 *   BOX and a look is exactly a change of box. The declaration's `rect` is the source's rect in
 *   the DEFAULT look, falling back to the first look containing it (a bridge that has not
 *   learned looks yet seats what a fresh take will show); `elementId` is the first referencing
 *   plate's, document order (the bridge never reads it — AZ-verified — it survives as the
 *   operator-facing handle).
 * - **per-look `rects`** — the look's VISIBLE SET: its own plates plus every root-level
 *   plate (a plate outside every look is on screen in EVERY look; so is one inside an
 *   instance the group does not register, which the switch never hides). 🔴 A source
 *   ABSENT from a look gets NO entry — never a zero-area rect, which the bridge refuses
 *   outright ("seat NO PRODUCER AT ALL rather than to emit a zero-area rect"); zero-area
 *   holes belong to the PARKED animated phase (§13.4/§14.6). The EMPTY look is valid and
 *   carries an empty map — background alone.
 * - A source no look places yields no declaration: it cannot be shown, and declaring it would
 *   seat a producer no look can reveal. (Reachable only with zero looks now that the list is
 *   derived from the plates — it used to be the `l9` case, a declared-but-unused key.)
 *
 * Tolerant on purpose where the PREFLIGHT refuses at export (a within-look duplicate is
 * first-wins in document order): import must not refuse a whole template over what the
 * preflight already guards — the zod-strip philosophy, one level up.
 */
export function collectLookCarrier(scene: Scene): {
  sources: LiveSourceDeclaration[];
  looks: TemplateLookCarrier[];
  defaultLookId?: string;
} | null {
  const group = lookGroupOf(scene);
  if (group === undefined) return null;

  const lookByInstance = new Map(group.looks.map((l) => [l.instanceId, l] as const));
  /*
    🔴 `B-188` — THE SOURCE LIST IS DERIVED, AND THIS IS ITS ONE DEFINITION'S ONE CALL SITE.

    It was `group.sources` — the group's declared list — with every plate gated on membership
    of it. Both are gone: the list comes from the plates, so a plate cannot reference something
    the list lacks and there is nothing to gate on. `deriveLookSources` walks the SAME flattener
    in the SAME `'document'` order this loop does, which is what keeps the Designer's list, this
    carrier's order and this loop's membership one answer rather than three.
  */
  const derived = deriveLookSources(scene);
  const rectsByLook = new Map<string, Record<string, LiveSourceRect>>(
    group.looks.map((l) => [l.id, {}]),
  );
  /**
   * ⭐ `B-178` — the per-look fit modes, harvested in the SAME pass and under the SAME
   * first-wins rule as {@link rectsByLook}.
   *
   * 🔴 **This loop already knew which element serves which `routeKey` in which look; it simply
   * threw the element away and kept only its rect.** That is the whole of `B-178`: the author's
   * `fitMode` was in scope, one line from where it was needed, and the carrier read a
   * never-written field on the DECLARATION instead — so every plate under a look group reached
   * air on the `contain` default however the author had set it.
   *
   * Keyed and gated identically to the rects so the two can never disagree about membership: a
   * source with a rect in this look has its mode looked up here, and one without has neither.
   */
  const fitsByLook = new Map<string, Record<string, LiveFitMode>>(
    group.looks.map((l) => [l.id, {}]),
  );
  const firstPlateFor = new Map<string, string>();
  /**
   * ⭐ `B-179` — **the AUTHOR's `expectedAspect` and the FILL-binding flag, per source, from
   * the plate ELEMENT that first serves it.**
   *
   * Both used to be read off the declaration (`src.expectedAspect`, `src.dynamic`) and NEITHER
   * had a writer: `addLookSource` emitted `{ routeKey, dynamic: false }` and nothing anywhere
   * set an aspect. So every look-group template exported no aspect at all, which DISARMED the
   * take's mismatch refusal (it fires only when both the source's aspect and the author's are
   * present) — that is `B-179`, and reading the element is its fix.
   *
   * 🔴 The owner settled WHERE an aspect belongs rather than this change assuming it:
   * _"aspect and fit are per-plate right now and have nothing to do with the source — which I
   * think is correct."_ It is the author's intention for the BOX, and the real feed still wins
   * when known (`resolvePlateAspect`: source `format` → source `aspect` → this → `assumed`).
   * So there is no refusal when two looks' plates assert different aspects for one key: the
   * FIRST in document order wins, which is the same element `elementId` already names, so the
   * carrier entry describes one element rather than two halves of two.
   *
   * `dynamic` comes from the same element through the same {@link dynamicRoleIndex} the
   * groupless path uses — closing the asymmetry where that path computed it from the field
   * bindings and this one hardcoded `false` for every look-group template ever exported.
   */
  const dynamicRoles = dynamicRoleIndex(scene);
  const aspectFor = new Map<string, number>();
  const dynamicFor = new Map<string, boolean>();

  for (const flat of flattenElements(scene, 'document')) {
    const el = flat.element;
    if (el.type !== 'video-placeholder') continue;
    // `B-183` — narrowed once, at the top, so the reads below cannot disagree about whether
    // this plate has a source. An UNASSIGNED plate has no key to contribute and is therefore
    // not a candidate for any look; `live-source-unset` refuses the export separately.
    const routeKey = el.routeKey;
    if (routeKey === undefined) continue;
    if (!firstPlateFor.has(routeKey)) {
      firstPlateFor.set(routeKey, el.id);
      // Gated on FIRST-PLATE identity, not written unconditionally: a later plate serving the
      // same key must not overwrite the aspect belonging to the element `elementId` names.
      if (el.expectedAspect !== undefined) aspectFor.set(routeKey, el.expectedAspect);
      dynamicFor.set(routeKey, dynamicRoles.get(el.id)?.has('fill') ?? false);
    }
    const ownerInstanceId = flat.ancestry.map((a) => a.id).find((id) => lookByInstance.has(id));
    const owner = ownerInstanceId === undefined ? undefined : lookByInstance.get(ownerInstanceId);
    const inLooks = owner === undefined ? group.looks : [owner];
    for (const look of inLooks) {
      const rects = rectsByLook.get(look.id);
      if (rects === undefined || routeKey in rects) continue;
      rects[routeKey] = flat.rect;
      /*
        ⚠ WRITTEN ONLY WHEN THE AUTHOR STATED ONE. An absent entry is the third state —
        "nobody said" — and it must reach the bridge as an absence rather than as a defaulted
        `contain`, because telling those two apart is half of what `B-178` is for.

        Inside the same `!(routeKey in rects)` gate on purpose: the rect decides which element
        WINS this look, so reading the mode off any other element would seat one plate's picture
        under another plate's fit.
      */
      if (el.fitMode !== undefined) {
        const fits = fitsByLook.get(look.id);
        if (fits !== undefined) fits[routeKey] = el.fitMode;
      }
    }
  }

  const fallback = defaultLookOf(group);
  const sources: LiveSourceDeclaration[] = [];
  for (const routeKey of derived) {
    let rect = fallback === undefined ? undefined : rectsByLook.get(fallback.id)?.[routeKey];
    if (rect === undefined) {
      for (const look of group.looks) {
        rect = rectsByLook.get(look.id)?.[routeKey];
        if (rect !== undefined) break;
      }
    }
    if (rect === undefined) continue;
    const expectedAspect = aspectFor.get(routeKey);
    sources.push({
      elementId: firstPlateFor.get(routeKey) ?? routeKey,
      sourceId: routeKey,
      rect,
      ...(expectedAspect !== undefined ? { expectedAspect } : {}),
      /*
        ⭐ `B-178` — **NO `fitMode` HERE ANY MORE, and its absence is the fix.**

        `C-028` put it on the declaration with the comment "from the DECLARED source, never from
        a plate element … a per-plate read would silently pick one of two looks' plates and call
        it the answer". The instinct was right and the conclusion was wrong: the answer is not to
        pick one plate, it is to answer PER LOOK, where there is exactly one plate to pick. The
        field it read (`LookSource.fitMode`) had no writer anywhere in the product, so the author's
        choice was dropped for every look-group template ever exported.

        The mode now travels on each look's own `fits` map. It is NOT also emitted here, because a
        second home for one fact is how the two come to disagree — golden rule 7's shape, and the
        reason `LookSource.fitMode` is deleted from the schema in the same change rather than left
        as a plausible-looking second place to write it.
      */
      dynamic: dynamicFor.get(routeKey) ?? false,
    });
  }

  return {
    sources,
    looks: group.looks.map((l) => ({
      id: l.id,
      name: l.name,
      entered: l.entered,
      rects: rectsByLook.get(l.id) ?? {},
      fits: fitsByLook.get(l.id) ?? {},
    })),
    ...(group.defaultLookId !== undefined ? { defaultLookId: group.defaultLookId } : {}),
  };
}

export function buildTemplateLiveSources(scene: Scene): {
  resolution: Scene['resolution'];
  defaultPosition: ReturnType<typeof resolveDefaultPosition>;
  sources: LiveSourceDeclaration[];
  arrangements: LiveSourceArrangement[];
  looks?: TemplateLookCarrier[];
  defaultLookId?: string;
} {
  const lookCarrier = collectLookCarrier(scene);
  return {
    resolution: scene.resolution,
    defaultPosition: resolveDefaultPosition(scene),
    // With a multi-frame group the carrier is SOURCE-KEYED (one declaration per declared
    // source); the per-element emission would double-seat a source two looks share.
    sources: lookCarrier === null ? collectLiveSources(scene) : lookCarrier.sources,
    arrangements: collectArrangements(scene),
    ...(lookCarrier === null
      ? {}
      : {
          looks: lookCarrier.looks,
          ...(lookCarrier.defaultLookId !== undefined
            ? { defaultLookId: lookCarrier.defaultLookId }
            : {}),
        }),
  };
}
