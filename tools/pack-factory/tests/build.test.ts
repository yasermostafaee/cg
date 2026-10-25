import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import { preparePack } from '../src/build.js';
import { writeDelivery } from '../src/delivery.js';
import { brandAssetIdFor } from '../src/identity.js';
import { REPOSITORY_ROOT } from '../src/paths.js';
import { createFactoryFixture, type FactoryFixture } from './fixtures.js';

const fixtures: FactoryFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function fixture(brandId?: string): Promise<FactoryFixture> {
  const created = await createFactoryFixture(brandId);
  fixtures.push(created);
  return created;
}

describe('preparePack', () => {
  it('builds a verified scoped package with stable brand/template and brand/role identities', async () => {
    const source = await fixture();
    const fixed = '2026-10-26T00:00:00.000Z';
    const first = await preparePack({
      brandKitPath: source.brandKitPath,
      recipePath: source.recipePath,
      exportedAt: fixed,
    });
    const second = await preparePack({
      brandKitPath: source.brandKitPath,
      recipePath: source.recipePath,
      exportedAt: fixed,
    });

    expect(first.templates).toHaveLength(1);
    const template = first.templates[0];
    if (template === undefined) throw new Error('fixture produced no template');
    expect(template.vcg).toEqual(second.templates[0]?.vcg);
    expect(template.scene.name).toBe('Synthetic Lower Third');
    expect(JSON.stringify(template.scene)).toContain('#654321');
    expect(JSON.stringify(template.scene)).not.toContain('#123456');
    expect(template.bindings.assets[0]?.outputId).toBe(
      brandAssetIdFor('example-station', 'asset', 'logo'),
    );
    const packageDocument = await unpack(template.vcg);
    expect(packageDocument.scene.compositions).toEqual([]);
    expect(packageDocument.manifest.assetIndex).toHaveLength(3);
    expect(packageDocument.manifest.assetIndex.map((asset) => asset.id)).toEqual(
      expect.arrayContaining([
        template.bindings.assets[0]?.outputId,
        template.bindings.fonts[0]?.outputId,
      ]),
    );
    expect(template.masterAssets).toHaveLength(1);
    expect(template.masterAssets[0]?.sourceId).toBe('master-decor');
    expect(packageDocument.manifest.assetIndex.map((asset) => asset.id)).toContain(
      template.masterAssets[0]?.outputId,
    );
    expect(packageDocument.manifest.assetIndex.map((asset) => asset.id)).not.toContain(
      'master-decor',
    );
    expect([...packageDocument.files.keys()].some((file) => file.includes('sibling'))).toBe(false);
  });

  it('isolates two brands that build the same template key', async () => {
    const a = await fixture('brand-a');
    const b = await fixture('brand-b');
    const [packA, packB] = await Promise.all([
      preparePack({ brandKitPath: a.brandKitPath, recipePath: a.recipePath }),
      preparePack({ brandKitPath: b.brandKitPath, recipePath: b.recipePath }),
    ]);
    expect(packA.templates[0]?.manifest.id).not.toBe(packB.templates[0]?.manifest.id);
    expect(packA.templates[0]?.manifest.assetIndex[0]?.id).not.toBe(
      packB.templates[0]?.manifest.assetIndex[0]?.id,
    );
  });

  it('refuses a stale source binding rather than building an unchanged package', async () => {
    const source = await fixture();
    const recipe = JSON.parse(await fs.readFile(source.recipePath, 'utf8')) as {
      templates: { colors: Record<string, string> }[];
    };
    const firstTemplate = recipe.templates[0];
    if (firstTemplate === undefined) throw new Error('fixture recipe has no template');
    firstTemplate.colors = { '#ABCDEF': 'primary' };
    await fs.writeFile(source.recipePath, JSON.stringify(recipe));
    await expect(
      preparePack({ brandKitPath: source.brandKitPath, recipePath: source.recipePath }),
    ).rejects.toThrow(/do not occur/);
  });

  it('writes an atomic no-preview delivery and marks it incomplete', async () => {
    const source = await fixture();
    const pack = await preparePack({
      brandKitPath: source.brandKitPath,
      recipePath: source.recipePath,
    });
    const result = await writeDelivery(pack, {
      outputDirectory: source.outputPath,
      preview: false,
    });
    expect(result.report.status).toBe('incomplete');
    expect(result.report.visualQc).toBe('skipped');
    await expect(fs.stat(`${source.outputPath}/templates/lower-third.vcg`)).resolves.toBeDefined();
    expect(await fs.readFile(`${source.outputPath}/contact-sheet.html`, 'utf8')).toContain(
      'QC SKIPPED',
    );

    await expect(
      writeDelivery(pack, { outputDirectory: source.outputPath, preview: false }),
    ).rejects.toThrow(/already exists/);
    await fs.writeFile(path.join(source.outputPath, 'old-marker.txt'), 'old');
    await writeDelivery(pack, {
      outputDirectory: source.outputPath,
      preview: false,
      force: true,
    });
    await expect(fs.stat(path.join(source.outputPath, 'old-marker.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('refuses a delivery path inside the product repository before creating it', async () => {
    const source = await fixture();
    const pack = await preparePack({
      brandKitPath: source.brandKitPath,
      recipePath: source.recipePath,
    });
    const forbidden = path.join(REPOSITORY_ROOT, '.pack-factory-customer-output-test');
    await expect(
      writeDelivery(pack, { outputDirectory: forbidden, preview: false }),
    ).rejects.toThrow(/outside the product repository/);
    await expect(fs.stat(forbidden)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
