import type { BindingTransform } from '@cg/shared-schema';
import { dateEn, dateFa, latinDigits, persianDigits, truncate } from '@cg/text-shaping';

/**
 * Apply a `BindingTransform` to a stringified field value. Pure function;
 * runs every time the binding re-renders.
 *
 * `truncate` uses a default limit of 100 characters — when bindings need
 * per-instance limits, that should land via per-binding options (M3.2-β).
 */
export function applyTransform(value: string, transform: BindingTransform | undefined): string {
  if (!transform || transform === 'identity') return value;
  switch (transform) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'truncate':
      return truncate(value, 100);
    case 'persian-digits':
      return persianDigits(value);
    case 'latin-digits':
      return latinDigits(value);
    case 'date-fa':
      return dateFa(value);
    case 'date-en':
      return dateEn(value);
  }
}

/**
 * Stringify a `FieldValue` for binding output. Plain types serialize
 * naturally; the image-asset object becomes its `assetId` (useful for
 * paths/keys; image element bindings handle the asset lookup elsewhere).
 */
export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && 'assetId' in value && typeof value.assetId === 'string') {
    return value.assetId;
  }
  return String(value);
}
