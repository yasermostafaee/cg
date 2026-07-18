import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { MemoryWorkspace } from '@cg/storage';
import {
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import {
  BridgeDisconnectedError,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';
import { StackRetentionStore } from '../src/platform/stack/StackRetentionStore.js';

/**
 * B-092 — the stack survives a restart of the BRIDGE process.
 *
 * The stack used to live ONLY in the bridge's in-memory Reconciler: kill the
 * bridge and every row vanished, because the restarted process boots empty and
 * `#resync` re-pulls that empty snapshot over the operator's stack. The browser
 * now retains the stack INTENT and re-delivers it on every (re)connect, BEFORE
 * the re-pull — the same shape B-085 gave the template library.
 *
 * (The broadcast-safety half — that restoring never CLEARs a live layer — is
 * asserted against real AMCP bytes in the bridge's
 * `stack-survives-bridge-restart.integration.test.ts`.)
 */

const wsFactory = (url: string): WebSocketLike => new WsWebSocket(url) as unknown as WebSocketLike;

function ephemeralConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
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

afterEach(async () => {
  runtime?.dispose();
  runtime = null;
  await handle?.close();
  handle = null;
});

it('THE BUG: stack items survive a REAL bridge restart instead of vanishing', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  const port = handle.port;
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  runtime = new WebSocketRuntime(handle.url, {
    createWebSocket: wsFactory,
    stackRetention: retention,
  });
  await runtime.whenReady();

  // The operator builds a stack: import a template, load two items.
  await runtime.templates.import({ template: TEMPLATE, html: '<html>v1</html>' });
  await runtime.stack.load({ itemId: 'item1', templateId: 'lower-third', fields: { h: 'یک' } });
  await runtime.stack.load({ itemId: 'item2', templateId: 'lower-third', fields: { h: 'دو' } });
  expect((await runtime.stack.snapshot()).map((i) => i.itemId)).toEqual(['item1', 'item2']);
  // The intent is now the BROWSER's, not just the bridge's.
  expect(retention.items().map((i) => i.itemId)).toEqual(['item1', 'item2']);

  // The last stack pushed to subscribers — what the UI would be rendering.
  let lastPushed: readonly StackItemState[] = [];
  runtime.stack.onStateChanged((s) => {
    lastPushed = s;
  });

  // ── the bridge process dies with the page still open ──
  await handle.close();
  handle = null;
  await awaitStatus(runtime, 'disconnected');

  // ── a fresh bridge starts on the same port, with an EMPTY stack ──
  handle = await createBridge({ port, connection: ephemeralConnection() });
  expect(handle.runtime.stackSnapshot()).toEqual([]);

  await awaitStatus(runtime, 'live');
  const h = handle;
  // The retained intent is restored INTO the fresh bridge…
  await waitFor(() => h.runtime.stackSnapshot().length === 2);
  expect(h.runtime.stackSnapshot().map((i) => i.itemId)).toEqual(['item1', 'item2']);
  // …with the operator's fields and layers intact.
  expect(h.runtime.stackSnapshot()[0]?.fields).toEqual({ h: 'یک' });
  expect(h.runtime.stackSnapshot().map((i) => i.slot?.layer)).toEqual([10, 11]);

  // …and the SPA never adopts an empty stack: the rows do NOT disappear.
  await waitFor(() => lastPushed.length === 2);
  expect(lastPushed.map((i) => i.itemId)).toEqual(['item1', 'item2']);
  expect((await runtime.stack.snapshot()).map((i) => i.itemId)).toEqual(['item1', 'item2']);
}, 20_000);

it('a removal is a removal: it prunes the retention and does NOT walk back in on reconnect', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  const port = handle.port;
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  runtime = new WebSocketRuntime(handle.url, {
    createWebSocket: wsFactory,
    stackRetention: retention,
  });
  await runtime.whenReady();

  await runtime.templates.import({ template: TEMPLATE, html: '<html>v1</html>' });
  await runtime.stack.load({ itemId: 'keep', templateId: 'lower-third', fields: {} });
  await runtime.stack.load({ itemId: 'gone', templateId: 'lower-third', fields: {} });
  await runtime.stack.remove({ itemId: 'gone' });
  await waitFor(() => retention.items().length === 1);

  await handle.close();
  handle = null;
  await awaitStatus(runtime, 'disconnected');
  handle = await createBridge({ port, connection: ephemeralConnection() });
  await awaitStatus(runtime, 'live');

  const h = handle;
  await waitFor(() => h.runtime.stackSnapshot().length === 1);
  expect(h.runtime.stackSnapshot().map((i) => i.itemId)).toEqual(['keep']);
}, 20_000);

