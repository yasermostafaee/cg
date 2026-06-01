import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { CanvasOverlay } from './CanvasOverlay.js';
import { type DesignerTool } from '../../state/store.js';

interface Props {
  scene: Scene | null;
  tool: DesignerTool;
  selection: ReadonlySet<string>;
  editingTextId: string | null;
  bindModeFieldId: string | null;
  currentFrame: number;
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
    background: colors.panelMuted,
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
    background: '#000',
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
}: Props): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);

  useEffect(() => {
    if (scene === null) {
      // eslint-disable-next-line no-console
      console.log('[cg-canvas] scene is null, clearing iframe');
      setSrc(null);
      setHtml(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line no-console
    console.log('[cg-canvas] calling preview.load for scene', scene.id);
    void window.cg.preview.load({ scene }).then((res) => {
      if (cancelled) {
        // eslint-disable-next-line no-console
        console.log('[cg-canvas] preview.load resolved but effect was cancelled');
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        '[cg-canvas] preview.load resolved; html size=',
        res.html.length,
        'src=',
        res.src,
      );
      setSrc(res.src);
      setHtml(res.html);
    });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as
        | { kind?: string; sceneId?: string; args?: readonly unknown[] }
        | undefined;
      if (msg?.kind === 'cg-preview-ready') {
        iframeRef.current?.contentWindow?.postMessage(
          { kind: 'cg-preview', action: 'scrub', frame: currentFrame },
          '*',
        );
      }
      if (msg?.kind === 'cg-preview-log' && Array.isArray(msg.args)) {
        // eslint-disable-next-line no-console
        console.log('[cg-preview]', ...msg.args);
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
      <div style={styles.header} aria-label="Canvas controls">
        <button
          type="button"
          style={styles.headerButton}
          onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <span style={styles.zoomReadout}>{zoomPct}%</span>
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
          onClick={() => setZoom(1)}
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
        >
          1×
        </button>
        <button
          type="button"
          style={styles.headerButton}
          onClick={() => setZoom(ZOOM_DEFAULT)}
          aria-label="Fit"
          title="Fit"
        >
          ⛶
        </button>
        <span style={styles.spacer} />
        <span title="Hold Ctrl + wheel to zoom · wheel to scroll · use hand tool to pan">
          tip: Ctrl+wheel zooms
        </span>
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
                  // Diagnostic: bright red border on the iframe element
                  // itself (parent CSS, not iframe-content CSS). Visible
                  // even if the iframe document fails to load. If you
                  // do not see a red rectangle on the canvas, the
                  // iframe element itself is not in the DOM (or has
                  // zero size).
                  border: '3px solid red',
                }}
                // sandbox intentionally omitted — the iframe is loaded
                // from a same-origin blob: URL we just created in this
                // window. Chrome blocks dynamic module imports from
                // blob: URLs *inside* sandboxed iframes (even with
                // allow-scripts + allow-same-origin), which silently
                // prevented the runtime from ever loading and was the
                // cause of "shapes / colours don't render".
                onLoad={() => {
                  // eslint-disable-next-line no-console
                  console.log(
                    '[cg-canvas] iframe.onLoad fired (srcDoc-mode, src fallback=',
                    src,
                    ')',
                  );
                }}
                onError={(e) => {
                  // eslint-disable-next-line no-console
                  console.log('[cg-canvas] iframe.onError fired', e);
                }}
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
