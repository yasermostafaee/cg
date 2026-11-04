import {
  compositionClosure,
  type Element,
  type Scene,
  type SequenceElement,
} from '@cg/shared-schema';

/** Opt in only when a held composition page contains an authored row exit. */
export function sequenceHasRepeaterExit(scene: Scene, sequence: SequenceElement): boolean {
  const hasExit = (elements: readonly Element[]): boolean =>
    elements.some((element) => {
      if (element.visible === false) return false;
      if (element.type === 'container') return hasExit(element.children);
      return element.type === 'repeater' && (element.itemExit ?? 'none') !== 'none';
    });
  for (const item of sequence.items) {
    if (item.kind !== 'composition') continue;
    const ids = new Set([item.compositionId, ...compositionClosure(scene, item.compositionId)]);
    if (
      scene.compositions?.some(
        (comp) =>
          ids.has(comp.id) &&
          comp.layers.some((layer) => layer.visible !== false && hasExit(layer.children)),
      )
    )
      return true;
  }
  return false;
}
