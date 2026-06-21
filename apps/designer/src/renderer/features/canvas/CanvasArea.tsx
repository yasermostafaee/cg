import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  fitZoom,
  pasteboardExtent,
  screenToScene,
} from './geometry.js';
import { Control } from '../../ui/Control.js';
import * as s from './CanvasArea.css.js';
import {
  designerStore,
  shallowEqual,
  useDesignerSelector,
  type DesignerTool,
} from '../../state/store.js';

interface Props {
  scene: Scene | null;
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

const ZOOM_MIN = 0.1;
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
  useEffect(() => {
    const current = latestSceneRef.current;
    if (current === null) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    // D-071 Phase B — the canvas iframe renders in AUTHORING mode (off-frame
    // pasteboard: clip lifted). Its element size (the pasteboard extent) is set by
    // CanvasArea + a `device-width` viewport, so the document needs no `pad`. The
    // broadcast modal + exports omit `authoring` (native clip — UNCHANGED).
    void window.cg.preview.load({ scene: current, authoring: true }).then((res) => {
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
        },
        '*',
      );
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
      }
      if (msg?.kind === 'cg-preview-error') {
        console.error('[cg-preview]', msg.label, msg.payload);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [currentFrame, editingTextId]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { kind: 'cg-preview', action: 'scrub', frame: currentFrame },
      '*',
    );
  }, [currentFrame]);

  // Ctrl + wheel over the canvas zooms; plain wheel keeps the default
  // overflow:auto behaviour. We use a non-passive listener so we can
  // preventDefault on the Ctrl-wheel and not trigger the browser's
  // page-zoom or page-scroll.
  useEffect(() => {
    const el = outerRef.current;
    if (el === null) return;
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey) return; // let native scroll happen
      e.preventDefault();
      setZoom((z) => clampZoom(e.deltaY < 0 ? z * ZOOM_STEP : z / ZOOM_STEP));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // D-071 Phase B — scroll so the FRAME (not the pasteboard extent) is centered in
  // the viewport at the given zoom. The frame sits at the stage's top-left (scene
  // 0,0); the pasteboard extends right/bottom, so without this an off-frame-grown
  // stage would pin the frame to the corner.
  function centerFrameInView(z: number): void {
    const el = outerRef.current;
    const s = stageRef.current;
    const sc = latestSceneRef.current;
    if (el === null || s === null || sc === null) return;
    const srect = s.getBoundingClientRect();
    const orect = el.getBoundingClientRect();
    const frameLeftInContent = srect.left - orect.left + el.scrollLeft;
    const frameTopInContent = srect.top - orect.top + el.scrollTop;
    el.scrollLeft = frameLeftInContent + (sc.resolution.width * z) / 2 - el.clientWidth / 2;
    el.scrollTop = frameTopInContent + (sc.resolution.height * z) / 2 - el.clientHeight / 2;
  }

  // Fit the FRAME inside the scroll viewport (small margin) so it's fully visible,
  // then CENTER it — the same zoom + centering the ⛶ button applies. Fit-zoom is
  // computed from the FRAME bounds (not the enlarged pasteboard extent).
  function fitToViewport(): void {
    const el = outerRef.current;
    const s = latestSceneRef.current;
    if (el === null || s === null) return;
    const margin = 16;
    const z = fitZoom(
      el.clientWidth,
      el.clientHeight,
      s.resolution.width,
      s.resolution.height,
      margin,
    );
    if (z !== null) {
      const cz = clampZoom(z);
      setZoom(cz);
      // Center after the new zoom lays out (the stage size depends on it).
      requestAnimationFrame(() => centerFrameInView(cz));
    }
  }

  // Auto-fit on load / project (or composition size) switch. Runs in a layout
  // effect (before paint) so the very first frame is already at the fit zoom —
  // no flash from the initial state value.
  useLayoutEffect(() => {
    if (sceneId === null) return;
    fitToViewport();
  }, [sceneId, scene?.resolution.width, scene?.resolution.height]);

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
      const orect = o.getBoundingClientRect();
      const srect = s.getBoundingClientRect();
      // D-071 Phase B — the frame is at the stage's top-left (the pasteboard
      // extends right/bottom only), so scene (0,0) is the stage top-left as before.
      setRulerOrigin({
        x: srect.left - orect.left - o.clientLeft,
        y: srect.top - orect.top - o.clientTop,
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
  }, [zoom, sceneId, html]);

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

  // D-071 Phase B — the stage extent (frame ∪ off-frame content). Equals the frame
  // for an empty/on-frame doc (so it centers + fits as before); grows right/bottom
  // only for off-frame content. The frame stays at the stage origin (0,0).
  const extent = pasteboardExtent(scene);
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

  // Scene coordinates under a viewport point, via the live stage rect. D-071
  // Phase B — the frame stays at the stage's top-left (scene 0,0); the pasteboard
  // extends to the RIGHT/BOTTOM only, so this mapping is unchanged.
  function sceneFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const s = stageRef.current;
    if (s === null) return { x: 0, y: 0 };
    return screenToScene(clientX, clientY, s.getBoundingClientRect(), zoom);
  }

  // Drag a guide (existing or freshly created). Guides can sit anywhere in the
  // dark area outside the canvas too (negative coords / past the edges), so the
  // position isn't clamped to the canvas; double-click removes a guide.
  function dragGuide(axis: 'x' | 'y', index: number, ev: PointerEvent): void {
    ev.preventDefault();
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
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={fitToViewport}
          aria-label="Fit"
          title="Fit canvas"
        >
          ⛶
        </Control>
        <span className={s.zoomReadout}>{zoomPct}%</span>
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={() => setZoom(1)}
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
        >
          1×
        </Control>
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </Control>
        <Control
          variant="bare"
          className={s.headerButton}
          onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </Control>
      </div>
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
              style={{
                // D-071 Phase B — the stage is the PASTEBOARD: the content extent
                // (frame for an empty doc; grown right/bottom by off-frame content).
                // The frame stays at the top-left so click→scene mapping is unchanged.
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
                  // the `.cg-stage` clip so off-frame shapes paint into the margin. A
                  // `device-width` viewport means the content fills this (changing)
                  // element size with no stretch; the frame stays at (0,0).
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
                currentFrame={currentFrame}
                onPan={applyPan}
              />
            </div>
          </div>
        )}
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

/** Thin wrapper binding the pure {@link clampZoomPure} to this view's zoom bounds. */
function clampZoom(z: number): number {
  return clampZoomPure(z, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT);
}
