import * as fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, parseArgs } from '../src/cli.js';
import { createFactoryFixture, type FactoryFixture } from './fixtures.js';

const fixtures: FactoryFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe('cg-pack-factory CLI', () => {
  it('accepts the literal pnpm script delimiter before Studio options', () => {
    expect(
      parseArgs(['studio', '--', '--workspace', 'D:\\CG-Customers', '--port', '4319']),
    ).toMatchObject({
      command: 'studio',
      workspace: 'D:\\CG-Customers',
      port: 4319,
    });
  });

  it('validates and builds an explicitly incomplete no-preview delivery', async () => {
    const fixture = await createFactoryFixture();
    fixtures.push(fixture);
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const error = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(
      await main(['validate', '--brand-kit', fixture.brandKitPath, '--recipe', fixture.recipePath]),
    ).toBe(0);
    expect(out.mock.calls.flat().join('')).toContain('VALID');

    expect(
      await main([
        'build',
        '--brand-kit',
        fixture.brandKitPath,
        '--recipe',
        fixture.recipePath,
        '--out',
        fixture.outputPath,
        '--no-preview',
      ]),
    ).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(out.mock.calls.flat().join('')).toContain('INCOMPLETE');
    await expect(fs.stat(`${fixture.outputPath}/pack-report.json`)).resolves.toBeDefined();
  });

  it('returns a failure for missing required options', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const error = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await main(['validate'])).toBe(1);
    expect(error.mock.calls.flat().join('')).toContain('missing-option');
  });
});
