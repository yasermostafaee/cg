import type { Element, Layer, Scene } from '@cg/shared-schema';
import { LiveSourceIdSchema } from '@cg/shared-schema';
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

/** Do two AABBs share any area? Edge-touching is NOT an overlap (zero area). */
function overlaps(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
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

  const seen = new Set<string>();
  for (const doc of docs) {
    const flat = collectFlat(doc.layers, seen);
    for (const entry of flat) {
      const { element, box } = entry;
      if (!LiveSourceIdSchema.safeParse(element.routeKey).success) {
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
  return issues;
}