// ── deterministic ordering + failure isolation (scripted fake WebSocket) ──

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

  #fire(type: string, ev: { data: unknown }): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(ev);
  }
}

const HEALTH = {
  primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
};

const ON_AIR_ITEM: StackItemState = {
  itemId: 'item1',
  templateId: 'lower-third',
  fields: { h: 'سلام' },
  status: 'on-air',
  pending: false,
  slot: { channel: 1, layer: 10, server: 'primary' },
};

function respondLikeBridge(sock: FakeSocket, restoreFails: boolean): void {
  // A faithful fake: a bridge that ACCEPTS a restore then reports those items in
  // its snapshot. Anything else is a bridge contradicting itself, and testing
  // against that would assert on a state no real bridge can produce.
  let restored: StackItemState[] = [];
  sock.respond = (channel, payload) => {
    switch (channel) {
      case 'templates.import':
        return { registered: true, templateId: 'lower-third' };
      case 'stack.restore': {
        if (restoreFails) throw new Error('restore rejected');
        const req = payload as { items: { itemId: string; templateId: string; played: boolean }[] };
        restored = req.items.map((i) => ({
          itemId: i.itemId,
          templateId: i.templateId,
          fields: {},
          status: i.played ? 'on-air' : 'loaded',
          pending: false,
        }));
        return { restored: restored.length, skipped: 0 };
      }
      // After a FAILED restore this is the EMPTY snapshot of a freshly-booted
      // bridge — the exact one that must never be allowed to erase the retention.
      case 'stack.snapshot':
        return restored;
      case 'connections.health':
        return HEALTH;
      case 'lock.state':
        return { engaged: false };
      default:
        return undefined;
    }
  };
}

async function reconnectWith(restoreFails: boolean): Promise<{
  retention: StackRetentionStore;
  resyncSock: FakeSocket | undefined;
  onResyncError: ReturnType<typeof vi.fn>;
}> {
  const sockets: FakeSocket[] = [];
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  await retention.mirror([ON_AIR_ITEM]);
  const onResyncError = vi.fn();

  runtime = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => {
      const s = new FakeSocket();
      respondLikeBridge(s, restoreFails);
      sockets.push(s);
      return s;
    },
    stackRetention: retention,
    onResyncError,
  });

  sockets[0]?.open();
  await runtime.whenReady();
  sockets[0]?.drop();
  await awaitStatus(runtime, 'disconnected');
  await waitFor(() => sockets.length >= 2);
  sockets[1]?.open();
  await awaitStatus(runtime, 'live');

  const resyncSock = sockets[1];
  await waitFor(
    () => (resyncSock?.sent.filter((f) => f.channel === 'stack.snapshot').length ?? 0) >= 1,
  );
  return { retention, resyncSock, onResyncError };
}

