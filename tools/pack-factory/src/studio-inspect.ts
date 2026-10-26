import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { unpackProject } from '@cg/vcg-format';
import { PackFactoryError } from './errors.js';
import { canonicalReadableFile } from './paths.js';

export interface StudioMasterInspection {
  path: string;
  projectId: string;
  name: string;
  savedAt: string;
  compositions: {
    id: string;
    name: string;
    width: number;
    height: number;
  }[];
  colors: string[];
  assets: {
    id: string;
    filename: string;
    kind: 'image' | 'font' | 'lottie' | 'video' | 'audio';
  }[];
}

export async function inspectStudioMaster(sourceProject: string): Promise<StudioMasterInspection> {
  const file = await canonicalReadableFile(path.resolve(sourceProject), 'Master project');
  if (path.extname(file).toLowerCase() !== '.cgproj') {
    throw new PackFactoryError('invalid-master', `Master must be a .cgproj: ${file}`);
  }
  const bytes = new Uint8Array(await fs.readFile(file));
  let document;
  try {
    document = await unpackProject(bytes);
  } catch (error) {
    throw new PackFactoryError(
      'invalid-master',
      `Master project is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    path: file,
    projectId: document.manifest.projectId,
    name: document.manifest.name,
    savedAt: document.manifest.savedAt,
    compositions: document.scene.compositions?.map((composition) => ({
      id: composition.id,
      name: composition.name,
      width: composition.resolution.width,
      height: composition.resolution.height,
    })) ?? [
      {
        id: document.scene.id,
        name: document.scene.name,
        width: document.scene.resolution.width,
        height: document.scene.resolution.height,
      },
    ],
    colors: collectHexColors(document.scene),
    assets: document.index.map((asset) => ({
      id: asset.assetId,
      filename: asset.filename,
      kind: asset.kind,
    })),
  };
}

function collectHexColors(value: unknown): string[] {
  const found = new Map<string, string>();
  visit(value, (candidate) => {
    if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(candidate)) return;
    const key = candidate.toLowerCase();
    if (!found.has(key)) found.set(key, candidate.toUpperCase());
  });
  return [...found.values()].sort();
}

function visit(value: unknown, onString: (value: string) => void): void {
  if (typeof value === 'string') {
    onString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) visit(child, onString);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) visit(child, onString);
  }
}
