import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectStudioMaster } from '../src/studio-inspect.js';
import {
  listStudioCustomers,
  nextStudioDeliveryPath,
  openStudioWorkspace,
  readStudioCustomer,
  saveStudioCustomer,
} from '../src/studio-workspace.js';
import { REPOSITORY_ROOT } from '../src/paths.js';
import { createFactoryFixture, type FactoryFixture } from './fixtures.js';

const fixtures: FactoryFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function setup(): Promise<{
  fixture: FactoryFixture;
  workspace: Awaited<ReturnType<typeof openStudioWorkspace>>;
  brandKit: Record<string, unknown>;
  recipe: Record<string, unknown>;
}> {
  const fixture = await createFactoryFixture();
  fixtures.push(fixture);
  const workspace = await openStudioWorkspace(path.join(fixture.root, 'studio'));
  const brandKit = JSON.parse(await fs.readFile(fixture.brandKitPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const recipe = JSON.parse(await fs.readFile(fixture.recipePath, 'utf8')) as Record<
    string,
    unknown
  >;
  return { fixture, workspace, brandKit, recipe };
}

describe('Brand Pack Studio workspace', () => {
  it('persists canonical customer documents and restores customer/delivery history', async () => {
    const source = await setup();
    await saveStudioCustomer(source.workspace, 'example-station', {
      brandKit: source.brandKit,
      recipe: source.recipe,
    });
    const firstDelivery = await nextStudioDeliveryPath(
      source.workspace,
      'example-station',
      new Date('2026-10-26T12:34:56.000Z'),
    );
    await fs.mkdir(firstDelivery, { recursive: true });
    await fs.writeFile(
      path.join(firstDelivery, 'pack-report.json'),
      JSON.stringify({ status: 'complete', templates: [{ key: 'lower-third' }] }),
    );

    const reopened = await openStudioWorkspace(source.workspace.root);
    const customers = await listStudioCustomers(reopened);
    expect(customers).toEqual([
      expect.objectContaining({
        id: 'example-station',
        name: 'Synthetic Station',
        templates: 1,
        deliveries: [expect.objectContaining({ status: 'complete', templates: 1 })],
      }),
    ]);
  });

  it('refuses a workspace inside the product repository before creating it', async () => {
    const forbidden = path.join(REPOSITORY_ROOT, '.brand-pack-studio-test');
    await expect(openStudioWorkspace(forbidden)).rejects.toThrow(/outside the product repository/);
    await expect(fs.stat(forbidden)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validates before writing and preserves the previous valid customer documents', async () => {
    const source = await setup();
    await saveStudioCustomer(source.workspace, 'example-station', {
      brandKit: source.brandKit,
      recipe: source.recipe,
    });
    const invalid = structuredClone(source.brandKit) as {
      fonts: Record<string, { licenseConfirmed: boolean }>;
    };
    const font = invalid.fonts['display'];
    if (font === undefined) throw new Error('fixture font missing');
    font.licenseConfirmed = false;

    await expect(
      saveStudioCustomer(source.workspace, 'example-station', {
        brandKit: invalid,
        recipe: source.recipe,
      }),
    ).rejects.toThrow(/embedding rights/);
    const customer = await readStudioCustomer(source.workspace, 'example-station');
    expect(customer.brandKit.fonts['display']?.licenseConfirmed).toBe(true);
  });

  it('inspects composition, colour and asset metadata without changing the master', async () => {
    const source = await setup();
    const master = path.join(source.fixture.root, 'master.cgproj');
    const before = await fs.readFile(master);
    const inspection = await inspectStudioMaster(master);
    const after = await fs.readFile(master);

    expect(after).toEqual(before);
    expect(inspection.compositions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'comp-main', width: 1920 })]),
    );
    expect(inspection.colors).toContain('#123456');
    expect(inspection.assets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'master-logo', kind: 'image' })]),
    );
  });

  it('has no Designer dependency or starter-catalogue integration path', async () => {
    const packageJson = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies).not.toHaveProperty('@cg/designer');

    const sourceFiles = await sourceTree(path.resolve('src'));
    const studioFiles = await sourceTree(path.resolve('studio'));
    const contents = await Promise.all(
      [...sourceFiles, ...studioFiles].map((file) => fs.readFile(file, 'utf8')),
    );
    expect(contents.join('\n')).not.toMatch(/apps[\\/]designer|LandingView|starter catalogue/i);
  });
});

async function sourceTree(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceTree(candidate)));
    else if (/\.(?:ts|css|html)$/i.test(entry.name)) files.push(candidate);
  }
  return files;
}
