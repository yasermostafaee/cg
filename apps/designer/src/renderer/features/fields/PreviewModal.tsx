import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  hasSoundEffects,
  aggregateCompositionFields,
  countdownTargetFieldsOf,
  defaultLookOf,
  lookGroupOf,
  withListLimits,
  defaultNestedValues,
  hasNextStep,
  type AggregatedFields,
  type FieldValue,
  type NestedFieldValues,
  type Scene,
} from '@cg/shared-schema';
import { getAll as assetUrlGetAll } from '../assets/assetUrlCache.js';
import { useAssets } from '../assets/useAssets.js';
import {
  getForScene as lottieAssetsForScene,
  primeScene as primeSceneLottie,
} from '../assets/lottieAssetCache.js';
import { getAll as sharedUrlGetAll } from '../sharedLibrary/sharedImageUrlCache.js';
import { getAll as sharedFontUrlGetAll } from '../sharedLibrary/sharedFontUrlCache.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { Modal } from '../shell/Modal.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { PreviewFieldForm, type PreviewDispatch } from './PreviewFieldForm.js';
import { imageChoicesForAssets, repeaterColumnsByFieldId } from './repeater-columns.js';
import { PreviewStatus, PreviewTransport } from './PreviewTransport.js';
import { parseRehearsalChoice, stepRehearsalChoices } from '../inspector/countdown-steps.js';
import { PreviewScopeTiming } from './PreviewScopeTiming.js';
import { type TimingOverride } from './PreviewTimingControls.js';
import { applyDesignerFileSourcePreviews } from './fileSourcePreviewStore.js';
import {
  previewDisplayFrame,
  previewElapsedLimitMs,
  rootUsesAuthoredFrameClock,
  shouldDeferPreviewNaturalStop,
} from './preview-elapsed.js';
import * as s from './PreviewModal.css.js';

function previewSeed(sceneId: string, aggregate: AggregatedFields): NestedFieldValues {
  return applyDesignerFileSourcePreviews(sceneId, aggregate.fields, defaultNestedValues(aggregate));
}

/** A stable key for the aggregate's SHAPE (fields + nested namespaces), so the
 *  preview re-seeds only when the form structure changes — not on value edits. */
function aggregateShapeKey(aggregate: AggregatedFields): string {
  const own = aggregate.fields.map((f) => `${f.id}:${f.type}`).join(',');
  const groups = aggregate.groups
    .map((g) => `${g.name}{${aggregateShapeKey(g.aggregate)}}`)
    .join(',');
  return `${own}|${groups}`;
}

/** Immutable nested set: `setIn({home:{}}, ['home','score'], 2)`. */
function setIn(obj: NestedFieldValues, path: string[], value: FieldValue): NestedFieldValues {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  const key = head as string;
  if (rest.length === 0) return { ...obj, [key]: value };
  const child = obj[key];
  const childObj =
    child !== null && typeof child === 'object' && !Array.isArray(child) && !('assetId' in child)
      ? (child as NestedFieldValues)
      : {};
  return { ...obj, [key]: setIn(childObj, rest, value) };
}

function isNamespaceObj(v: unknown): v is NestedFieldValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !('assetId' in v);
}

/**
 * D-106 — the dotted leaf paths whose PENDING value differs from the APPLIED value
 * (a list / image value compares by shape). Used to mark edited-but-unapplied fields.
 */
function dirtyPaths(
  pending: NestedFieldValues,
  applied: NestedFieldValues,
  prefix: string[] = [],
  out: Set<string> = new Set<string>(),
): Set<string> {
  for (const key of Object.keys(pending)) {
    const pv = pending[key];
    const av = (applied as Record<string, unknown> | undefined)?.[key];
    if (isNamespaceObj(pv)) {
      dirtyPaths(pv, isNamespaceObj(av) ? av : {}, [...prefix, key], out);
    } else if (JSON.stringify(pv) !== JSON.stringify(av)) {
      out.add([...prefix, key].join('.'));
    }
  }
  return out;
}

