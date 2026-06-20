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
    setClipboard(null);
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
      set({ scene: withActiveDoc(current.scene, { lifecycle: undefined }) });
      return;
    }
    const active = activeRangeOf(activeDocOf(current.scene));
    const out = Math.max(active.in, Math.min(active.out, Math.round(marker.outPoint)));
    const prev = activeDocOf(current.scene).lifecycle;
    if (prev !== undefined && prev.outPoint === out) return;
    set({
      scene: withActiveDoc(current.scene, { lifecycle: { outPoint: out } }),
    });
  },

  /** D-020 — merge a patch onto the active composition's playout timing config. */
  setPlayout(patch: Partial<Playout>): void {
    if (current.scene === null) return;
    const next: Playout = { ...playoutOf(activeDocOf(current.scene)), ...patch };
    set({ scene: withActiveDoc(current.scene, { playout: next }) });
  },
} as const;
