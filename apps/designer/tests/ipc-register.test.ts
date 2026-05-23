import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcHandler, IpcPublisher } from '@cg/shared-ipc';
import { AssetService } from '../src/main/services/AssetService.js';
import { ExportService } from '../src/main/services/ExportService.js';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { PreviewService } from '../src/main/preview/PreviewService.js';
import { registerDesignerIpc } from '../src/main/ipc/register.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

const CG_JS_STUB = `export function createRuntime(){return{ready:Promise.resolve()}}export function installCasparGlobals(){}`;

function makeFakeIpc(): IpcHandler & {
  calls: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
} {
  const calls = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handle: vi.fn((channel: string, listener) => {
      calls.set(channel, listener as (event: unknown, ...args: unknown[]) => unknown);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
    calls,
  } as unknown as IpcHandler & {
    calls: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
  };
}

function makeFakePublisher(): IpcPublisher & {
  sent: { channel: string; args: unknown[] }[];
} {
  const sent: { channel: string; args: unknown[] }[] = [];
  return {
    send: (channel: string, ...args: unknown[]) => sent.push({ channel, args }),
    sent,
  };
}

async function setup(): Promise<{
  ipcMain: ReturnType<typeof makeFakeIpc>;
  webContents: ReturnType<typeof makeFakePublisher>;
  projects: ProjectService;
  assets: AssetService;
  exporter: ExportService;
  preview: PreviewService;
  tmpDir: string;
  unwire: () => void;
}> {
  tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-ipc-'));
  const projects = new ProjectService({
    recentFilePath: path.join(tmp, 'recent.json'),
    now: () => new Date('2026-05-23T10:00:00.000Z'),
    randomId: () => 'scene-fixed',
  });
  const assets = new AssetService({
    workingRoot: path.join(tmp, 'working'),
    randomId: () => 'asset-fixed',
  });
  const exporter = new ExportService({ cgJs: CG_JS_STUB, assets });
  const preview = new PreviewService({ cgJs: CG_JS_STUB, assets });
  const ipcMain = makeFakeIpc();
  const webContents = makeFakePublisher();
  const unwire = registerDesignerIpc({
    ipcMain,
    webContents,
    projects,
    assets,
    exporter,
    preview,
  });
  return { ipcMain, webContents, projects, assets, exporter, preview, tmpDir: tmp, unwire };
}

describe('registerDesignerIpc', () => {
  it('registers every designer channel on ipcMain', async () => {
    const { ipcMain } = await setup();
    for (const c of [
      'projects.new',
      'projects.open',
      'projects.save',
      'projects.recent',
      'assets.import',
      'assets.list',
      'assets.remove',
      'export.preflight',
      'export.run',
    ]) {
      expect(ipcMain.calls.has(c)).toBe(true);
    }
  });

  it('forwards projects.new and returns the new scene', async () => {
    const { ipcMain } = await setup();
    const handler = ipcMain.calls.get('projects.new');
    const result = (await handler!(null, { name: 'X', templateType: 'lower-third' })) as {
      scene: { id: string };
    };
    expect(result.scene.id).toBe('scene-fixed');
  });

  it('forwards projects.save with explicit path', async () => {
    const { ipcMain, tmpDir } = await setup();
    const newHandler = ipcMain.calls.get('projects.new');
    const created = (await newHandler!(null, { name: 'X', templateType: 'lower-third' })) as {
      scene: unknown;
    };
    const saveHandler = ipcMain.calls.get('projects.save');
    const out = path.join(tmpDir, 'p.scene.json');
    const result = (await saveHandler!(null, { scene: created.scene, path: out })) as {
      path: string;
    };
    expect(result.path).toBe(out);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('projects.save without a path throws when no dialog is provided', async () => {
    const { ipcMain } = await setup();
    const newHandler = ipcMain.calls.get('projects.new');
    const created = (await newHandler!(null, { name: 'X', templateType: 'lower-third' })) as {
      scene: unknown;
    };
    const saveHandler = ipcMain.calls.get('projects.save');
    await expect(saveHandler!(null, { scene: created.scene })).rejects.toThrow(/dialog/);
  });

  it('republishes projects.active-changed pushes', async () => {
    const { projects, webContents } = await setup();
    projects.newScene('Y', 'ticker');
    expect(webContents.sent.some((s) => s.channel === 'projects.active-changed')).toBe(true);
  });

  it('republishes assets.imported pushes', async () => {
    const { assets, webContents, tmpDir } = await setup();
    const src = path.join(tmpDir, 'logo.png');
    await fs.promises.writeFile(src, 'fake');
    await assets.import(src);
    expect(webContents.sent.some((s) => s.channel === 'assets.imported')).toBe(true);
  });

  it('unwire() detaches service listeners', async () => {
    const { projects, webContents, unwire } = await setup();
    unwire();
    projects.newScene('Y', 'ticker');
    expect(webContents.sent.filter((s) => s.channel === 'projects.active-changed')).toHaveLength(0);
  });
});
