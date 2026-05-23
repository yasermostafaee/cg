import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { BrowserWindow, IpcMain } from 'electron';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { boot, type BootHandle } from '../../src/main/boot.js';

/**
 * M5.3 — end-to-end smoke against amcp-mock.
 *
 * Drives the runtime's composition root (`boot()`) against a real
 * amcp-mock instance (OSC enabled). Verifies the full operator flow
 * lands the right state changes in the Reconciler:
 *
 *   load   → status 'loaded'
 *   take   → 'playing' + AMCP PLAY observed on the wire
 *            + OSC 'html' arrives → 'on-air'
 *   out    → CG STOP observed
 *   remove → item gone
 *
 * Playwright-driven UI tests against the rendered Electron window live
 * in `tests/e2e/` and ship with M9 alongside the operator guide.
 */

let mocks: [MockHandle, MockHandle] | undefined;
let handle: BootHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.shutdown();
    handle = undefined;
  }
  if (mocks) {
    for (const m of mocks) await m.stop();
    mocks = undefined;
  }
  // Reset env overrides used by the runtime's config reader.
  for (const k of [
    'CG_PRIMARY_HOST',
    'CG_PRIMARY_AMCP_PORT',
    'CG_PRIMARY_OSC_PORT',
    'CG_BACKUP_HOST',
    'CG_BACKUP_AMCP_PORT',
    'CG_BACKUP_OSC_PORT',
    'CG_STRATEGY',
    'CG_AUTO_FAILOVER',
  ]) {
    delete process.env[k];
  }
});

function makeFakeIpcMain(): IpcMain & {
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
  } as unknown as IpcMain & { calls: Map<string, (event: unknown, ...args: unknown[]) => unknown> };
}

function makeFakeWindow(): {
  window: BrowserWindow;
  sent: { channel: string; payload: unknown }[];
} {
  const sent: { channel: string; payload: unknown }[] = [];
  const webContents = {
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload });
    },
  };
  return { window: { webContents } as unknown as BrowserWindow, sent };
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function setup(): Promise<{
  handle: BootHandle;
  mockA: MockHandle;
  mockB: MockHandle;
  sent: { channel: string; payload: unknown }[];
  ipcMain: IpcMain & { calls: Map<string, (event: unknown, ...args: unknown[]) => unknown> };
  templateUrl: string;
}> {
  // Boot two mocks. The primary mock pushes OSC to whatever local port
  // ServerSession ends up binding to (port 0 = ephemeral). We'll wire
  // the mock's OSC observer after boot() resolves it via session.osc.port.
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 0, disableOsc: true });
  const mockB = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 0, disableOsc: true });
  mocks = [mockA, mockB];

  process.env['CG_PRIMARY_HOST'] = '127.0.0.1';
  process.env['CG_PRIMARY_AMCP_PORT'] = String(mockA.amcpPort);
  process.env['CG_PRIMARY_OSC_PORT'] = '0';
  process.env['CG_BACKUP_HOST'] = '127.0.0.1';
  process.env['CG_BACKUP_AMCP_PORT'] = String(mockB.amcpPort);
  process.env['CG_BACKUP_OSC_PORT'] = '0';
  process.env['CG_STRATEGY'] = 'mirror-sync';

  const ipcMain = makeFakeIpcMain();
  const { window, sent } = makeFakeWindow();
  handle = boot({ ipcMain, window });

  // Pre-populate the registry the way an M5.4 watched-folder ingest would.
  const templateUrl = 'file:///C:/m5-smoke/lt.html';
  handle.templates.register({
    templateId: 'lt-smoke',
    url: templateUrl,
    templateType: 'lower-third',
  });

  // Wait for at least one session to reach healthy.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no healthy event within 3s')), 3000);
    handle!.connections.sessionA.once('healthy', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  // Now that ServerSession bound its ephemeral OSC port, point the mocks at it.
  mockA.addOscObserver('127.0.0.1', handle!.connections.sessionA.osc.port);
  mockB.addOscObserver('127.0.0.1', handle!.connections.sessionB.osc.port);

  return { handle: handle!, mockA, mockB, sent, ipcMain, templateUrl };
}

