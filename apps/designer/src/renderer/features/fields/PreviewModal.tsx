import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { Modal } from '../shell/Modal.js';
import { PreviewFieldForm, seedDefaults, type PreviewDispatch } from './PreviewFieldForm.js';
import * as s from './PreviewModal.css.js';

/**
 * D-018 — the preview as a large modal opened from the toolbar's "PREVIEW"
 * button. It owns a *dedicated* preview iframe (the same `platform/preview.ts`
 * harness used by the canvas and shared with the single-file HTML export),
 * rendered at the composition's native resolution and scaled to fill the stage,
 * with the `PreviewFieldForm` and its Play / Stop / Next / Reset controls as a
 * sidebar. Built + seeded on open, stopped on close (the iframe unmounts with
 * the modal); the form drives it directly, never touching the canvas preview.
 */
export function PreviewModal({
  scene,
  onClose,
}: {
  scene: Scene;
  onClose: () => void;
}): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  // Measured stage size, so the composition scales to fit whatever the (large)
  // modal gives us rather than a fixed thumbnail.
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

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

  useEffect(() => {
    const el = stageRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r !== undefined) setStageSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      pause: () => post({ action: 'pause' }),
      resume: () => post({ action: 'resume' }),
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
  const scale =
    stageSize.w > 0 && stageSize.h > 0 ? Math.min(stageSize.w / resW, stageSize.h / resH) : 0;

  return (
    <Modal
      title={`Preview · ${String(resW)}×${String(resH)}`}
      onClose={onClose}
      width="min(1500px, 96vw)"
      minBodyHeight="74vh"
      ariaLabel="Composition preview"
    >
      <div className={s.layout}>
        <div ref={stageRef} className={s.stage}>
          {html !== null && (
            <iframe
              ref={iframeRef}
              title="cgpreview-modal"
              srcDoc={html}
              className={s.stageFrame}
              style={{
                width: resW,
                height: resH,
                transform: `translate(-50%, -50%) scale(${String(scale)})`,
              }}
            />
          )}
        </div>
        <div className={s.sidebar}>
          <PreviewFieldForm scene={scene} dispatch={dispatch} />
        </div>
      </div>
    </Modal>
  );
}
