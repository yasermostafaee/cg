import { PositionAnchorSchema, type Position, type Scene } from '@cg/shared-schema';

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
 * The reference output frame manifest offsets are authored in. Non-1080
 * channels are documented future work (the page gets no channel-geometry
 * signal; plumbing the real channel size into the query is the follow-up).
 */
export const OUTPUT_FRAME = { width: 1920, height: 1080 } as const;

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

/** query override ?? scene.defaultPosition ?? centered (never 0,0). */
export function resolveOutputPosition(scene: Scene, search: string): Position {
  return (
    parsePositionQuery(search) ??
    scene.defaultPosition ?? { anchor: 'center', offset: { x: 0, y: 0 } }
  );
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
  frame: { width: number; height: number } = OUTPUT_FRAME,
): { x: number; y: number } {
  const { ax, ay } = ANCHOR_FRACTIONS[position.anchor];
  return {
    x: ax * (frame.width - scene.resolution.width) + position.offset.x,
    y: ay * (frame.height - scene.resolution.height) + position.offset.y,
  };
}

export interface ApplyOutputPositionOptions {
  /** The page's `location.search` (the bridge-appended override). Default ''. */
  search?: string;
  /** Document override for tests. */
  doc?: Document;
}

/**
 * Place the built stage on the output frame. The footprint stays
 * scene-resolution-sized — only translated — and the page (`html`/`body`)
 * is inline-resized to the output frame, because the exported page's
 * static CSS sizes it to the SCENE resolution with `overflow:hidden`,
 * which would clip a translated stage.
 */
export function applyOutputPosition(scene: Scene, options: ApplyOutputPositionOptions = {}): void {
  const doc = options.doc ?? document;
  const stage = doc.querySelector<HTMLElement>('.cg-stage');
  if (stage === null) return;
  const { x, y } = outputTranslate(scene, resolveOutputPosition(scene, options.search ?? ''));
  stage.style.transform = `translate(${String(x)}px, ${String(y)}px)`;
  for (const el of [doc.documentElement, doc.body]) {
    el.style.width = `${String(OUTPUT_FRAME.width)}px`;
    el.style.height = `${String(OUTPUT_FRAME.height)}px`;
  }
}
