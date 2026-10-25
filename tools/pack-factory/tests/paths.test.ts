import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFactoryInputs } from '../src/config.js';
import {
  REPOSITORY_ROOT,
  assertOutsideRepository,
  isInside,
  safeOutputPath,
} from '../src/paths.js';

describe('customer-data boundary', () => {
  it('recognises the repository itself and descendants, not prefix lookalikes', () => {
    const root = path.resolve('C:/work/cg');
    expect(isInside(root, path.join(root, 'customers/acme'))).toBe(true);
    expect(isInside(root, path.resolve('C:/work/cg-other'))).toBe(false);
  });

  it('refuses customer paths in the repository and broad filesystem roots', () => {
    const root = path.resolve('C:/work/cg');
    expect(() => assertOutsideRepository(path.join(root, 'customer'), 'Customer', root)).toThrow(
      /outside the product repository/,
    );
    expect(() => safeOutputPath(path.parse(process.cwd()).root)).toThrow(/broad output/);
  });

  it('refuses Brand Kit and recipe files located in the product repository', async () => {
    await expect(
      loadFactoryInputs(
        path.join(REPOSITORY_ROOT, 'package.json'),
        path.join(REPOSITORY_ROOT, 'package.json'),
        REPOSITORY_ROOT,
      ),
    ).rejects.toThrow(/Brand Kit must stay outside/);
  });
});
