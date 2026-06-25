import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';
import { hashScene } from './scene-hash.js';

/**
 * Designer store ENGINE — the hand-rolled pub/sub core the domain slices are
 * built on. This module owns the single source of truth (`current`), the lone
 * write primitive (`set`), the undo/redo history (welded to `set`'s coalescing
 * and the `dirty` flag), the subscriber set, and two transient module-level
 * caches (the element clipboard and the toast-notice timer).
 *
 * The split is BEHAVIOUR-PRESERVING: this is the same singleton store that used
 * to live in one file, with the engine carved out so each domain slice can
 * `import { current, set } from './store-core.js'` and keep its method bodies
 * identical. Only this module reassigns `current`/`past`/`future`/… — slices
 * READ `current` (a live ES-module binding) and WRITE through `set`, so a
 * cross-slice mutation behaves exactly as before. See `state/README.md`.
 */

export type DesignerTool =
  | 'cursor'
  | 'text'
  | 'ticker'
  | 'clock'
  | 'sequence'
  | 'repeater'
  | 'shape'
  | 'ellipse'
  | 'image'
  | 'hand';

export type DesignerView = 'landing' | 'studio';

/** A reference to one keyframe (by element, property, and frame). */
export interface KeyframeRef {
  elementId: string;
  property: AnimatableProperty;
  frame: number;
}

export interface DesignerStoreState {
  scene: Scene | null;
  projectPath: string | null;
  /**
   * Which composition is currently being edited. `null` = the main scene
   * (the `Scene` itself); otherwise the id of an entry in
   * `scene.compositions`. The canvas, timeline, transport and every layer
   * mutation operate on this "active document" — its own size, duration and
   * layers. Switching is done from the Compositions panel (double-click).
   */
  activeCompositionId: string | null;
  /**
   * A transient, user-facing notice (e.g. why an action was refused). Shown as
   * a small toast and auto-cleared; `null` when nothing to show.
   */
  notice: string | null;
  /**
   * D-086 Phase B — the composition snapshot the Preview modal is open on (`null` =
   * closed). Session-only UI state (NOT saved / undone). It lives in the store — not
   * a component — so the rail-footer action bar can OPEN the preview while the modal
   * itself renders inside the canvas subtree (where the preview iframe works): only
   * the small in-canvas preview host subscribes to this, so opening never re-renders
   * the rest of the tree.
   */
  previewScene: Scene | null;
  /**
   * Top-level routing: the Designer starts at the Landing screen
   * (starter picker / recent / new) and flips to the Studio whenever
   * a scene becomes active. Clearing the scene flips it back.
   */
  view: DesignerView;
  tool: DesignerTool;
  /** Element IDs currently selected. */
  selection: ReadonlySet<string>;
  /** When set, the canvas shows an inline TextEditor for this element. */
  editingTextId: string | null;
  /**
   * When set, the next canvas click binds this field to the clicked
   * element instead of selecting it. Set by the Fields panel's
   * "Bind from canvas" button; cleared after the binding is created
   * or the operator presses Escape.
   */
  bindModeFieldId: string | null;
  /**
   * The "authoring cursor" frame the timeline dock sits at. Adding a
   * keyframe lands at this frame; editing a property's value through
   * the Inspector updates the keyframe (if any) on that frame for that
   * property instead of the static value. Clamped to the scene's
   * frameRange at write time.
   */
  currentFrame: number;
  /**
   * Currently-selected keyframe in the timeline. Drives the yellow
   * highlight on the diamond glyph (in the timeline lane, the track
   * row's left label, and the Inspector's per-row indicator). A bare
   * single-click on a timeline diamond sets only this — the Inspector
   * stays on the Element view.
   */
  selectedKeyframe: KeyframeRef | null;
  /**
   * Full keyframe selection (supports multi-select for batch easing). Always
   * mirrors `selectedKeyframe` as its last/primary entry. The timeline
   * highlights every ref here; the Keyframe Inspector shows the per-point
   * fields only when exactly one is selected.
   */
  selectedKeyframes: readonly KeyframeRef[];
  /**
   * Whether the right-side Inspector is showing the dedicated Keyframe
   * Inspector (frame / value / easing editor) for `selectedKeyframe`.
   * Toggled true only by an explicit double-click on a keyframe diamond
   * (or by the "edit point" action). Single-click leaves it false so
   * the Inspector keeps showing the Element view with diamond indicators
   * lit up for the selected point.
   */
  keyframeInspectorOpen: boolean;
  /**
   * Horizontal zoom of the timeline lane: 1 = full scene span fits, 2 =
   * see half the frames at twice the width, etc. Controlled by the
   * status-bar slider; the dock derives a view window from this and the
   * playhead frame and pans automatically as the operator scrubs.
   */
  timelineZoom: number;
  /** View menu — show the canvas pixel rulers (top + left). */
  rulerVisible: boolean;
  /** View menu — snap element edges/centers while dragging on the canvas. */
  snappingEnabled: boolean;
  /**
   * Active snap guide lines (scene coordinates) to draw while a drag is
   * snapped — `x` are vertical lines, `y` are horizontal. Empty when idle.
   */
  snapGuides: { x: readonly number[]; y: readonly number[] };
  /**
   * Persistent ruler guide lines the operator pulls from the rulers (scene
   * coordinates). `x` are vertical guides (a scene-x each), `y` horizontal.
   * Editor aids — session-only, not saved into the scene.
   */
  guides: { x: readonly number[]; y: readonly number[] };
  /** Whether the past stack has at least one entry. */
  canUndo: boolean;
  /** Whether the future stack has at least one entry. */
  canRedo: boolean;
  /**
   * Whether the active project has unsaved changes — the current scene differs
   * from the one last loaded or saved. Drives the "save before switching"
   * prompt so it only appears when there's actually something to lose.
   */
  dirty: boolean;
}

