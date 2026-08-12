// 🔴 THE SUBPATH IS LOAD-BEARING — `@cg/template-runtime/position`, NEVER the
// package's entry index. The index reaches `adapters/caspar-globals.ts`, which
// carries `declare global { interface Window { cg?: TemplateRuntime } }` — the
// PAGE's `window.cg`. This app's `window.cg` is the RUNTIME BRIDGE, and the two
// declarations merge into one compilation: importing the index here made every
// `window.cg.stack` / `.templates` / `.rehearse` call in the app fail typecheck
// against the template runtime's interface. Two things legitimately own the name
// `window.cg` — the served page and the console — and they must never be in the
// same program. The subpath keeps this app importing pure arithmetic and nothing
// ambient.
import { outputLetterbox, outputScale, outputTranslate } from '@cg/template-runtime/position';
import type { ChannelRaster, TemplateLiveSources } from '@cg/shared-ipc';
import type { Position } from '@cg/shared-schema';

/**
 * R-049 — WHERE each Live Source plate sits on the rehearsal frame, and WHAT the
 * operator has bound to it.
 *
 * ── THIS DOES NOT REOPEN design.md §12.2 ────────────────────────────────────
 *
 * Rehearse still renders the RETAINED EXPORTED PAGE VERBATIM, and that page still
 * paints ZERO PIXELS where a Live Source is, because on air a CasparCG layer
 * composites the real feed BEHIND the template. What this module computes is an
 * OVERLAY the Runtime draws ON TOP of that frame. No `.vcg` changes, no exporter
 * changes, and `buildScene`'s `mode: 'author' | 'output'` seam stays unused and
 * available for a real `'rehearse'` mode if one is ever wanted.
 *
 * ── THE ARITHMETIC IS THE PAGE'S OWN, IMPORTED, NEVER RE-DERIVED ────────────
 *
 * `live-source-multibox` design.md §6 states the chain for a hole at scene-px
 * `(px, py)` on a channel raster `R`, and its 🔴 duplication guard: if this and
 * `position.ts` ever disagree, NOTHING ERRORS — the overlay simply stops sitting
 * on the hole it describes, and the hole is transparent, so the failure looks like
 * a mis-authored template. So the three terms come from `@cg/template-runtime`'s
 * `position.ts`, the module the page itself runs:
 *
 *   s   = outputScale(R)                 uniform, min of the two ratios
 *   pad = outputLetterbox(R)             centres the scaled reference frame
 *   T   = outputTranslate(res, pos)      the anchor translate, in reference px
 *
 *   X = pad.x + s·(T.x + rect.x)         W = s·rect.width
 *   Y = pad.y + s·(T.y + rect.y)         H = s·rect.height
 *
 * 🔴 The NAIVE form — normalizing by `resolution` alone — is wrong and must not
 * be reintroduced: it omits `s`, `pad` and `T`. design.md §6's worked example is
 * the regression test in `tests/livePlateOverlay.test.ts`: a 960×540 scene,
 * centred, on a 1440×1080 channel, hole at scene x=100 lands at raster x=435; the
 * naive form says 100. On a 16:9 raster every one of those terms collapses (s=1,
 * pad=(0,0)) and a wrong implementation returns the right answer, which is why the
 * test's table is mostly NON-16:9.
 *
 * ── SCENE PIXELS IN, RASTER PIXELS OUT — AND NOTHING ABOUT THE PANEL ────────
 *
 * The output is in the iframe's OWN coordinate space, because each rehearsal frame
 * is sized to the channel raster. Fitting that into the panel is the stage's
 * single FIT scale, applied to the overlay box by the same `frameBox` helper the
 * iframes use. This module never sees it, so it cannot invent a second one.
 */

/** One plate, placed on the rehearsal frame and joined to what the operator bound. */
export interface PlatePlacement {
  /**
   * The authoring element's id — a stable React key. `plateId` is NOT unique on
   * its own once two rehearsing rows carry the same template.
   */
  elementId: string;
  /**
   * The PLATE identifier the author declared (`guest-1`). It names a hole in this
   * template's layout and nothing outside it (design.md §2z).
   */
  plateId: string;
  /**
   * The operator-facing NAME of the source bound to this plate, or `null` when
   * nothing is bound.
   *
   * 🔴 The APPLIED binding, never a staged draft. A draft that has not been
   * applied still REFUSES the take (C-015's empty-mapping acceptance), so showing
   * it as bound would defeat the one question this overlay exists to answer.
   */
  sourceName: string | null;
  /** The plate's box in RASTER pixels — the rehearsal iframe's own space. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Place every plate a template declares onto the channel raster.
 *
 * `position` is the operator's APPLIED placement override (R-011) when the row has
 * one. Absent, the carried `defaultPosition` is used — the same
 * `override ?? authored default` fall-through the page performs, and the reason
 * `defaultPosition` rides the carrier at all: a bridge (or an overlay) that
 * assumed "centred" would compute a different origin from the page for every
 * template whose author set a position.
 */
export function platePlacements(
  live: TemplateLiveSources,
  raster: ChannelRaster,
  position: Position | undefined,
  sourceNameOf: (plateId: string) => string | null,
): PlatePlacement[] {
  const s = outputScale(raster);
  const pad = outputLetterbox(raster);
  const t = outputTranslate({ resolution: live.resolution }, position ?? live.defaultPosition);
  return live.sources.map((plate) => ({
    elementId: plate.elementId,
    plateId: plate.sourceId,
    sourceName: sourceNameOf(plate.sourceId),
    x: pad.x + s * (t.x + plate.rect.x),
    y: pad.y + s * (t.y + plate.rect.y),
    width: s * plate.rect.width,
    height: s * plate.rect.height,
  }));
}