it('resync delivers the retained stack AFTER the templates and BEFORE the snapshot re-pull', async () => {
  const { resyncSock } = await reconnectWith(false);
  const channels = resyncSock?.sent.map((f) => f.channel) ?? [];

  const restoreIdx = channels.indexOf('stack.restore');
  const pullIdx = channels.indexOf('stack.snapshot');
  expect(restoreIdx).toBeGreaterThanOrEqual(0);
  // Templates first — a restored item must resolve against a populated registry.
  expect(channels.indexOf('templates.import')).toBeLessThan(restoreIdx);
  // …and the restore precedes the re-pull, which is what stops the SPA adopting
  // the empty stack of a freshly-booted bridge.
  expect(restoreIdx).toBeLessThan(pullIdx);

  // The intent delivered is the retained INTENT — not reconciled state.
  const payload = resyncSock?.sent[restoreIdx]?.payload as {
    items: { itemId: string; played: boolean; slot?: { layer: number } }[];
  };
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({ itemId: 'item1', played: true });
  expect(payload.items[0]?.slot?.layer).toBe(10);
});

it('a FAILED restore is surfaced and preserves the retention — the empty snapshot never erases it', async () => {
  const { retention, onResyncError } = await reconnectWith(true);

  // The operator is told, and the intent is kept for the next connect. Without
  // this the bug would erase its own fix: the empty snapshot that follows a
  // failed restore would be mirrored straight over the retained stack, and the
  // store is PERSISTENT — the loss would outlive the page.
  expect(onResyncError).toHaveBeenCalledTimes(1);
  expect(String(onResyncError.mock.calls[0]?.[0])).toContain('retained stack');
  expect(retention.items().map((i) => i.itemId)).toEqual(['item1']);
});

// ── StackRetentionStore in isolation ──

it('the retention store round-trips through storage and reduces state to INTENT', async () => {
  const ws = new MemoryWorkspace();
  const store = new StackRetentionStore(ws);
  await store.hydrate();
  await store.mirror([ON_AIR_ITEM, { ...ON_AIR_ITEM, itemId: 'item2', status: 'loaded' }]);

  // A fresh store over the SAME storage sees it — this is what survives a reload.
  const reloaded = new StackRetentionStore(ws);
  await reloaded.hydrate();
  expect(reloaded.items().map((i) => i.itemId)).toEqual(['item1', 'item2']);
  expect(reloaded.items()[0]).toMatchObject({ played: true, fields: { h: 'سلام' } });
  expect(reloaded.items()[1]?.played).toBe(false);
  // Reconciled-only noise is dropped; intent is kept.
  expect(reloaded.items()[0]).not.toHaveProperty('status');
  expect(reloaded.items()[0]).not.toHaveProperty('pending');
});

it('ambiguous statuses retain play evidence — the occupancy check, not the badge, decides', async () => {
  const store = new StackRetentionStore(new MemoryWorkspace());
  await store.hydrate();

  // An item that MAY still be rendering restores as "was on air": the bridge
  // demotes it to `loaded` the moment its layer proves silent, whereas the
  // opposite error would treat a LIVE layer as empty.
  const maybeOnAir = [
    'playing',
    'on-air',
    'updating',
    'exiting',
    'unconfirmed',
    'unverified',
  ] as const;
  for (const s of maybeOnAir) {
    await store.mirror([{ ...ON_AIR_ITEM, status: s }]);
    expect(store.items()[0]?.played, s).toBe(true);
  }
  for (const s of ['idle', 'loaded', 'error', 'disconnected'] as const) {
    await store.mirror([{ ...ON_AIR_ITEM, status: s }]);
    expect(store.items()[0]?.played, s).toBe(false);
  }
});

// ── the cold-boot gap: a hard refresh while the bridge is DOWN ──

/**
 * Owner-found gap: the retention is hydrated from OPFS at boot, but nothing READ
 * it for display — it was only the re-delivery set for `#resync`. So a hard
 * refresh during a bridge outage showed an EMPTY stack until the bridge came
 * back, which contradicts "the list must not disappear, in ANY case".
 *
 * The fix is DISPLAY-ONLY: `stack.snapshot()` answers from the retention while
 * the link is down. It sends nothing and decides nothing — the occupancy-aware
 * restore still happens on the bridge, on reconnect.
 */
