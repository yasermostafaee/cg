import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'cg.runtime.preview-resize.v1';
function readPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== 'free';
  } catch {
    return true;
  }
}

let preserveAspect = readPreference();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): boolean => preserveAspect;

export function usePreserveFrameAspect(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setPreserveFrameAspect(preserve: boolean): void {
  if (preserveAspect === preserve) return;
  preserveAspect = preserve;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, preserve ? 'preserve' : 'free');
  } catch {
    // The same preference remains available for this console session.
  }
  for (const listener of listeners) listener();
}
