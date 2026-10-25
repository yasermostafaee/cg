import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BrandKit, PackRecipe } from './schema.js';
import { BrandKitSchema, PackRecipeSchema } from './schema.js';
import { PackFactoryError, zodMessage } from './errors.js';
import {
  REPOSITORY_ROOT,
  assertOutsideRepository,
  canonicalReadableFile,
  resolveDeclaredPath,
} from './paths.js';

export interface ResolvedFont {
  role: string;
  path: string;
  definition: BrandKit['fonts'][string];
}

export interface ResolvedAsset {
  role: string;
  sourcePath: string;
  renderPath: string;
  definition: BrandKit['assets'][string];
}

export interface LoadedFactoryInputs {
  brandKitPath: string;
  recipePath: string;
  brandKit: BrandKit;
  recipe: PackRecipe;
  fonts: ReadonlyMap<string, ResolvedFont>;
  assets: ReadonlyMap<string, ResolvedAsset>;
  sourceProjects: ReadonlyMap<string, string>;
}

export async function loadFactoryInputs(
  brandKitPath: string,
  recipePath: string,
  repositoryRoot = REPOSITORY_ROOT,
): Promise<LoadedFactoryInputs> {
  const brandPath = await canonicalReadableFile(path.resolve(brandKitPath), 'Brand Kit');
  const buildPath = await canonicalReadableFile(path.resolve(recipePath), 'Pack recipe');
  assertOutsideRepository(brandPath, 'Brand Kit', repositoryRoot);
  assertOutsideRepository(buildPath, 'Pack recipe', repositoryRoot);

  const brandRaw = await readJson(brandPath, 'Brand Kit');
  const recipeRaw = await readJson(buildPath, 'Pack recipe');
  const brandParsed = BrandKitSchema.safeParse(brandRaw);
  if (!brandParsed.success) {
    throw new PackFactoryError('invalid-brand-kit', zodMessage('Brand Kit', brandParsed.error));
  }
  const recipeParsed = PackRecipeSchema.safeParse(recipeRaw);
  if (!recipeParsed.success) {
    throw new PackFactoryError('invalid-recipe', zodMessage('Pack recipe', recipeParsed.error));
  }

  const fonts = new Map<string, ResolvedFont>();
  for (const [role, definition] of Object.entries(brandParsed.data.fonts)) {
    const fontPath = await canonicalReadableFile(
      resolveDeclaredPath(brandPath, definition.path),
      `Font "${role}"`,
    );
    assertOutsideRepository(fontPath, `Font "${role}"`, repositoryRoot);
    fonts.set(role, { role, path: fontPath, definition });
  }

  const assets = new Map<string, ResolvedAsset>();
  for (const [role, definition] of Object.entries(brandParsed.data.assets)) {
    const sourcePath = await canonicalReadableFile(
      resolveDeclaredPath(brandPath, definition.sourcePath),
      `Asset "${role}" source`,
    );
    const renderPath = await canonicalReadableFile(
      resolveDeclaredPath(brandPath, definition.renderPath ?? definition.sourcePath),
      `Asset "${role}" render file`,
    );
    assertOutsideRepository(sourcePath, `Asset "${role}" source`, repositoryRoot);
    assertOutsideRepository(renderPath, `Asset "${role}" render file`, repositoryRoot);
    assets.set(role, { role, sourcePath, renderPath, definition });
  }

  for (const [index, reference] of brandParsed.data.references.entries()) {
    const referencePath = await canonicalReadableFile(
      resolveDeclaredPath(brandPath, reference),
      `Reference ${String(index + 1)}`,
    );
    assertOutsideRepository(referencePath, `Reference ${String(index + 1)}`, repositoryRoot);
  }

  const targets = new Set(brandParsed.data.targets.map((target) => target.key));
  const sourceProjects = new Map<string, string>();
  for (const template of recipeParsed.data.templates) {
    if (!targets.has(template.target)) {
      throw new PackFactoryError(
        'unknown-target',
        `Template "${template.key}" names undeclared target "${template.target}"`,
      );
    }
    const sourceProject = await canonicalReadableFile(
      resolveDeclaredPath(buildPath, template.sourceProject),
      `Template "${template.key}" source project`,
    );
    if (path.extname(sourceProject).toLowerCase() !== '.cgproj') {
      throw new PackFactoryError(
        'invalid-master',
        `Template "${template.key}" source must be a .cgproj: ${sourceProject}`,
      );
    }
    sourceProjects.set(template.key, sourceProject);
  }

  return {
    brandKitPath: brandPath,
    recipePath: buildPath,
    brandKit: brandParsed.data,
    recipe: recipeParsed.data,
    fonts,
    assets,
    sourceProjects,
  };
}

async function readJson(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  } catch (error) {
    throw new PackFactoryError(
      'invalid-json',
      `${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
