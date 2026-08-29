import type {
  ArrangementView,
  Element,
  FlatElement,
  Layer,
  LiveSourceRect,
  Scene,
} from '@cg/shared-schema';
import {
  LiveSourceIdSchema,
  applyArrangementGeometry,
  flattenElements,
  lessThanBeyondNoise,
  liveSourcesInStampedScopes,
  lookContaining,
  resolveVisibilityOf,
} from '@cg/shared-schema';
import { arrangementViewOf, boxInstanceIds } from './slices/arrangements.js';
import type { ExportIssue } from '@cg/shared-ipc';
import { frameAabb, GEOMETRY_TRACK_KEYS, type Aabb } from './off-frame.js';

/**
 * D-137 — the Live Source PREFLIGHT: four checks, and every one of them is
 * `severity: 'error'`.
 *
 * **Why not a warning, stated once so nobody softens them later.** Only an error
 * blocks an export — `CompositionActionBar` gates on `severity === 'error'` and
 * `Exporter.produce` throws on the first one. A warning ships the broken template
 * with a note nobody reads, and every failure below is a failure ON AIR:
 *
 * - `live-source-off-frame` — the hole is outside the frame it belongs to. It used
 *   to be worse than a missed warning: `dropFullyOffFrameForExport` DELETED such an
 *   element silently, taking the runtime contract with it while leaving the template
 *   that depends on it. That deletion is now exempted, so the element survives — and
 *   this error is what stops it shipping in a state the bridge cannot place.
 * - `live-source-overlap` — two holes intersect, so two live layers fight over the
 *   same pixels. Which one wins is a z-order accident, and it is not visible while
 *   authoring, because in `'author'` mode both paint bars.
 * - `live-source-device-id` — the id names a concrete device. Caught at the schema
 *   boundary too, but a hand-edited scene never round-trips through a parse, and this
 *   is the check that can name the ELEMENT rather than a field path.
 * - `live-source-animated` — the hole carries a geometry keyframe. `MIXER FILL` is
 *   emitted once, from the static rect; a moving hole desyncs from a stationary
 *   composited box, and the guest slides out from behind their own window. v1 refuses
 *   it rather than shipping a template that looks right until it plays.
 *
 * Every check is per-DOC: the root layers against `scene.resolution`, each
 * composition against its OWN resolution — the same partition
 * `dropFullyOffFrameForExport` uses, so "off-frame" means the same thing in both.
 *
 * PURE and dependency-light on purpose, so `Exporter.preflight` (platform) can call
 * it without pulling in UI. The AABB flattening is IMPORTED from `off-frame.ts`
 * rather than re-derived: the drop filter and this preflight must agree on what
 * "off-frame" means, and a second local spelling of that arithmetic is exactly how
 * they would come to disagree.
 */

/** One Live Source, flattened into its own doc's coordinates. */
interface FlatLiveSource {
  element: Element & { type: 'video-placeholder' };
  box: Aabb;
  /**
   * The element's ancestor CONTAINERS, outermost → innermost.
   *
   * Carried because two of the six checks are about the CHAIN and not about the
   * element: a rotated or animated PARENT moves the hole exactly as the element's
   * own rotation or keyframe would, and an element-local check passes it. See
   * `rotatedAncestor` / `animatedAncestor`.
   */
  ancestors: readonly Element[];
}

/**
 * Every Live Source of one doc, with its ancestor-composed AABB.
 *
 * `seen` is not an optimisation — it is REQUIRED for correctness, because the scene
 * this runs against ALIASES one document. `editSceneOf` projects the active
 * composition's layers into `scene.layers` while leaving that same composition in
 * `scene.compositions`, so a naive per-doc sweep meets every element of the open
 * composition TWICE: two identical off-frame errors, and every overlapping pair
 * counted four times instead of two. (`Exporter.preflight` solves the same aliasing
 * with its `elementsById` map; this is that idea, kept local because the overlap
 * pass needs the elements grouped BY DOC and not merely deduped.)
 *
 * Element ids are unique per project, so skipping a seen id can only ever drop the
 * alias — never a real second element.
 */
