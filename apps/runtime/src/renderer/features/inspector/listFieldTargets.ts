import {
  compositionInstancesOf,
  listBoundSequenceIds,
  sequenceItemInstanceId,
  sequencesOf,
  type FieldDoc,
  type Scene,
} from '@cg/shared-schema';

/**
 * R-018 — which element KIND consumes each `list` field, resolved from the
 * scene's bindings at `.vcg` import (the one moment the app holds the unpacked
 * scene — the same R-011 pattern as `defaultPositionStore`).
 *
 * WHY: the from-file split default is per-TARGET, not per-field-type. Ticker
 * content and sequence items are BOTH `list` fields, but a ticker crawl wants
 * the whole file verbatim as ONE item (Cinegy parity), while a sequence shows
 * discrete items and wants split ON. The binding's `target.kind` is the one
 * canonical place that distinction lives, so it is read from there — never
 * re-derived from field names or shapes.
 */

/** The binding-target kinds a `list` field can drive. */
export type ListTargetKind = 'ticker-items' | 'sequence-items' | 'repeater-items';

/** `fieldPathKey(path)` → the single list-target kind consuming that field. */
export type ListFieldTargets = Readonly<Record<string, ListTargetKind>>;

/** The stable key for a field path (namespace chain + field id). */
export function fieldPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function isListTargetKind(kind: string): kind is ListTargetKind {
  return kind === 'ticker-items' || kind === 'sequence-items' || kind === 'repeater-items';
}

/** Mirrors `aggregateCompositionFields`' depth guard. */
const MAX_DEPTH = 8;

/**
 * Walk the scene exactly the way `aggregateCompositionFields` builds the
 * operator's form — same namespaces, same recursion — and record, for every
 * `list` field, the target kind of its binding(s). A field bound to targets of
 * MORE than one kind is ambiguous and deliberately not recorded: the caller
 * falls back to split OFF (verbatim is the safer, Cinegy-parity default).
 */
export function collectListFieldTargets(
  scene: Pick<Scene, 'compositions'>,
  doc: FieldDoc,
  prefix: readonly string[] = [],
  depth = 0,
  out: Record<string, ListTargetKind> = {},
): Record<string, ListTargetKind> {
  for (const field of doc.fields ?? []) {
    if (field.type !== 'list') continue;
    const kinds = new Set<ListTargetKind>();
    for (const b of doc.bindings ?? []) {
      if (b.fieldId === field.id && isListTargetKind(b.target.kind)) kinds.add(b.target.kind);
    }
    const [only] = [...kinds];
    if (kinds.size === 1 && only !== undefined) out[fieldPathKey([...prefix, field.id])] = only;
  }
  if (depth < MAX_DEPTH) {
    for (const inst of compositionInstancesOf(doc)) {
      const child = scene.compositions?.find((c) => c.id === inst.compositionId);
      if (child === undefined) continue;
      collectListFieldTargets(scene, child, [...prefix, inst.name], depth + 1, out);
    }
    // D-083 sequence COMPOSITION items namespace their comp's fields under an
    // id-based key — the same key the aggregation uses (list-bound sequences
    // expose nothing there, exactly as in the aggregation).
    const bound = listBoundSequenceIds(doc);
    for (const seq of sequencesOf(doc)) {
      if (bound.has(seq.id)) continue;
      for (const item of seq.items) {
        if (item.kind !== 'composition') continue;
        const child = scene.compositions?.find((c) => c.id === item.compositionId);
        if (child === undefined) continue;
        collectListFieldTargets(
          scene,
          child,
          [...prefix, sequenceItemInstanceId(seq.id, item.id)],
          depth + 1,
          out,
        );
      }
    }
  }
  return out;
}
