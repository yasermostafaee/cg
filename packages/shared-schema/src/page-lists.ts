import { sequenceStepsByOperator, type Element } from './elements.js';
import type { Scene } from './scene.js';

/** `R-100` — one PAGE LIST of a template: its field, and whether Next/Previous wrap around. */
export interface PageListInfo {
  fieldId: string;
  /** `true` when the sequence it drives repeats forever; `false` for a book that stops at its ends. */
  wrap: boolean;
  /**
   * `D-163` — `false` when the operator does not step the sequence (`sequenceStepsByOperator`): its
   * pictures are still the operator's to load, but no console verb turns them. Absent ⇒ steps.
   */
  step?: false;
}

/**
 * `R-100` — **THE TEMPLATE'S PAGE LISTS**, read once at import (where CG Control holds the scene) so
 * the bridge and every console know which rows load pictures and how a page turn behaves at the
 * ends. A page list is a `list` field marked `pages` and bound (`sequence-items`) to a sequence in
 * the root or the ENTRY composition — the fields an operator edits at the row's top level. Its
 * `wrap` is that sequence's `repeat: 'infinite'`.
 */
export function pageListsOf(scene: Scene): PageListInfo[] {
  const docs = [
    scene,
    ...(scene.compositions ?? []).filter((c) => c.id === scene.entryCompositionId),
  ];
  const out: PageListInfo[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    for (const field of doc.fields ?? []) {
      if (field.type !== 'list' || field.pages !== true || seen.has(field.id)) continue;
      const binding = (doc.bindings ?? []).find(
        (b) => b.fieldId === field.id && b.target.kind === 'sequence-items',
      );
      if (binding === undefined || binding.target.kind !== 'sequence-items') continue;
      const elementId = binding.target.elementId;
      const sequence = findElement(
        doc.layers.flatMap((l) => l.children),
        elementId,
      );
      if (sequence === undefined || sequence.type !== 'sequence') continue;
      seen.add(field.id);
      out.push({
        fieldId: field.id,
        wrap: sequence.repeat === 'infinite',
        ...(sequenceStepsByOperator(sequence) ? {} : { step: false as const }),
      });
    }
  }
  return out;
}

function findElement(children: readonly Element[], id: string): Element | undefined {
  for (const el of children) {
    if (el.id === id) return el;
    if (el.type === 'container') {
      const inner = findElement(el.children, id);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}
