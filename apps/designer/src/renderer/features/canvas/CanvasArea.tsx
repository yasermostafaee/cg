import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';

interface Props {
  scene: Scene | null;
}

const styles = {
  outer: {
    flex: 1,
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    minHeight: 0,
    overflow: 'auto' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
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
  },
} as const;

/**
 * The Designer's central work area. Shows the cgpreview iframe when a
 * scene is active. Element drawing + the gizmo overlay land with M6.4;
 * for now this just hosts the live preview.
 *
 * The iframe loads `cgpreview://<sceneId>/index.html` (resolved by Main
 * via the protocol handler from M6.2).
 */
export function CanvasArea({ scene }: Props): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (scene === null) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void window.cg.preview.load({ scene }).then((res) => {
      if (!cancelled) setSrc(res.src);
    });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // Listen for the iframe's ready ping. Once it lands we know the
  // template-runtime is booted and `window.update` is callable from
  // postMessage. The Inspector (M6.5) will use this gate.
  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as { kind?: string; sceneId?: string } | undefined;
      if (msg?.kind === 'cg-preview-ready') {
        // Surface a console line during dev; M6.5 will route this to the store.
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
  // Fit the 1080-line stage at ~50% so a 1920×1080 scene comfortably
  // shows in a 1280-wide workspace. M9 introduces zoom controls.
  const scale = 0.5;
  return (
    <div style={styles.outer}>
      <div
        style={{
          ...styles.stage,
          width: width * scale,
          height: height * scale,
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title="cgpreview"
          style={styles.iframe}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
