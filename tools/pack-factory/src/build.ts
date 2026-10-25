import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  CG_RUNTIME_VERSION,
  SceneSchema,
  withPageLists,
  type Manifest,
  type Scene,
} from '@cg/shared-schema';
import { buildVcgIndexHtml, cgCss, cgJs, cgJsLottie } from '@cg/single-file-export';
import {
  pack,
  projectCompositionForExport,
  readProjectDocument,
  sha256Hex,
  unpack,
  verify,
  type ProjectDocument,
} from '@cg/vcg-format';
import { loadFactoryInputs, type LoadedFactoryInputs } from './config.js';
import { PackFactoryError } from './errors.js';
import { applyTemplateBindings, remintProjectAssetIds, type AppliedBindings } from './transform.js';
import { gatherTemplateAssets } from './assets.js';
import { REPOSITORY_ROOT } from './paths.js';

export interface PrepareOptions {
  brandKitPath: string;
  recipePath: string;
  exportedAt?: string;
  repositoryRoot?: string;
}

export interface BuiltTemplate {
  key: string;
  displayName: string;
  outputName: string;
  sourceProject: string;
  compositionId: string;
  target: string;
  scene: Scene;
  manifest: Manifest;
  vcg: Uint8Array;
  files: Map<string, Uint8Array>;
  sha256: string;
  bindings: AppliedBindings;
  masterAssets: { sourceId: string; outputId: string }[];
  preview: LoadedFactoryInputs['recipe']['templates'][number]['preview'];
}

export interface PreparedPack {
  inputs: LoadedFactoryInputs;
  exportedAt: string;
  templates: BuiltTemplate[];
}

export async function preparePack(options: PrepareOptions): Promise<PreparedPack> {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(exportedAt))) {
    throw new PackFactoryError('invalid-export-time', `Invalid ISO export time: ${exportedAt}`);
  }
  const inputs = await loadFactoryInputs(
    options.brandKitPath,
    options.recipePath,
    options.repositoryRoot ?? REPOSITORY_ROOT,
  );
  const projectCache = new Map<string, ProjectDocument>();
  const templates: BuiltTemplate[] = [];

  for (const recipe of inputs.recipe.templates) {
    const sourceProject = inputs.sourceProjects.get(recipe.key);
    if (sourceProject === undefined) {
      throw new PackFactoryError('missing-master', `No source project resolved for ${recipe.key}`);
    }
    let project = projectCache.get(sourceProject);
    if (project === undefined) {
      project = await readProjectDocument(new Uint8Array(await fs.readFile(sourceProject)));
      projectCache.set(sourceProject, project);
    }
    const compositionId = selectComposition(project.scene, recipe.compositionId, recipe.key);
    const projected = projectCompositionForExport(project.scene, compositionId);
    if (projected === null) {
      throw new PackFactoryError(
        'missing-composition',
        `Template "${recipe.key}" cannot select composition "${compositionId}"`,
      );
    }
    const target = inputs.brandKit.targets.find((candidate) => candidate.key === recipe.target);
    if (
      target === undefined ||
      projected.resolution.width !== target.width ||
      projected.resolution.height !== target.height
    ) {
      throw new PackFactoryError(
        'raster-mismatch',
        `Template "${recipe.key}" is ${String(projected.resolution.width)}×${String(projected.resolution.height)}, not target "${recipe.target}" ${String(target?.width ?? '?')}×${String(target?.height ?? '?')}`,
      );
    }

    const bindings = applyTemplateBindings(projected, recipe, inputs.brandKit);
    const reminted = remintProjectAssetIds(
      bindings.scene,
      project.index,
      inputs.brandKit.id,
      recipe.key,
    );
    const scene = SceneSchema.parse(withPageLists(reminted.scene));
    const gathered = await gatherTemplateAssets(
      scene,
      project,
      bindings,
      inputs,
      recipe.key,
      reminted.sourceIdByOutputId,
    );
    const includeLottie = gathered.assetIndex.some((entry) => entry.kind === 'lottie');
    if (includeLottie) {
      gathered.assets.set('cg-lottie.js', new TextEncoder().encode(cgJsLottie));
    }
    const indexHtml = buildVcgIndexHtml(
      scene,
      gathered.assetIndex,
      gathered.fontIndex,
      includeLottie,
    );
    const vcg = await pack({
      scene,
      manifestExtras: {
        id: scene.id,
        name: scene.name,
        authoring: {
          designerVersion: '0.0.0-pack-factory.1',
          createdAt: scene.metadata.createdAt,
          exportedAt,
          ...(inputs.brandKit.author === undefined ? {} : { author: inputs.brandKit.author }),
        },
        compatibility: {
          minRuntimeVersion: CG_RUNTIME_VERSION,
          minCasparCGVersion: '2.3.0',
        },
        fontDeps: scene.fonts,
        assetIndex: [...gathered.assetIndex, ...gathered.fontIndex],
      },
      indexHtml,
      cgJs,
      cgCss,
      assets: gathered.assets,
      fonts: gathered.fonts,
    });
    const verification = await verify(vcg);
    if (!verification.ok) {
      throw new PackFactoryError(
        'package-verification-failed',
        `Template "${recipe.key}" failed package verification: ${verification.errors.join('; ')}`,
      );
    }
    const unpacked = await unpack(vcg);
    templates.push({
      key: recipe.key,
      displayName: recipe.displayName,
      outputName: recipe.outputName ?? `${recipe.key}.vcg`,
      sourceProject: path.basename(sourceProject),
      compositionId,
      target: recipe.target,
      scene,
      manifest: unpacked.manifest,
      vcg,
      files: unpacked.files,
      sha256: sha256Hex(vcg),
      bindings,
      masterAssets: [...reminted.sourceIdByOutputId].map(([outputId, sourceId]) => ({
        sourceId,
        outputId,
      })),
      preview: recipe.preview,
    });
  }

  return { inputs, exportedAt, templates };
}

function selectComposition(
  scene: Scene,
  requested: string | undefined,
  templateKey: string,
): string {
  if (requested !== undefined) return requested;
  if (scene.entryCompositionId !== undefined) return scene.entryCompositionId;
  if (scene.compositions?.length === 1 && scene.compositions[0] !== undefined) {
    return scene.compositions[0].id;
  }
  throw new PackFactoryError(
    'composition-required',
    `Template "${templateKey}" must name compositionId because the master has no unambiguous entry composition`,
  );
}