export const initialState: DesignerStoreState = {
  scene: null,
  projectPath: null,
  activeCompositionId: null,
  notice: null,
  previewScene: null,
  view: 'landing',
  tool: 'cursor',
  selection: new Set<string>(),
  editingTextId: null,
  bindModeFieldId: null,
  currentFrame: 0,
  selectedKeyframe: null,
  selectedKeyframes: [],
  keyframeInspectorOpen: false,
  timelineZoom: 1,
  rulerVisible: false,
  snappingEnabled: true,
  snapGuides: { x: [], y: [] },
  guides: { x: [], y: [] },
  canUndo: false,
  canRedo: false,
  dirty: false,
};

export type Listener = (state: DesignerStoreState) => void;
const listeners = new Set<Listener>();

/**
 * THE state. A live ES-module binding: slices `import { current }` and always
 * observe the latest value because only this module reassigns it (in `set` /
 * `_resetCore`).
 */
export let current = initialState;

/**
 * Basic undo/redo: every time `set` writes a *different* Scene object
 * we push the prior one onto `past` and drop the redo stack. The
 * snapshot is the immutable scene reference itself (mutations always
 * produce a fresh object), so memory cost is one pointer per entry.
 *
 * `setScene` (project load / close) resets both stacks so the operator
 * can't undo across a project switch. Calls coming from `undo` /
 * `redo` set `suppressHistory` to avoid re-pushing the same value.
 *
 * Granularity is per-mutation — a long drag generates many history
 * entries. Coalescing intermediate frames into a single transaction
 * is a polish item for later.
 */
const MAX_HISTORY = 100;
/**
 * Coalescing window. Mutations that arrive within this many ms of the
 * last history push do not generate a new entry — they just update the
 * present. This is what lets a drag (or a live colour picker dragging
 * across hues) collapse to a single undo step that restores the
 * pre-burst state, instead of stepping back one ~16 ms tick per Ctrl+Z.
 * `markHistoryBoundary` lets explicit gestures (pointerup, key release)
 * close the burst early so the *next* mutation snapshots immediately.
 */
const COALESCE_MS = 300;
let past: Scene[] = [];
let future: Scene[] = [];
let suppressHistory = false;
let lastSnapshotAt = -Infinity;
/**
 * The scene object as it was at the last load or save. `dirty` is simply
 * `current.scene !== savedScene` — every mutation produces a fresh scene
 * object, so an identity check is enough.
 */
let savedScene: Scene | null = null;
/**
 * D-088 — content hashes for the authoritative dirty signal. `savedHash` is the hash of
 * the scene at the last load/save; `currentHash` is recomputed lazily by `reconcileDirty`
 * (on a history boundary / markSaved), NOT per mutation. `dirty` is `savedHash !==
 * currentHash` once reconciled; between reconciles `set()` keeps an optimistic identity
 * value. See `state/README.md`.
 */
let savedHash: number | null = null;
let currentHash: number | null = null;
/**
 * D-088 — trailing reconcile timer. A scene edit marks dirty optimistically; this fires once
 * after the edit burst SETTLES (so a manual revert clears the indicator promptly without
 * needing a follow-up interaction). It's a debounce: each scene-changing `set()` reschedules
 * it, so a drag (sets every frame) never reconciles mid-gesture — no per-tick hashing — and
 * `markHistoryBoundary` (pointer-gesture end) cancels it and reconciles synchronously.
 */
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
const RECONCILE_SETTLE_MS = 50;