describe('M5.3 — operator flow end-to-end', () => {
  it('walks load → take → on-air → out → remove against amcp-mock', async () => {
    const { handle, mockA, sent, templateUrl } = await setup();
    const stack = handle.stack;

    // Capture handler invocations on both mocks so we can assert
    // the wire commands the StackService produced.
    const playLines: string[] = [];
    mockA.setHandler('PLAY', (req) => {
      playLines.push(req.raw);
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    const cgLines: string[] = [];
    mockA.setHandler('CG', (req) => {
      cgLines.push(req.raw);
      return { kind: 'ok', code: 202, verb: 'CG' };
    });

    // 1. LOAD — Reconciler picks up the item; no AMCP yet.
    expect(
      stack.load({ itemId: 'i1', templateId: 'lt-smoke', fields: { title: 'Sarah Lee' } }),
    ).toBe(true);
    const afterLoad = stack.snapshot();
    expect(afterLoad).toHaveLength(1);
    expect(afterLoad[0]).toMatchObject({ status: 'loaded', pending: false });

    // 2. TAKE — PLAY [HTML] flies, ack arrives, Reconciler marks playing.
    //    The mock's PLAY handler also fires an immediate OSC producer flip;
    //    by the time we observe the snapshot the status may already be
    //    'on-air' (truth winning over ack) — both are correct landings.
    const takeResult = await stack.take('i1');
    expect(takeResult.accepted).toBe(true);
    expect(playLines.length).toBeGreaterThan(0);
    expect(playLines.some((l) => l.includes(templateUrl))).toBe(true);
    expect(stack.snapshot()[0]?.pending).toBe(false);
    expect(['playing', 'on-air']).toContain(stack.snapshot()[0]?.status);

    // 3. OSC truth — guarantee on-air by emitting another producer flip.
    const slot = stack.snapshot()[0]!.slot!;
    mockA.emitOsc(
      `/channel/${String(slot.channel)}/stage/layer/${String(slot.layer)}/foreground/producer`,
      ['html'],
    );
    // OSC is UDP — give the event loop a beat to deliver it.
    await delay(80);
    expect(stack.snapshot()[0]).toMatchObject({ status: 'on-air', pending: false });

    // 4. OUT — CG STOP goes out.
    const outResult = await stack.out('i1');
    expect(outResult.accepted).toBe(true);
    expect(cgLines.some((l) => l.includes('STOP'))).toBe(true);

    // 5. OSC empty — truth flips to 'idle', which structurally confirms
    //    the 'exiting' intent. Reconciled status = truth ('idle'); pending
    //    drops because the intent has been satisfied.
    mockA.emitOsc(
      `/channel/${String(slot.channel)}/stage/layer/${String(slot.layer)}/foreground/producer`,
      ['empty'],
    );
    await delay(80);
    expect(stack.snapshot()[0]).toMatchObject({ status: 'idle', pending: false });

    // 6. REMOVE — clean cleanup.
    const removeResult = await stack.remove('i1');
    expect(removeResult.accepted).toBe(true);
    expect(stack.snapshot()).toEqual([]);

    // 7. Renderer would have seen stack.state-changed pushes throughout.
    const stackPushes = sent.filter((s) => s.channel === 'stack.state-changed');
    expect(stackPushes.length).toBeGreaterThanOrEqual(4);
  });

  it('exposes config + health via the IPC channels Main wired', async () => {
    const { ipcMain } = await setup();
    const configHandler = ipcMain.calls.get('connections.config');
    const config = (await configHandler!(null)) as ConnectionConfig;
    expect(config.strategy).toBe('mirror-sync');

    const healthHandler = ipcMain.calls.get('connections.health');
    const health = await healthHandler!(null);
    expect(health).toMatchObject({ currentPrimary: 'A' });
  });

  it('refuses to load an unknown templateId', async () => {
    const { handle } = await setup();
    expect(handle.stack.load({ itemId: 'i1', templateId: 'ghost', fields: {} })).toBe(false);
    expect(handle.stack.snapshot()).toEqual([]);
  });

  it('lock engage/release flows end-to-end via the wired IPC handler', async () => {
    const { ipcMain } = await setup();
    const engage = ipcMain.calls.get('lock.engage');
    const release = ipcMain.calls.get('lock.release');
    const state = ipcMain.calls.get('lock.state');

    expect(await state!(null)).toEqual({ engaged: false });
    expect(await engage!(null, { pin: '1234' })).toEqual({ ok: true });
    expect(await state!(null)).toMatchObject({ engaged: true });
    expect(await release!(null, { pin: '9999' })).toEqual({ ok: false, reason: 'pin-mismatch' });
    expect(await release!(null, { pin: '1234' })).toEqual({ ok: true });
    expect(await state!(null)).toEqual({ engaged: false });
  });
});

// Suppress unused-binding lint for EventEmitter — kept for type clarity in fakes.
void EventEmitter;
