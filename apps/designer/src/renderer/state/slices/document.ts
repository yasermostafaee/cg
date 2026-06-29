import type { Playout, Scene } from '@cg/shared-schema';
import { activeRangeOf, playoutOf } from '@cg/shared-schema';
import {
  current,
  getNoticeTimer,
  resetHistory,
  set,
  setClipboard,
  setNoticeTimer,
  setSavedBaseline,
  setSuppressHistory,
  type DesignerView,
} from '../store-core.js';
import {
  activeCompId,
  activeDocOf,
  ensureCompositions,
  normalizeKeyframeIds,
  withActiveDoc,
} from '../scene-doc.js';

/**
 * Document slice — project lifecycle (load/close, top-level view, the toast
 * notice) and the active document's own scene-level fields (size / duration /
 * active region / lifecycle out-point / playout). `setScene` resets the history
 * + clipboard through the engine's mutators (`store-core.ts`); the doc-prop
 * actions route their patch to the active composition via `withActiveDoc`. See
 * `state/README.md`.
 */
export const documentSlice = {
  setScene(scene: Scene | null, projectPath: string | null): void {
    resetHistory();
    setClipboard([]);
    setSuppressHistory(true);
    // Normalise to the composition model (migrate legacy root layers → a comp)
    // and open the first composition, if any.
    let activeId: string | null = null;
    let normalized: Scene | null = null;
    if (scene !== null) {
      const ensured = ensureCompositions(normalizeKeyframeIds(scene));
      normalized = ensured.scene;
      activeId = ensured.activeId;
    }
    // A freshly loaded/closed project starts clean — nothing to save yet. Baseline both
    // the scene reference AND its content hash (D-088).
    setSavedBaseline(normalized);
    try {
      set({
        scene: normalized,
        projectPath,
        activeCompositionId: activeId,
        view: scene === null ? 'landing' : 'studio',
        selection: new Set<string>(),
        selectedKeyframe: null,
        selectedKeyframes: [],
        keyframeInspectorOpen: false,
        currentFrame: 0,
        snapGuides: { x: [], y: [] },
        guides: { x: [], y: [] },
      });
    } finally {
      setSuppressHistory(false);
    }
  },

  /** Explicitly switch top-level view (used by "back to projects"). */
  setView(view: DesignerView): void {
    if (view === current.view) return;
    set({ view });
  },

  /**
   * D-088 — fully CLOSE the active project: clears the scene, the saved baseline + content
   * hashes, the project path, and history, and returns to the landing view (via `setScene`).
   * Home and "Close project" use this so the landing page holds no dirty project and the
   * unsaved-changes guard cannot re-fire there (fixes the duplicate-modal bug). The on-disk
   * file handle is keyed by project id in the bridge/IndexedDB and is intentionally kept so
   * the project reopens from Recent; closing just drops the in-editor reference.
   */
  closeProject(): void {
    documentSlice.setScene(null, null);
  },

  /** Show a transient toast notice (auto-clears). Replaces any current one. */
  showNotice(message: string): void {
    const t = getNoticeTimer();
    if (t !== null) clearTimeout(t);
    set({ notice: message });
    setNoticeTimer(
      setTimeout(() => {
        setNoticeTimer(null);
        set({ notice: null });
      }, 5000) as unknown as number,
    );
  },

  /** Dismiss the current toast notice immediately. */
  dismissNotice(): void {
    const t = getNoticeTimer();
    if (t !== null) {
      clearTimeout(t);
      setNoticeTimer(null);
    }
    if (current.notice !== null) set({ notice: null });
  },

  /**
   * Merge a shallow patch onto the active scene (background, name,
   * frameRange, etc.). The scene reference is replaced so React /
   * preview subscribers re-render through the existing pipeline.
   */
  updateScene(patch: Partial<Scene>): void {
    if (current.scene === null) return;
    // When the main scene is active, a plain shallow merge. When a composition
    // is active, doc-level keys (size / duration / background / name / layers)
    // target the composition; project-level keys (fields, bindings, fonts,
    // compositions, metadata) stay on the scene root.
    if (activeCompId() === null) {
      set({ scene: { ...current.scene, ...patch } });
      return;
    }
    // D-026 — `frameRate` is project-level: it is intentionally NOT a doc key, so
    // an fps patch routes to the scene root (shared by every composition).
    const docKeys = new Set([
      'resolution',
      'frameRange',
      'activeRange',
      'lifecycle',
      'playout',
      'background',
      'name',
      'layers',
    ]);
    const docPatch: Record<string, unknown> = {};
    const rootPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      (docKeys.has(k) ? docPatch : rootPatch)[k] = v;
    }
    let scene = current.scene;
    if (Object.keys(docPatch).length > 0) {
      scene = {
        ...scene,
        compositions: (scene.compositions ?? []).map((c) =>
          c.id === current.activeCompositionId ? { ...c, ...docPatch } : c,
        ),
      };
    }
    if (Object.keys(rootPatch).length > 0) scene = { ...scene, ...rootPatch };
    set({ scene });
  },

  /**
   * Set the scene's **total** duration in frames. Updates `frameRange.out`
   * to `frameRange.in + frames` and clamps the authoring `currentFrame` so
   * the playhead can't sit past the new end. When an `activeRange` exists it
   * is clamped to stay within the new total (a shorter total pulls the active
   * out-point in; a longer total leaves the active region untouched).
   * Existing keyframes are preserved — widening again restores their effect.
   */
  setSceneDurationFrames(frames: number): void {
    if (current.scene === null) return;
    const doc = activeDocOf(current.scene);
    const safe = Math.max(1, Math.floor(frames));
    const inFrame = doc.frameRange.in;
    const out = inFrame + safe;
    const nextFrame = Math.min(out, Math.max(inFrame, current.currentFrame));
    const prevActive = doc.activeRange;
    let activeRange = prevActive;
    if (prevActive !== undefined) {
      const aOut = Math.min(prevActive.out, out);
      const aIn = Math.max(inFrame, Math.min(prevActive.in, aOut - 1));
      activeRange = { in: aIn, out: aOut };
    }
    set({
      scene: withActiveDoc(current.scene, { frameRange: { in: inFrame, out }, activeRange }),
      currentFrame: nextFrame,
    });
  },

  /**
   * Resize the **active region** (the scene / main-layer bar) by setting its
   * out-point, clamped to `[activeRange.in + 1, frameRange.out]`. This never
   * touches `frameRange`, so the total frame count — and therefore the ruler
   * and the trailing frames — stay put. Playback and export use this window.
   */
  setSceneActiveOut(outFrames: number): void {
    if (current.scene === null) return;
    const doc = activeDocOf(current.scene);
    const { in: total0, out: total1 } = doc.frameRange;
    const inFrame = doc.activeRange?.in ?? total0;
    const out = Math.max(inFrame + 1, Math.min(total1, Math.round(outFrames)));
    const prev = doc.activeRange;
    if (prev !== undefined && prev.in === inFrame && prev.out === out) return;
    set({ scene: withActiveDoc(current.scene, { activeRange: { in: inFrame, out } }) });
  },

  /**
   * D-020 — set the active composition's lifecycle `outPoint` marker. Clamps to
   * the active region so the schema invariant `activeRange.in ≤ outPoint ≤
   * activeRange.out` always holds. Pass `null` to clear the lifecycle (back to no
   * distinct phases).
   */
  setLifecycle(marker: { outPoint: number } | null): void {
    if (current.scene === null) return;
    if (marker === null) {
      // D-114 (revises D-113) — clearing the out-point makes the composition `static` (no marker ⇒
      // no animated exit). The out-point-DEPENDENT modes (`auto-out` / `loop-cycle`) are rewritten to
      // `static` in the SAME action (one atomic undo step), so re-adding an out-point does NOT
      // auto-restore them (the invariant stays ONE-DIRECTIONAL). A `manual`/absent composition needs
      // no write — `playoutOf` already resolves a no-out-point default to `static` — so clearing it
      // leaves the playout untouched (no spurious write). `playoutOf(doc)` here still sees the
      // out-point (about to be cleared), so it returns the STORED mode.
      const doc = activeDocOf(current.scene);
      const stored = playoutOf(doc).mode;
      const revert = stored === 'auto-out' || stored === 'loop-cycle';
      set({
        scene: withActiveDoc(
          current.scene,
          revert
            ? { lifecycle: undefined, playout: { ...doc.playout, mode: 'static' as const } }
            : { lifecycle: undefined },
        ),
      });
      return;
    }
    const doc = activeDocOf(current.scene);
    const active = activeRangeOf(doc);
    const out = Math.max(active.in, Math.min(active.out, Math.round(marker.outPoint)));
    const prev = doc.lifecycle;
    // D-104 follow-up — PRESERVE the content-start marker across an out-point drag, but
    // re-clamp it to `[active.in, out]` (dragging the out-point below it pulls it along).
    const cs = prev?.contentStart === undefined ? undefined : Math.min(prev.contentStart, out);
    if (prev !== undefined && prev.outPoint === out && prev.contentStart === cs) return;
    const lifecycle = cs === undefined ? { outPoint: out } : { outPoint: out, contentStart: cs };
    // D-114 — ADDING the first out-point to a stored-`static` composition lands it on `manual` (the
    // benign default for an out-point composition; `static` means no out-point). This does NOT
    // restore any prior `auto-out` / `loop-cycle` (the clear-revert stays one-directional). Dragging
    // an existing out-point (`prev` defined) never touches the mode.
    const coerceStaticToManual = prev === undefined && doc.playout?.mode === 'static';
    set({
      scene: withActiveDoc(
        current.scene,
        coerceStaticToManual
          ? { lifecycle, playout: { ...doc.playout, mode: 'manual' as const } }
          : { lifecycle },
      ),
    });
  },

  /**
   * D-104 follow-up — set / clear the active composition's content-start marker (the frame
   * where ticker / clock / sequence begins). Clamped to `[active.in, outPoint]`. `null`
   * clears it (back to the runtime's `entranceSettleFrame()` heuristic). A no-op when no
   * out-point exists yet — the marker lives inside the lifecycle's entrance.
   */
  setContentStart(frame: number | null): void {
    if (current.scene === null) return;
    const doc = activeDocOf(current.scene);
    const prev = doc.lifecycle;
    if (prev === undefined) return;
    if (frame === null) {
      if (prev.contentStart === undefined) return;
      set({ scene: withActiveDoc(current.scene, { lifecycle: { outPoint: prev.outPoint } }) });
      return;
    }
    const active = activeRangeOf(doc);
    const cs = Math.max(active.in, Math.min(prev.outPoint, Math.round(frame)));
    if (prev.contentStart === cs) return;
    set({
      scene: withActiveDoc(current.scene, {
        lifecycle: { outPoint: prev.outPoint, contentStart: cs },
      }),
    });
  },

  /** D-020 — merge a patch onto the active composition's playout timing config. */
  setPlayout(patch: Partial<Playout>): void {
    if (current.scene === null) return;
    const next: Playout = { ...playoutOf(activeDocOf(current.scene)), ...patch };
    set({ scene: withActiveDoc(current.scene, { playout: next }) });
  },
} as const;