/**
 * In-memory element clipboard for the layer Copy / Cut / Paste actions (the
 * right-click menu and the Ctrl/Cmd+C/X/V shortcuts). Holds the WHOLE copied
 * selection (D-076/D-077), in stack order; an empty array means nothing to
 * paste. Module-level (not part of the scene or undo history) — the menu reads
 * `hasClipboardElement()` when it opens to enable/disable Paste.
 *
 * NOTE: clipboard is logically an *elements*-domain concern, but it lives here
 * in the engine for simplicity (the `_resetCore` test hook clears it alongside
 * the history). See `state/README.md`.
 */
let clipboardElements: Element[] = [];

/** Timer handle for the auto-dismissing toast notice. */
let noticeTimer: number | null = null;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * The single write primitive — every mutation funnels through here. Pushes the
 * prior `scene` onto the undo stack (time-coalesced), recomputes
 * `canUndo`/`canRedo`/`dirty`, replaces `current`, and notifies subscribers.
 */
export function set(patch: Partial<DesignerStoreState>): void {
  if (
    patch.scene !== undefined &&
    patch.scene !== current.scene &&
    !suppressHistory &&
    current.scene !== null
  ) {
    const t = now();
    if (t - lastSnapshotAt > COALESCE_MS) {
      past.push(current.scene);
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
    }
    lastSnapshotAt = t;
  }
  const nextScene = patch.scene !== undefined ? patch.scene : current.scene;
  const sceneChanged = patch.scene !== undefined && patch.scene !== current.scene;
  current = {
    ...current,
    ...patch,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    // D-088 — OPTIMISTIC dirty: a scene edit toggles dirty by identity (so undo back to
    // the saved object clears it instantly); a non-scene patch (selection, zoom, …)
    // preserves dirty. The authoritative content-hash reconcile runs on a history
    // boundary / markSaved (`reconcileDirty`), so a drag never hashes per tick.
    dirty: sceneChanged ? nextScene !== null && nextScene !== savedScene : current.dirty,
  };
  for (const l of listeners) l(current);
  // D-088 — after the scene settles, authoritatively reconcile dirty by content hash, so a
  // manual revert clears the indicator on its own (no follow-up click). Skipped during
  // undo/redo (they reconcile synchronously themselves).
  if (sceneChanged && current.dirty && !suppressHistory) scheduleTrailingReconcile();
}

/** Write `dirty` directly (authoritative) and notify only when it actually changes. */
function writeDirty(d: boolean): void {
  if (current.dirty === d) return;
  current = { ...current, dirty: d };
  for (const l of listeners) l(current);
}

/** Debounced trailing reconcile — fires once after the edit burst settles. */
function scheduleTrailingReconcile(): void {
  if (typeof setTimeout === 'undefined') return; // no timers → markHistoryBoundary covers it
  if (reconcileTimer !== null) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileDirty();
  }, RECONCILE_SETTLE_MS);
}

function cancelTrailingReconcile(): void {
  if (reconcileTimer !== null) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
}

/** Subscribe to every state change; returns an unsubscribe fn. */
export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Read the current state (imperative access; the live `current` binding is equivalent). */
export function getState(): DesignerStoreState {
  return current;
}

// ── History engine (welded to `set`) ──────────────────────────────────────

/**
 * Step backward in the per-scene undo history. No-op when the past
 * stack is empty. The redo stack receives the *current* scene so
 * `redo()` returns to it.
 */
export function undo(): void {
  const prev = past[past.length - 1];
  if (prev === undefined) return;
  past = past.slice(0, -1);
  if (current.scene !== null) future.push(current.scene);
  suppressHistory = true;
  try {
    set({
      scene: prev,
      selection: new Set<string>(),
      selectedKeyframe: null,
      selectedKeyframes: [],
      keyframeInspectorOpen: false,
    });
  } finally {
    suppressHistory = false;
  }
  // D-088 — history nav lands on a different scene OBJECT than the baseline even when its
  // content equals it (e.g. redo back to a reverted/pruned state). Reconcile by content
  // hash so dirty is authoritative after undo/redo, not just identity-optimistic.
  cancelTrailingReconcile();
  reconcileDirty();
}

/**
 * Step forward through the redo stack. No-op when the future stack
 * is empty (i.e. there's nothing the operator has undone).
 */
export function redo(): void {
  const next = future[future.length - 1];
  if (next === undefined) return;
  future = future.slice(0, -1);
  if (current.scene !== null) past.push(current.scene);
  suppressHistory = true;
  try {
    set({
      scene: next,
      selection: new Set<string>(),
      selectedKeyframe: null,
      selectedKeyframes: [],
      keyframeInspectorOpen: false,
    });
  } finally {
    suppressHistory = false;
  }
  // D-088 — see undo(): reconcile dirty by content hash after redo too.
  cancelTrailingReconcile();
  reconcileDirty();
}

