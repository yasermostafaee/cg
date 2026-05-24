import { useEffect, useState } from 'react';
import type { Scene } from '@cg/shared-schema';

/**
 * Designer renderer state — tiny built-in store (no Zustand yet). The
 * full undo/redo + scene-graph mutation history land in M6.4 alongside
 * element drawing; this just tracks the active scene + the currently
 * selected tool.
 */

export type DesignerTool = 'cursor' | 'text' | 'shape' | 'image';

export interface DesignerStoreState {
  scene: Scene | null;
  projectPath: string | null;
  tool: DesignerTool;
}

const initialState: DesignerStoreState = {
  scene: null,
  projectPath: null,
  tool: 'cursor',
};

type Listener = (state: DesignerStoreState) => void;
const listeners = new Set<Listener>();
let current = initialState;

function set(patch: Partial<DesignerStoreState>): void {
  current = { ...current, ...patch };
  for (const l of listeners) l(current);
}

export const designerStore = {
  get(): DesignerStoreState {
    return current;
  },
  setScene(scene: Scene | null, projectPath: string | null): void {
    set({ scene, projectPath });
  },
  setTool(tool: DesignerTool): void {
    set({ tool });
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Reset for tests. */
  _reset(): void {
    current = initialState;
    listeners.clear();
  },
} as const;

/** React hook for the whole store. Re-renders on any change. */
export function useDesignerStore(): DesignerStoreState {
  const [state, setState] = useState(current);
  useEffect(() => designerStore.subscribe(setState), []);
  return state;
}
