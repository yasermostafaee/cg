import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Protocol } from 'electron';
import { AssetService } from '../src/main/services/AssetService.js';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { PreviewFs } from '../src/main/preview/preview-fs.js';
import {
  CG_PREVIEW_SCHEME,
  registerPreviewProtocol,
} from '../src/main/preview/register-protocol.js';

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('registerPreviewProtocol', () => {
  it('CG_PREVIEW_SCHEME declares standard + secure + supportFetchAPI', () => {
    expect(CG_PREVIEW_SCHEME.scheme).toBe('cgpreview');
    expect(CG_PREVIEW_SCHEME.privileges.standard).toBe(true);
    expect(CG_PREVIEW_SCHEME.privileges.secure).toBe(true);
    expect(CG_PREVIEW_SCHEME.privileges.supportFetchAPI).toBe(true);
  });

  it('registers a Fetch-style handler against the cgpreview scheme', async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-proto-'));
    const projects = new ProjectService({
      recentFilePath: path.join(tmp, 'recent.json'),
      randomId: () => 'scene-fixed',
    });
    const { scene } = projects.newScene('demo', 'lower-third');
    const assets = new AssetService({ workingRoot: path.join(tmp, 'working') });
    const fs2 = new PreviewFs({ cgJs: 'stub', assets });
    fs2.setActive(scene);

    let registeredHandler: ((req: Request) => Promise<Response>) | null = null;
    const protocol = {
      handle: vi.fn((scheme: string, h: (req: Request) => Promise<Response>) => {
        expect(scheme).toBe('cgpreview');
        registeredHandler = h;
      }),
    } as unknown as Protocol;

    registerPreviewProtocol({ protocol, fs: fs2 });
    expect(registeredHandler).not.toBeNull();

    // Drive the handler against a known URL.
    const ok = await registeredHandler!(new Request(`cgpreview://${scene.id}/cg.js`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('stub');

    const missing = await registeredHandler!(new Request(`cgpreview://${scene.id}/no.txt`));
    expect(missing.status).toBe(404);
  });
});
