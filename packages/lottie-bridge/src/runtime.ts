// D-125 — the `lottie_light` build (not the full `lottie-web`): it drops the After
// Effects expression evaluator and therefore all `eval(` / `new Function`, which is
// the real on-hardware blocker under CasparCG's CEF loaded from `file://` (and the
// single-file export's `script-src 'unsafe-inline'` CSP with no `'unsafe-eval'`
// forbids it too). The importer already rejects expressions, so the evaluator is
// dead weight. Same SVG renderer, same `AnimationItem` surface.
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';

/**
 * Subset of the LottieElement.loopMode enum from `@cg/shared-schema`.
 * Kept local so this package doesn't pull the full schema at runtime.
 */
export type LottieLoopMode = 'none' | 'loop' | 'bounce';

export interface LottiePlayerOptions {
  /** Playback speed multiplier (default 1.0). */
  speed?: number;
  /** Default `'loop'`. `'bounce'` toggles direction on each complete. */
  loopMode?: LottieLoopMode;
  /** Optional [in, out] frame range to play within. */
  segment?: readonly [number, number];
  /** Auto-play on creation. Default `false` — caller drives `play()`. */
  autoplay?: boolean;
}

/**
 * The handle returned by `createLottiePlayer`. Lifecycle methods are
 * idempotent — calling `destroy()` more than once is safe.
 */
export interface LottiePlayerHandle {
  readonly element: HTMLElement;
  play(): void;
  pause(): void;
  stop(): void;
  destroy(): void;
  goToFrame(frame: number): void;
  /**
   * D-125 Phase 3c — apply a `lottie-override` field value onto a NAMED top-level
   * layer of the mounted animation. The v1 grammar (fixed by design §6/D8 — "text /
   * colour; image if cheap", and image is not cheap):
   *
   *  - `prop: 'text'`   — replace a text layer's document text via lottie-web's own
   *    `updateDocumentData` (the official dynamic-text API — the layer re-renders with
   *    the new string; no keyframe is touched).
   *  - `prop: 'fill' | 'stroke'` — recolour the layer's fills/strokes TWICE over:
   *    the rendered `fill`/`stroke` attributes (immediate, visible even while the
   *    driver holds a frozen frame) AND the built style-data values (`itemData.c.v`)
   *    those attributes are re-stamped FROM — lottie re-runs every static
   *    renderFill/renderStroke with `isFirstFrame` when a layer transitions
   *    hidden→shown (a fade-in entrance under `hideOnTransparent`, a replay, an
   *    idle-loop wrap), so a DOM-only patch would be silently wiped there. An
   *    ANIMATED colour recomputes its value from its own keyframes every rendered
   *    frame and wins — that property belongs to the clip; while frames are frozen
   *    the patch shows until the next render. Gradients (`gf`/`gs`) carry no `c`
   *    and are not overridable. This is the OPACITY boundary: overrides substitute
   *    static authored values (like a text binding replacing authored text); they
   *    never convert, re-time, or edit internal keyframes.
   *
   *    A named TOP-LEVEL precomp layer recolours its whole rendered subtree — the
   *    named layer is the addressing unit; picking it is the designer's call.
   *
   * Addressing is by layer `nm`, TOP-LEVEL layers only (precomp internals are not
   * addressable — they are the clip's own business). Returns whether anything was
   * actually patched (a DOM attribute, a style-data value, or a text document): a
   * missing/mistyped layer, a not-yet-built lazy layer, an unknown prop, or a layer
   * whose subtree simply carries no such paint is a graceful `false`, never a throw —
   * the binding path re-applies on every `update()` and on play, so a late-building
   * layer picks the value up then.
   *
   * A text apply forces one repaint of the CURRENT frame: `updateDocumentData` only
   * marks the text dirty and the rebuild happens inside a renderer pass — with the
   * driver frozen on a hold there IS no next pass, so the primary broadcast case
   * (retitle the lower third mid-hold) would otherwise show the old text until the
   * outro's first frame.
   */
  applyOverride(layer: string, prop: string, value: string): boolean;
  /** True while a Lottie animation is loaded and not destroyed. */
  readonly isAlive: boolean;
}

/**
 * The slice of lottie-web's SVG renderer internals {@link LottiePlayerHandle.applyOverride}
 * touches, typed defensively — there is no public API for either operation, so every
 * access is optional and a shape mismatch degrades to "not applied" rather than a throw.
 */
interface RendererElementLike {
  data?: { nm?: unknown };
  updateDocumentData?: (data: Record<string, unknown>, index?: number) => void;
  layerElement?: unknown;
}

function rendererElements(anim: AnimationItem): readonly RendererElementLike[] {
  const renderer = (anim as unknown as { renderer?: { elements?: unknown } }).renderer;
  const els = renderer?.elements;
  return Array.isArray(els) ? (els as RendererElementLike[]) : [];
}

