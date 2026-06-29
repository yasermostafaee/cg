import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScanSearch, ZoomIn, ZoomOut } from 'lucide-react';
import type { Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import {
  getAll as assetUrlGetAll,
  subscribe as assetUrlSubscribe,
} from '../assets/assetUrlCache.js';
import {
  getAll as sharedUrlGetAll,
  subscribe as sharedUrlSubscribe,
  prime as primeSharedImage,
  primeAll as primeAllSharedImages,
} from '../sharedLibrary/sharedImageUrlCache.js';
import { ARROW_CURSOR, CanvasOverlay } from './CanvasOverlay.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { PreviewHost } from './PreviewHost.js';
import {
  clampZoom as clampZoomPure,
  coverZoom,
  fitZoom,
  pasteboardLayout,
  screenToScene,
  zoomAnchorScroll,
} from './geometry.js';
import { needsFit, markFitted, frameCenterScroll, type FitGate } from './fit-on-open.js';
import { registerPreviewDocument, bumpMeasureVersion } from './measure-element.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './CanvasArea.css.js';
import {
  designerStore,
  shallowEqual,
  useDesignerSelector,
  type DesignerTool,
} from '../../state/store.js';

interface Props {
  scene: Scene | null;
  /**
   * The active composition's id — the fit-on-open identity (B-035). `scene.id` is the
   * PROJECT id (stable across composition switches), so a same-resolution comp switch
   * must re-fit keyed on this, not on `scene.id`.
   */
  activeCompositionId: string | null;
  tool: DesignerTool;
  selection: ReadonlySet<string>;
  /**
   * When non-null, the canvas overlays an inline text editor for that
   * element and the iframe hides the static text node so the operator
   * doesn't see both at once (previously the iframe rendered the
   * original text underneath the editor).
   */
  editingTextId: string | null;
  bindModeFieldId: string | null;
  /**
   * Render the shape tools inline at the left of the canvas header
   * (D-008). The caller passes `true` from the Studio layout so the
   * single header row reads:  [tools] ……… [zoom controls].
   */
  showToolbar?: boolean;
}

// B-027 — the minimum zoom is DYNAMIC (the cover-fit of the pasteboard over the viewport,
// `coverZoom` × `dynamicZoomMin` below), so a full zoom-out always leaves the pasteboard
// COVERING the viewport (no empty surround) — one axis may overflow and scroll. `ZOOM_HARD_MIN`
// is only an absolute safety floor for the unmeasured/degenerate case (the cover-fit governs
// in every normal case, and is always well above this).
const ZOOM_HARD_MIN = 0.02;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.1; // multiplicative step per click / wheel notch
const ZOOM_DEFAULT = 0.5;

/**
 * D-040 — the assetId → blob URL map posted to the preview iframe, merged across
 * the per-project asset cache AND the shared image library cache so a
 * `source: 'shared'` logo renders alongside project images. The two stores have
 * disjoint uuid id-spaces, so the merge is unambiguous.
 */
function mergedAssetUrls(): Record<string, string> {
  return { ...assetUrlGetAll(), ...sharedUrlGetAll() };
}

/** Every image element's assetId in a scene (main + comps, recursing containers). */
function collectSceneImageIds(scene: Scene): string[] {
  const ids = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'image') ids.add(el.assetId);
      else if (el.type === 'container') walk(el.children);
    }
  };
  for (const layer of scene.layers) walk(layer.children);
  for (const comp of scene.compositions ?? [])
    for (const layer of comp.layers) walk(layer.children);
  return [...ids];
}

/**
 * Canvas work area with the cgpreview iframe + transparent input
 * overlay. D-007 added:
 *   - zoom in / out / fit / reset buttons in the header
 *   - Ctrl+wheel over the canvas zooms (clamped 10..400%)
 *   - plain wheel scrolls the inner container (overflow: auto)
 *   - hand-tool drag pans the inner container (scrollLeft/Top)
 */
