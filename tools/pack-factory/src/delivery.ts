import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PreparedPack } from './build.js';
import { PackFactoryError } from './errors.js';
import {
  REPOSITORY_ROOT,
  assertOutsideRepository,
  canonicalPathForCreation,
  safeOutputPath,
} from './paths.js';
import { runVisualQc } from './qc.js';
import {
  buildPackReport,
  contactSheetHtml,
  packSheetMarkdown,
  type PackReport,
} from './reports.js';

export interface DeliveryOptions {
  outputDirectory: string;
  preview?: boolean;
  force?: boolean;
  repositoryRoot?: string;
}

export async function writeDelivery(
  pack: PreparedPack,
  options: DeliveryOptions,
): Promise<{ outputDirectory: string; report: PackReport }> {
  const outputDirectory = safeOutputPath(
    await canonicalPathForCreation(safeOutputPath(options.outputDirectory)),
  );
  assertOutsideRepository(
    outputDirectory,
    'Delivery directory',
    options.repositoryRoot ?? REPOSITORY_ROOT,
  );
  const existing = await pathKind(outputDirectory);
  if (existing !== 'missing' && options.force !== true) {
    throw new PackFactoryError(
      'output-exists',
      `Delivery path already exists; choose another path or pass --force: ${outputDirectory}`,
    );
  }
  const parent = path.dirname(outputDirectory);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(parent, `.${path.basename(outputDirectory)}.factory-`));

  try {
    await fs.mkdir(path.join(stage, 'templates'), { recursive: true });
    await fs.mkdir(path.join(stage, 'previews'), { recursive: true });
    for (const template of pack.templates) {
      await fs.writeFile(path.join(stage, 'templates', template.outputName), template.vcg);
    }
    const qc = options.preview === false ? null : await runVisualQc(pack.templates, stage);
    const report = buildPackReport(pack, qc);
    await fs.writeFile(
      path.join(stage, 'pack-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await fs.writeFile(path.join(stage, 'pack-sheet.md'), packSheetMarkdown(pack, report));
    await fs.writeFile(path.join(stage, 'contact-sheet.html'), contactSheetHtml(pack, report));
    await promote(stage, outputDirectory, options.force === true);
    return { outputDirectory, report };
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function promote(stage: string, output: string, force: boolean): Promise<void> {
  if ((await pathKind(output)) === 'missing') {
    await fs.rename(stage, output);
    return;
  }
  if (!force) {
    throw new PackFactoryError('output-exists', `Delivery path already exists: ${output}`);
  }
  const backup = `${output}.previous-${String(process.pid)}-${String(Date.now())}`;
  await fs.rename(output, backup);
  try {
    await fs.rename(stage, output);
    await fs.rm(backup, { recursive: true, force: true });
  } catch (error) {
    if ((await pathKind(output)) === 'missing') await fs.rename(backup, output);
    throw error;
  }
}

async function pathKind(candidate: string): Promise<'missing' | 'file' | 'directory'> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isDirectory() ? 'directory' : 'file';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}
