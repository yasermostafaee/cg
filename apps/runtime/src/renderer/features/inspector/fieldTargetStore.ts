import { fieldPathKey, type ListFieldTargets } from './listFieldTargets.js';

/**
 * R-018 — per-template record of which element kind consumes each `list`
 * field, written by the Library at `.vcg` import (the one moment the unpacked
 * scene is in hand — the R-011 `defaultPositionStore` pattern). The Inspector
 * reads it to pick the from-file SPLIT DEFAULT per target.
 *
 * Display-default residual, exactly like R-011: a template imported by a
 * PREVIOUS page session lists from the bridge registry without its scene, so
 * no record exists and every list field defaults to split OFF — the specified
 * safe fallback (verbatim / Cinegy parity); the operator can flip it.
 */
const targetsByTemplate = new Map<string, ListFieldTargets>();

export function recordListFieldTargets(
  templateId: string,
  targets: ListFieldTargets | undefined,
): void {
  if (targets === undefined) targetsByTemplate.delete(templateId);
  else targetsByTemplate.set(templateId, targets);
}

/**
 * The from-file split default for a field: ON only when the field's SOLE
 * consumer is a sequence (discrete items). Ticker / repeater / unknown /
 * ambiguous → OFF: the whole file becomes one item, verbatim.
 */
export function splitDefaultFor(templateId: string, path: readonly string[]): boolean {
  return targetsByTemplate.get(templateId)?.[fieldPathKey(path)] === 'sequence-items';
}

/** Test-only: wipe all records. */
export function __resetFieldTargetsForTest(): void {
  targetsByTemplate.clear();
}