export function CanvasArea({
  scene,
  activeCompositionId,
  tool,
  selection,
  editingTextId,
  bindModeFieldId,
  showToolbar = false,
}: Props): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);
  // Live mirror of `zoom` so the (once-bound) wheel listener + the zoom helpers read
  // the current value without re-subscribing.
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;
  // A cursor-anchored zoom stashes the scene point under the pointer here; a layout
  // effect (post-zoom, pre-paint) consumes it to scroll the point back under the cursor.
  const pendingZoomAnchorRef = useRef<{
    px: number;
    py: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const { rulerVisible, guides, snapGuides, currentFrame } = useDesignerSelector(
    (s) => ({
      rulerVisible: s.rulerVisible,
      guides: s.guides,
      snapGuides: s.snapGuides,
      currentFrame: s.currentFrame,
    }),
    shallowEqual,
  );
  // Screen offset (within the scroll viewport) of the scene's (0,0), so the
  // pinned rulers and the guide lines stay aligned with the canvas as it
  // zooms / scrolls / resizes.
  const [rulerOrigin, setRulerOrigin] = useState<{ x: number; y: number } | null>(null);
  // Visible viewport size, so the rulers can tick across the whole dark area
  // (including negative scene coords and past the canvas edges), not just 0..w.
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // D-072 — the persistent ruler guide whose coordinate badge is shown: the HOVERED
  // guide, or (winning) the one being dragged. Transient view state (not in the store).
  // `guideDraggingRef` keeps the badge through a drag even when the window-level
  // pointer-move takes the pointer off the thin strip (so `onPointerLeave` must no-op).
  const [activeGuide, setActiveGuide] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
  const guideDraggingRef = useRef(false);

  // Only rebuild the iframe document when the *scene id* changes
  // (e.g. project switch). For mutations within the same scene we
  // send a 'scene-replace' postMessage so the iframe rebuilds the
  // runtime in-place without a full document reload — otherwise the
  // canvas flashes every drag-tick at 60 Hz.
  //
  // The latest scene is captured via a ref so the srcDoc effect can
  // pass it to preview.load() without depending on `scene` (which
  // changes on every mutation).
  const latestSceneRef = useRef<Scene | null>(scene);
  latestSceneRef.current = scene;
  const sceneId = scene?.id ?? null;

  // B-027 — the FIXED pasteboard: extent + frame offset are a pure function of the
  // resolution (a one-frame margin on every side → 3× the frame width × 3× the height), NOT
  // content-grown. So dragging a shape off-frame moves nothing but the shape, and the
  // frame never drifts (the old grow-to-fit origin shift was the jitter source).
  const layout = useMemo(
    () => (scene === null ? null : pasteboardLayout(scene.resolution)),
    [scene?.resolution.width, scene?.resolution.height],
  );
  const frameOffset = layout?.frame ?? { x: 0, y: 0 };
  const extent = { width: layout?.width ?? 0, height: layout?.height ?? 0 };
  // Latest (constant-per-resolution) offset for the deps-limited load + scene-replace effects.
  const frameOffsetRef = useRef(frameOffset);
  frameOffsetRef.current = frameOffset;

  // B-027 — the DYNAMIC minimum zoom: the cover-fit of the pasteboard over the current
  // viewport (the MAX of the two axis ratios), so a full zoom-out always leaves the
  // pasteboard COVERING the viewport — no empty surround ever shows (one axis may overflow
  // and scroll). Recomputes whenever the viewport size (ResizeObserver → `viewport`) or the
  // resolution (→ `extent`) changes. Falls back to the absolute hard floor before the
  // viewport is measured. `clampZoom` binds the pure clamp to this floor + `ZOOM_MAX`, so
  // EVERY zoom path (buttons, Ctrl+wheel, Fit) is bounded by it — Fit can only be clamped
  // UP to it, never below (fitting the frame is always more zoomed-in than covering the 3×3
  // pasteboard, so in normal cases there is no conflict).
  const dynamicZoomMin = useMemo(
    () => Math.max(ZOOM_HARD_MIN, coverZoom(viewport.w, viewport.h, extent.width, extent.height)),
    [viewport.w, viewport.h, extent.width, extent.height],
  );
  const clampZoom = (z: number): number => clampZoomPure(z, dynamicZoomMin, ZOOM_MAX, ZOOM_DEFAULT);
  useEffect(() => {
    const current = latestSceneRef.current;
    if (current === null) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    // D-071 Phase B — the canvas iframe renders in AUTHORING mode (off-frame
    // pasteboard: clip lifted). Its element size (the pasteboard extent) is set by
    // CanvasArea + a `device-width` viewport; `frameOffset` insets the frame into the
    // SYMMETRIC pasteboard so off-frame content shows on every side (left/top too) and
    // scene (0,0) matches the overlay. The broadcast modal + exports omit `authoring`
    // (native clip — UNCHANGED).
    // The load-time offset is the baked FALLBACK for the `.cg-stage` CSS var; the live
    // value then rides each scene-replace (below). Use the content-aware offset so the
    // first paint already insets the frame correctly for off-frame content.
    const offset = frameOffsetRef.current;
    void window.cg.preview
      .load({ scene: current, authoring: true, frameOffset: offset })
      .then((res) => {
        if (cancelled) return;
        setHtml(res.html);
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // Stream live scene updates to the existing iframe via postMessage,
  // rAF-throttled so we never queue more than one rebuild per frame.
  const pendingSceneRef = useRef<Scene | null>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (scene === null) return;
    // The srcDoc effect (above) handles the initial load on
    // scene-id change; suppress until the iframe is loaded.
    pendingSceneRef.current = scene;
    if (rafRef.current !== 0) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const sceneToSend = pendingSceneRef.current;
      pendingSceneRef.current = null;
      if (sceneToSend === null) return;
      iframeRef.current?.contentWindow?.postMessage(
        {
          kind: 'cg-preview',
          action: 'scene-replace',
          scene: sceneToSend,
          assetUrls: mergedAssetUrls(),
          // D-071 — the content-grown frame inset travels with the scene so the iframe
          // re-insets `.cg-stage` (CSS var) without a reload.
          frameOffset: frameOffsetRef.current,
        },
        '*',
      );
      // D-060 — after the iframe re-lays-out (a frame later), re-measure auto-sized
      // text so the selection gizmo stays glued to the content box.
      requestAnimationFrame(() => bumpMeasureVersion());
    });
    return () => {
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [scene]);

  // D-011 / D-040 — push a fresh asset URL map to the iframe whenever a newly
  // resolved project asset OR shared-library image lands, so a freshly-dropped
  // picture or logo appears without waiting for the next scene mutation.
  useEffect(() => {
    function repost(): void {
      iframeRef.current?.contentWindow?.postMessage(
        { kind: 'cg-preview', action: 'asset-urls', assetUrls: mergedAssetUrls() },
        '*',
      );
    }
    const offAssets = assetUrlSubscribe(repost);
    const offShared = sharedUrlSubscribe(repost);
    return () => {
      offAssets();
      offShared();
    };
  }, []);

  // D-040 — prime the shared library's blob URLs (project-independent, so once
  // on mount) and keep priming as images are added, so logos render in the
  // canvas even before the Shared Library panel is opened.
  useEffect(() => {
    void primeAllSharedImages();
    return window.cg.sharedImages.onImported((image) => {
      void primeSharedImage(image);
    });
  }, []);

  // D-040 — surface a one-time warning when a logo (or image) reference resolves
  // in NEITHER store (truly missing, not merely un-primed: the bridge `url`
  // calls read the stores directly). The iframe renders a visible placeholder;
  // this tells the operator why. Keyed on the set of image ids, not the scene
  // object, so a drag doesn't re-check every frame.
  const warnedMissingRef = useRef<Set<string>>(new Set());
  const imageIdsKey = useMemo(
    () => (scene === null ? '' : collectSceneImageIds(scene).sort().join(',')),
    [scene],
  );
  useEffect(() => {
    const current = latestSceneRef.current;
    if (current === null) return;
    let cancelled = false;
    void (async () => {
      for (const id of collectSceneImageIds(current)) {
        if (warnedMissingRef.current.has(id)) continue;
        const [proj, shared] = await Promise.all([
          window.cg.assets.url(id),
          window.cg.sharedImages.url(id),
        ]);
        if (cancelled) return;
        if (proj === null && shared === null) {
          warnedMissingRef.current.add(id);
          designerStore.showNotice(
            'A logo references an image that is no longer available — showing a placeholder. Re-point it from the inspector or re-add it to the Shared Library.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageIdsKey]);

  // Mirror the inline TextEditor's open/close state into the iframe
  // so the iframe can hide its rendered text node while the operator
  // is editing — otherwise the runtime's text sits underneath the
  // editor and the operator sees two overlapping copies.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { kind: 'cg-preview', action: 'editing-text', elementId: editingTextId },
      '*',
    );
  }, [editingTextId]);

  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as
        | { kind?: string; sceneId?: string; label?: string; payload?: string }
        | undefined;
      if (msg?.kind === 'cg-preview-ready') {
        const cw = iframeRef.current?.contentWindow;
        if (cw === undefined || cw === null) return;
        cw.postMessage({ kind: 'cg-preview', action: 'scrub', frame: currentFrame }, '*');
        cw.postMessage(
          { kind: 'cg-preview', action: 'editing-text', elementId: editingTextId },
          '*',
        );
        // The iframe's inline `applyScene` initialises with an empty
        // assetUrls map (the parent has no way to inline blob URLs
        // into srcDoc). Push the current map as soon as the iframe
        // confirms readiness — otherwise images decoded by the
        // asset-URL `notify()` callback are silently dropped when the
        // iframe's message listener isn't registered yet, leaving the
        // canvas with broken-image icons until the next scene
        // mutation. See the project-re-open regression.
        cw.postMessage(
          { kind: 'cg-preview', action: 'asset-urls', assetUrls: mergedAssetUrls() },
          '*',
        );
        // D-060 — the preview is up: re-measure auto text now, and again once the
        // bundled/imported webfonts finish loading (they change the hug size).
        requestAnimationFrame(() => bumpMeasureVersion());
        void iframeRef.current?.contentDocument?.fonts?.ready?.then(() => bumpMeasureVersion());
      }
      if (msg?.kind === 'cg-preview-error') {
        console.error('[cg-preview]', msg.label, msg.payload);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [currentFrame, editingTextId]);

  // D-060 — expose the live preview document so the selection gizmo (and the
  // auto→fixed one-shot size commit) can measure an auto-sized text box's rendered
  // content box. Display-only; nothing is written back on the render path.
  useEffect(() => {
    registerPreviewDocument(() => iframeRef.current?.contentDocument ?? null);
    return () => registerPreviewDocument(null);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      // D-071 — the offset is CURRENT-FRAME derived (Q2), so an animated shape that flies
      // off-frame shifts it as the playhead moves; carry it on the scrub message too so the
      // iframe `.cg-stage` inset stays aligned during scrub (not only on scene edits).
      {
        kind: 'cg-preview',
        action: 'scrub',
        frame: currentFrame,
        frameOffset: frameOffsetRef.current,
      },
      '*',
    );
  }, [currentFrame]);

  // Zoom by `factor`, keeping the scene point under (clientX, clientY) pinned there —
  // so Ctrl+wheel zooms toward the CURSOR and the +/−/1× buttons toward the viewport
  // centre (instead of growing from the stage's top-left corner). Capture the scene
  // point pre-zoom and stash it; the scroll correction is applied in a LAYOUT effect
  // (below) — synchronously after the stage relays out but BEFORE paint, so the canvas
  // never flashes the resized-but-unscrolled frame (that one-frame gap was the "jump").
  function zoomAt(factor: number, clientX: number, clientY: number): void {
    const el = outerRef.current;
    const stage = stageRef.current;
    const oldZoom = zoomRef.current;
    const newZoom = clampZoom(oldZoom * factor);
    if (newZoom === oldZoom) return;
    if (el === null || stage === null) {
      setZoom(newZoom);
      return;
    }
    const srect = stage.getBoundingClientRect();
    pendingZoomAnchorRef.current = {
      px: (clientX - srect.left) / oldZoom,
      py: (clientY - srect.top) / oldZoom,
      clientX,
      clientY,
    };
    setZoom(newZoom);
  }
  // Buttons have no pointer position — anchor on the viewport centre.
  function zoomAtCenter(factor: number): void {
    const el = outerRef.current;
    if (el === null) {
      setZoom((z) => clampZoom(z * factor));
      return;
    }
    const r = el.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  // Apply a cursor-anchored zoom's scroll correction SYNCHRONOUSLY after the zoom
  // relayout but before paint, so the canvas point under the cursor stays put (no jump).
  // Runs on every `zoom` change but no-ops unless a zoom gesture stashed an anchor
  // (so the fit/center path, which has no anchor, is untouched).
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current;
    if (anchor === null) return;
    pendingZoomAnchorRef.current = null;
    const el = outerRef.current;
    const stage = stageRef.current;
    if (el === null || stage === null) return;
    const r = stage.getBoundingClientRect();
    el.scrollLeft = zoomAnchorScroll(el.scrollLeft, r.left, anchor.px, zoom, anchor.clientX);
    el.scrollTop = zoomAnchorScroll(el.scrollTop, r.top, anchor.py, zoom, anchor.clientY);
  }, [zoom]);

  // B-027 — when the dynamic minimum RISES (the window grew, or the resolution shrank the
  // extent relative to the viewport) while the user was zoomed at/below the old floor, clamp
  // the CURRENT zoom UP to the new minimum so the empty surround never appears. Fit always
  // lands ≥ this floor, so it is a no-op on the fit path.
  useEffect(() => {
    setZoom((z) => (z < dynamicZoomMin ? dynamicZoomMin : z));
  }, [dynamicZoomMin]);

  // B-027 — the origin-shift scroll compensation (Seam 2) is GONE: the frame offset is
  // now constant per resolution, so scene (0,0) never moves on a drag/scrub and there is
  // nothing to compensate. Removing it (and the per-move extent recompute) is what kills
  // the during-drag jitter by construction.

  // Ctrl + wheel over the canvas zooms toward the cursor; plain wheel keeps the default
  // overflow:auto scroll. A non-passive listener so we can preventDefault on the
  // Ctrl-wheel and not trigger the browser's page-zoom or page-scroll.
  useEffect(() => {
    const el = outerRef.current;
    if (el === null) return;
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey) return; // let native scroll happen
      e.preventDefault();
      zoomAtRef.current(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // B-035 — fit-on-open is keyed on the active COMPOSITION, not `sceneId`: `scene.id`
  // is the PROJECT id (editSceneOf spreads the root scene), so it is stable across a
  // composition switch — keying on it would miss a same-resolution comp switch (and
  // the bug shows on child comps too). `activeCompositionId` changes on BOTH a project
  // switch and a comp switch, so it is the right fit identity.
  const fitKey = activeCompositionId ?? sceneId;
  // Marked fitted only AFTER centering actually applies (in the centering layout-effect
  // below), so a zoom that succeeds but whose center hasn't run does NOT consume the
  // one fit (B-035 Bug A). Comparing to `fitKey` resets on a switch and blocks double-fit.
  const fitGateRef = useRef<FitGate>({ fittedKey: null });
  // Bumped by every fit request; the centering layout-effect keys on it so centering
  // ALWAYS runs after the zoom commit + layout — even when the zoom value is unchanged
  // (manual Fit at the current zoom).
  const [centerNonce, setCenterNonce] = useState(0);

  // The fit zoom for the current viewport + scene, or null when the viewport isn't
  // measured yet (`fitZoom` → null on a zero-size viewport) so the caller retries.
  function computeFitZoom(): number | null {
    const el = outerRef.current;
    const s = latestSceneRef.current;
    if (el === null || s === null) return null;
    const margin = 16;
    const z = fitZoom(
      el.clientWidth,
      el.clientHeight,
      s.resolution.width,
      s.resolution.height,
      margin,
    );
    return z === null ? null : clampZoom(z);
  }

  // Apply the fit zoom + request a (re)center. Does NOT mark the gate — the centering
  // effect does, once it applies — so an unmeasured viewport (null) is retried by the
  // cold effect and a center that hasn't run can't be skipped.
  function applyFit(): void {
    const cz = computeFitZoom();
    if (cz === null) return;
    setZoom(cz);
    setCenterNonce((n) => n + 1);
  }

  // Fit-on-open: fire once per composition (the warm + cold paths share the gate).
  function fitOnOpenIfReady(): void {
    if (!needsFit(fitGateRef.current, fitKey)) return;
    applyFit();
  }

  // Manual Fit (header button): always re-fit + re-center, even if already fitted and
  // even when the zoom doesn't change.
  function manualFit(): void {
    applyFit();
  }

  // WARM path — synchronous before paint, so when the viewport is already measured at
  // the composition tick the first frame is at the fit zoom (no flash).
  useLayoutEffect(() => {
    fitOnOpenIfReady();
  }, [fitKey, scene?.resolution.width, scene?.resolution.height]);

  // COLD-OPEN fallback — the viewport's real size arrives after the scene loads (the
  // ResizeObserver `measure()` sets `viewport`). Retrying on `viewport.w/h` fits once
  // the size is known; the gate guard no-ops it after the warm path already fit.
  useEffect(() => {
    fitOnOpenIfReady();
  }, [fitKey, scene?.resolution.width, scene?.resolution.height, viewport.w, viewport.h]);

  // CENTERING (B-035 fix) — runs AFTER the zoom is committed + the stage laid out (a
  // layout-effect, NOT a one-off rAF), keyed on `centerNonce` (bumped by every fit
  // request). The scroll target is derived ARITHMETICALLY from the frame's known
  // position in the pasteboard (`frameOffset` + resolution, × zoom) plus the stage's
  // content-space offset (the scroll container's padding, read once from the settled
  // computed style) — NOT a transitional getBoundingClientRect / live scrollLeft — so a
  // warm switch (reloading iframe, stale prior scroll) cannot land it in a corner. The
  // gate is marked fitted HERE, after the scroll applies, so a fit isn't consumed until
  // centering actually happened.
  useLayoutEffect(() => {
    if (centerNonce === 0) return; // no fit requested yet
    const el = outerRef.current;
    const stage = stageRef.current;
    const sc = latestSceneRef.current;
    if (el === null || stage === null || sc === null) return; // not laid out → retry on next request
    const frame = frameOffsetRef.current;
    const cs = getComputedStyle(el);
    const padX = Number.parseFloat(cs.paddingLeft) || 0;
    const padY = Number.parseFloat(cs.paddingTop) || 0;
    el.scrollLeft = frameCenterScroll(padX, frame.x, sc.resolution.width, zoom, el.clientWidth);
    el.scrollTop = frameCenterScroll(padY, frame.y, sc.resolution.height, zoom, el.clientHeight);
    markFitted(fitGateRef.current, fitKey);
    // Keyed on `centerNonce` only: it is bumped in the same batch as `setZoom`, so this
    // render's `zoom` / `fitKey` are fresh when the effect runs after the commit.
  }, [centerNonce]);

  function applyPan(dx: number, dy: number): void {
    const el = outerRef.current;
    if (el === null) return;
    el.scrollLeft -= dx;
    el.scrollTop -= dy;
  }

  // Keep the ruler/guide origin in sync with the stage as it zooms / scrolls /
  // resizes. Measured whenever a scene is open (guides render even when the
  // ruler bars are hidden).
  useEffect(() => {
    const outer = outerRef.current;
    if (outer === null) return;
    function measure(): void {
      const o = outerRef.current;
      const s = stageRef.current;
      if (o === null || s === null) return;
      const frame = frameOffsetRef.current; // content-aware inset (Q5: re-keyed below)
      const orect = o.getBoundingClientRect();
      const srect = s.getBoundingClientRect();
      // D-071 Phase B — scene (0,0) is the FRAME top-left, which is INSET into the
      // pasteboard by `frame` (scene px) → `frame × zoom` screen px from the stage
      // top-left. The rulers/guides live in the NON-scrolling overlay aligned to
      // `outer`'s border box (orect), so the origin is measured from there — and
      // because `srect` reflects the live scroll, the ticks/guides follow the stage
      // as it scrolls under the pinned overlay.
      setRulerOrigin({
        x: srect.left - orect.left + frame.x * zoom,
        y: srect.top - orect.top + frame.y * zoom,
      });
      setViewport({ w: o.clientWidth, h: o.clientHeight });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    if (stageRef.current !== null) ro.observe(stageRef.current);
    outer.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      outer.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
    // Q5 — re-measure when the content-aware offset shifts, not only on scroll/zoom.
  }, [zoom, sceneId, html, frameOffset.x, frameOffset.y]);

  if (scene === null) {
    return (
      <div className={s.wrap}>
        <div className={s.outer} ref={outerRef}>
          <div className={s.empty}>
            <p>No active project.</p>
          </div>
        </div>
      </div>
    );
  }

  // `extent` + `frameOffset` (the content-aware pasteboard) are computed up-top so the
  // effects can read them; here we only need the zoom readout.
  const zoomPct = Math.round(zoom * 100);
  // Use the active tool's cursor across the whole scroll area, not just over
  // the canvas, so the dark margin around the scene shows the same cursor.
  const outerCursor =
    bindModeFieldId !== null
      ? 'crosshair'
      : tool === 'cursor'
        ? ARROW_CURSOR
        : tool === 'hand'
          ? 'grab'
          : 'crosshair';

  // Scene coordinates under a viewport point. D-071 Phase B — scene (0,0) is the
  // FRAME top-left, which is INSET into the pasteboard by `frameOffset` (scene px), so
  // measure from the stage top-left + that offset × zoom (the frame's screen origin).
  function sceneFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const s = stageRef.current;
    if (s === null) return { x: 0, y: 0 };
    const r = s.getBoundingClientRect();
    return screenToScene(
      clientX,
      clientY,
      { left: r.left + frameOffset.x * zoom, top: r.top + frameOffset.y * zoom },
      zoom,
    );
  }

  // Drag a guide (existing or freshly created). Guides can sit anywhere in the
  // dark area outside the canvas too (negative coords / past the edges), so the
  // position isn't clamped to the canvas; double-click removes a guide.
  function dragGuide(axis: 'x' | 'y', index: number, ev: PointerEvent): void {
    ev.preventDefault();
    // D-072 — keep the coordinate badge pinned to THIS guide for the whole drag
    // (drag wins over hover; the window-level pointer-move leaves the thin strip).
    guideDraggingRef.current = true;
    setActiveGuide({ axis, index });
    const posOf = (e: PointerEvent): number => {
      const sc = sceneFromClient(e.clientX, e.clientY);
      return Math.round(axis === 'x' ? sc.x : sc.y);
    };
    const onMove = (e: PointerEvent): void => {
      designerStore.setGuidePos(axis, index, posOf(e));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      guideDraggingRef.current = false;
      setActiveGuide(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Pull a new guide out of a ruler: top ruler → horizontal ('y'), left → 'x'.
  function createGuideFromRuler(axis: 'x' | 'y', e: React.PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const sc = sceneFromClient(e.clientX, e.clientY);
    const pos = Math.round(axis === 'x' ? sc.x : sc.y);
    const index = designerStore.addGuide(axis, pos);
    dragGuide(axis, index, e.nativeEvent);
  }

  return (
    <div className={s.wrap}>
      <PreviewHost />
      <div className={s.header} aria-label="Canvas header">
        {showToolbar && <CanvasToolbar tool={tool} />}
        <span className={s.spacer} />
        <span className={s.zoomReadout} data-testid="zoom-readout">
          {zoomPct}%
        </span>
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={manualFit}
          aria-label="Fit"
          title="Fit canvas"
        >
          <Icon icon={ScanSearch} size={16} />
        </Control>
        <Control
          variant="bare"
          className={s.zoomResetButton}
          onClick={() => zoomAtCenter(1 / zoomRef.current)}
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
        >
          100%
        </Control>
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={() => zoomAtCenter(ZOOM_STEP)}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Icon icon={ZoomIn} size={16} />
        </Control>
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={() => zoomAtCenter(1 / ZOOM_STEP)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Icon icon={ZoomOut} size={16} />
        </Control>
      </div>
      <div className={s.viewport}>
        <div
          className={s.outer}
          style={{ cursor: outerCursor }}
          ref={outerRef}
          data-testid="canvas-viewport"
        >
          {html !== null && (
            <div className={s.centerWrap}>
              <div
                ref={stageRef}
                className={s.stage}
                data-testid="canvas-stage"
                style={{
                  // B-027 — the stage is the FIXED pasteboard (3× × 3× the frame, a constant
                  // function of resolution; no grow, no origin shift). The frame is inset by
                  // the constant `frameOffset`, so off-frame content shows on every side.
                  width: extent.width * zoom,
                  height: extent.height * zoom,
                }}
              >
                <iframe
                  ref={iframeRef}
                  srcDoc={html}
                  title="cgpreview"
                  className={s.iframe}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    // Sized to the pasteboard extent; the runtime's authoring CSS lifts
                    // the `.cg-stage` clip so off-frame shapes paint into the margin and
                    // insets the frame by `frameOffset`. A `device-width` viewport means
                    // the content fills this element size with no stretch.
                    width: extent.width,
                    height: extent.height,
                    transform: `scale(${String(zoom)})`,
                    transformOrigin: 'top left',
                  }}
                  // sandbox intentionally omitted — see Preview class
                  // comment. The combination "iframe srcDoc + ES module
                  // import from a blob URL" only works without sandbox
                  // in current Chromium.
                />
                <CanvasOverlay
                  scene={scene}
                  tool={tool}
                  selection={selection}
                  editingTextId={editingTextId}
                  bindModeFieldId={bindModeFieldId}
                  scale={zoom}
                  frameOffset={frameOffset}
                  currentFrame={currentFrame}
                  onPan={applyPan}
                />
              </div>
            </div>
          )}
        </div>
        {/* Non-scrolling overlay over the scroll viewport: the rulers + guides
            stay pinned to the visible area while `rulerOrigin` tracks the
            scrolling stage (so they no longer slide away on zoom + scroll). */}
        <div className={s.overlay}>
          {rulerVisible && rulerOrigin !== null && html !== null && (
            <CanvasRuler
              originX={rulerOrigin.x}
              originY={rulerOrigin.y}
              zoom={zoom}
              viewW={viewport.w}
              viewH={viewport.h}
              onCreateGuide={createGuideFromRuler}
            />
          )}
          {rulerOrigin !== null && (guides.x.length > 0 || guides.y.length > 0) && (
            <div
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
              aria-hidden
            >
              {guides.x.map((gx, i) => (
                <div
                  key={`gx-${String(i)}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: rulerOrigin.x + gx * zoom - 3,
                    width: 7,
                    cursor: 'ew-resize',
                    pointerEvents: 'auto',
                  }}
                  title="Drag to move · double-click to remove"
                  onPointerDown={(e) => dragGuide('x', i, e.nativeEvent)}
                  onPointerEnter={() => setActiveGuide({ axis: 'x', index: i })}
                  onPointerLeave={() => {
                    if (!guideDraggingRef.current) setActiveGuide(null);
                  }}
                  onDoubleClick={() => designerStore.removeGuide('x', i)}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 3,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: '#F472B6',
                    }}
                  />
                </div>
              ))}
              {guides.y.map((gy, i) => (
                <div
                  key={`gy-${String(i)}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: rulerOrigin.y + gy * zoom - 3,
                    height: 7,
                    cursor: 'ns-resize',
                    pointerEvents: 'auto',
                  }}
                  title="Drag to move · double-click to remove"
                  onPointerDown={(e) => dragGuide('y', i, e.nativeEvent)}
                  onPointerEnter={() => setActiveGuide({ axis: 'y', index: i })}
                  onPointerLeave={() => {
                    if (!guideDraggingRef.current) setActiveGuide(null);
                  }}
                  onDoubleClick={() => designerStore.removeGuide('y', i)}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: '#F472B6',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {/* D-071 Phase B — alignment/snap guides (shown while dragging) span the
            FULL visible canvas (the dark pasteboard), not the frame: drawn over the
            scroll viewport at the scene position (rulerOrigin tracks scroll/zoom). */}
          {rulerOrigin !== null && (snapGuides.x.length > 0 || snapGuides.y.length > 0) && (
            <div
              data-testid="snap-guides"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
              aria-hidden
            >
              {snapGuides.x.map((gx) => (
                <div
                  key={`sgx-${String(gx)}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: rulerOrigin.x + gx * zoom,
                    width: 1,
                    background: '#FF3DAE',
                  }}
                />
              ))}
              {snapGuides.y.map((gy) => (
                <div
                  key={`sgy-${String(gy)}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: rulerOrigin.y + gy * zoom,
                    height: 1,
                    background: '#FF3DAE',
                  }}
                />
              ))}
            </div>
          )}
          {/* D-072 — coordinate badge for the active (hovered/dragged) persistent guide.
              Display-only (pointerEvents:none), positioned at the guide's screen coord near
              the ruler edge and clamped to the viewport; `direction:ltr` keeps `x: 960`
              readable under RTL. */}
          {activeGuide !== null &&
            rulerOrigin !== null &&
            (() => {
              const onX = activeGuide.axis === 'x';
              const pos = (onX ? guides.x : guides.y)[activeGuide.index];
              if (pos === undefined) return null; // guide removed mid-interaction
              const left = onX
                ? Math.max(2, Math.min(viewport.w - 64, rulerOrigin.x + pos * zoom + 5))
                : 5;
              const top = onX
                ? 5
                : Math.max(2, Math.min(viewport.h - 22, rulerOrigin.y + pos * zoom + 5));
              return (
                <div
                  data-testid="guide-badge"
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    zIndex: 6,
                    pointerEvents: 'none',
                    direction: 'ltr',
                    background: 'rgba(11,14,22,0.92)',
                    color: '#F472B6',
                    border: '1px solid #F472B6',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontSize: 11,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {onX ? 'x' : 'y'}: {Math.round(pos)}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

const RULER = 16;

/**
 * Pinned canvas rulers (top + left) showing scene-pixel coordinates. The tick
 * step adapts to zoom so labels stay ~64px apart; `originX/Y` place scene (0,0).
 */
function CanvasRuler({
  originX,
  originY,
  zoom,
  viewW,
  viewH,
  onCreateGuide,
}: {
  originX: number;
  originY: number;
  zoom: number;
  /** Visible viewport size in px — the rulers tick across this whole range. */
  viewW: number;
  viewH: number;
  onCreateGuide: (axis: 'x' | 'y', e: React.PointerEvent) => void;
}): JSX.Element {
  const STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = STEPS.find((s) => s * zoom >= 64) ?? 5000;
  // Tick across the whole visible viewport (the dark area), including negative
  // scene coordinates to the left/top of the canvas and past its right/bottom.
  const sceneAt = (screenPx: number, origin: number): number => (screenPx - origin) / zoom;
  const xticks: number[] = [];
  const x0 = sceneAt(0, originX);
  const x1 = sceneAt(viewW, originX);
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) xticks.push(x);
  const yticks: number[] = [];
  const y0 = sceneAt(0, originY);
  const y1 = sceneAt(viewH, originY);
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) yticks.push(y);
  const bar = {
    position: 'absolute' as const,
    background: '#13151f',
    zIndex: 6,
    pointerEvents: 'none' as const,
    overflow: 'hidden' as const,
    color: colors.textMuted,
    fontSize: 9,
    fontVariantNumeric: 'tabular-nums' as const,
  };
  return (
    <>
      <div
        style={{
          ...bar,
          top: 0,
          left: 0,
          right: 0,
          height: RULER,
          borderBottom: `1px solid ${colors.border}`,
          pointerEvents: 'auto',
          cursor: 'ns-resize',
        }}
        data-testid="ruler-top"
        title="Drag down for a horizontal guide"
        onPointerDown={(e) => onCreateGuide('y', e)}
      >
        {xticks.map((x) => (
          <div
            key={x}
            style={{ position: 'absolute', left: originX + x * zoom, top: 0, bottom: 0 }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: 1,
                height: 5,
                background: colors.border,
              }}
            />
            <span style={{ position: 'absolute', left: 2, top: 1, whiteSpace: 'nowrap' }}>{x}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          ...bar,
          top: 0,
          left: 0,
          bottom: 0,
          width: RULER,
          borderRight: `1px solid ${colors.border}`,
          pointerEvents: 'auto',
          cursor: 'ew-resize',
        }}
        title="Drag right for a vertical guide"
        onPointerDown={(e) => onCreateGuide('x', e)}
      >
        {yticks.map((y) => (
          <div key={y} style={{ position: 'absolute', top: originY + y * zoom, left: 0, right: 0 }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                height: 1,
                width: 5,
                background: colors.border,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 1,
                top: 2,
                writingMode: 'vertical-rl' as const,
                fontSize: 8,
              }}
            >
              {y}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: RULER,
          height: RULER,
          background: '#13151f',
          borderRight: `1px solid ${colors.border}`,
          borderBottom: `1px solid ${colors.border}`,
          zIndex: 7,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
    </>
  );
}
