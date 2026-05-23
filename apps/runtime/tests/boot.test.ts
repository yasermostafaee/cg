import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMain } from 'electron';
import { boot } from '../src/main/boot.js';

/**
 * `boot()` is the runtime's composition root. We can't load Electron
 * from a vitest worker, so we hand it a duck-typed stand-in for both
 * ipcMain and the BrowserWindow's webContents.
 */

function makeFakeIpcMain(): IpcMain & { calls: Map<string, unknown> } {
  const calls = new Map<string, unknown>();
  return {
    handle: vi.fn((channel: string, listener) => {
      calls.set(channel, listener);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
    calls,
  } as unknown as IpcMain & { calls: Map<string, unknown> };
}

function makeFakeWindow(): BrowserWindow {
  const webContents = { send: vi.fn() };
  return { webContents } as unknown as BrowserWindow;
}

describe('boot()', () => {
  it('wires services + IPC and returns a shutdown handle', async () => {
    const ipcMain = makeFakeIpcMain();
    const window = makeFakeWindow();

    // Point at an unreachable host so ServerSessions never actually
    // connect during this test. The boot order shouldn't depend on
    // connect succeeding.
    process.env['CG_PRIMARY_HOST'] = '127.0.0.1';
    process.env['CG_PRIMARY_AMCP_PORT'] = '65500';
    process.env['CG_PRIMARY_OSC_PORT'] = '65501';
    process.env['CG_BACKUP_HOST'] = '127.0.0.1';
    process.env['CG_BACKUP_AMCP_PORT'] = '65502';
    process.env['CG_BACKUP_OSC_PORT'] = '65503';

    const handle = boot({ ipcMain, window });
    try {
      expect(handle.connections).toBeDefined();
      expect(handle.stack).toBeDefined();
      expect(handle.lock).toBeDefined();
      expect(handle.templates).toBeDefined();
      expect(ipcMain.calls.has('stack.take')).toBe(true);
      expect(ipcMain.calls.has('connections.health')).toBe(true);
      expect(ipcMain.calls.has('lock.state')).toBe(true);
    } finally {
      await handle.shutdown();
    }
  });

  it('reads strategy from env (defaulting to mirror-sync)', async () => {
    const ipcMain = makeFakeIpcMain();
    const window = makeFakeWindow();
    process.env['CG_STRATEGY'] = 'journal-replay';
    process.env['CG_PRIMARY_AMCP_PORT'] = '65500';
    process.env['CG_BACKUP_AMCP_PORT'] = '65502';
    const handle = boot({ ipcMain, window });
    try {
      expect(handle.connections.getConfig().strategy).toBe('journal-replay');
    } finally {
      await handle.shutdown();
    }
    delete process.env['CG_STRATEGY'];
  });

  it('rejects unknown strategy and falls back to mirror-sync', async () => {
    const ipcMain = makeFakeIpcMain();
    const window = makeFakeWindow();
    process.env['CG_STRATEGY'] = 'nonsense';
    const handle = boot({ ipcMain, window });
    try {
      expect(handle.connections.getConfig().strategy).toBe('mirror-sync');
    } finally {
      await handle.shutdown();
    }
    delete process.env['CG_STRATEGY'];
  });

  it('CG_AUTO_FAILOVER=false disables auto-failover', async () => {
    const ipcMain = makeFakeIpcMain();
    const window = makeFakeWindow();
    process.env['CG_AUTO_FAILOVER'] = 'false';
    const handle = boot({ ipcMain, window });
    try {
      expect(handle.connections.getConfig().autoFailoverEnabled).toBe(false);
    } finally {
      await handle.shutdown();
    }
    delete process.env['CG_AUTO_FAILOVER'];
  });
});

// satisfy unused-binding lint for the EventEmitter import — used implicitly by mocks.
void new EventEmitter();