/**
 * Force the next scene mutation to start a fresh history entry, even
 * if it lands within the coalescing window. Call this from gesture
 * endpoints (e.g. pointerup after a drag) so an immediately-following
 * unrelated edit doesn't fold into the drag's undo group.
 */
export function markHistoryBoundary(): void {
  lastSnapshotAt = -Infinity;
  // D-088 — a real gesture boundary (e.g. pointerup) reconciles synchronously; cancel any
  // pending trailing reconcile since we're handling it now. Only hash when optimistically
  // dirty: a project that `set()` left clean is clean by identity, so an idle pointerup
  // never pays for a hash.
  cancelTrailingReconcile();
  if (current.dirty) reconcileDirty();
}

/**
 * Run `fn` so its scene mutations collapse to EXACTLY ONE undo entry, isolated
 * from neighbouring edits. There is no transaction object — history grouping is
 * the time-coalescing in `set` (a burst within `COALESCE_MS` is one entry). The
 * leading boundary makes `fn`'s first write snapshot the pre-edit scene (so the
 * group is its own entry even when it follows other synchronous edits, e.g. in
 * tests); the trailing boundary keeps the NEXT edit from folding in. Used by the
 * D-041 group property edit (fan-out over selected ids); NOT for continuous
 * gestures like a drag, whose ticks must coalesce WITHOUT a boundary between
 * them (they call `markHistoryBoundary` at the gesture endpoints instead).
 */
export function runAsSingleHistoryEntry(fn: () => void): void {
  markHistoryBoundary();
  try {
    fn();
  } finally {
    markHistoryBoundary();
  }
}

/**
 * Mark the current scene as saved — clears the `dirty` flag. Call after a
 * successful save so the "unsaved changes" prompt won't fire until the next
 * edit.
 */
export function markSaved(): void {
  setSavedBaseline(current.scene);
  writeDirty(false);
}

/**
 * Reset the history stacks (used by `setScene` on project load / close so the
 * operator can't undo across a project switch).
 */
export function resetHistory(): void {
  past = [];
  future = [];
}

/** Toggle the history-suppression flag (used by `setScene` while it seeds a load). */
export function setSuppressHistory(v: boolean): void {
  suppressHistory = v;
}

/**
 * Set the "last saved" baseline the `dirty` flag compares against — both the scene
 * reference (identity fast-path) and its content hash (`savedHash`/`currentHash`). Call on
 * load and save. D-088.
 */
export function setSavedBaseline(scene: Scene | null): void {
  savedScene = scene;
  savedHash = scene === null ? null : hashScene(scene);
  currentHash = savedHash;
}

/**
 * Authoritatively reconcile `dirty` from the document CONTENT hash (D-088): recompute
 * `currentHash` and set `dirty = savedHash !== currentHash`. This is what clears dirty when
 * the operator edits then reverts to byte-identical content (a fresh scene object whose
 * hash matches the baseline). Called from `markHistoryBoundary` and `markSaved`.
 */
export function reconcileDirty(): void {
  if (current.scene === null) {
    currentHash = null;
    writeDirty(false);
    return;
  }
  currentHash = hashScene(current.scene);
  writeDirty(savedScene !== null && savedHash !== currentHash);
}

// ── Clipboard (elements-domain state, kept here for simplicity) ────────────

export function getClipboard(): readonly Element[] {
  return clipboardElements;
}

export function setClipboard(els: Element[]): void {
  clipboardElements = els;
}

// ── Toast-notice timer ─────────────────────────────────────────────────────

export function getNoticeTimer(): number | null {
  return noticeTimer;
}

export function setNoticeTimer(t: number | null): void {
  noticeTimer = t;
}

/** Reset for tests — clears history, clipboard, notice timer, subscribers, and state. */
export function _resetCore(): void {
  past = [];
  future = [];
  clipboardElements = [];
  savedScene = null;
  savedHash = null;
  currentHash = null;
  cancelTrailingReconcile();
  if (noticeTimer !== null) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  suppressHistory = false;
  lastSnapshotAt = -Infinity;
  current = {
    ...initialState,
    selection: new Set<string>(),
    editingTextId: null,
    bindModeFieldId: null,
    currentFrame: 0,
    selectedKeyframe: null,
    selectedKeyframes: [],
    keyframeInspectorOpen: false,
    view: 'landing',
  };
  listeners.clear();
}