/**
 * D-029 — can `next()` advance anything in this scene?
 *
 * R-028 (5.4) — this WAS a local copy; it now delegates to the canonical
 * `hasNextStep` in `@cg/shared-schema`, because the Runtime's per-row NEXT verb
 * asks the same question and two copies is how the two surfaces come to
 * disagree (the repo's one-canonical-predicate rule). The shared version also
 * closes two under-reports this copy had: it descends into `repeater` rows and
 * into D-083 sequence composition items, both of which the runtime's `next()`
 * cascade genuinely reaches.
 */
function canStepScene(scene: Scene): boolean {
  return hasNextStep(scene, scene.compositions);
}

/**
 * D-029 — `list` fields bound `sequence-items` (in the scene or any
 * composition doc) get the per-item dwell column in the preview form.
 */
function sequenceListFieldIds(scene: Scene): ReadonlySet<string> {
  const out = new Set<string>();
  const docs = [scene, ...(scene.compositions ?? [])];
  for (const d of docs) {
    for (const b of d.bindings ?? []) {
      if (b.target.kind === 'sequence-items') out.add(b.fieldId);
    }
  }
  return out;
}

/**
 * D-030 — `list` fields bound `repeater-items` get one editor column per
 * referenced child-composition field (the same columned editor the
 * inspector shows). KNOWN LIMIT: the map is keyed by field id ONLY — field
 * bindings are per-document (D-025), so the SAME id bound to repeaters with
 * different children in two docs would show one doc's columns for both
 * (display-only; values and runtime routing stay correct). Keying by
 * namespace path is the fix if that authoring pattern ever matters.
 */
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
  const assets = useAssets();
  const sharedImages = useSharedImages();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const documentGenerationRef = useRef(0);
  const [previewDocument, setPreviewDocument] = useState<{
    scene: Scene;
    html: string;
    generation: number;
  } | null>(null);
  const [readyGeneration, setReadyGeneration] = useState<number | null>(null);
  const transportReady =
    previewDocument !== null &&
    previewDocument.scene === scene &&
    readyGeneration === previewDocument.generation;
  // Measured stage size, so the composition scales to fit whatever the (large)
  // modal gives us rather than a fixed thumbnail.
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  // D-020 / D-026 — session-only playout overrides (mode / holdMs / repeat), now
  // PER-SCOPE: keyed by the composition-instance path (`''` = this composition,
  // `'home'` a child instance, `'home.inner'` a grandchild — the same names the
  // nested field scopes use). Held here, never written back to the stored scene;
  // applied by rebuilding the preview runtime with these overrides.
  const [overrides, setOverrides] = useState<Record<string, TimingOverride>>({});
  const imageChoices = useMemo(
    () => imageChoicesForAssets(assets, sharedImages),
    [assets, sharedImages],
  );
  const repeaterColumns = useMemo(
    () => repeaterColumnsByFieldId(scene, imageChoices),
    [imageChoices, scene],
  );

  // D-196 — Preview owns a Look choice for this rehearsal session. Seed from the
  // authoring canvas when possible, but never write the Preview choice back to the project.
  const lookGroup = useMemo(() => lookGroupOf(scene), [scene]);
  const lookChoices = useMemo(
    () => (lookGroup?.looks ?? []).map((look) => ({ value: look.id, label: look.name })),
    [lookGroup],
  );
  const initialLookId = useCallback((): string => {
    const authoringId = designerStore.get().activeLookId;
    return (
      lookGroup?.looks.find((look) => look.id === authoringId)?.id ??
      (lookGroup === undefined ? undefined : defaultLookOf(lookGroup)?.id) ??
      ''
    );
  }, [lookGroup]);
  const [previewLookId, setPreviewLookId] = useState(initialLookId);
  const previewLookIdRef = useRef(previewLookId);
  previewLookIdRef.current = previewLookId;
  useEffect(() => {
    setPreviewLookId(initialLookId());
  }, [initialLookId]);

  // D-025 — the aggregated fields: this composition's own fields plus each nested
  // child instance's fields under its namespace.
  // `RUN-NEXT-VERSION-02` Q3 — each list carries its repeater's row limit, so the form stops there.
  const aggregate = useMemo(
    () =>
      countdownTargetFieldsOf(
        scene,
        scene,
        withListLimits(scene, scene, aggregateCompositionFields(scene, scene)),
      ),
    [scene],
  );
  // Nested field values live here (not in the form) so the fixed transport bar can
  // play() with the current data. Re-seed when the form *shape* changes (fields or
  // nested instances added/removed/renamed) but not on unrelated edits, so typed
  // test values survive — the "adjust state during render on key change" pattern.
  const shapeKey = useMemo(() => aggregateShapeKey(aggregate), [aggregate]);
  const [values, setValues] = useState<NestedFieldValues>(() => previewSeed(scene.id, aggregate));
  // D-106 — `values` is the PENDING (edited) form state; `applied` is what's on the
  // stage. Editing changes `values` only; an explicit Update commits pending → applied.
  const [applied, setApplied] = useState<NestedFieldValues>(() => previewSeed(scene.id, aggregate));
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const [seededKey, setSeededKey] = useState(shapeKey);
  if (seededKey !== shapeKey) {
    setSeededKey(shapeKey);
    const seeded = previewSeed(scene.id, aggregate);
    setValues(seeded);
    setApplied(seeded);
  }

  // Tracks whether the operator paused, so Play becomes Resume and Pause disables.
  const [paused, setPaused] = useState(false);
  // D-173 — a monotonic rehearsal clock. It is UI/session state only: a fresh Play starts at
  // zero, Pause freezes it, Resume continues it, Stop resets it, and natural completion settles it.
  const [elapsedMs, setElapsedMs] = useState(0);
  // D-182 — unlike elapsed wall time, this is reported by the root runtime controller itself.
  // It therefore parks during Hold, advances through Outro and wraps with a real loop.
  const [runtimeFrame, setRuntimeFrame] = useState(scene.frameRange.in);
  const [elapsedRunning, setElapsedRunning] = useState(false);
  const elapsedBaseRef = useRef(0);
  const elapsedStartedRef = useRef<number | null>(null);
  // Stop/Reset close the run before Runtime's asynchronous outro/final-frame messages arrive.
  // Those messages must not overwrite the counters' reset-to-start state.
  const acceptRuntimeFramesRef = useRef(false);
  const rootTimingOverride = overrides[''];
  const authoredFrameClock = useMemo(() => rootUsesAuthoredFrameClock(scene), [scene]);
  const elapsedLimitMs = useMemo(
    () => previewElapsedLimitMs(scene, rootTimingOverride),
    [rootTimingOverride, scene],
  );
  const displayedFrame = useMemo(
    () => previewDisplayFrame(scene, runtimeFrame, elapsedMs, rootTimingOverride),
    [elapsedMs, rootTimingOverride, runtimeFrame, scene],
  );

  const currentElapsed = useCallback((): number => {
    const started = elapsedStartedRef.current;
    const current = elapsedBaseRef.current + (started === null ? 0 : performance.now() - started);
    return elapsedLimitMs === null ? current : Math.min(current, elapsedLimitMs);
  }, [elapsedLimitMs]);
  const startElapsed = useCallback((resume: boolean): void => {
    elapsedBaseRef.current = resume ? elapsedBaseRef.current : 0;
    elapsedStartedRef.current = performance.now();
    if (!resume) setElapsedMs(0);
    setElapsedRunning(true);
  }, []);
  const pauseElapsed = useCallback((): void => {
    const next = currentElapsed();
    elapsedBaseRef.current = next;
    elapsedStartedRef.current = null;
    setElapsedMs(next);
    setElapsedRunning(false);
  }, [currentElapsed]);
  const resetElapsed = useCallback((): void => {
    elapsedBaseRef.current = 0;
    elapsedStartedRef.current = null;
    setElapsedMs(0);
    setElapsedRunning(false);
  }, []);

  useEffect(() => {
    if (!elapsedRunning) return;
    let frame = 0;
    const tick = (): void => {
      const next = currentElapsed();
      setElapsedMs(next);
      if (elapsedLimitMs !== null && next >= elapsedLimitMs) {
        elapsedBaseRef.current = elapsedLimitMs;
        elapsedStartedRef.current = null;
        setElapsedRunning(false);
        // A collapsed empty/static Runtime may already have stopped. Re-arm fresh Play only when
        // its authored display tail has also settled; real animated/media roots retain their
        // existing Runtime-owned frame acceptance.
        if (authoredFrameClock) {
          acceptRuntimeFramesRef.current = false;
          setPaused(false);
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [authoredFrameClock, currentElapsed, elapsedLimitMs, elapsedRunning]);

  // Build a fresh, dedicated preview document on open. Reset any session
  // override + paused flag when the composition itself changes (keeps controls in
  // sync).
  useEffect(() => {
    let alive = true;
    const generation = ++documentGenerationRef.current;
    setReadyGeneration(null);
    setPreviewDocument(null);
    setOverrides({});
    setPaused(false);
    acceptRuntimeFramesRef.current = false;
    setRuntimeFrame(scene.frameRange.in);
    resetElapsed();
    // D-125 — make sure this composition's Lottie animations are parsed + cached before
    // the ready handler posts the map (the canvas usually primed them already; this is a
    // safety net so a Lottie renders even if the modal is the first surface to need it).
    void primeSceneLottie(scene);
    // D-087 — the modal mirrors broadcast: open loaded-but-unpainted (blank)
    // and paint only on Play. The editor canvas omits this flag (stays visible
    // for editing).
    void window.cg.preview.load({ scene, broadcast: true }).then((res) => {
      if (alive) setPreviewDocument({ scene, html: res.html, generation });
    });
    return () => {
      alive = false;
    };
  }, [resetElapsed, scene]);

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

  const onPreviewLookChange = useCallback(
    (lookId: string): void => {
      if (lookGroup?.looks.some((look) => look.id === lookId) !== true) return;
      setPreviewLookId(lookId);
      post({ action: 'look', lookId });
    },
    [lookGroup, post],
  );

  const dispatch = useMemo<PreviewDispatch>(
    () => ({
      update: (f) => post({ action: 'update', fields: f }),
      play: (f) => post({ action: 'play', fields: f }),
      stop: () => post({ action: 'stop' }),
      out: () => post({ action: 'out' }),
      next: () => post({ action: 'next' }),
      previous: () => post({ action: 'previous' }),
      reset: (fields) => post({ action: 'reset', fields }),
      pause: () => post({ action: 'pause' }),
      resume: () => post({ action: 'resume' }),
    }),
    [post],
  );

  // D-106 — editing stages a PENDING value; it does NOT touch the stage until an
  // explicit Update (global or per-field) is pressed.
  const onFieldChange = useCallback((path: string[], value: FieldValue): void => {
    setValues((prev) => setIn(prev, path, value));
  }, []);

  // Momentary playout commands. Play resumes when paused; otherwise plays with the
  // current data. None of them is a toggle — each is a one-shot command.
  const onPlay = useCallback(() => {
    // The generated document installs its listener after its asynchronous boot. A command
    // before its own ready signal would be lost, while starting these counters would lie.
    if (!transportReady) return;
    if (paused) {
      acceptRuntimeFramesRef.current = true;
      dispatch.resume();
      setPaused(false);
      startElapsed(true);
    } else {
      // D-106 — Play commits the prepared (pending) values and starts a fresh rehearsal.
      // Commit the counters before the iframe can synchronously collapse a visually-static
      // lifecycle from its first frame to its last. Without this boundary, React batches the
      // reset with the iframe's terminal-frame message and a second Play appears to leave the
      // frame counter stuck at the previous run's end even though elapsed time restarted.
      acceptRuntimeFramesRef.current = true;
      flushSync(() => {
        setRuntimeFrame(scene.activeRange?.in ?? scene.frameRange.in);
        startElapsed(false);
      });
      dispatch.play(values);
      setApplied(values);
    }
  }, [
    dispatch,
    paused,
    scene.activeRange?.in,
    scene.frameRange.in,
    startElapsed,
    transportReady,
    values,
  ]);
  const onPause = useCallback(() => {
    if (!transportReady) return;
    dispatch.pause();
    setPaused(true);
    pauseElapsed();
  }, [dispatch, pauseElapsed, transportReady]);
  const onStop = useCallback(() => {
    if (!transportReady) return;
    acceptRuntimeFramesRef.current = false;
    dispatch.stop();
    setPaused(false);
    setRuntimeFrame(scene.activeRange?.in ?? scene.frameRange.in);
    resetElapsed();
  }, [dispatch, resetElapsed, scene.activeRange?.in, scene.frameRange.in, transportReady]);
  const onNext = useCallback(() => {
    if (transportReady) dispatch.next();
  }, [dispatch, transportReady]);
  const onPrevious = useCallback(() => {
    if (transportReady) dispatch.previous();
  }, [dispatch, transportReady]);
  const onReset = useCallback(() => {
    const seeded = previewSeed(scene.id, aggregate);
    setValues(seeded);
    setApplied(seeded);
    acceptRuntimeFramesRef.current = false;
    dispatch.reset(seeded);
    setPaused(false);
    setRuntimeFrame(scene.frameRange.in);
    resetElapsed();
  }, [dispatch, aggregate, resetElapsed, scene.frameRange.in, scene.id]);
  // D-106 / D-173 — one clear commit point: Update all applies every prepared value in place.
  const onUpdateAll = useCallback(() => {
    setApplied(values);
    dispatch.update(values);
  }, [dispatch, values]);
  /*
    `D-165` — the preview's SOUND switch, ON by default (the Designer is where an author listens to
    the sound they placed). Sent to the page's own runtime, and sent again whenever the page boots,
    because a rebuilt page starts unmuted.

    `DELTA-RUN-NEXT-VERSION-01-G` — ONE switch, the timeline's and this one: it lives in the store
    (session-only), so turning the sound off under the canvas leaves the Preview off too, and the
    state is shown on both — a muted preview is never mistaken for a broken one.
  */
  const hasSound = useMemo(() => hasSoundEffects(scene, scene.compositions), [scene]);
  const soundMuted = useDesignerSelector((st) => st.soundMuted);
  // The page-boot handler reads the switch without re-subscribing on every toggle.
  const soundMutedRef = useRef(soundMuted);
  soundMutedRef.current = soundMuted;
  useEffect(() => {
    post({ action: 'sound-muted', muted: soundMuted });
  }, [post, soundMuted]);
  const onToggleSound = useCallback(() => {
    designerStore.setSoundMuted(!soundMutedRef.current);
  }, []);
  /*
    `D-141` (design §7.4) / DELTA-RUN-NEXT-VERSION-01-A — the two STEP rehearsal knobs, shown only
    when a countdown has steps: a clock RATE (the page's one clock runs N× faster, so an hour of
    steps replays in a minute) and a SHOWN step (Before, each step, At zero — with everything it
    changes, through the runtime's own `rehearseStep`). Session-only, like Sound, and re-sent when
    the page boots.
  */
  const stepChoices = useMemo(() => stepRehearsalChoices(scene), [scene]);
  const [clockRate, setClockRate] = useState(1);
  const clockRateRef = useRef(1);
  const onClockRate = useCallback(
    (rate: number) => {
      clockRateRef.current = rate;
      setClockRate(rate);
      post({ action: 'clock-rate', rate });
    },
    [post],
  );
  const [forcedStep, setForcedStep] = useState('');
  const forcedStepRef = useRef('');
  const onForceStep = useCallback(
    (value: string) => {
      // Release the countdown shown before (it returns to its live step), then show the new one.
      const previous = parseRehearsalChoice(forcedStepRef.current);
      if (previous !== null)
        post({ action: 'rehearse-step', clockId: previous.clockId, live: true });
      forcedStepRef.current = value;
      setForcedStep(value);
      const next = parseRehearsalChoice(value);
      if (next !== null) post({ action: 'rehearse-step', clockId: next.clockId, step: next.step });
    },
    [post],
  );
  const pendingPaths = useMemo(() => dirtyPaths(values, applied), [values, applied]);
  const anyPending = pendingPaths.size > 0;

  // Apply the session overrides by rebuilding the preview runtime with them (the
  // stored scene + non-persistent per-scope overrides). The iframe preserves typed
  // field values across the rebuild, and the stored scene is untouched. No-op until
  // the operator actually changes a knob on some scope. Settings prepared during
  // boot must wait for the document's listener too, rather than being dropped.
  useEffect(() => {
    if (!transportReady) return;
    const hasAny = Object.values(overrides).some((o) => Object.keys(o).length > 0);
    if (!hasAny) return;
    post({
      action: 'scene-replace',
      scene,
      // D-039ext / D-040 — merge project + shared caches so a shared image (logo element
      // OR ticker image separator) resolves in the preview, as it does on the canvas.
      assetUrls: { ...assetUrlGetAll(), ...sharedUrlGetAll(), ...sharedFontUrlGetAll() },
      // D-125 — carry the parsed Lottie map so a rebuilt runtime keeps its players.
      // B-137 — SCENE-SCOPED: the whole-cache form kept this map non-empty after a
      // Lottie was deleted, which kept forcing the rebuild that strands a playing video.
      lottieAssets: lottieAssetsForScene(scene),
      playoutOverride: overrides[''],
      scopeOverrides: overrides,
    });
  }, [overrides, scene, post, transportReady]);

  // Seed our iframe (only ours) once it signals readiness.
  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as { kind?: string; state?: string; frame?: number } | undefined;
      if (previewDocument === null || previewDocument.scene !== scene) return;
      if (evt.source !== iframeRef.current?.contentWindow) return;
      if (msg?.kind === 'cg-preview-frame' && typeof msg.frame === 'number') {
        if (acceptRuntimeFramesRef.current) setRuntimeFrame(msg.frame);
        return;
      }
      if (msg?.kind === 'cg-preview-state' && msg.state === 'stopped') {
        // A Stop/Reset has already settled the host synchronously; ignore its asynchronous echo.
        if (!acceptRuntimeFramesRef.current) return;
        const stoppedAt = currentElapsed();
        acceptRuntimeFramesRef.current = false;
        if (shouldDeferPreviewNaturalStop(scene, stoppedAt, elapsedLimitMs)) return;
        pauseElapsed();
        setPaused(false);
        return;
      }
      if (msg?.kind !== 'cg-preview-ready') return;
      // D-028 — the iframe boots with an empty assetUrls map; without this
      // push, operator-imported (asset-*) fonts could never load here and the
      // play-path font await would be a no-op on the only surface that plays.
      post({
        action: 'asset-urls',
        assetUrls: { ...assetUrlGetAll(), ...sharedUrlGetAll(), ...sharedFontUrlGetAll() },
      });
      // D-125 — seed the parsed Lottie map too (the srcDoc boot has an empty one), so a
      // Lottie mounts its player on this dedicated preview iframe.
      post({ action: 'lottie-assets', lottieAssets: lottieAssetsForScene(scene) });
      // D-196 — the iframe is new and has forgotten the Preview-local Look.
      if (previewLookIdRef.current !== '') {
        post({ action: 'look', lookId: previewLookIdRef.current });
      }
      post({ action: 'scrub', frame: 0 });
      post({ action: 'update', fields: appliedRef.current });
      // `D-165` — a freshly booted page starts unmuted; carry the author's switch over.
      post({ action: 'sound-muted', muted: soundMutedRef.current });
      // `D-141` — and the zone rehearsal knobs, which a fresh page has forgotten too.
      if (clockRateRef.current > 1) post({ action: 'clock-rate', rate: clockRateRef.current });
      {
        const shown = parseRehearsalChoice(forcedStepRef.current);
        if (shown !== null)
          post({ action: 'rehearse-step', clockId: shown.clockId, step: shown.step });
      }
      setReadyGeneration(previewDocument.generation);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // `scene` joins the deps because the seeded Lottie map is now scoped to it.
  }, [post, aggregate, currentElapsed, elapsedLimitMs, pauseElapsed, previewDocument, scene]);

  // Tear down on close — stop the runtime; the iframe unmounts with the modal.
  useEffect(() => () => post({ action: 'stop' }), [post]);

  const { width: resW, height: resH } = scene.resolution;
  const scale =
    stageSize.w > 0 && stageSize.h > 0 ? Math.min(stageSize.w / resW, stageSize.h / resH) : 0;

  return (
    <Modal
      title={`Preview · ${String(resW)}×${String(resH)}`}
      onClose={onClose}
      width="min(1800px, 98vw)"
      minBodyHeight="84vh"
      maxHeight="96vh"
      ariaLabel="Composition preview"
    >
      <div className={s.layout}>
        <div className={s.stageColumn}>
          <PreviewStatus
            compositionName={scene.name}
            elapsedMs={elapsedMs}
            currentFrame={displayedFrame}
            totalFrames={scene.frameRange.out}
          />
          <div ref={stageRef} className={s.stage}>
            {previewDocument !== null && previewDocument.scene === scene && (
              <iframe
                // Remount even when HTML is identical: a reused iframe keeps its WindowProxy,
                // so an obsolete document's queued ready event could unlock its replacement.
                key={previewDocument.generation}
                ref={iframeRef}
                title="cgpreview-modal"
                srcDoc={previewDocument.html}
                className={s.stageFrame}
                style={{
                  width: resW,
                  height: resH,
                  transform: `translate(-50%, -50%) scale(${String(scale)})`,
                }}
              />
            )}
          </div>
        </div>
        <div className={s.sidebar}>
          <div className={s.fixedBar}>
            <PreviewTransport
              ready={transportReady}
              lookChoices={lookChoices}
              activeLookId={previewLookId}
              onLookChange={onPreviewLookChange}
              paused={paused}
              canStep={canStepScene(scene)}
              onPlay={onPlay}
              onPause={onPause}
              onStop={onStop}
              onPrevious={onPrevious}
              onNext={onNext}
              onReset={onReset}
              hasSound={hasSound}
              soundMuted={soundMuted}
              onToggleSound={onToggleSound}
              stepChoices={stepChoices}
              clockRate={clockRate}
              onClockRate={onClockRate}
              forcedStep={forcedStep}
              onForceStep={onForceStep}
            />
            <details className={s.advanced}>
              <summary>Advanced</summary>
              <div className={s.timingScroll}>
                <PreviewScopeTiming
                  scene={scene}
                  overrides={overrides}
                  onChange={(path, patch) =>
                    setOverrides((prev) => ({ ...prev, [path]: { ...prev[path], ...patch } }))
                  }
                />
              </div>
            </details>
          </div>
          <div className={s.fieldsScroll}>
            <PreviewFieldForm
              aggregate={aggregate}
              values={values}
              onChange={onFieldChange}
              pendingPaths={pendingPaths}
              onUpdateAll={onUpdateAll}
              anyPending={anyPending}
              dwellFieldIds={sequenceListFieldIds(scene)}
              columnsByFieldId={repeaterColumns}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
