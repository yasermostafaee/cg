import { current, set, type DesignerTool } from '../store-core.js';

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