async function coldBootOffline(): Promise<{
  rt: WebSocketRuntime;
  retention: StackRetentionStore;
  sock: FakeSocket;
}> {
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  const { slot: _slot, ...noSlot } = ON_AIR_ITEM;
  await retention.mirror([ON_AIR_ITEM, { ...noSlot, itemId: 'item2', status: 'loaded' }]);
  const sock = new FakeSocket();
  respondLikeBridge(sock, false);
  // NEVER opened → the runtime sits in `disconnected`, exactly like a page
  // loaded while the bridge process is dead.
  const rt = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => sock,
    stackRetention: retention,
  });
  runtime = rt;
  return { rt, retention, sock };
}

it('THE GAP: a cold boot with the bridge DOWN shows the retained stack, not an empty list', async () => {
  const { rt } = await coldBootOffline();
  expect(rt.link.status()).toBe('disconnected');

  // It ANSWERS rather than refusing — the rows are on screen while offline.
  const snap = await rt.stack.snapshot();
  expect(snap.map((i) => i.itemId)).toEqual(['item1', 'item2']);
  expect(snap[0]?.fields).toEqual({ h: 'سلام' });
  expect(snap[0]?.slot?.layer).toBe(10);
});

it('offline rows are HONEST: a was-on-air row is muted "unverified", never a confident red', async () => {
  const { rt } = await coldBootOffline();
  const snap = await rt.stack.snapshot();

  // With NO bridge the SPA has no conduit to CasparCG at all, so an on-air claim
  // is unverifiable — B-086/B-087's `unverified`, never `on-air`/`playing`.
  expect(snap[0]?.status).toBe('unverified');
  expect(snap[0]?.status).not.toBe('on-air');
  expect(snap[0]?.status).not.toBe('playing');
  // A never-taken row is not an air claim at all.
  expect(snap[1]?.status).toBe('loaded');
  // Nothing is in flight, so no row spins.
  expect(snap.every((i) => !i.pending)).toBe(true);
});

it('the offline view commands NOTHING — no frame is ever sent while disconnected', async () => {
  const { rt, sock } = await coldBootOffline();
  await rt.stack.snapshot();
  await rt.stack.snapshot();
  expect(sock.sent).toHaveLength(0);

  // …and the on-air verbs stay REFUSED (R-006): a visible row is not a usable one.
  await expect(rt.stack.take({ itemId: 'item1' })).rejects.toBeInstanceOf(BridgeDisconnectedError);
  expect(sock.sent).toHaveLength(0);
});

it('the offline view is replaced by authoritative truth once the bridge returns', async () => {
  const { rt, retention, sock } = await coldBootOffline();
  expect((await rt.stack.snapshot()).map((i) => i.status)).toEqual(['unverified', 'loaded']);

  sock.open();
  await rt.whenReady();
  await waitFor(() => sock.sent.some((f) => f.channel === 'stack.restore'));

  // The bridge is authoritative now, so its statuses win over the local
  // projection: the restored row reads the real `on-air`, not the offline
  // `unverified` placeholder.
  const live = await rt.stack.snapshot();
  expect(live.map((i) => i.itemId)).toEqual(['item1', 'item2']);
  expect(live[0]?.status).toBe('on-air');
  // And the retention still holds both items — the projection round-trips, so
  // being displayed offline corrupted nothing.
  expect(retention.items().map((i) => i.itemId)).toEqual(['item1', 'item2']);
  expect(retention.items()[0]?.played).toBe(true);
});

it('offline template-remove counts the RETAINED rows as references (R-005 stays enforced)', async () => {
  const { rt } = await coldBootOffline();
  // The retained rows are visible and use 'lower-third'; removing it offline
  // must be refused, exactly as it would be against a live bridge holding them.
  await rt.templates.import({ template: TEMPLATE, html: '<html>v1</html>' });
  await rt.stack.snapshot(); // the operator is looking at the rows
  expect(await rt.templates.remove({ templateId: 'lower-third' })).toMatchObject({
    ok: false,
    reason: 'in-use',
  });
});
