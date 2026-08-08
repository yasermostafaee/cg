import type { Element, Layer, Scene, Transform } from '@cg/shared-schema';
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
  const walk = (children: readonly Element[], ancestors: readonly Transform[]): void => {
    for (const el of children) {
      if (el.type === 'video-placeholder') {
        if (seen.has(el.id)) continue;
        seen.add(el.id);
        out.push({ element: el, box: frameAabb(el, ancestors) });
      } else if (el.type === 'container') {
        walk(el.children, [...ancestors, el.transform]);
      }
    }
  };
  for (const layer of layers) walk(layer.children, []);
  return out;
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
    for (const { element, box } of flat) {
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
            `slide off the source behind it. Animating a Live Source is out of scope in v1.`,
          elementId: element.id,
        });
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
