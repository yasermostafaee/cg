import { SceneSchema, type ProjectAssetEntry, type Scene } from '@cg/shared-schema';
import type { BrandKit, TemplateRecipe } from './schema.js';
import { brandAssetIdFor, templateIdFor } from './identity.js';
import { PackFactoryError } from './errors.js';

export interface AppliedBindings {
  scene: Scene;
  colors: { source: string; role: string; value: string; replacements: number }[];
  assets: { sourceId: string; role: string; outputId: string; replacements: number }[];
  fonts: { sourceId: string; role: string; outputId: string; replacements: number }[];
}

export interface RemintedProjectAssets {
  scene: Scene;
  /** Brand/template-scoped output id → the master-project id whose bytes it keeps. */
  sourceIdByOutputId: ReadonlyMap<string, string>;
}

export function applyTemplateBindings(
  scene: Scene,
  template: TemplateRecipe,
  brandKit: BrandKit,
): AppliedBindings {
  const colorTargets = new Map<string, { source: string; role: string; value: string }>();
  for (const [source, role] of Object.entries(template.colors)) {
    const color = brandKit.colors[role];
    if (color === undefined) {
      throw new PackFactoryError(
        'unknown-color-role',
        `Template "${template.key}" maps ${source} to missing colour role "${role}"`,
      );
    }
    const normalized = source.toLowerCase();
    if (colorTargets.has(normalized)) {
      throw new PackFactoryError(
        'duplicate-color-binding',
        `Template "${template.key}" maps the same source colour more than once: ${source}`,
      );
    }
    colorTargets.set(normalized, { source, role, value: color.value });
  }

  const assetTargets = new Map<string, { role: string; outputId: string }>();
  for (const [sourceId, role] of Object.entries(template.assets)) {
    if (brandKit.assets[role] === undefined) {
      throw new PackFactoryError(
        'unknown-asset-role',
        `Template "${template.key}" maps ${sourceId} to missing asset role "${role}"`,
      );
    }
    assetTargets.set(sourceId, {
      role,
      outputId: brandAssetIdFor(brandKit.id, 'asset', role),
    });
  }

  const fontTargets = new Map<string, { role: string; outputId: string }>();
  for (const [sourceId, role] of Object.entries(template.fonts)) {
    if (brandKit.fonts[role] === undefined) {
      throw new PackFactoryError(
        'unknown-font-role',
        `Template "${template.key}" maps ${sourceId} to missing font role "${role}"`,
      );
    }
    if (assetTargets.has(sourceId)) {
      throw new PackFactoryError(
        'ambiguous-asset-binding',
        `Template "${template.key}" maps ${sourceId} as both an asset and a font`,
      );
    }
    fontTargets.set(sourceId, {
      role,
      outputId: brandAssetIdFor(brandKit.id, 'font', role),
    });
  }

  const colorCounts = new Map([...colorTargets.keys()].map((source) => [source, 0]));
  const assetCounts = new Map([...assetTargets.keys()].map((source) => [source, 0]));
  const fontCounts = new Map([...fontTargets.keys()].map((source) => [source, 0]));

  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const colorTarget = colorTargets.get(value.toLowerCase());
      if (colorTarget !== undefined) {
        colorCounts.set(value.toLowerCase(), (colorCounts.get(value.toLowerCase()) ?? 0) + 1);
        return colorTarget.value;
      }
      const assetTarget = assetTargets.get(value);
      if (assetTarget !== undefined) {
        assetCounts.set(value, (assetCounts.get(value) ?? 0) + 1);
        return assetTarget.outputId;
      }
      const fontTarget = fontTargets.get(value);
      if (fontTarget !== undefined) {
        fontCounts.set(value, (fontCounts.get(value) ?? 0) + 1);
        return fontTarget.outputId;
      }
      if (value.startsWith('asset-')) {
        const sourceId = value.slice('asset-'.length);
        const familyTarget = fontTargets.get(sourceId);
        if (familyTarget !== undefined) {
          fontCounts.set(sourceId, (fontCounts.get(sourceId) ?? 0) + 1);
          return `asset-${familyTarget.outputId}`;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          replace(child),
        ]),
      );
    }
    return value;
  };

  const replaced = replace(scene) as Scene;
  const parsed = SceneSchema.safeParse({
    ...replaced,
    id: templateIdFor(brandKit.id, template.key),
    name: template.displayName,
  });
  if (!parsed.success) {
    throw new PackFactoryError(
      'invalid-transformed-scene',
      `Template "${template.key}" no longer passes SceneSchema after bindings: ${parsed.error.message}`,
    );
  }

  const colors = [...colorTargets.entries()].map(([normalized, target]) => ({
    ...target,
    replacements: colorCounts.get(normalized) ?? 0,
  }));
  const assets = [...assetTargets.entries()].map(([sourceId, target]) => ({
    sourceId,
    ...target,
    replacements: assetCounts.get(sourceId) ?? 0,
  }));
  const fonts = [...fontTargets.entries()].map(([sourceId, target]) => ({
    sourceId,
    ...target,
    replacements: fontCounts.get(sourceId) ?? 0,
  }));

  const stale = [
    ...colors.filter((binding) => binding.replacements === 0).map((binding) => binding.source),
    ...assets.filter((binding) => binding.replacements === 0).map((binding) => binding.sourceId),
    ...fonts.filter((binding) => binding.replacements === 0).map((binding) => binding.sourceId),
  ];
  if (stale.length > 0) {
    throw new PackFactoryError(
      'stale-binding',
      `Template "${template.key}" has bindings that do not occur in the selected composition: ${stale.join(', ')}`,
    );
  }

  return { scene: parsed.data, colors, assets, fonts };
}

/** Namespace every still-referenced master asset, including unbound decorative media. */
export function remintProjectAssetIds(
  scene: Scene,
  projectIndex: readonly ProjectAssetEntry[],
  brandId: string,
  templateKey: string,
): RemintedProjectAssets {
  const targetBySourceId = new Map(
    projectIndex.map((entry) => [
      entry.assetId,
      brandAssetIdFor(
        brandId,
        entry.kind === 'font' ? 'font' : 'asset',
        `template:${templateKey}:master:${entry.assetId}`,
      ),
    ]),
  );
  const used = new Set<string>();
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const direct = targetBySourceId.get(value);
      if (direct !== undefined) {
        used.add(value);
        return direct;
      }
      if (value.startsWith('asset-')) {
        const sourceId = value.slice('asset-'.length);
        const family = targetBySourceId.get(sourceId);
        if (family !== undefined) {
          used.add(sourceId);
          return `asset-${family}`;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          replace(child),
        ]),
      );
    }
    return value;
  };
  const parsed = SceneSchema.parse(replace(scene));
  const sourceIdByOutputId = new Map<string, string>();
  for (const sourceId of used) {
    const outputId = targetBySourceId.get(sourceId);
    if (outputId !== undefined) sourceIdByOutputId.set(outputId, sourceId);
  }
  return { scene: parsed, sourceIdByOutputId };
}