/** `#rgb` / `#rrggbb` / `rgb(a)(…)` → [r, g, b] 0–255, or null (named colours etc.). */
function parseCssColor(value: string): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex !== null) {
    const h = hex[1] ?? '';
    const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (rgb !== null) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/**
 * Patch the BUILT style-data colour (`itemData.c.v`, 0–255 per channel) for every
 * fill (or stroke) in a shape element's `itemsData` tree. This is the value lottie's
 * own static re-stamp reads on a hidden→shown transition (`isFirstFrame` re-runs
 * renderFill/renderStroke), so the override survives fade-in entrances, replays, and
 * idle-loop wraps — a DOM-only patch is wiped there. A stroke's item-data carries a
 * width property (`w`); a fill's does not — that is the discriminator. Gradients have
 * no `c` and fall through untouched. Defensive: any shape mismatch is a no-hit.
 */
function patchStyleDataColor(
  el: RendererElementLike,
  prop: string,
  rgb: readonly number[],
): boolean {
  const items = (el as { itemsData?: unknown }).itemsData;
  if (!Array.isArray(items)) return false;
  const wantStroke = prop === 'stroke';
  const visit = (list: readonly unknown[]): boolean => {
    let hit = false;
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const it = item as { c?: { v?: unknown }; w?: unknown; it?: unknown; style?: unknown };
      if (Array.isArray(it.it)) hit = visit(it.it) || hit;
      const isStroke = it.w !== undefined;
      if (it.style === undefined || isStroke !== wantStroke) continue;
      const v = it.c?.v;
      if (Array.isArray(v) && v.length >= 3) {
        v[0] = rgb[0];
        v[1] = rgb[1];
        v[2] = rgb[2];
        hit = true;
      }
    }
    return hit;
  };
  return visit(items);
}

/**
 * Render a Lottie animation into `container`. `data` is the parsed JSON
 * exported from Bodymovin/After Effects (or a path-loaded URL — see
 * `path` overload below).
 *
 * Notes / constraints:
 *  - Renderer is fixed to `'svg'` for now. Canvas/HTML renderers are
 *    deferred until we have a real use case for them.
 *  - `bounce` is implemented locally (lottie-web has no built-in toggle).
 *  - Field overrides (text / colour replacement at runtime) go through
 *    {@link LottiePlayerHandle.applyOverride} (D-125 Phase 3c).
 */
export function createLottiePlayer(
  container: HTMLElement,
  data: unknown,
  options: LottiePlayerOptions = {},
): LottiePlayerHandle {
  const loopMode = options.loopMode ?? 'loop';
  const autoplay = options.autoplay ?? false;

  const anim: AnimationItem = lottie.loadAnimation({
    container,
    renderer: 'svg',
    // lottie-web treats `loop: true` as infinite; `'bounce'` we manage manually.
    loop: loopMode === 'loop',
    autoplay,
    animationData: data,
  });

  if (options.speed !== undefined) anim.setSpeed(options.speed);

  if (options.segment) {
    // Reset to the segment range. `playSegments(_, true)` forces the player
    // to restrict its in/out points; we set autoplay=false above so this
    // doesn't actually start playback.
    anim.playSegments([options.segment[0], options.segment[1]], true);
    if (!autoplay) anim.pause();
  }

  let bounceListener: (() => void) | null = null;
  if (loopMode === 'bounce') {
    bounceListener = () => {
      anim.setDirection(anim.playDirection === 1 ? -1 : 1);
      anim.play();
    };
    anim.addEventListener('complete', bounceListener);
  }

  let destroyed = false;

  return {
    element: container,
    play() {
      if (destroyed) return;
      anim.play();
    },
    pause() {
      if (destroyed) return;
      anim.pause();
    },
    stop() {
      if (destroyed) return;
      anim.stop();
    },
    goToFrame(frame: number) {
      if (destroyed) return;
      anim.goToAndStop(frame, true);
    },
    applyOverride(layer: string, prop: string, value: string): boolean {
      if (destroyed) return false;
      let applied = false;
      let textApplied = false;
      for (const el of rendererElements(anim)) {
        // Lazily-built layers (not yet in range) sit as holes in `elements` — skip;
        // the binding path re-applies on the next update()/play once they exist.
        if (el === null || el === undefined || el.data?.nm !== layer) continue;
        if (prop === 'text') {
          if (typeof el.updateDocumentData === 'function') {
            // Merge-update the first text document keyframe — lottie-web's dynamic-text
            // seam. Only `t` (the string) is overridden; font/size/fill stay authored.
            el.updateDocumentData({ t: value }, 0);
            applied = true;
            textApplied = true;
          }
          continue;
        }
        if ((prop === 'fill' || prop === 'stroke') && el.layerElement instanceof Element) {
          // Patch only nodes that CARRY the attribute (and not 'none') so authored
          // holes stay holes; an animated colour recomputes from its keyframes on the
          // next rendered frame and wins — static authored values are the surface.
          for (const node of Array.from(el.layerElement.querySelectorAll(`[${prop}]`))) {
            const current = node.getAttribute(prop);
            if (current !== null && current !== 'none') {
              node.setAttribute(prop, value);
              applied = true;
            }
          }
          // …and the BUILT style data those attributes are re-stamped from on a
          // hidden→shown transition, so the override survives lottie's own
          // isFirstFrame re-stamp (fade-in entrance, replay, idle-loop wrap).
          const rgb = parseCssColor(value);
          if (rgb !== null) applied = patchStyleDataColor(el, prop, rgb) || applied;
        }
      }
      if (textApplied) {
        // `updateDocumentData` only marks the text dirty; the DOM rebuild happens in a
        // renderer pass. With the driver FROZEN on a hold there is no next pass, so
        // force one repaint of the current frame (invalidate the renderer's
        // same-frame early-return first). A playing leg repaints next tick anyway —
        // the extra same-frame paint is harmless; the playhead value never moves.
        const a = anim as unknown as {
          renderer?: { renderedFrame?: number };
          currentFrame?: number;
        };
        if (a.renderer !== undefined) a.renderer.renderedFrame = -1;
        anim.goToAndStop(typeof a.currentFrame === 'number' ? a.currentFrame : 0, true);
      }
      return applied;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (bounceListener) {
        anim.removeEventListener('complete', bounceListener);
        bounceListener = null;
      }
      anim.destroy();
    },
    get isAlive() {
      return !destroyed;
    },
  };
}
