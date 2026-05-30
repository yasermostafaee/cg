import { useEffect, useState } from 'react';
import type { DynamicField, Element, FieldBinding, Layer, Scene } from '@cg/shared-schema';

/**
 * Designer renderer state — small pub-sub store with a JSON-patch-ish
 * scene mutation surface. Full undo/redo arrives in M7 alongside the
 * timeline; for M6 every mutation is immediate.
 *
 * Selection is a `Set<elementId>` — multi-select lands by shift-clicking
 * (M6.5's Inspector cares; canvas hit-test in M6.4 only sets single).
 */

export type DesignerTool = 'cursor' | 'text' | 'shape' | 'ellipse' | 'image';

export interface DesignerStoreState {
  scene: Scene | null;
  projectPath: string | null;
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
}

const initialState: DesignerStoreState = {
  scene: null,
  projectPath: null,
  tool: 'cursor',
  selection: new Set<string>(),
  editingTextId: null,
  bindModeFieldId: null,
};

type Listener = (state: DesignerStoreState) => void;
const listeners = new Set<Listener>();
let current = initialState;

function set(patch: Partial<DesignerStoreState>): void {
  current = { ...current, ...patch };
  for (const l of listeners) l(current);
}

/** Find the layer + index of an element. Used by every mutation. */
function locate(
  scene: Scene,
  elementId: string,
): { layer: Layer; layerIdx: number; elIdx: number } | null {
  for (let li = 0; li < scene.layers.length; li++) {
    const layer = scene.layers[li];
    if (layer === undefined) continue;
    const elIdx = layer.children.findIndex((e) => e.id === elementId);
    if (elIdx !== -1) return { layer, layerIdx: li, elIdx };
  }
  return null;
}

export const designerStore = {
  get(): DesignerStoreState {
    return current;
  },

  setScene(scene: Scene | null, projectPath: string | null): void {
    set({ scene, projectPath, selection: new Set<string>() });
  },

  setTool(tool: DesignerTool): void {
    set({ tool });
  },

  /** Replace selection. Pass `[]` to deselect. */
  setSelection(ids: readonly string[]): void {
    set({ selection: new Set(ids), editingTextId: null });
  },

  /** Enter inline edit mode for a text element. Pass null to exit. */
  setEditingText(elementId: string | null): void {
    set({ editingTextId: elementId });
  },

  /** Enter bind-from-canvas mode for a field. Pass null to cancel. */
  setBindMode(fieldId: string | null): void {
    set({ bindModeFieldId: fieldId });
  },

  /** Append a dynamic field to scene.fields. */
  addField(field: DynamicField): void {
    if (current.scene === null) return;
    const fields = [...current.scene.fields, field];
    set({ scene: { ...current.scene, fields } });
  },

  /** Patch a field's editable properties (label/required/default/etc.). */
  updateField(fieldId: string, patch: Partial<DynamicField>): void {
    if (current.scene === null) return;
    const fields = current.scene.fields.map((f) =>
      f.id === fieldId ? ({ ...f, ...patch } as DynamicField) : f,
    );
    set({ scene: { ...current.scene, fields } });
  },

  /** Remove a field and any bindings that reference it. */
  removeField(fieldId: string): void {
    if (current.scene === null) return;
    const fields = current.scene.fields.filter((f) => f.id !== fieldId);
    const bindings = current.scene.bindings.filter((b) => b.fieldId !== fieldId);
    set({ scene: { ...current.scene, fields, bindings } });
  },

  /** Append a binding (no dedup — same target appearing twice is allowed). */
  addBinding(binding: FieldBinding): void {
    if (current.scene === null) return;
    const bindings = [...current.scene.bindings, binding];
    set({ scene: { ...current.scene, bindings } });
  },

  /**
   * Remove a binding identified by its array index. Index-based removal
   * is unambiguous when two bindings share the same field/target.
   */
  removeBindingAt(index: number): void {
    if (current.scene === null) return;
    if (index < 0 || index >= current.scene.bindings.length) return;
    const bindings = current.scene.bindings.filter((_, i) => i !== index);
    set({ scene: { ...current.scene, bindings } });
  },

  /** Add one element to the first layer (creates a layer if none exist). */
  addElement(element: Element): void {
    if (current.scene === null) return;
    let scene = current.scene;
    if (scene.layers.length === 0) {
      const layer: Layer = {
        id: `L${String(Date.now())}`,
        name: 'Layer 1',
        visible: true,
        locked: false,
        children: [element],
        blendMode: 'normal',
      };
      scene = { ...scene, layers: [layer] };
    } else {
      const layers = scene.layers.map((l, i) =>
        i === 0 ? { ...l, children: [...l.children, element] } : l,
      );
      scene = { ...scene, layers };
    }
    set({ scene, selection: new Set([element.id]) });
  },

  /** Apply a shallow patch to an element. */
  updateElement(elementId: string, patch: Partial<Element>): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const existing = layer.children[elIdx];
    if (existing === undefined) return;
    const merged = { ...existing, ...patch } as Element;
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = merged;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: { ...current.scene, layers: nextLayers } });
  },

  /** Update an element's transform (preserves the rest of the element). */
  updateTransform(elementId: string, patch: Partial<Element['transform']>): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const existing = layer.children[elIdx];
    if (existing === undefined) return;
    const merged = {
      ...existing,
      transform: { ...existing.transform, ...patch },
    } as Element;
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = merged;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: { ...current.scene, layers: nextLayers } });
  },

  /** Remove an element by id. Cleans up the selection set if needed. */
  removeElement(elementId: string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const nextChildren = layer.children.filter((_, i) => i !== elIdx);
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    const nextSelection = new Set(current.selection);
    nextSelection.delete(elementId);
    set({ scene: { ...current.scene, layers: nextLayers }, selection: nextSelection });
  },

  /** All elements across all layers, top-of-stack first (last layer index = topmost). */
  allElements(): readonly Element[] {
    if (current.scene === null) return [];
    const out: Element[] = [];
    for (const layer of current.scene.layers) {
      for (const el of layer.children) out.push(el);
    }
    return out;
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Reset for tests. */
  _reset(): void {
    current = {
      ...initialState,
      selection: new Set<string>(),
      editingTextId: null,
      bindModeFieldId: null,
    };
    listeners.clear();
  },
} as const;

/** React hook for the whole store. Re-renders on any change. */
export function useDesignerStore(): DesignerStoreState {
  const [state, setState] = useState(current);
  useEffect(() => designerStore.subscribe(setState), []);
  return state;
}
