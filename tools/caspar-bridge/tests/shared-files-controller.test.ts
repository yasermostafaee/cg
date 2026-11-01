import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSharedFilesController } from '../src/shared-files.js';

const roots: string[] = [];

function scratch(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-shared-files-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('the live shared-files controller', () => {
  it('adopts and persists a readable server folder', async () => {
    const root = scratch();
    const original = path.join(root, 'original');
    const next = path.join(root, 'next');
    const config = path.join(root, 'cg-bridge.json');
    fs.mkdirSync(original);
    fs.mkdirSync(next);
    fs.writeFileSync(
      config,
      JSON.stringify({ playoutAddress: 'http://192.0.2.10:8080', textSourceRoot: original }),
    );

    const controller = createSharedFilesController({
      initialPath: original,
      serviceConfigFile: config,
    });
    await expect(controller.setPath(next)).resolves.toEqual({ ok: true, path: next });
    expect(controller.getPath()).toBe(next);
    expect(JSON.parse(fs.readFileSync(config, 'utf8'))).toMatchObject({ textSourceRoot: next });
  });

  it('leaves both live and stored paths intact when the server cannot read the candidate', async () => {
    const root = scratch();
    const original = path.join(root, 'original');
    const missing = path.join(root, 'missing');
    const config = path.join(root, 'cg-bridge.json');
    fs.mkdirSync(original);
    fs.writeFileSync(
      config,
      JSON.stringify({ playoutAddress: 'http://192.0.2.10:8080', textSourceRoot: original }),
    );

    const controller = createSharedFilesController({
      initialPath: original,
      serviceConfigFile: config,
    });
    await expect(controller.setPath(missing)).resolves.toMatchObject({ ok: false });
    expect(controller.getPath()).toBe(original);
    expect(JSON.parse(fs.readFileSync(config, 'utf8'))).toMatchObject({
      textSourceRoot: original,
    });
  });
});
