import {
  PositionAnchorSchema,
  resolveDefaultPosition,
  type Position,
  type Scene,
} from '@cg/shared-schema';

/**
 * R-011 — output-only stage placement ("author small, place anywhere").
 *
 * A small-canvas template is authored at its own `scene.resolution` and
 * placed on the OUTPUT frame at play-out time: the exported single-file
 * boot (the one page CasparCG loads — bridge-served `/template/<id>` and
 * the file-drop path alike) calls {@link applyOutputPosition} right after
 * `createRuntime`/`installCasparGlobals`. The Designer preview NEVER calls
 * it — the author keeps seeing the comp at its own resolution — so
 * positioning is output-only by construction (`installCasparGlobals`
 * itself is shared with the preview and is deliberately NOT the gate).
 *
 * Effective position = served-URL query override (the operator, appended
 * by the bridge) ?? `scene.defaultPosition` (the author) ?? CENTERED — a
 * freshly imported graphic never lands at (0,0).
 */

/**
 * R-030 — the REFERENCE frame every manifest offset and keyframe is authored
 * against. It is deliberately a CONSTANT and not the channel's raster: the
 * whole anchor calculation below stays expressed in reference pixels, and the
 * channel's real geometry is applied afterwards as ONE uniform scale
 * ({@link outputScale}).
 *
 * The name matters. This used to be called `OUTPUT_FRAME` while being
 * hardcoded 1920×1080, which made it a lie on any other channel: the anchor
 * maths computed against a frame the output did not have, so a 1920×1080 scene
 * overflowed a 720p channel (the C-018 recon worked around it with
 * `CG 1-10 INVOKE 0 "scrollTo(0,360)"`, a diagnostic trick that cannot be on
 * air). The output frame is now {@link resolveChannelRaster}; this is the
 * reference the author sees.
 *
 * REFLOW IS REJECTED, and the reason is recorded so it is not reproposed:
 * keyframes are authored in pixels and line-breaking/kerning are relative to
 * authored boxes, so reflowing makes on-air output non-deterministic and
 * breaks the preview-equals-air property the whole placement design exists to
 * preserve.
 */
export const REFERENCE_FRAME = { width: 1920, height: 1080 } as const;

/** A pixel raster — the reference frame, or a channel's real geometry. */
export interface Raster {
  width: number;
  height: number;
}

/** A `window`-shaped geometry source (the real `window`, or a test double). */
export interface RasterView {
  innerWidth: number;
  innerHeight: number;
}

/** Anchor → fractional handle on both axes (0 = start, 0.5 = middle, 1 = end). */
const ANCHOR_FRACTIONS: Record<Position['anchor'], { ax: number; ay: number }> = {
  'top-left': { ax: 0, ay: 0 },
  'top-center': { ax: 0.5, ay: 0 },
  'top-right': { ax: 1, ay: 0 },
  'mid-left': { ax: 0, ay: 0.5 },
  center: { ax: 0.5, ay: 0.5 },
  'mid-right': { ax: 1, ay: 0.5 },
  'bottom-left': { ax: 0, ay: 1 },
  'bottom-center': { ax: 0.5, ay: 1 },
  'bottom-right': { ax: 1, ay: 1 },
};

/**
 * Parse the operator override from the served URL's query
 * (`?pos=<anchor>&dx=<x>&dy=<y>`). `pos` must be one of the 9 anchor
 * tokens — anything else invalidates the WHOLE override (never a
 * half-applied position); `dx`/`dy` must be finite numbers, absent ⇒ 0.
 */
