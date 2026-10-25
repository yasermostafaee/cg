import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PackFactoryError } from './errors.js';

export const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

export function resolveDeclaredPath(declaringFile: string, declaredPath: string): string {
  return path.resolve(path.dirname(declaringFile), declaredPath);
}

export function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== '..')
  );
}

export function assertOutsideRepository(
  candidate: string,
  label: string,
  repositoryRoot = REPOSITORY_ROOT,
): void {
  if (isInside(repositoryRoot, candidate)) {
    throw new PackFactoryError(
      'customer-data-in-repository',
      `${label} must stay outside the product repository: ${candidate}`,
    );
  }
}

export async function assertReadableFile(file: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    throw new PackFactoryError('missing-input', `${label} does not exist: ${file}`);
  }
  if (!stat.isFile()) {
    throw new PackFactoryError('invalid-input-path', `${label} is not a file: ${file}`);
  }
}

export async function canonicalReadableFile(file: string, label: string): Promise<string> {
  await assertReadableFile(file, label);
  return fs.realpath(file);
}

/** Resolve existing ancestors too, so an outside-looking symlink cannot hide an inside target. */
export async function canonicalPathForCreation(candidate: string): Promise<string> {
  let cursor = path.resolve(candidate);
  const missing: string[] = [];
  while (true) {
    try {
      const existing = await fs.realpath(cursor);
      return path.resolve(existing, ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export function safeOutputPath(outputPath: string): string {
  const resolved = path.resolve(outputPath);
  const root = path.parse(resolved).root;
  if (resolved === root || path.basename(resolved).trim() === '') {
    throw new PackFactoryError('unsafe-output', `Refusing broad output directory: ${resolved}`);
  }
  return resolved;
}
