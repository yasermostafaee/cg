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
}

const SCALE = 0.5;

const styles = {
  outer: {
    flex: 1,
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    minHeight: 0,
    minWidth: 0,
    overflow: 'auto' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  stage: {
    position: 'relative' as const,
    background: '#000',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  empty: {
    color: colors.textMuted,
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    lineHeight: 1.6,
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
 * Central work area. Shows the cgpreview iframe with a transparent
 * overlay on top that owns selection + element creation. The iframe's
 * `pointer-events: none` ensures the overlay sees all clicks.
 *
 * Scene mutations push a fresh `preview.load` so the iframe re-resolves
 * `cgpreview://`. M9 swaps this for a postMessage-driven scene-graph
 * diff once the template-runtime exposes one.
 */
export function CanvasArea({
  scene,
  tool,
  selection,
  editingTextId,
  bindModeFieldId,
}: Props): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (scene === null) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void window.cg.preview.load({ scene }).then((res) => {
      if (!cancelled) {
        // Cache-bust so the iframe actually re-fetches.
        setSrc(`${res.src}?t=${String(Date.now())}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as { kind?: string; sceneId?: string } | undefined;
      if (msg?.kind === 'cg-preview-ready') {
        // eslint-disable-next-line no-console
        console.info('[designer] preview ready for', msg.sceneId);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (scene === null || src === null) {
    return (
      <div style={styles.outer}>
        <div style={styles.empty}>
          <p>No active project.</p>
          <p>Use the Library to create or open a scene.</p>
        </div>
      </div>
    );
  }

  const { width, height } = scene.resolution;
  return (
    <div style={styles.outer}>
      <div
        style={{
          ...styles.stage,
          width: width * SCALE,
          height: height * SCALE,
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title="cgpreview"
          style={styles.iframe}
          sandbox="allow-scripts allow-same-origin"
        />
        <CanvasOverlay
          scene={scene}
          tool={tool}
          selection={selection}
          editingTextId={editingTextId}
          bindModeFieldId={bindModeFieldId}
          scale={SCALE}
        />
      </div>
    </div>
  );
}
