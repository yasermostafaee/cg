import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AssetEntry, ProjectAssetEntry, Scene } from '@cg/shared-schema';
import { sha256Hex } from '@cg/vcg-format';
import type { ProjectDocument } from '@cg/vcg-format';
import type { AppliedBindings } from './transform.js';
import type { LoadedFactoryInputs } from './config.js';
import { PackFactoryError } from './errors.js';

export interface GatheredAssets {
  assets: Map<string, Uint8Array>;
  fonts: Map<string, Uint8Array>;
  assetIndex: AssetEntry[];
  fontIndex: AssetEntry[];
}

export async function gatherTemplateAssets(
  scene: Scene,
  project: ProjectDocument,
  applied: AppliedBindings,
  inputs: LoadedFactoryInputs,
  templateKey: string,
  sourceIdByOutputId: ReadonlyMap<string, string>,
): Promise<GatheredAssets> {
  const sourceById = new Map(project.index.map((entry) => [entry.assetId, entry]));
  validateMappedSourceKinds(sourceById, applied, inputs, templateKey);

  const external = new Map<
    string,
    { entry: AssetEntry; bytes: Uint8Array; destination: 'assets' | 'fonts' }
  >();
  for (const binding of applied.assets) {
    if (external.has(binding.outputId)) continue;
    const resolved = inputs.assets.get(binding.role);
    if (resolved === undefined) continue;
    const bytes = new Uint8Array(await fs.readFile(resolved.renderPath));
    const extension = path.extname(resolved.renderPath).toLowerCase();
    assertExtension(resolved.definition.kind, extension, `Asset "${binding.role}"`);
    const sha256 = sha256Hex(bytes);
    external.set(binding.outputId, {
      entry: {
        id: binding.outputId,
        path: `assets/${resolved.definition.kind}/${sha256}${extension}`,
        kind: resolved.definition.kind,
        bytes: bytes.byteLength,
        sha256,
        mime: mimeFor(extension),
      },
      bytes,
      destination: 'assets',
    });
  }
  for (const binding of applied.fonts) {
    if (external.has(binding.outputId)) continue;
    const resolved = inputs.fonts.get(binding.role);
    if (resolved === undefined) continue;
    const bytes = new Uint8Array(await fs.readFile(resolved.path));
    const extension = path.extname(resolved.path).toLowerCase();
    assertExtension('font', extension, `Font "${binding.role}"`);
    const sha256 = sha256Hex(bytes);
    external.set(binding.outputId, {
      entry: {
        id: binding.outputId,
        path: `fonts/${sha256}${extension}`,
        kind: 'font',
        bytes: bytes.byteLength,
        sha256,
        mime: mimeFor(extension),
      },
      bytes,
      destination: 'fonts',
    });
  }

  const required = collectAssetIds(scene);
  const assets = new Map<string, Uint8Array>();
  const fonts = new Map<string, Uint8Array>();
  const assetIndex: AssetEntry[] = [];
  const fontIndex: AssetEntry[] = [];

  for (const assetId of [...required].sort()) {
    const replacement = external.get(assetId);
    if (replacement !== undefined) {
      const destination = replacement.destination === 'fonts' ? fonts : assets;
      destination.set(replacement.entry.path, replacement.bytes);
      (replacement.destination === 'fonts' ? fontIndex : assetIndex).push(replacement.entry);
      continue;
    }

    const source = sourceById.get(sourceIdByOutputId.get(assetId) ?? assetId);
    if (source === undefined) {
      throw new PackFactoryError(
        'missing-master-asset',
        `Template "${templateKey}" references asset ${assetId}, but its .cgproj carries no indexed bytes`,
      );
    }
    const bytes = project.files.get(source.path);
    if (bytes === undefined) {
      throw new PackFactoryError(
        'missing-master-asset',
        `Template "${templateKey}" is missing packaged bytes for ${source.filename}`,
      );
    }
    assertProjectAssetIntegrity(source, bytes, templateKey);
    const entry: AssetEntry = {
      id: assetId,
      path: source.path,
      kind: source.kind,
      bytes: bytes.byteLength,
      sha256: source.sha256,
      mime: mimeFor(path.extname(source.filename)),
    };
    const destination = source.kind === 'font' ? fonts : assets;
    destination.set(source.path, bytes);
    (source.kind === 'font' ? fontIndex : assetIndex).push(entry);
  }

  return { assets, fonts, assetIndex, fontIndex };
}

function validateMappedSourceKinds(
  sourceById: ReadonlyMap<string, ProjectAssetEntry>,
  applied: AppliedBindings,
  inputs: LoadedFactoryInputs,
  templateKey: string,
): void {
  for (const binding of applied.assets) {
    const source = sourceById.get(binding.sourceId);
    if (source === undefined) {
      throw new PackFactoryError(
        'unknown-source-asset',
        `Template "${templateKey}" asset binding names ${binding.sourceId}, which is absent from the master project`,
      );
    }
    const target = inputs.assets.get(binding.role);
    if (target !== undefined && source.kind !== target.definition.kind) {
      throw new PackFactoryError(
        'asset-kind-mismatch',
        `Template "${templateKey}" maps ${source.kind} asset ${binding.sourceId} to ${target.definition.kind} role "${binding.role}"`,
      );
    }
  }
  for (const binding of applied.fonts) {
    const source = sourceById.get(binding.sourceId);
    if (source === undefined || source.kind !== 'font') {
      throw new PackFactoryError(
        'font-kind-mismatch',
        `Template "${templateKey}" font binding ${binding.sourceId} is not a font in the master project`,
      );
    }
  }
}

function collectAssetIds(scene: Scene): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown, key?: string): void => {
    if (typeof value === 'string') {
      if ((key === 'assetId' || key === 'defaultAssetId') && value !== '') ids.add(value);
      if (key === 'family' && value.startsWith('asset-')) ids.add(value.slice('asset-'.length));
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        visit(child, childKey);
      }
    }
  };
  visit(scene);
  return ids;
}

function assertProjectAssetIntegrity(
  entry: ProjectAssetEntry,
  bytes: Uint8Array,
  templateKey: string,
): void {
  const actual = sha256Hex(bytes);
  if (actual !== entry.sha256 || bytes.byteLength !== entry.byteSize) {
    throw new PackFactoryError(
      'corrupt-master-asset',
      `Template "${templateKey}" master asset ${entry.filename} does not match its project index`,
    );
  }
}

function assertExtension(kind: AssetEntry['kind'], extension: string, label: string): void {
  const allowed: Record<AssetEntry['kind'], readonly string[]> = {
    image: ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'],
    lottie: ['.json'],
    video: ['.webm', '.mp4'],
    audio: ['.wav'],
    font: ['.ttf', '.otf', '.woff', '.woff2'],
  };
  if (!allowed[kind].includes(extension.toLowerCase())) {
    throw new PackFactoryError(
      'unsupported-asset-file',
      `${label} uses ${extension || '<no extension>'}; expected ${allowed[kind].join(', ')}`,
    );
  }
}

function mimeFor(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json';
    case '.webm':
      return 'video/webm';
    case '.mp4':
      return 'video/mp4';
    case '.wav':
      return 'audio/wav';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}
