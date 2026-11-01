import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '../src/bridge.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { TEST_LAYER_POLICY } from './support/harness.js';

let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
});

function routes(controller?: {
  getPath: () => string;
  setPath: (path: string) => Promise<{ ok: boolean; path?: string; message?: string }>;
}) {
  runtime = new CasparRuntime(
    {
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  return buildRoutes(runtime, controller === undefined ? {} : { sharedFiles: controller });
}

describe('the station-wide shared-files path', () => {
  it('reports the live Bridge-server path and delegates an admin change', async () => {
    let current = String.raw`D:\CG Shared`;
    const setPath = vi.fn(async (path: string) => {
      current = path;
      return { ok: true, path };
    });
    const table = routes({ getPath: () => current, setPath });

    await expect(Promise.resolve(table.get('sharedFiles.get')?.handle(undefined))).resolves.toEqual(
      {
        path: current,
      },
    );
    await expect(
      Promise.resolve(table.get('sharedFiles.set')?.handle({ path: String.raw`\\NEWS\CG Shared` })),
    ).resolves.toEqual({ ok: true, path: String.raw`\\NEWS\CG Shared` });
    expect(setPath).toHaveBeenCalledWith(String.raw`\\NEWS\CG Shared`);
  });

  it('refuses an editable write when no installed controller owns persistence', async () => {
    await expect(
      Promise.resolve(routes().get('sharedFiles.set')?.handle({ path: 'D:\\Other' })),
    ).resolves.toEqual({
      ok: false,
      message: 'This installation does not allow changing the Shared files path from CG Control.',
    });
  });
});
