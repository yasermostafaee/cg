import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import {
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type RestoreSkip,
  type StackRestoreReport,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { MemoryWorkspace } from '@cg/storage';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import {
  TEMPLATE_IMPORT_NEEDS_BRIDGE,
  TEMPLATE_REMOVE_NEEDS_BRIDGE,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';
import { LibraryStore } from '../src/platform/library/LibraryStore.js';
import { StackRetentionStore } from '../src/platform/stack/StackRetentionStore.js';
import { currentBridgeCapabilities } from './support/currentBridge.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`) — **A CONSOLE RE-DELIVERS NOTHING.**
 *
 * This file used to pin the opposite (`reconnect-redelivery`): the browser kept every template
 * it imported and its stack, and replayed both on every connect, because the bridge held them
 * only in memory (`B-085`, `B-092`). With one CG Bridge serving several consoles each console's
 * copy was a claim on the truth, and a stale one could win — a removed template came back after a
 * bridge restart, an older version replaced a newer one. The bridge keeps the library and the
 * stack itself now; a console reads.
 *
 * Every case carries its control: a resync that sends nothing must be shown to be a resync that
 * RAN, and a restart that keeps a template must be shown to keep it from the BRIDGE's store.
 */

const wsFactory = (url: string): WebSocketLike => new WsWebSocket(url) as unknown as WebSocketLike;

function ephemeralConnection(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
      B: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 6000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function awaitStatus(
  rt: WebSocketRuntime,
  target: BridgeLinkStatus,
  timeoutMs = 6000,
): Promise<void> {
  if (rt.link.status() === target) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`link never reached ${target} (stuck at ${rt.link.status()})`));
    }, timeoutMs);
    const unsub = rt.link.onStatusChanged((s) => {
      if (s === target) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};

let handle: BridgeHandle | null = null;
let runtime: WebSocketRuntime | null = null;
let dir: string | null = null;

afterEach(async () => {
  runtime?.dispose();
  runtime = null;
  await handle?.close();
  handle = null;
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

it('🔴 a REAL bridge restart keeps the template from the BRIDGE’s own store — and a bridge without that store gets nothing from the console', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-delivers-nothing-'));
  const templatesDir = path.join(dir, 'templates');
  handle = await createBridge({ port: 0, connection: ephemeralConnection(), templatesDir });
  const port = handle.port;
  runtime = new WebSocketRuntime(handle.url, { createWebSocket: wsFactory });
  await runtime.whenReady();
  await runtime.templates.import({ template: TEMPLATE, html: '<html>v2</html>' });
  expect(handle.runtime.templateHtml('lower-third')).toBe('<html>v2</html>');

  // The bridge restarts on the SAME store: the template is there before any console speaks.
  await handle.close();
  handle = null;
  await awaitStatus(runtime, 'disconnected');
  handle = await createBridge({ port, connection: ephemeralConnection(), templatesDir });
  expect(handle.runtime.templateHtml('lower-third')).toBe('<html>v2</html>');
  await awaitStatus(runtime, 'live');

  // CONTROL — a bridge on an EMPTY store: the console, reconnected and resynced, sends it nothing.
  await handle.close();
  handle = null;
  await awaitStatus(runtime, 'disconnected');
  const resyncs: boolean[] = [];
  const off = runtime.link.onResyncingChanged((v) => resyncs.push(v));
  handle = await createBridge({
    port,
    connection: ephemeralConnection(),
    templatesDir: path.join(dir, 'empty'),
  });
  await awaitStatus(runtime, 'live');
  const h = handle;
  // The resync RAN to its end on this connection — so the silence below is a measurement.
  await waitFor(() => resyncs.includes(true) && resyncs.at(-1) === false);
  off();
  expect(h.runtime.templateHtml('lower-third')).toBeNull();
  expect(h.runtime.templateList()).toEqual([]);
});

// ── the frames a resync sends (scripted fake WebSocket) ──

interface SentFrame {
  channel: string;
  id: string;
  payload: unknown;
}

/** A scriptable `WebSocketLike`: the test plays the server. */
class FakeSocket implements WebSocketLike {
  readyState = 0; // CONNECTING
  readonly sent: SentFrame[] = [];
  readonly #listeners = new Map<string, ((ev: { data: unknown }) => void)[]>();
  /** Per-channel responder: return a payload, or throw to answer with an error frame. */
  respond: (channel: string, payload: unknown) => unknown = () => undefined;

  addEventListener(type: string, listener: (ev: { data: unknown }) => void): void {
    const list = this.#listeners.get(type) ?? [];
    list.push(listener);
    this.#listeners.set(type, list);
  }

  send(data: string): void {
    const frame = parseWsFrame(data);
    if (frame === null || frame.type !== 'request') return;
    this.sent.push({ channel: frame.channel, id: frame.id, payload: frame.payload });
    queueMicrotask(() => {
      let reply: string;
      try {
        const payload = this.respond(frame.channel, frame.payload);
        reply = serializeWsFrame({ type: 'response', id: frame.id, payload });
      } catch (err) {
        reply = serializeWsFrame({
          type: 'response',
          id: frame.id,
          error: { message: err instanceof Error ? err.message : 'fake error' },
        });
      }
      this.#fire('message', { data: reply });
    });
  }

  close(): void {
    this.drop();
  }

  open(): void {
    this.readyState = 1;
    this.#fire('open', { data: undefined });
  }

  drop(): void {
    this.readyState = 3;
    this.#fire('close', { data: undefined });
  }

  /** A bridge push. */
  publish(channel: string, payload: unknown): void {
    this.#fire('message', { data: serializeWsFrame({ type: 'publish', channel, payload }) });
  }

  #fire(type: string, ev: { data: unknown }): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(ev);
  }
}

const HEALTH = {
  primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
  backup: { label: 'B', state: 'healthy', amcpAxisOk: true },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
};

const SKIP: RestoreSkip = {
  itemId: 'row-gone',
  reason: 'unknown-template',
  templateId: 'tpl-missing',
  slot: { channel: 1, layer: 99, server: 'primary' },
};

function respondLikeBridge(sock: FakeSocket, report: StackRestoreReport | null): void {
  sock.respond = (channel, payload) => {
    switch (channel) {
      case 'templates.import': {
        const req = payload as { template: TemplateInfo };
        return { registered: true, templateId: req.template.templateId };
      }
      case 'stack.restore-report':
        return report;
      case 'station.strays':
        return [];
      case 'bridge.capabilities':
        return currentBridgeCapabilities();
      case 'stack.snapshot':
        return [];
      case 'connections.health':
        return HEALTH;
      case 'lock.state':
        return { engaged: false };
      case 'stack.dismiss-restore-report':
        return { ok: true };
      default:
        return undefined;
    }
  };
}

it('🔴 a reconnect sends READS only — no template, no stack — though this console holds both', async () => {
  const sockets: FakeSocket[] = [];
  // A console with a library and a retained stack in its display copies.
  const library = new LibraryStore(new MemoryWorkspace());
  const stackRetention = new StackRetentionStore(new MemoryWorkspace());
  await library.import(TEMPLATE, '<html>held here</html>');
  await stackRetention.mirror([
    { itemId: 'row-1', templateId: 'lower-third', fields: {}, status: 'on-air', pending: false },
  ]);
  runtime = new WebSocketRuntime('ws://fake', {
    library,
    stackRetention,
    createWebSocket: () => {
      const s = new FakeSocket();
      respondLikeBridge(s, null);
      sockets.push(s);
      return s;
    },
  });
  sockets[0]?.open();
  await runtime.whenReady();

  sockets[0]?.drop();
  await awaitStatus(runtime, 'disconnected');
  await waitFor(() => sockets.length >= 2);
  sockets[1]?.open();
  await awaitStatus(runtime, 'live');

  const resync = sockets[1];
  // CONTROL — the resync RAN: it read the report and the strays, then re-pulled the snapshots.
  await waitFor(() => (resync?.sent.filter((f) => f.channel === 'lock.state').length ?? 0) >= 1);
  const channels = (resync?.sent ?? []).map((f) => f.channel);
  expect(channels).toContain('stack.restore-report');
  expect(channels).toContain('station.strays');
  expect(channels).toContain('stack.snapshot');
  // …and delivered nothing.
  expect(channels).not.toContain('templates.import');
  expect(channels).not.toContain('stack.restore');
});

it('🔴 an import or a removal with CG Bridge unreachable is REFUSED and changes nothing — control: live, it reaches the bridge', async () => {
  const sockets: FakeSocket[] = [];
  const library = new LibraryStore(new MemoryWorkspace());
  runtime = new WebSocketRuntime('ws://fake', {
    library,
    createWebSocket: () => {
      const s = new FakeSocket();
      respondLikeBridge(s, null);
      sockets.push(s);
      return s;
    },
  });
  sockets[0]?.open();
  await runtime.whenReady();

  // CONTROL — live: the import reaches the bridge, and the display copy follows it.
  await runtime.templates.import({ template: TEMPLATE, html: 'v1' });
  expect(sockets[0]?.sent.some((f) => f.channel === 'templates.import')).toBe(true);
  expect(library.list().map((t) => t.templateId)).toEqual(['lower-third']);

  sockets[0]?.drop();
  await awaitStatus(runtime, 'disconnected');

  const offline: TemplateInfo = { ...TEMPLATE, templateId: 'offline-one' };
  await expect(runtime.templates.import({ template: offline, html: 'x' })).rejects.toThrow(
    TEMPLATE_IMPORT_NEEDS_BRIDGE,
  );
  expect(library.list().map((t) => t.templateId)).toEqual(['lower-third']);
  await expect(runtime.templates.remove({ templateId: 'lower-third' })).rejects.toThrow(
    TEMPLATE_REMOVE_NEEDS_BRIDGE,
  );
  expect(library.list().map((t) => t.templateId)).toEqual(['lower-third']);
});

it('B-108 — the bridge’s standing restore report reaches the skip seam by PULL on connect and by PUSH; an empty report clears it; a dismissal goes to the bridge', async () => {
  const sockets: FakeSocket[] = [];
  runtime = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => {
      const s = new FakeSocket();
      respondLikeBridge(s, { at: new Date().toISOString(), skipped: [SKIP], migrated: [] });
      sockets.push(s);
      return s;
    },
  });
  const seen: (readonly RestoreSkip[])[] = [];
  runtime.stack.onRestoreSkips((skips) => seen.push(skips));
  sockets[0]?.open();
  await runtime.whenReady();

  // PULL — the report the bridge made at its start, read by a console that connected after.
  await waitFor(() => seen.some((s) => s.length === 1));
  expect(seen.at(-1)).toEqual([SKIP]);

  // PUSH — another console dismissed it: `null` empties the seam, which clears the notice.
  sockets[0]?.publish('stack.restore-report-changed', null);
  await waitFor(() => seen.at(-1)?.length === 0);

  // A dismissal from THIS console goes to the bridge, scoped as asked.
  expect(await runtime.stack.dismissRestoreReport({ part: 'skipped', channel: 1 })).toEqual({
    ok: true,
  });
  const dismissal = sockets[0]?.sent.find((f) => f.channel === 'stack.dismiss-restore-report');
  expect(dismissal?.payload).toEqual({ part: 'skipped', channel: 1 });
});
