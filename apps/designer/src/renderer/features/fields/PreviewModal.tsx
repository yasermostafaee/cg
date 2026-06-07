import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { Modal } from '../shell/Modal.js';
import { PreviewFieldForm, seedDefaults, type PreviewDispatch } from './PreviewFieldForm.js';
import * as s from './PreviewModal.css.js';

const PREVIEW_WIDTH = 600;

/**
 * D-018 — the preview as a modal opened from the toolbar's "Preview" button. It
 * owns a *dedicated* preview iframe (the same `platform/preview.ts` harness used
 * for the canvas and shared with the single-file HTML export), shown on a
 * checkerboard at the composition resolution scaled to fit, plus the
 * `PreviewFieldForm` and its Play / Stop / Next / Reset controls. The iframe is
 * built + seeded on open and torn down on close (the form drives it directly, so
 * it never touches the canvas's own preview iframe).
 */
export function PreviewModal({
  scene,
  onClose,
}: {
  scene: Scene;
  onClose: () => void;
}): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  // Build a fresh, dedicated preview document on open.
  useEffect(() => {
    let alive = true;
    void window.cg.preview.load({ scene }).then((res) => {
      if (alive) setHtml(res.html);
    });
    return () => {
      alive = false;
    };
  }, [scene]);

  const post = useCallback((message: Record<string, unknown>): void => {
    iframeRef.current?.contentWindow?.postMessage({ kind: 'cg-preview', ...message }, '*');
  }, []);

  const dispatch = useMemo<PreviewDispatch>(
    () => ({
      update: (fields) => post({ action: 'update', fields }),
      play: (fields) => post({ action: 'play', fields }),
      stop: () => post({ action: 'stop' }),
      next: () => post({ action: 'next' }),
      reset: () => post({ action: 'reset' }),
    }),
    [post],
  );

  // Seed our iframe (only ours) once it signals readiness.
  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as { kind?: string } | undefined;
      if (msg?.kind !== 'cg-preview-ready') return;
      if (evt.source !== iframeRef.current?.contentWindow) return;
      post({ action: 'scrub', frame: 0 });
      post({ action: 'update', fields: seedDefaults(scene.fields) });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, scene.fields]);

  // Tear down on close — stop the runtime; the iframe unmounts with the modal.
  useEffect(() => () => post({ action: 'stop' }), [post]);

  const { width: resW, height: resH } = scene.resolution;
  const scale = PREVIEW_WIDTH / resW;

  return (
    <Modal
      title="Preview"
      onClose={onClose}
      width="min(680px, 94vw)"
      ariaLabel="Composition preview"
    >
      <div
        className={s.stageWrap}
        style={{ width: PREVIEW_WIDTH, height: Math.round(resH * scale) }}
      >
        {html !== null && (
          <iframe
            ref={iframeRef}
            title="cgpreview-modal"
            srcDoc={html}
            className={s.stageFrame}
            style={{ width: resW, height: resH, transform: `scale(${String(scale)})` }}
          />
        )}
      </div>
      <PreviewFieldForm scene={scene} dispatch={dispatch} />
    </Modal>
  );
}
