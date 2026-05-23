import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMain } from 'electron';
import { bootDesigner } from '../src/main/boot.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function fakeIpcMain(): IpcMain {
  return {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as IpcMain;
}

function fakeWindow(): BrowserWindow {
  return { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
}

const CG_JS_STUB =
  'export function createRuntime(){return{ready:Promise.resolve()}}export function installCasparGlobals(){}';

describe('bootDesigner', () => {
  it('returns a handle wiring all four services', async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-bootd-'));
    const handle = bootDesigner({
      ipcMain: fakeIpcMain(),
      window: fakeWindow(),
      cgJs: CG_JS_STUB,
      workingRoot: path.join(tmp, 'working'),
      recentFilePath: path.join(tmp, 'recent.json'),
    });
    expect(handle.projects).toBeDefined();
    expect(handle.assets).toBeDefined();
    expect(handle.fonts).toBeDefined();
    expect(handle.exporter).toBeDefined();
    handle.shutdown();
  });

  it('uses OS tmpdir defaults when no overrides are provided', () => {
    const handle = bootDesigner({
      ipcMain: fakeIpcMain(),
      window: fakeWindow(),
      cgJs: CG_JS_STUB,
    });
    expect(handle.projects).toBeDefined();
    handle.shutdown();
  });
});
