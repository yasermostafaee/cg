import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { CanvasOverlay } from './CanvasOverlay.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { type DesignerTool } from '../../state/store.js';

interface Props {
  scene: Scene | null;
  tool: DesignerTool;
  selection: ReadonlySet<string>;
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
    width: 24,
    height: 24,
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    fontSize: '0.78rem',
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
  const [html, setHtml] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);

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
        { kind: 'cg-preview', action: 'scene-replace', scene: sceneToSend },
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

  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as
        | { kind?: string; sceneId?: string; label?: string; payload?: string }
        | undefined;
      if (msg?.kind === 'cg-preview-ready') {
        iframeRef.current?.contentWindow?.postMessage(
          { kind: 'cg-preview', action: 'scrub', frame: currentFrame },
          '*',
        );
      }
      if (msg?.kind === 'cg-preview-error') {
        console.error('[cg-preview]', msg.label, msg.payload);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [currentFrame]);

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
      </div>
    </div>
  );
}

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}
