import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aggregateCompositionFields,
  defaultNestedValues,
  type AggregatedFields,
  type FieldValue,
  type NestedFieldValues,
  type Scene,
} from '@cg/shared-schema';
import { getAll as assetUrlGetAll } from '../assets/assetUrlCache.js';
import { Modal } from '../shell/Modal.js';
import { PreviewFieldForm, type PreviewDispatch } from './PreviewFieldForm.js';
import { columnsForFields, type ListItemColumn } from './repeater-columns.js';
import { PreviewTransport } from './PreviewTransport.js';
import { PreviewScopeTiming } from './PreviewScopeTiming.js';
import { type TimingOverride } from './PreviewTimingControls.js';
import * as s from './PreviewModal.css.js';

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

/**
 * D-029 — can `next()` advance anything in this scene? True when the scene
 * (or any of its compositions — nested instances advance via the runtime's
 * per-scope cascade) contains a sequence element. The D-031 steps model will
 * widen this same predicate when authored steps join the next() dispatch.
 */
function canStepScene(scene: Scene): boolean {
  const docs = [scene, ...(scene.compositions ?? [])];
  const walk = (children: readonly Scene['layers'][number]['children'][number][]): boolean =>
    children.some((el) => el.type === 'sequence' || (el.type === 'container' && walk(el.children)));
  return docs.some((d) => d.layers.some((l) => walk(l.children)));
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
 * inspector shows). The map is keyed by field id across all docs.
 */
function repeaterColumnsByFieldId(scene: Scene): ReadonlyMap<string, readonly ListItemColumn[]> {
  const out = new Map<string, readonly ListItemColumn[]>();
  const docs: { layers: Scene['layers']; bindings?: Scene['bindings'] | undefined }[] = [
    scene,
    ...(scene.compositions ?? []),
  ];
  const findRepeater = (
    children: readonly Scene['layers'][number]['children'][number][],
    elementId: string,
  ): { compositionId: string } | undefined => {
    for (const el of children) {
      if (el.type === 'repeater' && el.id === elementId) return el;
      if (el.type === 'container') {
        const found = findRepeater(el.children, elementId);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  for (const d of docs) {
    for (const b of d.bindings ?? []) {
      if (b.target.kind !== 'repeater-items' || !('elementId' in b.target)) continue;
      for (const layer of d.layers) {
        const el = findRepeater(layer.children, b.target.elementId);
        if (el === undefined) continue;
        const child = scene.compositions?.find((c) => c.id === el.compositionId);
        if (child !== undefined) out.set(b.fieldId, columnsForFields(child.fields));
        break;
      }
    }
  }
  return out;
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
  // D-020 / D-026 — session-only playout overrides (mode / holdMs / repeat), now
  // PER-SCOPE: keyed by the composition-instance path (`''` = this composition,
  // `'home'` a child instance, `'home.inner'` a grandchild — the same names the
  // nested field scopes use). Held here, never written back to the stored scene;
  // applied by rebuilding the preview runtime with these overrides.
  const [overrides, setOverrides] = useState<Record<string, TimingOverride>>({});

  // D-025 — the aggregated fields: this composition's own fields plus each nested
  // child instance's fields under its namespace.
  const aggregate = useMemo(() => aggregateCompositionFields(scene, scene), [scene]);
  // Nested field values live here (not in the form) so the fixed transport bar can
  // play() with the current data. Re-seed when the form *shape* changes (fields or
  // nested instances added/removed/renamed) but not on unrelated edits, so typed
  // test values survive — the "adjust state during render on key change" pattern.
  const shapeKey = useMemo(() => aggregateShapeKey(aggregate), [aggregate]);
  const [values, setValues] = useState<NestedFieldValues>(() => defaultNestedValues(aggregate));
  const [seededKey, setSeededKey] = useState(shapeKey);
  if (seededKey !== shapeKey) {
    setSeededKey(shapeKey);
    setValues(defaultNestedValues(aggregate));
  }

  // Tracks whether the operator paused, so Play becomes Resume and Pause disables.
  const [paused, setPaused] = useState(false);

  // Build a fresh, dedicated preview document on open. Reset any session
  // override + paused flag when the composition itself changes (keeps controls in
  // sync).
  useEffect(() => {
    let alive = true;
    setOverrides({});
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
    (path: string[], value: FieldValue): void => {
      setValues((prev) => {
        const next = setIn(prev, path, value);
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
    setValues(defaultNestedValues(aggregate));
    dispatch.reset();
    setPaused(false);
  }, [dispatch, aggregate]);

  // Apply the session overrides by rebuilding the preview runtime with them (the
  // stored scene + non-persistent per-scope overrides). The iframe preserves typed
  // field values across the rebuild, and the stored scene is untouched. No-op until
  // the operator actually changes a knob on some scope.
  useEffect(() => {
    const hasAny = Object.values(overrides).some((o) => Object.keys(o).length > 0);
    if (!hasAny) return;
    post({
      action: 'scene-replace',
      scene,
      assetUrls: assetUrlGetAll(),
      playoutOverride: overrides[''],
      scopeOverrides: overrides,
    });
  }, [overrides, scene, post]);

  // Seed our iframe (only ours) once it signals readiness.
  useEffect(() => {
    function onMessage(evt: MessageEvent<unknown>): void {
      const msg = evt.data as { kind?: string } | undefined;
      if (msg?.kind !== 'cg-preview-ready') return;
      if (evt.source !== iframeRef.current?.contentWindow) return;
      // D-028 — the iframe boots with an empty assetUrls map; without this
      // push, operator-imported (asset-*) fonts could never load here and the
      // play-path font await would be a no-op on the only surface that plays.
      post({ action: 'asset-urls', assetUrls: assetUrlGetAll() });
      post({ action: 'scrub', frame: 0 });
      post({ action: 'update', fields: defaultNestedValues(aggregate) });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, aggregate]);

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
            <PreviewFieldForm
              aggregate={aggregate}
              values={values}
              onChange={onFieldChange}
              dwellFieldIds={sequenceListFieldIds(scene)}
              columnsByFieldId={repeaterColumnsByFieldId(scene)}
            />
          </div>
          <div className={s.fixedBar}>
            <PreviewTransport
              paused={paused}
              canStep={canStepScene(scene)}
              onPlay={onPlay}
              onPause={onPause}
              onStop={onStop}
              onNext={onNext}
              onReset={onReset}
            />
            <PreviewScopeTiming
              scene={scene}
              overrides={overrides}
              onChange={(path, patch) =>
                setOverrides((prev) => ({ ...prev, [path]: { ...prev[path], ...patch } }))
              }
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