function collectFlat(layers: readonly Layer[], seen: Set<string>): FlatLiveSource[] {
  const out: FlatLiveSource[] = [];
  const walk = (children: readonly Element[], chain: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'video-placeholder') {
        if (seen.has(el.id)) continue;
        seen.add(el.id);
        out.push({
          element: el,
          box: frameAabb(
            el,
            chain.map((a) => a.transform),
          ),
          ancestors: chain,
        });
      } else if (el.type === 'container') {
        walk(el.children, [...chain, el]);
      }
    }
  };
  for (const layer of layers) walk(layer.children, []);
  return out;
}

/**
 * The nearest ancestor carrying a non-zero rotation, or `undefined`.
 *
 * ROTATION IS CHECKED ON THE COMPOSED CHAIN, not on the element, and that is the
 * whole point of this function. `collectLiveSources` emits a flattened AXIS-ALIGNED
 * rect, so a rotated hole declares its BOUNDING BOX — strictly larger than the frame
 * the author drew — and the live picture is composited showing OUTSIDE that frame.
 * A rotated parent container produces exactly that with the element's own rotation
 * still at zero, which is why an element-local check is not enough.
 */
function rotatedAncestor(f: FlatLiveSource): Element | undefined {
  return f.ancestors.find((a) => a.transform.rotation !== 0);
}

/**
 * The nearest ancestor carrying a geometry keyframe, or `undefined`.
 *
 * Same shape of gap as {@link rotatedAncestor}. An animated PARENT moves the hole
 * identically to an animated element, and `collectLiveSources` reads transforms
 * STATICALLY — `live-source-multibox` design.md §6 lists "Animated values" among
 * what the flattener does not compose. So the `MIXER FILL` is emitted once from a
 * rect that stops being true on the next frame: the same desync, the same live face
 * sliding out from behind its own frame.
 */
function animatedAncestor(f: FlatLiveSource): Element | undefined {
  return f.ancestors.find(hasGeometryKeyframe);
}

/** Strictly outside `[0,0,w,h]` — the frame-touching case is ON-frame, and fine. */
function isOutsideFrame(box: Aabb, w: number, h: number): boolean {
  const { minX, minY, maxX, maxY } = box;
  if (![minX, minY, maxX, maxY].every((n) => Number.isFinite(n))) return false;
  return maxX < 0 || minX > w || maxY < 0 || minY > h;
}

/**
 * Not fully inside `[0,0,w,h]`. Deliberately STRICTER than {@link isOutsideFrame}:
 * a hole that hangs half off the frame is composited half off-screen, which is the
 * same broken shot as one entirely outside — it is simply harder to notice.
 */
function isNotFullyInsideFrame(box: Aabb, w: number, h: number): boolean {
  const { minX, minY, maxX, maxY } = box;
  if (![minX, minY, maxX, maxY].every((n) => Number.isFinite(n))) return false;
  return minX < 0 || minY < 0 || maxX > w || maxY > h;
}

/**
 * Do two AABBs share any area? Edge-touching is NOT an overlap (zero area).
 *
 * ⭐ `B-180` — the strict `<` is spelled through {@link lessThanBeyondNoise}, the ONE guard this
 * predicate shares with its two siblings (`rectsOverlap` below, and `intersects` in
 * `@cg/shared-schema`'s flattener). Three spellings that must agree is the defect this repo keeps
 * re-learning, so there is one.
 *
 * 🔴 **The rule is NOT loosened.** The operator is still strict, so flush abutment is still not an
 * overlap and a genuine 0.01 px collision still fires. What no longer fires is arithmetic dust: a
 * composition instance's `preScale`, the flattener's `fitAffine` and the Inspector's `n / 100` are
 * DIVISIONS, so an authored-integer rect reaches here carrying residue nobody typed. See
 * `float-noise.ts` for why the guard is in ULPs and never in pixels.
 */
