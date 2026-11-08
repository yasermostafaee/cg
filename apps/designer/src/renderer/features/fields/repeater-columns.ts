import {
  fieldDigitsOf,
  imageFieldAllowsChoices,
  imageFieldAllowsUpload,
  type DynamicField,
  type FieldDigits,
  type ImageFieldAssetOption,
  type Scene,
} from '@cg/shared-schema';

/**
 * D-030 — the columned items-editor surface for a repeater: one column per
 * child-composition field. Pure module so the derivation is unit-testable
 * and shared by the inspector section and the preview field form (the same
 * editor both places). The editor renders a number input for numeric child
 * fields and a text input otherwise (the kinds it already distinguishes).
 */
export interface ListItemColumn {
  /** The item key — the child composition's field id. */
  key: string;
  /** Column header / accessible-name part (the field label, else the id). */
  label: string;
  /** Input flavour derived from the child field; defaults to text. */
  kind?: 'text' | 'number' | 'image' | 'color' | 'boolean' | 'select';
  /** `TEXT-DIGITS-01` — a text column's child-field Digits: its cells are typed in them. */
  digits?: FieldDigits;
  /** Canonical child-field default used when the author adds a row. */
  defaultValue?: unknown;
  /** Numeric constraints copied from the child field for every row editor/import surface. */
  min?: number;
  max?: number;
  step?: number;
  /** Exact numeric choices rendered as a dropdown. */
  allowedValues?: readonly number[];
  /** Operator-facing aliases keyed by the canonical numeric choice. */
  allowedValueLabels?: Readonly<Record<string, string>>;
  /** Human-readable values for image/select cells. */
  choices?: readonly ListItemChoice[];
  /** An image cell may offer Windows Browse in addition to or instead of choices. */
  allowUpload?: boolean;
  /** Native image-picker filter derived from the authored accepted formats. */
  accept?: string;
}

export interface ListItemChoice {
  value: string;
  label: string;
  /** Designer-only Blob/data URL used to identify the choice visually. */
  thumbnailUrl?: string;
}

export interface ImageChoiceAsset {
  assetId: string;
  filename: string;
  kind: string;
}

/** Image field options with explicit project/shared ownership for Preview and export. */
export function imageFieldOptionsForAssets(
  projectAssets: readonly ImageChoiceAsset[],
  sharedAssets: readonly ImageChoiceAsset[] = [],
): ImageFieldAssetOption[] {
  const seen = new Set<string>();
  const options: ImageFieldAssetOption[] = [];
  const add = (asset: ImageChoiceAsset, source: 'project' | 'shared'): void => {
    if (asset.kind !== 'image' || seen.has(asset.assetId)) return;
    seen.add(asset.assetId);
    const dot = asset.filename.lastIndexOf('.');
    const name = dot > 0 ? asset.filename.slice(0, dot) : asset.filename;
    options.push({
      assetId: asset.assetId,
      label: source === 'shared' ? `${name} (shared)` : name,
      source,
    });
  };
  projectAssets.forEach((asset) => add(asset, 'project'));
  sharedAssets.forEach((asset) => add(asset, 'shared'));
  return options;
}

/** Merge project + shared image libraries into one readable, id-stable picker list. */
export function imageChoicesForAssets(
  projectAssets: readonly ImageChoiceAsset[],
  sharedAssets: readonly ImageChoiceAsset[] = [],
  imageUrls: Readonly<Record<string, string>> = {},
): ListItemChoice[] {
  return imageFieldOptionsForAssets(projectAssets, sharedAssets).map((option) => ({
    value: option.assetId,
    label: option.label,
    ...(imageUrls[option.assetId] === undefined ? {} : { thumbnailUrl: imageUrls[option.assetId] }),
  }));
}

