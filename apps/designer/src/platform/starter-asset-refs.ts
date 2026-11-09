import type { DynamicField, Element, Scene } from '@cg/shared-schema';

/**
 * Rewrite the stable placeholder keys shipped by a starter to the project-local
 * ids minted while its bundled assets are imported. Sequence picture pages are
 * assets too; treating only standalone image elements left an image-folder
 * starter pointing at keys that never existed in the project AssetStore.
 */
export function rewriteStarterAssetRefs(
  scene: Scene,
  imageRemap: ReadonlyMap<string, string>,
  fontRemap: ReadonlyMap<string, string>,
): void {
  const fixImageId = (value: string | undefined): string | undefined =>
    value === undefined ? undefined : (imageRemap.get(value) ?? value);

  const fixEl = (el: Element): void => {
    if (el.valueRules !== undefined) {
      for (const rule of el.valueRules.rules) {
        if (rule.effect.property === 'image' && rule.effect.value.source === 'project') {
          rule.effect.value.assetId =
            fixImageId(rule.effect.value.assetId) ?? rule.effect.value.assetId;
        }
      }
    }
    if (el.type === 'image') {
      el.assetId = fixImageId(el.assetId) ?? el.assetId;
    } else if (el.type === 'video-placeholder') {
      el.posterAssetId = fixImageId(el.posterAssetId);
    } else if (
      el.type === 'ticker' &&
      typeof el.separator === 'object' &&
      el.separator.source !== 'shared'
    ) {
      el.separator.assetId = fixImageId(el.separator.assetId) ?? el.separator.assetId;
    }

    if (
      el.type === 'text' ||
      el.type === 'ticker' ||
      el.type === 'clock' ||
      el.type === 'sequence'
    ) {
      el.font.family = fontRemap.get(el.font.family) ?? el.font.family;
    }

    if (el.type === 'sequence') {
      el.items = el.items.map((item) =>
        item.kind === 'image' && item.assetId !== undefined
          ? { ...item, assetId: fixImageId(item.assetId) ?? item.assetId }
          : item.kind === 'composition' && item.fieldValues !== undefined
            ? { ...item, fieldValues: fixOpenValue(item.fieldValues) as typeof item.fieldValues }
            : item,
      );
    } else if (el.type === 'repeater') {
      el.items = fixOpenValue(el.items) as typeof el.items;
    } else if (el.type === 'container') {
      el.children.forEach(fixEl);
    }
  };

  const fixOpenValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(fixOpenValue);
    if (value === null || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [
        key,
        key === 'assetId' && typeof child === 'string'
          ? (fixImageId(child) ?? child)
          : fixOpenValue(child),
      ]),
    );
  };

  const fixField = (field: DynamicField): void => {
    if (field.type === 'image') {
      field.defaultAssetId = fixImageId(field.defaultAssetId);
      if (field.assetOptions !== undefined) {
        field.assetOptions = field.assetOptions.map((option) => ({
          ...option,
          assetId: fixImageId(option.assetId) ?? option.assetId,
        }));
      }
    } else if (field.type === 'list') {
      field.default = fixOpenValue(field.default) as typeof field.default;
    }
  };

  for (const layer of scene.layers) layer.children.forEach(fixEl);
  scene.fields.forEach(fixField);
  for (const comp of scene.compositions ?? []) {
    for (const layer of comp.layers) layer.children.forEach(fixEl);
    comp.fields?.forEach(fixField);
  }
  scene.fonts = scene.fonts.map((font) => ({
    ...font,
    family: fontRemap.get(font.family) ?? font.family,
  }));
}
