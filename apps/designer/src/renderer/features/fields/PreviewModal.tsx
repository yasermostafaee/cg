import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aggregateCompositionFields,
  defaultNestedValues,
  type AggregatedFields,
  type FieldValue,
  type ListItem,
  type NestedFieldValues,
  type Scene,
} from '@cg/shared-schema';
import { getAll as assetUrlGetAll } from '../assets/assetUrlCache.js';
import { getAll as sharedUrlGetAll } from '../sharedLibrary/sharedImageUrlCache.js';
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

/** Read a nested value at `path` (undefined when absent). */
function getIn(obj: NestedFieldValues, path: string[]): FieldValue {
  let cur: unknown = obj;
  for (const k of path) cur = (cur as Record<string, unknown> | undefined)?.[k];
  return cur as FieldValue;
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
 * D-029 — can `next()` advance anything in this scene? True when the scene
 * (or any of its compositions — nested instances advance via the runtime's
 * per-scope cascade) contains a sequence element. The D-031 steps model will
 * widen this same predicate when authored steps join the next() dispatch.
 */
function canStepScene(scene: Scene): boolean {
  // B-034 — walk the instance tree FROM THE ROOT (not every composition independently) so visibility
  // propagates through ancestors: a sequence reachable ONLY through a HIDDEN instance / container (or
  // a hidden sequence itself) is inert and must NOT make the scene steppable — mirroring render's
  // display:none and the runtime hold. Cycle-guarded like the other instance walks.
  const visited = new Set<string>();
  const walk = (children: readonly Scene['layers'][number]['children'][number][]): boolean =>
    children.some((el) => {
      if (el.type === 'sequence') return el.visible !== false;
      if (el.type === 'container') return el.visible !== false && walk(el.children);
      if (el.type === 'composition') {
        if (el.visible === false || visited.has(el.compositionId)) return false;
        visited.add(el.compositionId);
        const comp = scene.compositions?.find((c) => c.id === el.compositionId);
        return comp !== undefined && comp.layers.some((l) => walk(l.children));
      }
      return false;
    });
  return scene.layers.some((l) => walk(l.children));
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
  // D-106 — `values` is the PENDING (edited) form state; `applied` is what's on the
  // stage. Editing changes `values` only; an explicit Update commits pending → applied.
  const [applied, setApplied] = useState<NestedFieldValues>(() => defaultNestedValues(aggregate));
  const [seededKey, setSeededKey] = useState(shapeKey);
  if (seededKey !== shapeKey) {
    setSeededKey(shapeKey);
    const seeded = defaultNestedValues(aggregate);
    setValues(seeded);
    setApplied(seeded);
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
    // D-087 — the modal mirrors broadcast: open loaded-but-unpainted (blank)
    // and paint only on Play. The editor canvas omits this flag (stays visible
    // for editing).
    void window.cg.preview.load({ scene, broadcast: true }).then((res) => {
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
      out: () => post({ action: 'out' }),
      next: () => post({ action: 'next' }),
      reset: () => post({ action: 'reset' }),
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
    if (paused) {
      dispatch.resume();
      setPaused(false);
    } else {
      // D-106 — Play commits the prepared (pending) values and plays them.
      dispatch.play(values);
      setApplied(values);
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
  // D-105 — the coordinated animated exit (distinct from Stop's quick clear).
  const onOut = useCallback(() => {
    dispatch.out();
    setPaused(false);
  }, [dispatch]);
  const onNext = useCallback(() => dispatch.next(), [dispatch]);
  const onReset = useCallback(() => {
    const seeded = defaultNestedValues(aggregate);
    setValues(seeded);
    setApplied(seeded);
    dispatch.reset();
    setPaused(false);
  }, [dispatch, aggregate]);
  // D-106 — apply pending edits to the stage. "Update all" commits every pending
  // field at once; a per-field Update commits just one path.
  const onUpdateAll = useCallback(() => {
    setApplied(values);
    dispatch.update(values);
  }, [dispatch, values]);
  const onUpdateField = useCallback(
    (path: string[]) => {
      const next = setIn(applied, path, getIn(values, path));
      setApplied(next);
      dispatch.update(next);
    },
    [applied, values, dispatch],
  );
  // D-106 follow-up — apply ONE item of a `list` field (per-input granularity): merge
  // just that item (matched by stable id) from pending into the applied list, leaving
  // every other item's applied value untouched, so each item input commits on its own.
  const onUpdateListItem = useCallback(
    (path: string[], itemId: string) => {
      const pendingList = getIn(values, path);
      if (!Array.isArray(pendingList)) return;
      const pArr = pendingList as ListItem[];
      const appliedList = getIn(applied, path);
      const aArr = Array.isArray(appliedList) ? (appliedList as ListItem[]) : [];
      const pItem = pArr.find((it) => it.id === itemId);
      if (pItem === undefined) return; // item was removed in pending — "Update all" handles that
      let nextArr: ListItem[];
      if (aArr.some((it) => it.id === itemId)) {
        nextArr = aArr.map((it) => (it.id === itemId ? pItem : it));
      } else {
        // A brand-new item: insert it at its pending index (best effort) so order is sane.
        const at = Math.min(Math.max(pArr.indexOf(pItem), 0), aArr.length);
        nextArr = [...aArr.slice(0, at), pItem, ...aArr.slice(at)];
      }
      const next = setIn(applied, path, nextArr as unknown as FieldValue);
      setApplied(next);
      dispatch.update(next);
    },
    [applied, values, dispatch],
  );
  const pendingPaths = useMemo(() => dirtyPaths(values, applied), [values, applied]);
  const anyPending = pendingPaths.size > 0;

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
      // D-039ext / D-040 — merge project + shared caches so a shared image (logo element
      // OR ticker image separator) resolves in the preview, as it does on the canvas.
      assetUrls: { ...assetUrlGetAll(), ...sharedUrlGetAll() },
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
      post({ action: 'asset-urls', assetUrls: { ...assetUrlGetAll(), ...sharedUrlGetAll() } });
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
              appliedValues={applied}
              onChange={onFieldChange}
              pendingPaths={pendingPaths}
              onUpdateField={onUpdateField}
              onUpdateItem={onUpdateListItem}
              onUpdateAll={onUpdateAll}
              anyPending={anyPending}
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
              onOut={onOut}
              onStop={onStop}
              onNext={onNext}
              onReset={onReset}
            />
            <div className={s.timingScroll}>
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
      </div>
    </Modal>
  );
}
