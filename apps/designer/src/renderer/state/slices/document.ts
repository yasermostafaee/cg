import type { Lifecycle, Playout, Scene } from '@cg/shared-schema';
import { migrateScenePaths } from '@cg/shared-schema';
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
  type EditDocFields,
} from '../scene-doc.js';

/**
 * Session V — THE ONE lifecycle-clamp rule: `active.in ≤ contentStart ≤ outPoint ≤
 * active.out` (`refineLifecycle`'s invariant), applied wherever either SIDE of the
 * relation moves. `setLifecycle` always clamped its own marker writes — but the writers
 * that move the WINDOW (`setSceneDurationFrames` shrinking the total, `setSceneActiveOut`
 * dragging the bar) never re-clamped the markers, so an out point could STRAND outside
 * the active range: the scene stopped parsing (`refineLifecycle` rejects it — a save that
 * cannot re-load), and every follow-source clip's OUT segment silently clamped to zero
 * (the owner's frozen-outro defect, instrumented 2026-08-13). One rule, one place —
 * the instrumented cause was precisely this rule existing in ONE writer and not the
 * others (the one-rule-twice family, B-100/P-012).
 *
 * Returns the ORIGINAL object when nothing moves, so untouched lifecycles stay
 * byte-identical (no spurious history entries, object-identity tests keep holding).
 */
function clampLifecycleTo(
  active: { in: number; out: number },
  lifecycle: Lifecycle | undefined,
): Lifecycle | undefined {
  if (lifecycle === undefined) return undefined;
  const out = Math.max(active.in, Math.min(active.out, lifecycle.outPoint));
  const cs =
    lifecycle.contentStart === undefined
      ? undefined
      : Math.max(active.in, Math.min(out, lifecycle.contentStart));
  if (out === lifecycle.outPoint && cs === lifecycle.contentStart) return lifecycle;
  return cs === undefined ? { outPoint: out } : { outPoint: out, contentStart: cs };
}

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
      // B-059/B-062 — migrate legacy paths to the size==visualBBox convention
      // FIRST (identity for conforming scenes, so a clean load stays clean).
      const ensured = ensureCompositions(normalizeKeyframeIds(migrateScenePaths(scene)));
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
    //
    // 🔴 **B-133 — this table is a set of STRINGS, so a field rename cannot break it
    // loudly.** B-129 renamed `background` -> `editorBackdrop` across the schema, the
    // renderer, the runtime and both exporters, and this literal stayed behind. The
    // result was silent and total: with a composition active (which is EVERY new
    // project — `newScene` seeds `comp1` and the operator lands inside it),
    // `editorBackdrop` fell through to `rootPatch` and was written to `scene.editorBackdrop`,
    // while the canvas renders `editSceneOf`, which reads `c.editorBackdrop`. Written to
    // one place, read from another: the backdrop control did nothing at all.
    //
    // The keys MUST stay in step with `EditDocFields` (`state/scene-doc.ts`) — the
    // `satisfies` below is what makes a future rename a TYPE ERROR here rather than a
    // control that quietly stops working.
    // `satisfies` is the guard: every literal must still NAME a real doc field, so
    // renaming one in `EditDocFields` fails the build HERE. (It does not assert
    // exhaustiveness — a brand-new doc field is a different, weaker risk. What bit us
    // was a rename leaving a dead string behind, and that is what this catches.)
    const DOC_KEYS = [
      'resolution',
      'frameRange',
      'activeRange',
      'lifecycle',
      'playout',
      'editorBackdrop',
      'name',
      'layers',
    ] as const satisfies readonly (keyof EditDocFields | 'name' | 'layers')[];
    const docKeys = new Set<string>(DOC_KEYS);
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
   * D-127 — rename the open PROJECT: set the scene-ROOT `name`.
   *
   * Deliberately NOT `updateScene({ name })`: `'name'` is one of that method's
   * `docKeys`, so with a composition active the patch is routed to the ACTIVE
   * COMPOSITION and renames *that* instead of the project. This targets the root
   * unconditionally. Do not "simplify" it back.
   *
   * The write goes through the normal `set()` path, so undo and the dirty flag
   * behave like any other edit (top-level `name` is in `hashScene`). Callers hold
   * the in-progress text in local state and call this ONCE on commit — a
   * per-keystroke call would push several history entries for one rename. An
   * empty / whitespace-only name is rejected (previous name kept, no undo entry).
   */
  renameProject(name: string): void {
    if (current.scene === null) return;
    const next = name.trim();
    if (next === '' || next === current.scene.name) return;
    set({ scene: { ...current.scene, name: next } });
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
    // Session V — a shrink can pull the ACTIVE WINDOW below the lifecycle markers; the
    // markers ride the same clamp `setLifecycle` applies (see clampLifecycleTo), else the
    // scene stops parsing and follow-source outros silently collapse to zero.
    const lifecycle = clampLifecycleTo(activeRange ?? { in: inFrame, out }, doc.lifecycle);
    set({
      scene: withActiveDoc(current.scene, {
        frameRange: { in: inFrame, out },
        activeRange,
        ...(lifecycle !== doc.lifecycle ? { lifecycle } : {}),
      }),
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
    // Session V — dragging the bar below the markers pulls them along (clampLifecycleTo:
    // the ONE invariant rule), never strands them outside the parseable range.
    const lifecycle = clampLifecycleTo({ in: inFrame, out }, doc.lifecycle);
    set({
      scene: withActiveDoc(current.scene, {
        activeRange: { in: inFrame, out },
        ...(lifecycle !== doc.lifecycle ? { lifecycle } : {}),
      }),
    });
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
    const prev = doc.lifecycle;
    // D-104 follow-up — PRESERVE the content-start marker across an out-point drag, but
    // re-clamp it (dragging the out-point below it pulls it along). Session V — the
    // clamp arithmetic is clampLifecycleTo, THE one rule every writer shares.
    const lifecycle = clampLifecycleTo(active, {
      outPoint: Math.round(marker.outPoint),
      ...(prev?.contentStart !== undefined ? { contentStart: prev.contentStart } : {}),
    })!;
    if (
      prev !== undefined &&
      prev.outPoint === lifecycle.outPoint &&
      prev.contentStart === lifecycle.contentStart
    ) {
      return;
    }
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
