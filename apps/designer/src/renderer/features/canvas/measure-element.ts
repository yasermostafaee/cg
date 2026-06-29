/**
 * D-060 — measure an auto-sized text element's RENDERED box in scene px.
 *
 * An auto box (`fitMode: 'autosize'`) is sized by CSS intrinsic sizing inside the
 * `cgpreview` iframe, so `transform.size` is no longer authoritative. The selection
 * gizmo (and the auto→fixed one-shot commit, D-046 §E) read the rendered size from
 * here instead — DISPLAY-only; nothing is written back to the model on the render
 * path (per design §C; the one-shot commit is the single sanctioned exception).
 *
 * `offsetWidth`/`offsetHeight` are the element's border-box in its OWN coordinate
 * space — unaffected by the stage's CSS `transform` (zoom) AND by the element's own
 * `scale`/`rotate` — i.e. the LOCAL content box. That is exactly what the gizmo
 * composes `scale·rotate`-about-anchor onto (matching the renderer), so it stays
 * correct under non-uniform scale + rotation (B-022).
 */

export interface SceneSize {
  w: number;
  h: number;
}

type DocGetter = () => Document | null;

let getDoc: DocGetter | null = null;

/** CanvasArea registers a getter for the live preview iframe's document. */
export function registerPreviewDocument(fn: DocGetter | null): void {
  getDoc = fn;
}

/**
 * The local content box (scene px) of the element's rendered node, or `null` when
 * the preview isn't available / the node isn't found / it hasn't laid out yet.
 */
export function measureElementSceneSize(elementId: string): SceneSize | null {
  const doc = getDoc?.();
  if (doc == null) return null;
  const node = doc.querySelector<HTMLElement>(`[data-cg-element-id="${CSS.escape(elementId)}"]`);
  if (node == null) return null;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  if (w === 0 && h === 0) return null;
  return { w, h };
}

// A tiny version pub/sub so the gizmo RE-MEASURES after the iframe re-lays-out (a
// text/font edit streams to the iframe asynchronously; fonts swap in later). The
// gizmo subscribes via `useSyncExternalStore`; CanvasArea bumps after each scene
// stream (post-rAF) and on `document.fonts.ready`.
let version = 0;
const subscribers = new Set<() => void>();

export function bumpMeasureVersion(): void {
  version += 1;
  for (const cb of subscribers) cb();
}

export function subscribeMeasure(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getMeasureVersion(): number {
  return version;
}
