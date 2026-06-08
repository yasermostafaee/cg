import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldValue, Scene } from '@cg/shared-schema';
import { Modal } from '../shell/Modal.js';
import { PreviewFieldForm, seedDefaults, type PreviewDispatch } from './PreviewFieldForm.js';
import { PreviewTransport } from './PreviewTransport.js';
import { PreviewTimingControls, type TimingOverride } from './PreviewTimingControls.js';
import * as s from './PreviewModal.css.js';

type Values = Record<string, FieldValue>;

/**
 * Number of discrete steps a paginated template can advance through with
 * `next()`. There is no pagination model yet (the runtime's `next()` is a stub),
 * so every composition has exactly one step and Next stays disabled. When
 * multi-step templates land, derive the real count from the scene here.
 */
function stepCount(_scene: Scene): number {
  return 1;
}

/**
 * D-018 / D-020 — the preview as a large modal opened from the toolbar's "PREVIEW"
 * button. It owns a *dedicated* preview iframe (the same `platform/preview.ts`
 * harness used by the canvas and shared with the single-file HTML export),
 * rendered at the composition's native resolution and scaled to fill the stage.
 *
 * The sidebar separates concerns: the data-key form scrolls in its own region,
 * while the playout transport (momentary Play / Pause / Stop / Next commands) and
 * the session-only timing overrides live in a fixed, always-visible bar. The
 * modal owns the field values + paused flag so the fixed transport can `play()`
 * with the current data while the form scrolls independently.
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
  // D-020 — session-only playout override (mode / holdMs / repeat). Held here,
  // never written back to the stored scene; applied by rebuilding the preview
  // runtime with this override (see the scene-replace effect).
  const [override, setOverride] = useState<TimingOverride>({});

  // Field values live here (not in the form) so the fixed transport bar can
  // play() with the current data. Re-seed when the field *set* changes (add /
  // remove / rename / retype) but not on unrelated scene edits, so typed test
  // values survive — the "adjust state during render on key change" pattern.
  const fields = scene.fields;
  const fieldsKey = useMemo(() => fields.map((f) => `${f.id}:${f.type}`).join('|'), [fields]);
  const [values, setValues] = useState<Values>(() => seedDefaults(fields));
  const [seededKey, setSeededKey] = useState(fieldsKey);
  if (seededKey !== fieldsKey) {
    setSeededKey(fieldsKey);
    setValues(seedDefaults(fields));
  }

  // Tracks whether the operator paused, so Play becomes Resume and Pause disables.
  const [paused, setPaused] = useState(false);

  // Build a fresh, dedicated preview document on open. Reset any session
  // override + paused flag when the composition itself changes (keeps controls in
  // sync).
  useEffect(() => {
    let alive = true;
    setOverride({});
    setPaused(false);
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
      update: (f) => post({ action: 'update', fields: f }),
      play: (f) => post({ action: 'play', fields: f }),
      stop: () => post({ action: 'stop' }),
      next: () => post({ action: 'next' }),
      reset: () => post({ action: 'reset' }),
      pause: () => post({ action: 'pause' }),
      resume: () => post({ action: 'resume' }),
    }),
    [post],
  );

  const onFieldChange = useCallback(
    (id: string, value: FieldValue): void => {
      setValues((prev) => {
        const next = { ...prev, [id]: value };
        dispatch.update(next);
        return next;
      });
    },
    [dispatch],
  );

  // Momentary playout commands. Play resumes when paused; otherwise plays with the
  // current data. None of them is a toggle — each is a one-shot command.
  const onPlay = useCallback(() => {
    if (paused) {
      dispatch.resume();
      setPaused(false);
    } else {
      dispatch.play(values);
    }
  }, [dispatch, paused, values]);
  const onPause = useCallback(() => {
    dispatch.pause();
    setPaused(true);
  }, [dispatch]);
  const onStop = useCallback(() => {
    dispatch.stop();
    setPaused(false);
  }, [dispatch]);
  const onNext = useCallback(() => dispatch.next(), [dispatch]);
  const onReset = useCallback(() => {
    setValues(seedDefaults(fields));
    dispatch.reset();
    setPaused(false);
  }, [dispatch, fields]);

  // Apply a session override by rebuilding the preview runtime with it (the
  // stored scene + a non-persistent `playoutOverride`). The iframe preserves
  // typed field values across the rebuild, and the stored scene is untouched.
  // No-op until the operator actually changes a knob.
  useEffect(() => {
    if (Object.keys(override).length === 0) return;
    post({ action: 'scene-replace', scene, playoutOverride: override });
  }, [override, scene, post]);

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
          <div className={s.fieldsScroll}>
            <PreviewFieldForm scene={scene} values={values} onChange={onFieldChange} />
          </div>
          <div className={s.fixedBar}>
            <PreviewTransport
              paused={paused}
              canStep={stepCount(scene) > 1}
              onPlay={onPlay}
              onPause={onPause}
              onStop={onStop}
              onNext={onNext}
              onReset={onReset}
            />
            <PreviewTimingControls
              scene={scene}
              override={override}
              onChange={(patch) => setOverride((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
