import type { Composition, Element, FieldBinding, Layer, Scene } from '@cg/shared-schema';

export interface ValueRuleDeleteImpact {
  fieldId: string;
  sourceElementIds: readonly string[];
  targetElementId: string;
  targetElementName: string;
  ruleCount: number;
}

function activeDoc(scene: Scene, activeCompositionId: string | null): Scene | Composition {
  if (activeCompositionId === null) return scene;
  return scene.compositions?.find((composition) => composition.id === activeCompositionId) ?? scene;
}

function elementsOf(elements: readonly Element[]): Element[] {
  const out: Element[] = [];
  for (const element of elements) {
    out.push(element);
    if (element.type === 'container') out.push(...elementsOf(element.children));
  }
  return out;
}

function bindingElementId(binding: FieldBinding): string | null {
  return binding.target.kind === 'scene-background' ? null : binding.target.elementId;
}

/**
 * Fields that disappear when every selected source element is removed, plus the surviving
 * elements whose value rules read those fields. This is pure so the warning and the store-side
 * cascade use the same definition of "dependent" without ever guessing from element order.
 */
export function valueRuleDeleteImpact(
  scene: Scene,
  activeCompositionId: string | null,
  deletingElementIds: ReadonlySet<string>,
): ValueRuleDeleteImpact[] {
  if (deletingElementIds.size === 0) return [];
  const doc = activeDoc(scene, activeCompositionId);
  const bindings = doc.bindings ?? [];
  const sourcesByField = new Map<string, Set<string>>();

  for (const binding of bindings) {
    const elementId = bindingElementId(binding);
    if (elementId === null || !deletingElementIds.has(elementId)) continue;
    const sources = sourcesByField.get(binding.fieldId) ?? new Set<string>();
    sources.add(elementId);
    sourcesByField.set(binding.fieldId, sources);
  }

  const removedFieldIds = new Set(
    [...sourcesByField.keys()].filter((fieldId) =>
      bindings.every((binding) => {
        if (binding.fieldId !== fieldId) return true;
        const elementId = bindingElementId(binding);
        return elementId !== null && deletingElementIds.has(elementId);
      }),
    ),
  );
  if (removedFieldIds.size === 0) return [];

  const elements = elementsOf((doc.layers as readonly Layer[]).flatMap((layer) => layer.children));
  return elements.flatMap((element) => {
    if (deletingElementIds.has(element.id)) return [];
    const rules = element.valueRules;
    if (
      rules === undefined ||
      rules.rules.length === 0 ||
      !removedFieldIds.has(rules.input.fieldId)
    ) {
      return [];
    }
    return [
      {
        fieldId: rules.input.fieldId,
        sourceElementIds: [...(sourcesByField.get(rules.input.fieldId) ?? [])],
        targetElementId: element.id,
        targetElementName: element.name,
        ruleCount: rules.rules.length,
      },
    ];
  });
}

/** Remove every value-rule set whose input field has just been removed. */
export function removeValueRulesForFields(
  elements: readonly Element[],
  removedFieldIds: ReadonlySet<string>,
): Element[] {
  if (removedFieldIds.size === 0) return [...elements];
  return elements.map((element): Element => {
    let next = element;
    if (element.valueRules !== undefined && removedFieldIds.has(element.valueRules.input.fieldId)) {
      const { valueRules: _removed, ...rest } = element;
      void _removed;
      next = rest as Element;
    }
    if (next.type === 'container') {
      return { ...next, children: removeValueRulesForFields(next.children, removedFieldIds) };
    }
    return next;
  });
}
