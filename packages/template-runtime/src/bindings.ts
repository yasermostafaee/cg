import type { FieldBinding, FieldValues, Scene } from '@cg/shared-schema';
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
  }
}