function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    lessThanBeyondNoise(a.minX, b.maxX) &&
    lessThanBeyondNoise(b.minX, a.maxX) &&
    lessThanBeyondNoise(a.minY, b.maxY) &&
    lessThanBeyondNoise(b.minY, a.maxY)
  );
}

/** Whether the element carries a keyframe on any geometry-affecting track. */
function hasGeometryKeyframe(el: Element): boolean {
  const tracks = el.animation?.tracks as Record<string, unknown> | undefined;
  if (tracks === undefined) return false;
  return GEOMETRY_TRACK_KEYS.some((k) => tracks[k] !== undefined);
}

/** A short human handle for an element in a message: its name, else its id. */
function label(el: Element): string {
  return el.name.trim() === '' ? el.id : el.name;
}

/** The four Live Source preflight checks, over the whole project. */
export function liveSourceIssues(scene: Scene): ExportIssue[] {
  const issues: ExportIssue[] = [];

  // 🔴 `multibox-layout-switch` 4.6 — a plate inside a STAMPED scope (`sequence` item or
  // `repeater`) is invisible to BOTH sides at once: nothing declares it, so no producer is
  // seated, and nothing punches it, so the backdrop stays solid. The two failures cancel and
  // the page looks intact — which is why it has to be said HERE, at authoring time, rather
  // than discovered as "the guest never appeared". Detected by the flattener's own module,
  // beside the non-descent that causes it.
  for (const stamped of liveSourcesInStampedScopes(scene)) {
    issues.push({
      severity: 'error',
      code: 'live-source-in-stamped-scope',
      message:
        `Live Source "${label(stamped.element)}" sits inside a ${stamped.scope}, which stamps ` +
        `its content at run time. A plate there declares no hole to the runtime and punches ` +
        `none in the backdrop, so nothing is composited behind it and nothing says so — and ` +
        `every stamp would carry the same source id, so the copies would fight over one live ` +
        `layer. Move the plate out of the ${stamped.scope}.`,
      elementId: stamped.element.id,
    });
  }
  const docs: { layers: readonly Layer[]; width: number; height: number; where: string }[] = [
    {
      layers: scene.layers,
      width: scene.resolution.width,
      height: scene.resolution.height,
      where: 'the main composition',
    },
    ...(scene.compositions ?? []).map((c) => ({
      layers: c.layers,
      width: c.resolution.width,
      height: c.resolution.height,
      where: `composition "${c.name}"`,
    })),
  ];

  /*
    ⭐ `B-183` — WHERE THE AUTHOR GOES TO FIX IT, resolved once and shared by both messages
    below, because the control's own label differs by template.

    A message that states a rule and stops leaves the author to work out the remedy; both
    refusals here now name the panel, the row, and what belongs in it. Which row exists
    depends on whether the project declares a multi-frame group — `StyleSection` renders the
    `source` PICKER when it does and the free-text `source id` box when it does not — so
    naming the wrong one would be worse than naming none.
  */
  const hasLookGroup = (scene.lookGroups ?? []).length > 0;
  const chooseASource = hasLookGroup
    ? 'Pick one in the Inspector\'s "Live Source" panel, from the "source" list — it offers ' +
      'the sources the multi-frame group declares.'
    : 'Set one in the Inspector\'s "Live Source" panel, in the "source id" box — a symbolic ' +
      'name such as "guest-1", never a device.';

  const seen = new Set<string>();
  for (const doc of docs) {
    const flat = collectFlat(doc.layers, seen);
    for (const entry of flat) {
      const { element, box } = entry;
      /*
        ⭐ `B-183` — "NOT CHOSEN YET" AND "CHOSE SOMETHING WRONG" ARE DIFFERENT MISTAKES.

        This test used to be the first thing a plate met, and with `routeKey` now optional an
        unassigned plate would fail it and be told its id *"is not symbolic (“undefined”)"* —
        a message about a typo, shown for a deliberate state, naming a value the author never
        typed. The two are split so each says the true thing and names its own remedy.

        🔴 Checked in DOCUMENT scope, so it fires whether or not the template declares a
        group. `look-source-undeclared` is group-scoped by nature; being pointed at nothing is
        not — a plate with no source can never be seated by anyone.
      */
      if (element.routeKey === undefined) {
        issues.push({
          severity: 'error',
          code: 'live-source-unassigned',
          message:
            `Live Source "${label(element)}" has no source: it is not pointed at anything, so ` +
            `nothing would ever be composited behind it. ${chooseASource}`,
          elementId: element.id,
        });
      } else if (!LiveSourceIdSchema.safeParse(element.routeKey).success) {
        issues.push({
          severity: 'error',
          code: 'live-source-device-id',
          message:
            `Live Source "${label(element)}" names a source id that is not symbolic ` +
            `("${element.routeKey}"). A template names sources by id only — mapping an id to a ` +
            `DECKLINK input, a route://, a media file or an NDI source is an INSTALLATION ` +
            `concern, configured in CG Control.`,
          elementId: element.id,
        });
      }
      if (
        element.keySourceId !== undefined &&
        !LiveSourceIdSchema.safeParse(element.keySourceId).success
      ) {
        issues.push({
          severity: 'error',
          code: 'live-source-device-id',
          message:
            `Live Source "${label(element)}" names a KEY source id that is not symbolic ` +
            `("${element.keySourceId}").`,
          elementId: element.id,
        });
      }
      if (isOutsideFrame(box, doc.width, doc.height)) {
        issues.push({
          severity: 'error',
          code: 'live-source-off-frame',
          message:
            `Live Source "${label(element)}" is entirely outside ${doc.where}'s frame. It is a ` +
            `compositing contract with the runtime, so it is NOT dropped from the export the way ` +
            `an off-frame graphic is — move it back on frame or delete it.`,
          elementId: element.id,
        });
      } else if (isNotFullyInsideFrame(box, doc.width, doc.height)) {
        issues.push({
          severity: 'error',
          code: 'live-source-off-frame',
          message:
            `Live Source "${label(element)}" extends past ${doc.where}'s frame. The composited ` +
            `source would be placed partly off-screen.`,
          elementId: element.id,
        });
      }
      if (hasGeometryKeyframe(element)) {
        issues.push({
          severity: 'error',
          code: 'live-source-animated',
          message:
            `Live Source "${label(element)}" carries a position/size/scale/rotation keyframe. ` +
            `The composited source is placed ONCE from the static rect, so a moving hole would ` +
            `slide off the source behind it. Remove the keyframes from this plate — animating a ` +
            `Live Source is out of scope in v1.`,
          elementId: element.id,
        });
      } else {
        // `else` deliberately: a plate that is animated AND sits under an animated
        // parent has ONE problem to fix first, and two errors saying the same thing
        // read as two faults.
        const animated = animatedAncestor(entry);
        if (animated !== undefined) {
          issues.push({
            severity: 'error',
            code: 'live-source-animated',
            message:
              `Live Source "${label(element)}" sits inside "${label(animated)}", which is ` +
              `ANIMATED. The plate itself has no keyframes, but an animated parent moves it just ` +
              `the same — and the composited source is placed ONCE, from a rect read statically, ` +
              `so it would stop matching on the next frame. Remove the geometry keyframes from ` +
              `"${label(animated)}", or move the plate out of it.`,
            elementId: element.id,
          });
        }
      }
      /*
        ROTATION — the element's own, or ANY ancestor's.

        The declared rect is axis-aligned, so a rotated plate declares its BOUNDING
        BOX: strictly larger than the frame the author drew, and the live picture
        shows outside it. A rotated CONTAINER does this with the plate's own rotation
        at zero, which is why this reads the composed chain and not the element.
      */
      if (element.transform.rotation !== 0) {
        issues.push({
          severity: 'error',
          code: 'live-source-rotated',
          message:
            `Live Source "${label(element)}" is rotated (${String(element.transform.rotation)}°). ` +
            `A live source is composited into an AXIS-ALIGNED box, so a rotated plate declares ` +
            `its bounding box instead — larger than the frame you drew, with the picture showing ` +
            `outside it. Set the plate's rotation back to 0.`,
          elementId: element.id,
        });
      } else {
        const rotated = rotatedAncestor(entry);
        if (rotated !== undefined) {
          issues.push({
            severity: 'error',
            code: 'live-source-rotated',
            message:
              `Live Source "${label(element)}" sits inside "${label(rotated)}", which is rotated ` +
              `(${String(rotated.transform.rotation)}°). The plate's own rotation is 0, but it is ` +
              `composited into an AXIS-ALIGNED box either way, so it declares its bounding box ` +
              `and the picture shows outside the frame. Set "${label(rotated)}" back to 0°, or ` +
              `move the plate out of it.`,
            elementId: element.id,
          });
        }
      }
    }
    // Overlap is reported against BOTH elements (D-137: "reports it against both"),
    // so selecting either issue takes the author to a participant in the collision.
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const a = flat[i];
        const b = flat[j];
        if (a === undefined || b === undefined) continue;
        if (!overlaps(a.box, b.box)) continue;
        for (const [self, other] of [
          [a, b],
          [b, a],
        ] as const) {
          issues.push({
            severity: 'error',
            code: 'live-source-overlap',
            message:
              `Live Source "${label(self.element)}" overlaps "${label(other.element)}". Each is ` +
              `composited on its own CasparCG layer, so overlapping holes put two live sources ` +
              `over the same pixels and which one shows is a z-order accident.`,
            elementId: self.element.id,
          });
        }
      }
    }
  }

  // 🔴 `multibox-layout-switch` 5.6 — OVERLAP, APPLIED WITHIN AN ARRANGEMENT.
  //
  // ⚠ The RULE is unchanged and is deliberately not re-implemented: two holes that
  // intersect put two live sources over the same pixels and which one shows is a z-order
  // accident. What changes is the INPUT it is evaluated over.
  //
  // ── WHY THIS IS AN ADDITION AND NOT A SWAP ─────────────────────────────────
  //
  // The plan expected the existing loop's input to be swapped. It cannot be, and the reason
  // is worth stating: that loop runs PER COMPOSITION DOCUMENT and `collectFlat` descends
  // into containers only — never into a `composition` instance. Under A′ each box IS a
  // composition instance, so two boxes are never flattened into one coordinate space and
  // the existing loop CANNOT fire between them, with or without arrangements. There is
  // therefore nothing to suppress; what was missing is the check itself.
  //
  // This uses the SHARED flattener (`flattenElements` + `applyArrangementGeometry`) rather
  // than `collectFlat`, because the hole the page punches and the hole this check measures
  // have to be one computation — a preflight that disagrees with the canvas about where a
  // hole is teaches the author to distrust the preflight.
  for (const arrangement of scene.arrangements ?? []) {
    const view = arrangementViewOf(arrangement, boxInstanceIds(scene));
    const plates = applyArrangementGeometry(
      flattenElements(scene, 'document'),
      view?.geometry,
    ).filter((f) => f.element.type === 'video-placeholder');
    for (let i = 0; i < plates.length; i++) {
      for (let j = i + 1; j < plates.length; j++) {
        const a = plates[i];
        const b = plates[j];
        if (a === undefined || b === undefined) continue;
        // A box with no cell in this arrangement is not on screen, so it cannot collide.
        if (hiddenInArrangement(a, view) || hiddenInArrangement(b, view)) continue;
        if (!rectsOverlap(a.rect, b.rect)) continue;
        for (const [self, other] of [
          [a, b],
          [b, a],
        ] as const) {
          issues.push({
            severity: 'error',
            code: 'live-source-overlap',
            message:
              `Live Source "${label(self.element)}" overlaps "${label(other.element)}" in ` +
              `arrangement "${arrangement.name}". Each is composited on its own CasparCG ` +
              `layer, so overlapping holes put two live sources over the same pixels and ` +
              `which one shows is a z-order accident. The same two plates in DIFFERENT ` +
              `arrangements are fine — they are never on air together.`,
            elementId: self.element.id,
          });
        }
      }
    }
  }

  // ── `multibox-layout-switch` §14 (LOOKS, adopted 2026-08-19) — THE LOOKS REFUSAL FAMILY ──
  //
  // One family, one wording discipline: name what was asked for and what exists. The four
  // members below share the per-look VISIBLE SET — root-level plates (outside every look,
  // on screen in EVERY look) plus the look's own plates — because "what is on air together"
  // is the unit every rule here judges.
  const groups = scene.lookGroups ?? [];
  for (const extra of groups.slice(1)) {
    issues.push({
      severity: 'error',
      code: 'look-second-group',
      message:
        `This template authors ${String(groups.length)} multi-frame groups; v1 supports ` +
        `exactly ONE per template (group "${extra.id}" is beyond it). The refusal is a v1 ` +
        `bound, not a model limit — the format already carries a list.`,
    });
  }
  const group = groups[0];
  if (group !== undefined) {
    const declared = new Set(group.sources.map((s) => s.routeKey));
    const declaredList =
      group.sources.length === 0
        ? '(none)'
        : group.sources.map((s) => `"${s.routeKey}"`).join(', ');
    const flatPlates = flattenElements(scene, 'document').filter(
      (f) => f.element.type === 'video-placeholder',
    );
    const ancestorIds = (f: FlatElement): string[] => f.ancestry.map((a) => a.id);

    // B.1 — every plate in a group-bearing template references a DECLARED source. An
    // undeclared plate would be invisible to the carrier: never declared, never seated —
    // the 4.6 cancel-and-vanish failure by another door.
    for (const f of flatPlates) {
      const routeKey = (f.element as { routeKey?: string }).routeKey;
      /*
        ⭐ `B-183` — AN UNASSIGNED PLATE IS NOT AN UNDECLARED ONE, and is skipped here.

        This read `?? ''` and then asked whether `''` was declared, so a plate with no source
        was reported as *referencing source ""* — a claim about a reference that does not
        exist. `live-source-unassigned` (document scope, above) owns that state and says the
        true thing about it. Skipping is not a hole: the unassigned check runs for EVERY
        plate, group or no group, so the plate is still refused — once, with the right words.
      */
      if (routeKey === undefined) continue;
      if (!declared.has(routeKey)) {
        issues.push({
          severity: 'error',
          code: 'look-source-undeclared',
          message:
            `Live Source "${label(f.element)}" references source "${routeKey}", which the ` +
            `multi-frame group does not declare. Declared sources: ${declaredList}. A group ` +
            `declares each source ONCE and every plate references a declared one — an ` +
            `undeclared plate would never be seated, and nothing else would say so. ` +
            // `B-183` / B3 — the message names the REMEDY, and there are legitimately two:
            // the plate is wrong, or the declaration is missing. Naming only the first would
            // push an author who meant the name toward retyping it somewhere it still is not
            // declared. No one-click fix — the owner declined it (it needs an undoable scene
            // mutation and is its own item).
            `Either pick a declared source in the Inspector's "Live Source" panel, from the ` +
            `"source" list — or, if "${routeKey}" is the name you meant, declare it with ` +
            `"+ Source" in the Looks panel.`,
          elementId: f.element.id,
        });
      }
    }

    for (const look of group.looks) {
      const visibleSet = flatPlates.filter((f) => {
        const owner = lookContaining(group, ancestorIds(f));
        return owner === undefined || owner.id === look.id;
      });

      /*
        B.2 — the same source TWICE in one look's visible set is refused: two frames, one
        seat, and which frame shows the picture is an accident. ACROSS looks it is fine, and
        the message says so, because the author who hits this refusal is usually one edit
        away from the legitimate case.

        🔴 **THE ACROSS-LOOKS HALF WAS REWORDED BY SESSION BM, AND THE OLD WORDING IS KEPT
        HERE BECAUSE IT WAS LOAD-BEARING.** It read: _"Referencing the same source from
        DIFFERENT looks is fine — that is the identity mechanism, one seat held across the
        switch."_ True while a plate's producer was a property of the plate. Under (B′) the
        operator may point either look's frame somewhere else, so a shared `routeKey` is no
        longer a promise of one seat — it supplies the same DEFAULT, and what the two looks
        end up showing is the operator's to decide. The refusal itself is unchanged; only
        the sentence explaining the legitimate neighbour case moved.
      */
      const byRoute = new Map<string, FlatElement[]>();
      for (const f of visibleSet) {
        const routeKey = (f.element as { routeKey?: string }).routeKey ?? '';
        byRoute.set(routeKey, [...(byRoute.get(routeKey) ?? []), f]);
      }
      for (const [routeKey, plates] of byRoute) {
        if (plates.length < 2 || !declared.has(routeKey)) continue;
        for (const f of plates) {
          issues.push({
            severity: 'error',
            code: 'look-source-duplicate',
            message:
              `Source "${routeKey}" appears ${String(plates.length)} times when look ` +
              `"${look.name}" is active (a plate outside every look is on screen in EVERY ` +
              `look). One source is ONE seat, so only one frame can show it. Referencing ` +
              `the same source from DIFFERENT looks is fine — it gives them the same ` +
              `default input, and the operator can point either look elsewhere.`,
            elementId: f.element.id,
          });
        }
      }

      // B.3 — the visible-set overlap pass: ROOT-level plates vs this look's plates. The
      // per-document loop above cannot see this pair (they live in different documents),
      // and it already covers root-vs-root and each document's interior — so this pass
      // checks exactly the cross-boundary pairs, and only those, to report each collision
      // once. ⚠ Known v1 residual, recorded in `design.md` §14.3 claim 3: a plate in a
      // composition nested INSIDE a look vs a plate directly in that look is checked only
      // at each document's own level.
      for (let i = 0; i < visibleSet.length; i++) {
        for (let j = i + 1; j < visibleSet.length; j++) {
          const a = visibleSet[i];
          const b = visibleSet[j];
          if (a === undefined || b === undefined) continue;
          const ownerA = lookContaining(group, ancestorIds(a));
          const ownerB = lookContaining(group, ancestorIds(b));
          if ((ownerA === undefined) === (ownerB === undefined)) continue;
          if (!rectsOverlap(a.rect, b.rect)) continue;
          for (const [self, other] of [
            [a, b],
            [b, a],
          ] as const) {
            issues.push({
              severity: 'error',
              code: 'live-source-overlap',
              message:
                `Live Source "${label(self.element)}" overlaps "${label(other.element)}" ` +
                `when look "${look.name}" is active. Each is composited on its own CasparCG ` +
                `layer, so overlapping holes put two live sources over the same pixels and ` +
                `which one shows is a z-order accident. The same two plates in DIFFERENT ` +
                `looks are fine — they are never on air together.`,
              elementId: self.element.id,
            });
          }
        }
      }
    }
  }
  return issues;
}

/** Is this flattened element hidden by the arrangement (itself or through an ancestor)? */
function hiddenInArrangement(flat: FlatElement, view: ArrangementView | undefined): boolean {
  const context = { arrangementVisibility: view?.visibility };
  if (!resolveVisibilityOf({ ...flat.element }, context)) return true;
  return flat.ancestry.some((a) => !resolveVisibilityOf(a, context));
}

/**
 * The same "do two rects share area" rule as {@link overlaps}, on `LiveSourceRect`s — and
 * `B-180`'s same single noise guard, for the same reason.
 */
function rectsOverlap(a: LiveSourceRect, b: LiveSourceRect): boolean {
  return (
    lessThanBeyondNoise(a.x, b.x + b.width) &&
    lessThanBeyondNoise(b.x, a.x + a.width) &&
    lessThanBeyondNoise(a.y, b.y + b.height) &&
    lessThanBeyondNoise(b.y, a.y + a.height)
  );
}
