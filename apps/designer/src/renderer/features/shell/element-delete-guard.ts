import { designerStore } from '../../state/store.js';
import {
  valueRuleDeleteImpact,
  type ValueRuleDeleteImpact,
} from '../../state/value-rule-dependencies.js';

export interface PendingElementDelete {
  elementIds: readonly string[];
  impacts: readonly ValueRuleDeleteImpact[];
}

let pending: PendingElementDelete | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function pendingElementDelete(): PendingElementDelete | null {
  return pending;
}

export function subscribeElementDelete(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The one UI door for deleting selected elements. Keyframe-only deletion stays immediate; element
 * deletion pauses only when removing a Data key would invalidate rules on a surviving element.
 */
export function requestDeleteSelection(): void {
  const state = designerStore.get();
  if (state.selectedKeyframes.length > 0 || state.scene === null) {
    designerStore.deleteSelection();
    return;
  }
  const elementIds = [...state.selection];
  const impacts = valueRuleDeleteImpact(state.scene, state.activeCompositionId, state.selection);
  if (impacts.length === 0) {
    designerStore.deleteSelection();
    return;
  }
  pending = { elementIds, impacts };
  emit();
}

export function cancelElementDelete(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

export function confirmElementDelete(): void {
  const request = pending;
  if (request === null) return;
  pending = null;
  emit();
  designerStore.runAsSingleHistoryEntry(() => {
    for (const elementId of request.elementIds) designerStore.removeElement(elementId);
  });
}

/** Test/session reset for a dialog request that is deliberately not authored state. */
export function resetElementDeleteGuard(): void {
  pending = null;
  emit();
}
