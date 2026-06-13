import { current, set } from '../store-core.js';

/**
 * Selection slice — the element selection set and the inline-text-edit target.
 * Replacing the selection also drops the keyframe selection unless the selected
 * keyframe's element survives the new selection. See `state/README.md`.
 */
export const selectionSlice = {
  /** Replace selection. Pass `[]` to deselect. */
  setSelection(ids: readonly string[]): void {
    const nextSel = new Set(ids);
    const keepKey =
      current.selectedKeyframe !== null && nextSel.has(current.selectedKeyframe.elementId);
    set({
      selection: nextSel,
      editingTextId: null,
      selectedKeyframe: keepKey ? current.selectedKeyframe : null,
      selectedKeyframes: keepKey ? current.selectedKeyframes : [],
      keyframeInspectorOpen: keepKey ? current.keyframeInspectorOpen : false,
    });
  },

  /**
   * Toggle one element in/out of the selection (shift / ctrl-click) — add when
   * absent, remove when present — so the canvas and the timeline layer rows
   * build ONE shared multi-selection (D-041). Like `setSelection`, the keyframe
   * selection is dropped unless the kept keyframe's element survives.
   */
  toggleInSelection(id: string): void {
    const nextSel = new Set(current.selection);
    if (nextSel.has(id)) nextSel.delete(id);
    else nextSel.add(id);
    const keepKey =
      current.selectedKeyframe !== null && nextSel.has(current.selectedKeyframe.elementId);
    set({
      selection: nextSel,
      editingTextId: null,
      selectedKeyframe: keepKey ? current.selectedKeyframe : null,
      selectedKeyframes: keepKey ? current.selectedKeyframes : [],
      keyframeInspectorOpen: keepKey ? current.keyframeInspectorOpen : false,
    });
  },

  /** Enter inline edit mode for a text element. Pass null to exit. */
  setEditingText(elementId: string | null): void {
    set({ editingTextId: elementId });
  },
} as const;
