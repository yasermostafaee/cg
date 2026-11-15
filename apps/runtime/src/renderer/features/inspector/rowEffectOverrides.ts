import { useSyncExternalStore } from 'react';
import { FrameTransitionSchema, InputTransitionSchema } from '@cg/shared-schema';
import { z } from 'zod';

const KEY = 'cg.runtime.row-effects.v1';
const RowEffectOverridesSchema = z.object({
  input: InputTransitionSchema.optional(),
  preset: FrameTransitionSchema.optional(),
});
type RowEffectOverrides = z.infer<typeof RowEffectOverridesSchema>;
const Entries = z.array(z.tuple([z.string(), RowEffectOverridesSchema]));
const listeners = new Set<() => void>();

function readOverrides(): Map<string, RowEffectOverrides> {
  try {
    const saved = globalThis.window?.localStorage.getItem(KEY);
    const result = Entries.safeParse(JSON.parse(saved ?? '[]'));
    return new Map(result.success ? result.data : []);
  } catch {
    return new Map();
  }
}

const overrides = readOverrides();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rowEffectOverrides(itemId: string): RowEffectOverrides | undefined {
  return overrides.get(itemId);
}

export function useRowEffectOverrides(itemId: string): RowEffectOverrides | undefined {
  const snapshot = () => rowEffectOverrides(itemId);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setRowEffectOverrides(itemId: string, change: RowEffectOverrides): void {
  const next = { ...overrides.get(itemId), ...change };
  if (next.input === undefined && next.preset === undefined) overrides.delete(itemId);
  else overrides.set(itemId, next);
  try {
    globalThis.window?.localStorage.setItem(KEY, JSON.stringify([...overrides]));
  } catch {
    // The override remains available for this session.
  }
  for (const listener of listeners) listener();
}
