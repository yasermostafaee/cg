import { useSyncExternalStore } from 'react';
import {
  FRAME_TRANSITION_DEFAULT_MS,
  FrameTransitionSchema,
  DEFAULT_INPUT_SLIDE_DIRECTION,
  type ControlLiveLayout,
  type ControlLiveLayoutEffects,
  type FrameTransition,
} from '@cg/shared-schema';

import { rowEffectOverrides } from './rowEffectOverrides.js';

const STORAGE_KEY = 'cg.runtime.frame-transition.v1';
const DEFAULT: FrameTransition = {
  motion: 'cut',
  fade: false,
  durationMs: FRAME_TRANSITION_DEFAULT_MS,
};

function readPreference(): FrameTransition {
  try {
    const raw = globalThis.window?.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT;
    const saved = FrameTransitionSchema.safeParse(JSON.parse(raw));
    return saved.success ? saved.data : DEFAULT;
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

export function frameTransitionPreference(): FrameTransition {
  return preference;
}

export function useFrameTransitionPreference(): FrameTransition {
  return useSyncExternalStore(subscribe, frameTransitionPreference, frameTransitionPreference);
}

export function setFrameTransitionPreference(change: Partial<FrameTransition>): void {
  preference = { ...preference, ...change };
  try {
    globalThis.window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Keep the choice for this console session even if storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function effectiveLayoutEffects(
  itemId: string,
  layout: ControlLiveLayout,
): ControlLiveLayoutEffects {
  const override = rowEffectOverrides(itemId);
  if (override === undefined) return layout.effects;
  const { input, preset } = override;
  const authoredSwitch = layout.effects.switch;
  return {
    focus: preset ?? layout.effects.focus,
    switch:
      input !== undefined
        ? { ...input, direction: input.direction ?? DEFAULT_INPUT_SLIDE_DIRECTION }
        : authoredSwitch.mode === 'motion' && preset !== undefined
          ? { ...authoredSwitch, durationMs: preset.durationMs }
          : authoredSwitch,
  };
}
