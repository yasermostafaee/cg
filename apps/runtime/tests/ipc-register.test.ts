import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { IpcHandler, IpcPublisher } from '@cg/shared-ipc';
import { registerIpcHandlers } from '../src/main/ipc/register.js';
import type { ConnectionService } from '../src/main/services/ConnectionService.js';
import type { StackService } from '../src/main/services/StackService.js';
import type { LockService } from '../src/main/services/LockService.js';
import { TemplateRegistry } from '../src/main/services/TemplateRegistry.js';
import type { AuditService } from '../src/main/services/AuditService.js';

function fakeAuditService(): AuditService {
  return {
    filePath: '/tmp/never-written-audit.ndjson',
  } as unknown as AuditService;
}

/**
 * Verifies that `registerIpcHandlers` plugs every channel into the
 * `ipcMain.handle` registry and that service events flow through
 * `webContents.send`. We don't drive the underlying services — they're
 * EventEmitter mocks with stub method surfaces.
 */

function makeIpcMain(): IpcHandler & {
  calls: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
} {
  const calls = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handle: vi.fn((channel: string, listener) => {
      calls.set(channel, listener as (event: unknown, ...args: unknown[]) => unknown);
    }),
    calls,
  };
}

function makeWebContents(): IpcPublisher & { sent: { channel: string; args: unknown[] }[] } {
  const sent: { channel: string; args: unknown[] }[] = [];
  return {
    send: (channel: string, ...args: unknown[]) => {
      sent.push({ channel, args });
    },
    sent,
  };
}

function fakeStackService(): StackService {
  const e = new EventEmitter() as unknown as StackService;
  Object.assign(e, {
    load: vi.fn(() => true),
    take: vi.fn(async () => ({ accepted: true })),
    update: vi.fn(async () => ({ accepted: true })),
    out: vi.fn(async () => ({ accepted: true })),
    remove: vi.fn(async () => ({ accepted: true })),
    snapshot: vi.fn(() => []),
  });
  return e;
}

function fakeConnectionService(): ConnectionService {
  const e = new EventEmitter() as unknown as ConnectionService;
  Object.assign(e, {
    getConfig: vi.fn(() => ({
      servers: {
        A: { host: 'a', amcpPort: 5250, oscPort: 6250 },
        B: { host: 'b', amcpPort: 5250, oscPort: 6250 },
      },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    })),
    getHealth: vi.fn(() => ({
      primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
      backup: { label: 'B', state: 'healthy', amcpAxisOk: true },
      currentPrimary: 'A',
      strategy: 'mirror-sync',
    })),
    failover: vi.fn(async () => 'B'),
  });
  return e;
}

function fakeLockService(): LockService {
  const e = new EventEmitter() as unknown as LockService;
  Object.assign(e, {
    engage: vi.fn(() => ({ ok: true })),
    release: vi.fn(() => ({ ok: true })),
    getState: vi.fn(() => ({ engaged: false })),
  });
  return e;
}

describe('registerIpcHandlers', () => {
  it('registers every runtime channel on ipcMain', () => {
    const ipcMain = makeIpcMain();
    const webContents = makeWebContents();
    registerIpcHandlers({
      ipcMain,
      webContents,
      stack: fakeStackService(),
      connections: fakeConnectionService(),
      lock: fakeLockService(),
      templates: new TemplateRegistry(),
      audit: fakeAuditService(),
    });

    const channels = [
      'stack.load',
      'stack.take',
      'stack.update',
      'stack.out',
      'stack.remove',
      'stack.snapshot',
      'connections.config',
      'connections.health',
      'connections.failover',
      'lock.engage',
      'lock.release',
      'lock.state',
      'templates.get',
      'templates.list',
      'audit.recent',
    ];
    for (const c of channels) {
      expect(ipcMain.calls.has(c)).toBe(true);
    }
  });

  it('forwards stack.take to the StackService and returns its result', async () => {
    const ipcMain = makeIpcMain();
    const webContents = makeWebContents();
    const stack = fakeStackService();
    registerIpcHandlers({
      ipcMain,
      webContents,
      stack,
      connections: fakeConnectionService(),
      lock: fakeLockService(),
      templates: new TemplateRegistry(),
      audit: fakeAuditService(),
    });
    const handler = ipcMain.calls.get('stack.take');
    const result = await handler!(null, { itemId: 'i1' });
    expect(stack.take).toHaveBeenCalledWith('i1');
    expect(result).toEqual({ accepted: true });
  });

  it('publishes state-changed when StackService emits', () => {
    const ipcMain = makeIpcMain();
    const webContents = makeWebContents();
    const stack = fakeStackService();
    registerIpcHandlers({
      ipcMain,
      webContents,
      stack,
      connections: fakeConnectionService(),
      lock: fakeLockService(),
      templates: new TemplateRegistry(),
      audit: fakeAuditService(),
    });
    stack.emit('state-changed', []);
    expect(webContents.sent).toEqual([{ channel: 'stack.state-changed', args: [[]] }]);
  });

  it('returns an unwire() callback that detaches service listeners', () => {
    const ipcMain = makeIpcMain();
    const webContents = makeWebContents();
    const stack = fakeStackService();
    const unwire = registerIpcHandlers({
      ipcMain,
      webContents,
      stack,
      connections: fakeConnectionService(),
      lock: fakeLockService(),
      templates: new TemplateRegistry(),
      audit: fakeAuditService(),
    });
    unwire();
    stack.emit('state-changed', []);
    expect(webContents.sent).toHaveLength(0);
  });

  it('forwards connections.failover and returns newPrimary', async () => {
    const ipcMain = makeIpcMain();
    const webContents = makeWebContents();
    const connections = fakeConnectionService();
    registerIpcHandlers({
      ipcMain,
      webContents,
      stack: fakeStackService(),
      connections,
      lock: fakeLockService(),
      templates: new TemplateRegistry(),
      audit: fakeAuditService(),
    });
    const handler = ipcMain.calls.get('connections.failover');
    const result = await handler!(null, { reason: 'manual' });
    expect(connections.failover).toHaveBeenCalledWith('manual');
    expect(result).toEqual({ ok: true, newPrimary: 'B' });
  });

  it('forwards lock.engage and returns ok', async () => {
    const ipcMain = makeIpcMain();
    const webContents = makeWebContents();
    const lock = fakeLockService();
    registerIpcHandlers({
      ipcMain,
      webContents,
      stack: fakeStackService(),
      connections: fakeConnectionService(),
      lock,
      templates: new TemplateRegistry(),
      audit: fakeAuditService(),
    });
    const handler = ipcMain.calls.get('lock.engage');
    const result = await handler!(null, { pin: '1234' });
    expect(lock.engage).toHaveBeenCalledWith('1234');
    expect(result).toEqual({ ok: true });
  });
});
