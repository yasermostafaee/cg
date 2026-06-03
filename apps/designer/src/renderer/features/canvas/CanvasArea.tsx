import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import {
  getAll as assetUrlGetAll,
  subscribe as assetUrlSubscribe,
} from '../assets/assetUrlCache.js';
import { CanvasOverlay } from './CanvasOverlay.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { designerStore, useDesignerStore, type DesignerTool } from '../../state/store.js';

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
  currentFrame: number;
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

const styles = {
  wrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.25rem 0.4rem',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    marginBottom: '0.3rem',
    fontSize: '0.74rem',
    color: colors.textMuted,
  },
  headerButton: {
    width: 28,
    height: 28,
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    fontSize: '1.05rem',
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomReadout: {
    minWidth: 50,
    textAlign: 'center' as const,
    fontSize: '0.7rem',
    fontVariantNumeric: 'tabular-nums' as const,
    color: colors.text,
  },
  spacer: { flex: 1 },
  outer: {
    flex: 1,
    background: '#161927',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    minHeight: 0,
    minWidth: 0,
    overflow: 'auto' as const,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: '1rem',
    width: '100%',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
  },
  centerWrap: {
    margin: 'auto',
    position: 'relative' as const,
  },
  // Stage occupies the scaled footprint (width * zoom × height * zoom)
  // so layout reserves the right amount of space and the CanvasOverlay
  // — which uses scale=zoom for hit-test math — sees the matching
  // bounding-rect dimensions. The iframe inside is sized to the
  // scene's intrinsic resolution and visually scaled with a CSS
  // transform so the *entire* scene is in view, never clipped by the
  // iframe's body overflow.
  stage: {
    position: 'relative' as const,
    // D-011 — surface the scene's transparency as a checkerboard so the
    // operator can tell the default scene is transparent. The iframe
    // body is `background:transparent` (cgCss), so this pattern shows
    // through anywhere the scene hasn't painted.
    backgroundColor: '#3d4253',
    backgroundImage:
      'linear-gradient(45deg, #5b6075 25%, transparent 25%),' +
      'linear-gradient(-45deg, #5b6075 25%, transparent 25%),' +
      'linear-gradient(45deg, transparent 75%, #5b6075 75%),' +
      'linear-gradient(-45deg, transparent 75%, #5b6075 75%)',
    backgroundSize: '48px 48px',
    backgroundPosition: '0 0, 0 24px, 24px -24px, -24px 0',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    overflow: 'hidden' as const,
  },
  empty: {
    color: colors.textMuted,
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    lineHeight: 1.6,
    margin: 'auto',
  },
  iframe: {
    border: 0,
    display: 'block',
    width: '100%',
    height: '100%',
    background: 'transparent',
    pointerEvents: 'none' as const,
  },
} as const;

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
  currentFrame,
  showToolbar = false,
}: Props): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);
  const { rulerVisible, guides } = useDesignerStore();
  // Screen offset (within the scroll viewport) of the scene's (0,0), so the
  // pinned rulers and the guide lines stay aligned with the canvas as it
  // zooms / scrolls / resizes.
  const [rulerOrigin, setRulerOrigin] = useState<{ x: number; y: number } | null>(null);

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
    void window.cg.preview.load({ scene: current }).then((res) => {
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
          assetUrls: assetUrlGetAll(),
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

  // D-011 — push a fresh asset URL map to the iframe whenever a newly
  // imported image resolves, so a freshly-dropped picture appears
  // without waiting for the next scene mutation.
  useEffect(() => {
    return assetUrlSubscribe(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { kind: 'cg-preview', action: 'asset-urls', assetUrls: assetUrlGetAll() },
        '*',
      );
    });
  }, []);

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
          { kind: 'cg-preview', action: 'asset-urls', assetUrls: assetUrlGetAll() },
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
      setRulerOrigin({
        x: srect.left - orect.left - o.clientLeft,
        y: srect.top - orect.top - o.clientTop,
      });
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
      <div style={styles.wrap}>
        <div style={styles.outer} ref={outerRef}>
          <div style={styles.empty}>
            <p>No active project.</p>
          </div>
        </div>
      </div>
    );
  }

  const { width, height } = scene.resolution;
  const zoomPct = Math.round(zoom * 100);

  // Scene coordinates under a viewport point, via the live stage rect.
  function sceneFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const s = stageRef.current;
    if (s === null) return { x: 0, y: 0 };
    const r = s.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  }

  // Drag a guide (existing or freshly created). Releasing with the guide pulled
  // outside the canvas removes it (drop back onto the ruler / off-canvas).
  function dragGuide(axis: 'x' | 'y', index: number, ev: PointerEvent): void {
    ev.preventDefault();
    const dim = axis === 'x' ? width : height;
    const posOf = (e: PointerEvent): number => {
      const sc = sceneFromClient(e.clientX, e.clientY);
      return axis === 'x' ? sc.x : sc.y;
    };
    const onMove = (e: PointerEvent): void => {
      designerStore.setGuidePos(axis, index, Math.max(0, Math.min(dim, posOf(e))));
    };
    const onUp = (e: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const p = posOf(e);
      if (p < 0 || p > dim) designerStore.removeGuide(axis, index);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Pull a new guide out of a ruler: top ruler → horizontal ('y'), left → 'x'.
  function createGuideFromRuler(axis: 'x' | 'y', e: React.PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const sc = sceneFromClient(e.clientX, e.clientY);
    const dim = axis === 'x' ? width : height;
    const pos = Math.max(0, Math.min(dim, axis === 'x' ? sc.x : sc.y));
    const index = designerStore.addGuide(axis, pos);
    dragGuide(axis, index, e.nativeEvent);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header} aria-label="Canvas header">
        {showToolbar && <CanvasToolbar tool={tool} />}
        <span style={styles.spacer} />
        <button
          type="button"
          style={styles.headerButton}
          onClick={() => setZoom(ZOOM_DEFAULT)}
          aria-label="Fit"
          title="Fit canvas"
        >
          ⛶
        </button>
        <span style={styles.zoomReadout}>{zoomPct}%</span>
        <button
          type="button"
          style={styles.headerButton}
          onClick={() => setZoom(1)}
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
        >
          1×
        </button>
        <button
          type="button"
          style={styles.headerButton}
          onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          style={styles.headerButton}
          onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
      </div>
      <div style={styles.outer} ref={outerRef}>
        {html !== null && (
          <div style={styles.centerWrap}>
            <div
              ref={stageRef}
              style={{
                ...styles.stage,
                width: width * zoom,
                height: height * zoom,
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={html}
                title="cgpreview"
                style={{
                  ...styles.iframe,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width,
                  height,
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
            width={width}
            height={height}
            onCreateGuide={createGuideFromRuler}
          />
        )}
        {rulerOrigin !== null && (guides.x.length > 0 || guides.y.length > 0) && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }} aria-hidden>
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
                <div style={{ position: 'absolute', left: 3, top: 0, bottom: 0, width: 1, background: '#22D3EE' }} />
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
                <div style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 1, background: '#22D3EE' }} />
              </div>
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
  width,
  height,
  onCreateGuide,
}: {
  originX: number;
  originY: number;
  zoom: number;
  width: number;
  height: number;
  onCreateGuide: (axis: 'x' | 'y', e: React.PointerEvent) => void;
}): JSX.Element {
  const STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = STEPS.find((s) => s * zoom >= 64) ?? 5000;
  const xticks: number[] = [];
  for (let x = 0; x <= width + 0.5; x += step) xticks.push(x);
  const yticks: number[] = [];
  for (let y = 0; y <= height + 0.5; y += step) yticks.push(y);
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
        title="Drag down for a horizontal guide"
        onPointerDown={(e) => onCreateGuide('y', e)}
      >
        {xticks.map((x) => (
          <div key={x} style={{ position: 'absolute', left: originX + x * zoom, top: 0, bottom: 0 }}>
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 5, background: colors.border }} />
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
            <div style={{ position: 'absolute', top: 0, right: 0, height: 1, width: 5, background: colors.border }} />
            <span
              style={{ position: 'absolute', left: 1, top: 2, writingMode: 'vertical-rl' as const, fontSize: 8 }}
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

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}
