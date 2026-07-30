import type { Position } from '@cg/shared-schema';
import { positionQuery } from '@cg/shared-schema';

/**
 * R-022 — what PVW does to a rehearsal frame's DOCUMENT, as opposed to what it
 * renders in it.
 *
 * This may never become a change to the served page: PVW's fidelity claim rests
 * on rendering the byte-identical page the bridge gives CasparCG, and a
 * preview-specific variant of that page would quietly become a second
 * implementation to drift from air. It lives in its own module so that boundary
 * is visible, and so it can be asserted without a real iframe.
 *
 * ── NOTHING ABOUT THE WHITE 16:9 AREA BELONGS HERE ──────────────────────────
 *
 * A "reproduce CEF's transparent base on this document" pass was once written
 * into this module, on the theory that the served page had an opaque base a
 * browser imposed and CEF did not. It never shipped, and the theory was wrong:
 * the white was an OPAQUE CANVAS, forced by the frame element and the document
 * it embeds resolving different `color-scheme` values, and it is fixed one layer
 * out — on the frame ELEMENT, in `RehearsalFrame`'s style object, where the
 * embedder relationship that causes it actually lives.
 *
 * Recorded here as a boundary rather than as history: the pull toward "just set
 * it on the inner document" is real, it also works, and taking it would put a
 * preview-only mutation on the served page for a second time. Declared
 * backgrounds have nothing to do with that bug in either direction — measured.
 */

/**
 * The page's own inlined `@cg/template-runtime`, under the IIFE global `CG` the
 * exporter bundles it as.
 *
 * Declared STRUCTURALLY and as narrowly as this module uses it, rather than by
 * importing the package: the runtime SPA deliberately does not depend on
 * `@cg/template-runtime` (that dependency would pull the whole renderer into
 * this bundle for one function type), and the page carries its own copy anyway
 * — the copy that runs on air is the one we want called.
 */
export interface PageRuntimeWindow {
  CG?: {
    applyOutputPosition?: (
      scene: { resolution: { width: number; height: number } },
      options: { search?: string },
    ) => void;
  };
}

/**
 * ── THE OPERATOR'S PLACEMENT OVERRIDE (R-011), AND WHY IT NEEDS DOING AT ALL ─
 *
 * On air the override rides the SERVED URL's query and the page reads it at
 * boot: `CG.applyOutputPosition(scene, { search: location.search })`. The
 * rehearsal frame is a `srcdoc` document, whose URL is `about:srcdoc` and whose
 * `location.search` is therefore ALWAYS empty — so the boot resolved the
 * override to null and placed the graphic at its AUTHORED position, every time,
 * however many times the operator pressed Apply. That is the whole of the bug:
 * the override never reached the frame.
 *
 * It cannot be fixed by giving the frame a URL that carries the query. A
 * `srcdoc` document has no URL to give, a blob URL cannot carry a query at all
 * (its store lookup is by exact serialisation), and the bridge's real served URL
 * is cross-origin — which would cost the lifecycle driving and the value pushes,
 * i.e. the feature.
 *
 * So the override is handed to the page's OWN `applyOutputPosition` — the exact
 * function the on-air boot calls, from the page's own inlined runtime — with the
 * exact query string the bridge appends, built by the one shared
 * `positionQuery`. NO PLACEMENT MATHS IS COMPUTED HERE: this module decides only
 * WHICH string to pass, never where the graphic lands, so there is still one
 * placement implementation and nothing to drift from air.
 *
 * `scene.resolution` is read back from the page's own `.cg-stage`, whose inline
 * width/height `buildScene` wrote from the scene itself — a fact the page states
 * about itself rather than one reconstructed from the panel's data. The renderer
 * genuinely does not hold the scene (a template imported in a previous session
 * has none), so reading it from the page is the only honest source. Inline style
 * rather than a measured box, so the preview's fit transform cannot perturb it.
 *
 * NO `cw`/`ch` IN THE QUERY, deliberately: the frame IS sized to the channel
 * raster, so the page's own R-030 chain falls through to
 * `window.innerWidth`/`innerHeight` and reads that box. One geometry source, and
 * it is the real one.
 *
 * NOT CALLED WHEN THERE IS NO OVERRIDE, also deliberately. `resolveOutputPosition`
 * falls back to `scene.defaultPosition`, which lives inside the page and is not
 * available here — calling with an empty search would resolve to CENTERED and
 * MOVE a correctly-placed graphic. With no override the boot's own placement is
 * already right, so the honest action is none.
 *
 * @returns whether the override was applied — false covers "no override to
 * apply" and "the page is not one we can drive", which the caller distinguishes
 * only for tests; the frame renders either way.
 */
export function applyOperatorPosition(
  win: PageRuntimeWindow | null,
  doc: Document | null,
  position: Position | undefined,
): boolean {
  if (position === undefined) return false;
  const apply = win?.CG?.applyOutputPosition;
  if (apply === undefined || doc === null) return false;
  const stage = doc.querySelector<HTMLElement>('.cg-stage');
  if (stage === null) return false;
  const width = Number.parseFloat(stage.style.width);
  const height = Number.parseFloat(stage.style.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return false;
  apply({ resolution: { width, height } }, { search: `?${positionQuery(position)}` });
  return true;
}
