import { useSyncExternalStore } from 'react';
import {
  FRAME_TRANSITION_DEFAULT_MS,
  InputTransitionSchema,
  type InputTransition,
} from '@cg/shared-schema';

const STORAGE_KEY = 'cg.runtime.input-transition.v1';
const DEFAULT: InputTransition = { mode: 'cut', durationMs: FRAME_TRANSITION_DEFAULT_MS };

function readPreference(): InputTransition {
  try {
    const saved = globalThis.window?.localStorage?.getItem(STORAGE_KEY);
    if (saved == null) return DEFAULT;
    const result = InputTransitionSchema.safeParse(JSON.parse(saved));
    return result.success ? result.data : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let preference = readPreference();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function inputTransitionPreference(): InputTransition {
  return preference;
}

export function useInputTransitionPreference(): InputTransition {
  return useSyncExternalStore(subscribe, inputTransitionPreference, inputTransitionPreference);
}

export function setInputTransitionPreference(change: Partial<InputTransition>): void {
  preference = { ...preference, ...change };
  try {
    globalThis.window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // The preference remains usable for the rest of this session.
  }
  for (const listener of listeners) listener();
}

/** Requests that omit the new option keep the same immediate Cut on all bridge versions. */
export function inputTransitionRequest(): { inputTransition?: InputTransition } {
  return preference.mode === 'fade' ? { inputTransition: preference } : {};
}