export function parsePositionQuery(search: string): Position | null {
  const params = new URLSearchParams(search);
  const pos = params.get('pos');
  if (pos === null) return null;
  const anchor = PositionAnchorSchema.safeParse(pos);
  if (!anchor.success) return null;
  const num = (v: string | null): number => {
    if (v === null || v.trim() === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    anchor: anchor.data,
    offset: { x: num(params.get('dx')), y: num(params.get('dy')) },
  };
}

/**
 * query override ?? scene.defaultPosition ?? centered (never 0,0).
 *
 * The tail of the chain is `resolveDefaultPosition` (`@cg/shared-schema`), never
 * a local `{ anchor: 'center' }` literal: the bridge records that same resolved
 * default on `TemplateInfo` at import so it can place a Live Source against the
 * origin the page uses, and two spellings of "centred" is how the composited box
 * comes to sit somewhere the hole is not (`live-source-multibox` design.md §6).
 */
export function resolveOutputPosition(scene: Scene, search: string): Position {
  return parsePositionQuery(search) ?? resolveDefaultPosition(scene);
}

/**
 * Where the scene-sized stage lands inside the output frame:
 * `stageX = ax*(ow−fw) + offset.x`, `stageY = ay*(oh−fh) + offset.y`.
 * A full-frame scene computes (0,0) — pixel-identical to the
 * pre-positioning output.
 */
export function outputTranslate(
  scene: Scene,
  position: Position,
  frame: Raster = REFERENCE_FRAME,
): { x: number; y: number } {
  const { ax, ay } = ANCHOR_FRACTIONS[position.anchor];
  return {
    x: ax * (frame.width - scene.resolution.width) + position.offset.x,
    y: ay * (frame.height - scene.resolution.height) + position.offset.y,
  };
}

/**
 * R-030 — parse the CHANNEL RASTER the bridge appends to the served URL
 * (`?cw=<width>&ch=<height>`).
 *
 * Both halves are required and both must be finite positive numbers: a raster
 * is a size, and half a size is not one. Anything else invalidates the WHOLE
 * pair (the `parsePositionQuery` rule, for the same reason — a half-applied
 * geometry would place graphics against a frame nobody declared) and the caller
 * falls through to the next source in {@link resolveChannelRaster}.
 */
export function parseChannelRasterQuery(search: string): Raster | null {
  const params = new URLSearchParams(search);
  const raw = { width: params.get('cw'), height: params.get('ch') };
  if (raw.width === null || raw.height === null) return null;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * R-030 — the channel's real output geometry, in the DECIDED source order:
 *
 *  1. the bridge-appended `?cw=&ch=` query — the configured channel raster,
 *     the only source that carries the operator's declared intent;
 *  2. the page's own `innerWidth`/`innerHeight` — what CasparCG's CEF actually
 *     sized the page to. Safe to consult HERE and only here, because this whole
 *     module is output-only by construction (the Designer preview never calls
 *     it), so reading the viewport can never leak into authoring;
 *  3. the {@link REFERENCE_FRAME} fallback — scale 1, today's behaviour.
 *
 * A view reporting a non-positive size is treated as no signal at all rather
 * than as a zero-sized channel: `scale = 0` would blank the output, which is
 * the worst possible reading of a missing measurement.
 */
export function resolveChannelRaster(search: string, view?: RasterView | null): Raster {
  const fromQuery = parseChannelRasterQuery(search);
  if (fromQuery !== null) return fromQuery;
  if (view != null && view.innerWidth > 0 && view.innerHeight > 0) {
    return { width: view.innerWidth, height: view.innerHeight };
  }
  return { width: REFERENCE_FRAME.width, height: REFERENCE_FRAME.height };
}

/**
 * R-030 — the ONE uniform scale that maps the reference frame onto the
 * channel's raster: `min(rasterW/refW, rasterH/refH)`.
 *
 * `min` (never a per-axis pair) is what makes this uniform, and uniform is what
 * keeps every anchor and offset calculation above correct UNCHANGED — the
 * reason scale was chosen over any coordinate rework. A non-16:9 raster
 * therefore LETTERBOXES rather than distorting: the smaller ratio wins and the
 * leftover is padding (see {@link outputLetterbox}).
 *
 * A 1920×1080 channel returns exactly 1 — the no-regression case.
 */
export function outputScale(raster: Raster, frame: Raster = REFERENCE_FRAME): number {
  return Math.min(raster.width / frame.width, raster.height / frame.height);
}

/**
 * The letterbox padding that centres the scaled reference frame in the raster.
 * Exactly `{ x: 0, y: 0 }` whenever the raster's aspect matches the reference
 * (every 16:9 channel, this plant throughout), so it costs the common case
 * nothing; on a 4:3 channel it is what puts the bars top-and-bottom instead of
 * pinning the picture to a corner.
 */
export function outputLetterbox(
  raster: Raster,
  frame: Raster = REFERENCE_FRAME,
): { x: number; y: number } {
  const scale = outputScale(raster, frame);
  return {
    x: (raster.width - frame.width * scale) / 2,
    y: (raster.height - frame.height * scale) / 2,
  };
}

/**
 * CSS number: at most 6 decimals, trailing zeros trimmed. Full float precision
 * would put `0.6666666666666666` in the transform; 6 decimals is a sub-
 * thousandth of a pixel across the whole 1920px frame, and keeps the emitted
 * declaration readable and assertable.
 */
function css(n: number): string {
  return String(Number(n.toFixed(6)));
}

export interface ApplyOutputPositionOptions {
  /** The page's `location.search` (the bridge-appended override). Default ''. */
  search?: string;
  /** Document override for tests. */
  doc?: Document;
  /**
   * Geometry source for step 2 of {@link resolveChannelRaster}. Defaults to the
   * real `window` when one exists. Tests pass an explicit view so the raster
   * under assertion is DECLARED rather than inherited from the test DOM's
   * incidental viewport.
   */
  view?: RasterView | null;
}

/**
 * Place the built stage on the output frame. The footprint stays
 * scene-resolution-sized — only translated — and the page (`html`/`body`)
 * is inline-resized to the CHANNEL RASTER, because the exported page's
 * static CSS sizes it to the SCENE resolution with `overflow:hidden`,
 * which would clip a translated stage.
 *
 * R-030 — the placement is computed in REFERENCE space and then mapped onto the
 * channel with one uniform scale, composed right-to-left as
 * `translate(letterbox) scale(s) translate(anchor)`:
 *
 *   - `translate(anchor)` is {@link outputTranslate}, in reference pixels and
 *     completely unchanged by this feature — that is the point of scaling;
 *   - `scale(s)` maps the whole reference frame onto the raster;
 *   - `translate(letterbox)` centres it when the aspect does not match.
 *
 * A 1920×1080 channel is BYTE-IDENTICAL to the pre-R-030 output, and
 * deliberately so rather than incidentally: `s` is exactly 1 and the letterbox
 * is exactly (0,0), and in that case the emitted declaration is the bare
 * `translate(Xpx, Ypx)` this function has always written, with
 * `transform-origin` left untouched. Emitting a redundant `scale(1)` would have
 * been harmless to render and a needless diff in the one output that must not
 * change; more importantly, `transform-origin` is only meaningful once a scale
 * is present, so the un-scaled path never acquires a property it does not need.
 */
export function applyOutputPosition(scene: Scene, options: ApplyOutputPositionOptions = {}): void {
  const doc = options.doc ?? document;
  const stage = doc.querySelector<HTMLElement>('.cg-stage');
  if (stage === null) return;
  // The raster is resolved BEFORE html/body are resized below. `innerWidth` is
  // a viewport measurement and so is not actually perturbed by sizing the
  // document element — but reading the geometry first means a second call
  // cannot observe this call's own mutation, which keeps the function
  // idempotent by construction rather than by luck.
  const view =
    options.view !== undefined
      ? options.view
      : typeof window === 'undefined'
        ? null
        : (window as RasterView);
  const raster = resolveChannelRaster(options.search ?? '', view);
  const scale = outputScale(raster);
  const pad = outputLetterbox(raster);
  const { x, y } = outputTranslate(scene, resolveOutputPosition(scene, options.search ?? ''));
  const anchor = `translate(${css(x)}px, ${css(y)}px)`;
  if (scale === 1 && pad.x === 0 && pad.y === 0) {
    stage.style.transform = anchor;
  } else {
    // `transform-origin: 0 0` is REQUIRED once a scale is in the chain: the CSS
    // default (50% 50%) would scale the stage about its own centre, which for
    // any scene smaller than the frame lands it somewhere nobody asked for.
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(${css(pad.x)}px, ${css(pad.y)}px) scale(${css(scale)}) ${anchor}`;
  }
  for (const el of [doc.documentElement, doc.body]) {
    el.style.width = `${css(raster.width)}px`;
    el.style.height = `${css(raster.height)}px`;
  }
}
