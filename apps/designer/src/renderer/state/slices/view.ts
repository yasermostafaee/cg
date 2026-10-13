import { current, set, type DesignerStoreState, type DesignerTool } from '../store-core.js';

/**
 * `B-218` — is the aspect lock ON for `key` (a plate's element id, or an arrangement's id)?
 * THE one predicate every reader uses — the gizmo, the Live Source aspect row, the `CELLS`
 * fields — so "locked" cannot grow a second spelling. Absent from the OFF set ⇒ locked.
 */
export function isAspectLocked(
  state: Pick<DesignerStoreState, 'aspectLockOff'>,
  key: string,
): boolean {
  return !state.aspectLockOff.has(key);
}

/**
 * View / canvas-aids slice — the active tool, the ruler/snapping toggles, the
 * live snap-guide lines, and the operator's persistent ruler guides. All of it
 * is session-only editor state (never saved into the scene). See `state/README.md`.
 */
export const viewSlice = {
  setTool(tool: DesignerTool): void {
    set({ tool });
  },

  /** View menu — toggle the canvas pixel rulers. */
  toggleRuler(): void {
    set({ rulerVisible: !current.rulerVisible });
  },

  /** View menu — enable/disable canvas snapping. Clears any live guides. */
  toggleSnapping(): void {
    set({ snappingEnabled: !current.snappingEnabled, snapGuides: { x: [], y: [] } });
  },

  /**
   * `D-155` / `B-218` — keep a declared aspect while resizing, for ONE subject. A SESSION
   * preference (never the scene); see `aspectLockOff` in `store-core.ts` for why it is session
   * state, and why it is keyed per plate (and per arrangement) rather than one flag.
   *
   * `key` is the id of the thing the toggle sits beside — a Live Source plate's element id, or
   * an arrangement's id for its `CELLS` fields. Absent from the set ⇒ locked (the default).
   *
   * ⚠ Takes an explicit value rather than flipping: a blind flip from a stale render could
   * move the lock the wrong way.
   */
  setAspectLock(key: string, enabled: boolean): void {
    const off = current.aspectLockOff;
    if (off.has(key) === !enabled) return;
    const next = new Set(off);
    if (enabled) next.delete(key);
    else next.add(key);
    set({ aspectLockOff: next });
  },

  /**
   * ⭐ `D-157` — **open or close the Issues panel, from anywhere.**
   *
   * 🔴 This was local `useState` inside `StatusBar`, which made the status-bar pill the ONLY
   * thing in the app that could open the panel — and that pill is itself rendered only while
   * `issues.length > 0`. So the door to the explanation appeared and disappeared with the
   * problem, and the control that was actually REFUSED (Export) had no way to point at it. The
   * unreachable `window.alert` naming "Issues panel" was reaching for exactly this seam.
   *
   * Session-only editor state, never the scene, like every other flag in this slice.
   */
  setIssuesOpen(open: boolean): void {
    if (current.issuesOpen !== open) set({ issuesOpen: open });
  },

  /**
   * D-122 — mirror the canvas's live zoom into the store so the keyboard nudge path can
   * gate pixel snapping on it (the pointer drag already receives the zoom directly). No-op
   * when unchanged so it never churns subscribers.
   */
  setCanvasZoom(zoom: number): void {
    if (current.canvasZoom !== zoom) set({ canvasZoom: zoom });
  },

  /** Set the live snap guide lines (scene coords) shown during a snapped drag. */
  setSnapGuides(guides: { x: readonly number[]; y: readonly number[] }): void {
    const cur = current.snapGuides;
    if (
      cur.x.length === 0 &&
      cur.y.length === 0 &&
      guides.x.length === 0 &&
      guides.y.length === 0
    ) {
      return;
    }
    set({ snapGuides: guides });
  },

  /** Add a ruler guide (vertical for axis 'x', horizontal for 'y'). Returns its index. */
  addGuide(axis: 'x' | 'y', pos: number): number {
    const next = [...current.guides[axis], pos];
    set({ guides: { ...current.guides, [axis]: next } });
    return next.length - 1;
  },

  /** Reposition the guide at `index` on `axis`. */
  setGuidePos(axis: 'x' | 'y', index: number, pos: number): void {
    const arr = current.guides[axis];
    if (index < 0 || index >= arr.length) return;
    const next = arr.map((p, i) => (i === index ? pos : p));
    set({ guides: { ...current.guides, [axis]: next } });
  },

  /** Remove the guide at `index` on `axis` (e.g. dropped back on the ruler). */
  removeGuide(axis: 'x' | 'y', index: number): void {
    const arr = current.guides[axis];
    if (index < 0 || index >= arr.length) return;
    set({ guides: { ...current.guides, [axis]: arr.filter((_, i) => i !== index) } });
  },
} as const;
