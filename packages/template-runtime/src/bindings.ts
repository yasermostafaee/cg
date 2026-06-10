import type {
  DynamicField,
  FieldBinding,
  FieldValues,
  NestedFieldValues,
  Scene,
} from '@cg/shared-schema';
import type { FieldScope } from './types.js';
import { coerceTickerItems, tickerDriverFor } from './ticker-driver.js';
import { applyTransform, stringifyValue } from './transforms.js';

/**
 * Apply a snapshot of field values to the live DOM by walking the scene's
 * declared bindings. Idempotent and stateless — call it once at scene
 * build, again on every `runtime.update()`.
 */
export function applyFieldValues(
  scene: Scene,
  values: FieldValues,
  elementMap: ReadonlyMap<string, HTMLElement>,
  textOriginals: ReadonlyMap<string, string>,
  container: HTMLElement,
): void {
  // Build a quick field-defaults lookup so missing values fall back cleanly,
  // plus per-field `maxLength` caps for text fields.
  const defaults = new Map<string, unknown>();
  const maxLengths = new Map<string, number>();
  for (const field of scene.fields) {
    defaults.set(field.id, 'default' in field ? field.default : undefined);
    if (field.type === 'text' && field.maxLength !== undefined) {
      maxLengths.set(field.id, field.maxLength);
    }
  }

  for (const binding of scene.bindings) {
    const raw = binding.fieldId in values ? values[binding.fieldId] : defaults.get(binding.fieldId);
    if (raw === undefined) continue;
    applyOne(binding, raw, elementMap, textOriginals, container, maxLengths.get(binding.fieldId));
  }
}

/** A doc that owns fields + bindings: the root scene or a composition. */
interface FieldDocLite {
  fields?: readonly DynamicField[] | undefined;
  bindings?: readonly FieldBinding[] | undefined;
}

/**
 * D-025 — apply a NESTED field-value object across the scope tree. The root doc's
 * own bindings apply to the root scope; each nested instance's namespace
 * (`values[instanceName]`) is applied to that instance's child scope, recursively.
 * This routes the same child instanced twice (e.g. `home`/`away`) to the correct
 * DOM copy. A scene with no nested instances behaves exactly like the flat
 * {@link applyFieldValues}.
 */
export function applyScopedFieldValues(
  scene: Scene,
  rootDoc: FieldDocLite,
  values: NestedFieldValues,
  scope: FieldScope,
): void {
  applyDocScope(scene, rootDoc, values, scope);
}

function applyDocScope(
  scene: Scene,
  doc: FieldDocLite,
  values: NestedFieldValues,
  scope: FieldScope,
): void {
  const defaults = new Map<string, unknown>();
  const maxLengths = new Map<string, number>();
  for (const field of doc.fields ?? []) {
    defaults.set(field.id, 'default' in field ? field.default : undefined);
    if (field.type === 'text' && field.maxLength !== undefined) {
      maxLengths.set(field.id, field.maxLength);
    }
  }
  for (const binding of doc.bindings ?? []) {
    const raw = binding.fieldId in values ? values[binding.fieldId] : defaults.get(binding.fieldId);
    if (raw === undefined) continue;
    applyOne(
      binding,
      raw,
      scope.elementMap,
      scope.textOriginals,
      scope.container,
      maxLengths.get(binding.fieldId),
    );
  }
  for (const child of scope.children) {
    const childDoc = scene.compositions?.find((c) => c.id === child.compositionId);
    if (childDoc === undefined) continue;
    const sub = values[child.name];
    const subVals: NestedFieldValues = isNamespace(sub) ? sub : {};
    applyDocScope(scene, childDoc, subVals, child.scope);
  }
}

/** A namespace sub-object (not a scalar field value, not an image `{assetId}`). */
function isNamespace(v: unknown): v is NestedFieldValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !('assetId' in v);
}

function applyOne(
  binding: FieldBinding,
  raw: unknown,
  elementMap: ReadonlyMap<string, HTMLElement>,
  textOriginals: ReadonlyMap<string, string>,
  container: HTMLElement,
  maxLength?: number,
): void {
  const target = binding.target;
  switch (target.kind) {
    case 'text': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      let stringValue = applyTransform(stringifyValue(raw), binding.transform);
      // Cap to the field's maxLength by code point (so a surrogate pair or a
      // ZWNJ counts as one and isn't split); the element's own auto-size /
      // auto-squeeze then handles fit.
      if (maxLength !== undefined && [...stringValue].length > maxLength) {
        stringValue = [...stringValue].slice(0, maxLength).join('');
      }
      const original = textOriginals.get(target.elementId);
      if (target.placeholder && original !== undefined) {
        el.textContent = original.replaceAll(target.placeholder, stringValue);
      } else {
        el.textContent = stringValue;
      }
      return;
    }
    case 'image': {
      const el = elementMap.get(target.elementId);
      if (!(el instanceof HTMLImageElement)) return;
      const assetId = stringifyValue(raw);
      el.dataset['cgAssetId'] = assetId;
      // Caller resolves assetId → URL. For M3.2-α we set src directly to
      // the assetId; the export pipeline will rewrite to `assets/img/...`
      // paths once asset resolution is wired.
      el.src = assetId;
      return;
    }
    case 'color': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const stringValue = applyTransform(stringifyValue(raw), binding.transform);
      switch (target.property) {
        case 'fill':
          el.style.background = stringValue;
          return;
        case 'stroke':
          el.style.borderColor = stringValue;
          return;
        case 'text':
          el.style.color = stringValue;
          return;
      }
      return;
    }
    case 'visible': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const shouldShow = Boolean(raw);
      el.style.display = shouldShow ? '' : 'none';
      return;
    }
    case 'transform': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(num)) return;
      switch (target.property) {
        case 'opacity':
          el.style.opacity = String(num);
          return;
        case 'x':
          el.style.left = `${num}px`;
          return;
        case 'y':
          el.style.top = `${num}px`;
          return;
        case 'scale':
        case 'rotation':
          // Composes with the baseline transform — for M3.2-α we set a
          // single CSS transform that overrides the baseline. M3.2-β
          // will multiply against the element's declared transform.
          el.style.transform = target.property === 'scale' ? `scale(${num})` : `rotate(${num}deg)`;
          return;
      }
      return;
    }
    case 'scene-background': {
      container.style.background = stringifyValue(raw);
      return;
    }
    case 'lottie-override': {
      // Lottie field overrides land with M3.3.
      return;
    }
    case 'ticker-items': {
      // D-028 — route a list value to the band's treadmill driver, which
      // reconciles by stable id (visible items keep position; removed items
      // scroll out and are never re-fed; new items enter on the next feed).
      // Bare string arrays get positional ids (degraded fallback).
      const el = elementMap.get(target.elementId);
      if (!el || !Array.isArray(raw)) return;
      tickerDriverFor(el)?.setItems(coerceTickerItems(raw));
      return;
    }
  }
}
