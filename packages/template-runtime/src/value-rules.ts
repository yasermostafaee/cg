import {
  matchingValueRules,
  type DynamicField,
  type Element,
  type FieldValues,
  type Layer,
  type ValueRuleEffect,
  type ValueRuleSet,
} from '@cg/shared-schema';
import { colorChangeTargets, STEP_WRAP_DATASET } from './step-css.js';
import type { FieldScope } from './types.js';

export interface ValueRuleDoc {
  fields?: readonly DynamicField[] | undefined;
  layers: readonly Layer[];
}

function docElements(layers: readonly Layer[]): Element[] {
  const out: Element[] = [];
  const add = (element: Element): void => {
    out.push(element);
    if (element.type === 'container') for (const child of element.children) add(child);
  };
  for (const layer of layers) for (const element of layer.children) add(element);
  return out;
}

function fieldDefault(field: DynamicField | undefined): unknown {
  if (field === undefined) return undefined;
  if ('default' in field) return field.default;
  return field.type === 'image' && field.defaultAssetId !== undefined
    ? { assetId: field.defaultAssetId }
    : undefined;
}

function effectKey(effect: ValueRuleEffect): string {
  return `${effect.elementId}\0${effect.property}`;
}

function visibilityNode(node: HTMLElement): HTMLElement {
  const parent = node.parentElement;
  return parent?.dataset[STEP_WRAP_DATASET] !== undefined ? parent : node;
}

function applyEffect(
  authored: Element,
  prototype: ValueRuleEffect,
  active: ValueRuleEffect | undefined,
  scope: FieldScope,
  assetUrls?: Readonly<Record<string, string>>,
): void {
  const host = scope.elementMap.get(prototype.elementId);
  if (host === undefined) return;
  switch (prototype.property) {
    case 'visible': {
      const shown = active?.property === 'visible' ? active.value : authored.visible;
      const target = visibilityNode(host);
      if (target === host && authored.type === 'composition') {
        host.style.display = shown ? '' : 'none';
      } else {
        target.style.opacity = shown ? '1' : '0';
      }
      return;
    }
    case 'image': {
      if (!(host instanceof HTMLImageElement) || authored.type !== 'image') return;
      const value = active?.property === 'image' ? active.value : authored;
      host.dataset['cgAssetId'] = value.assetId;
      const url = assetUrls?.[value.assetId] ?? value.assetId;
      if (host.getAttribute('src') !== url) host.src = url;
      return;
    }
    case 'textColor':
    case 'backgroundColor':
    case 'fill':
    case 'stroke': {
      const target = colorChangeTargets(authored).find(
        (candidate) => candidate.property === prototype.property,
      );
      if (target === undefined) return;
      const node =
        target.selectorSuffix === ''
          ? host
          : host.querySelector<HTMLElement | SVGElement>(target.selectorSuffix);
      if (node === null) return;
      const value =
        active !== undefined && active.property === prototype.property
          ? active.value
          : target.fallback;
      node.style.setProperty(target.css, value, 'important');
      return;
    }
  }
}

function applyRuleSet(
  set: ValueRuleSet,
  raw: unknown,
  elements: ReadonlyMap<string, Element>,
  scope: FieldScope,
  assetUrls?: Readonly<Record<string, string>>,
): void {
  const active = new Map(
    matchingValueRules(set, raw).map(({ rule }) => [effectKey(rule.effect), rule.effect] as const),
  );
  const seen = new Set<string>();
  for (const rule of set.rules) {
    const prototype = rule.effect;
    const key = effectKey(prototype);
    if (seen.has(key)) continue;
    seen.add(key);
    const authored = elements.get(prototype.elementId);
    if (authored === undefined) continue;
    applyEffect(authored, prototype, active.get(key), scope, assetUrls);
  }
}

/**
 * D-139 / D-180 — evaluate each element-owned rule list against this exact composition/row scope.
 * Repeater stamps call this with their row object, so identical authored rules resolve independently.
 */
export function applyValueRules(
  doc: ValueRuleDoc,
  values: FieldValues,
  scope: FieldScope,
  assetUrls?: Readonly<Record<string, string>>,
): void {
  const elements = docElements(doc.layers);
  const byId = new Map(elements.map((element) => [element.id, element] as const));
  const fields = new Map((doc.fields ?? []).map((field) => [field.id, field] as const));
  for (const owner of elements) {
    const set = owner.valueRules;
    if (set === undefined) continue;
    const field = fields.get(set.input.fieldId);
    const raw = Object.prototype.hasOwnProperty.call(values, set.input.fieldId)
      ? values[set.input.fieldId]
      : fieldDefault(field);
    applyRuleSet(set, raw, byId, scope, assetUrls);
  }
}