/** Derive the editor columns from a child composition's fields. */
export function columnsForFields(
  fields: readonly DynamicField[] | undefined,
  imageChoices: readonly ListItemChoice[] = [],
): ListItemColumn[] {
  return (fields ?? []).map((f) => {
    const base = { key: f.id, label: f.label !== '' ? f.label : f.id };
    switch (f.type) {
      case 'number':
        return {
          ...base,
          kind: 'number' as const,
          defaultValue: f.default,
          ...(f.min === undefined ? {} : { min: f.min }),
          ...(f.max === undefined ? {} : { max: f.max }),
          ...(f.step === undefined ? {} : { step: f.step }),
          ...(f.allowedValues === undefined ? {} : { allowedValues: f.allowedValues }),
          ...(f.allowedValueLabels === undefined
            ? {}
            : { allowedValueLabels: f.allowedValueLabels }),
        };
      case 'image':
        return {
          ...base,
          kind: 'image' as const,
          ...(f.defaultAssetId === undefined
            ? {}
            : { defaultValue: { assetId: f.defaultAssetId } }),
          ...(imageFieldAllowsChoices(f)
            ? {
                choices:
                  f.assetOptions?.map((option) => {
                    const thumbnailUrl = imageChoices.find(
                      (choice) => choice.value === option.assetId,
                    )?.thumbnailUrl;
                    return {
                      value: option.assetId,
                      label: option.label,
                      ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
                    };
                  }) ??
                  // B-413 — an explicit modern image mode with no authored checks means an
                  // empty allowlist. Only a legacy field (no inputMode key) keeps the historical
                  // implicit "all project images" behaviour.
                  (f.inputMode === undefined ? imageChoices : []),
              }
            : {}),
          ...(imageFieldAllowsUpload(f) ? { allowUpload: true } : {}),
          accept: f.accept.map((extension) => `.${extension}`).join(','),
        };
      case 'color':
        return { ...base, kind: 'color' as const, defaultValue: f.default };
      case 'boolean':
        return { ...base, kind: 'boolean' as const, defaultValue: f.default };
      case 'select':
        return {
          ...base,
          kind: 'select' as const,
          defaultValue: f.default,
          choices: f.options.map((o) => ({ value: o.value, label: o.label })),
        };
      case 'text':
      case 'multiline':
        return {
          ...base,
          digits: fieldDigitsOf(f),
          defaultValue: f.default,
        };
      case 'list':
        // Nested lists do not have a compact cell editor yet. Preserve the old
        // text fallback, but seed the canonical list value rather than losing it.
        return { ...base, defaultValue: f.default };
    }
  });
}

/**
 * Repeater list field → child-derived editor columns across the scene. Preview and the persistent
 * Designer page-data form share this lookup so both surfaces edit the same row shape.
 */
export function repeaterColumnsByFieldId(
  scene: Scene,
  imageChoices: readonly ListItemChoice[],
): ReadonlyMap<string, readonly ListItemColumn[]> {
  const out = new Map<string, readonly ListItemColumn[]>();
  const docs: { layers: Scene['layers']; bindings?: Scene['bindings'] | undefined }[] = [
    scene,
    ...(scene.compositions ?? []),
  ];
  const findRepeater = (
    children: readonly Scene['layers'][number]['children'][number][],
    elementId: string,
  ): { compositionId: string } | undefined => {
    for (const el of children) {
      if (el.type === 'repeater' && el.id === elementId) return el;
      if (el.type === 'container') {
        const found = findRepeater(el.children, elementId);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  for (const doc of docs) {
    for (const binding of doc.bindings ?? []) {
      if (binding.target.kind !== 'repeater-items' || !('elementId' in binding.target)) continue;
      for (const layer of doc.layers) {
        const repeater = findRepeater(layer.children, binding.target.elementId);
        if (repeater === undefined) continue;
        const child = scene.compositions?.find(
          (composition) => composition.id === repeater.compositionId,
        );
        if (child !== undefined) {
          out.set(binding.fieldId, columnsForFields(child.fields, imageChoices));
        }
        break;
      }
    }
  }
  return out;
}
