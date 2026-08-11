import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { MemoryWorkspace } from '@cg/storage';
import {
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type RestoreSkip,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { RetainedAirState, StackItemState } from '@cg/shared-schema';
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

/** How a faithful bridge seeds each retained state (mirrors `seedStatusFor`). */
const SEEDED: Record<RetainedAirState, StackItemState['status']> = {
  'on-air': 'on-air',
  loaded: 'loaded',
  cleared: 'idle',
  error: 'error',
};

function respondLikeBridge(
  sock: FakeSocket,
  restoreFails: boolean,
  skips: RestoreSkip[] = [],
): void {
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
        const req = payload as {
          items: { itemId: string; templateId: string; state: RetainedAirState }[];
        };
        restored = req.items.map((i) => ({
          itemId: i.itemId,
          templateId: i.templateId,
          fields: {},
          // A faithful bridge seeds the state it was GIVEN — it never promotes one.
          status: SEEDED[i.state],
          pending: false,
        }));
        return { restored: restored.length, skipped: skips };
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

async function reconnectWith(
  restoreFails: boolean,
  skips: RestoreSkip[] = [],
): Promise<{
  retention: StackRetentionStore;
  resyncSock: FakeSocket | undefined;
  onResyncError: ReturnType<typeof vi.fn>;
  reportedSkips: RestoreSkip[][];
}> {
  const sockets: FakeSocket[] = [];
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  await retention.mirror([ON_AIR_ITEM]);
  const onResyncError = vi.fn();

  runtime = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => {
      const s = new FakeSocket();
      respondLikeBridge(s, restoreFails, skips);
      sockets.push(s);
      return s;
    },
    stackRetention: retention,
    onResyncError,
  });

  const reportedSkips: RestoreSkip[][] = [];
  runtime.stack.onRestoreSkips((r) => reportedSkips.push([...r]));

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
  return { retention, resyncSock, onResyncError, reportedSkips };
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
    items: { itemId: string; state: RetainedAirState; slot?: { layer: number } }[];
  };
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({ itemId: 'item1', state: 'on-air' });
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
  expect(reloaded.items()[0]).toMatchObject({ state: 'on-air', fields: { h: 'سلام' } });
  expect(reloaded.items()[1]?.state).toBe('loaded');
  // Reconciled-only noise is dropped; intent is kept.
  expect(reloaded.items()[0]).not.toHaveProperty('status');
  expect(reloaded.items()[0]).not.toHaveProperty('pending');
  // B-107/B-109 — and the bit that used to carry ALL of this is gone, not merely
  // supplemented. Two shapes of one fact is how they come to disagree.
  expect(reloaded.items()[0]).not.toHaveProperty('played');
});

it('a record with no usable STATE is DROPPED, never given a comfortable default', async () => {
  // B-107/B-109 — the whole point of the change is that a row's state is never
  // guessed. A record written before the state field existed does not carry one, and
  // inventing `loaded` for it would be this bug re-created inside its own fix. Under
  // the compatibility-floor policy (P-031) it costs one stack rebuild, once.
  const ws = new MemoryWorkspace();
  await ws.writeJson('stack/retained.json', [
    { itemId: 'legacy', templateId: 'lower-third', fields: {}, played: true },
    { itemId: 'current', templateId: 'lower-third', fields: {}, state: 'cleared' },
  ]);
  const store = new StackRetentionStore(ws);
  await store.hydrate();
  expect(store.items().map((i) => i.itemId)).toEqual(['current']);
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
    expect(store.items()[0]?.state, s).toBe('on-air');
  }
});

it('⭐ B-107/B-109: a CLEARED row and an ERRORED row are each DISTINGUISHABLE from a loaded one', async () => {
  // THE root defect, asserted directly. All three of these used to reduce to the
  // identical retained record (`played: false`), which is why a bridge death showed
  // an errored row as READY and a bridge restart re-ADDed a cleared graphic.
  const store = new StackRetentionStore(new MemoryWorkspace());
  await store.hydrate();

  await store.mirror([
    { ...ON_AIR_ITEM, itemId: 'pre-rolled', status: 'loaded' },
    { ...ON_AIR_ITEM, itemId: 'cleared', status: 'idle' },
    { ...ON_AIR_ITEM, itemId: 'failed', status: 'error', errorCode: 'no-layer' },
  ]);

  expect(store.items().map((i) => i.state)).toEqual(['loaded', 'cleared', 'error']);
  expect(new Set(store.items().map((i) => i.state)).size).toBe(3);
  // The failure keeps its CAUSE, so an offline row can still say why.
  expect(store.items()[2]?.errorCode).toBe('no-layer');
  // …and only an error state carries one: B-093's `osc-unverifiable` rides an
  // `unverified` row and must never travel as if it were a failure this row suffered.
  await store.mirror([{ ...ON_AIR_ITEM, status: 'unverified', errorCode: 'osc-unverifiable' }]);
  expect(store.items()[0]).toMatchObject({ state: 'on-air' });
  expect(store.items()[0]).not.toHaveProperty('errorCode');
});

it('a CLEARED row keeps its SLOT — an out is not a remove, and restore needs the layer', async () => {
  const store = new StackRetentionStore(new MemoryWorkspace());
  await store.hydrate();
  await store.mirror([{ ...ON_AIR_ITEM, status: 'idle' }]);
  expect(store.items()[0]).toMatchObject({ state: 'cleared' });
  expect(store.items()[0]?.slot?.layer).toBe(10);
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
  expect(retention.items()[0]?.state).toBe('on-air');
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

// ── B-107: the offline projection may never IMPROVE a status ──────────────────

/**
 * ⭐ THE B-107 REGRESSION SET.
 *
 * `#retainedProjection` used to read `i.played ? 'unverified' : 'loaded'`, and
 * `useStack` opts into `pullWhileDisconnected` — so the instant the bridge PROCESS
 * died, every ERROR row on the operator's stack flipped to `loaded`, which
 * `airStateVisual` renders as the word READY. A load that never got a layer
 * presented as pre-rolled and playable, on a link the SPA could no longer use in
 * either direction.
 *
 * These drive the REAL runtime through a cold boot with the bridge down — the
 * owner's exact reproduction, minus the bridge process.
 */
async function offlineWith(items: readonly StackItemState[]): Promise<WebSocketRuntime> {
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  await retention.mirror(items);
  const sock = new FakeSocket();
  respondLikeBridge(sock, false);
  // NEVER opened → `disconnected`, exactly like a page loaded with the bridge dead.
  const rt = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => sock,
    stackRetention: retention,
  });
  runtime = rt;
  return rt;
}

it('B-107: an ERRORED row does NOT become READY when the bridge dies', async () => {
  const rt = await offlineWith([
    { ...ON_AIR_ITEM, itemId: 'failed', status: 'error', errorCode: 'no-layer' },
  ]);
  const [row] = await rt.stack.snapshot();

  // THE bug, pinned: it used to be `loaded`, which the row renders as READY.
  expect(row?.status).toBe('error');
  expect(row?.status).not.toBe('loaded');
  // …and it still says WHY, so the operator is not left guessing at a bare badge.
  expect(row?.errorCode).toBe('no-layer');
  expect(row?.pending).toBe(false);
});

it('B-107: the error code is trigger-INDEPENDENT — every failure survives, not just no-layer', async () => {
  // The generality check B-107's own notes demand: `unknown-template` involves no
  // layer at all and reaches the identical errored state through the same path.
  for (const code of ['no-layer', 'no-layer-foreign-occupied', 'unknown-template', 'amcp-error']) {
    const rt = await offlineWith([
      { ...ON_AIR_ITEM, itemId: 'failed', status: 'error', errorCode: code },
    ]);
    const [row] = await rt.stack.snapshot();
    expect(row?.status, code).toBe('error');
    expect(row?.errorCode, code).toBe(code);
    rt.dispose();
  }
});

it('B-107: a CLEARED row does NOT become READY either — the milder lie is fixed too', async () => {
  const rt = await offlineWith([{ ...ON_AIR_ITEM, itemId: 'cleared', status: 'idle' }]);
  const [row] = await rt.stack.snapshot();
  expect(row?.status).toBe('idle');
  expect(row?.status).not.toBe('loaded');
});

it('B-107: the projection keeps THREE source statuses distinct — it can never collapse them', async () => {
  const rt = await offlineWith([
    { ...ON_AIR_ITEM, itemId: 'pre-rolled', status: 'loaded' },
    { ...ON_AIR_ITEM, itemId: 'cleared', status: 'idle' },
    { ...ON_AIR_ITEM, itemId: 'failed', status: 'error', errorCode: 'no-layer' },
    { ...ON_AIR_ITEM, itemId: 'was-on-air', status: 'on-air' },
  ]);
  const statuses = (await rt.stack.snapshot()).map((i) => i.status);
  expect(statuses).toEqual(['loaded', 'idle', 'error', 'unverified']);
  expect(new Set(statuses).size).toBe(4);
});

it('B-107: the projection ROUND-TRIPS, so displaying offline can never corrupt the retention', async () => {
  // Load-bearing: `stack.snapshot()` sets `#lastStack` from the projection, and a
  // later mirror of a projected snapshot must not rewrite a row's state. Asserted
  // rather than reasoned about, because a new status added to the projection would
  // break it silently.
  const retention = new StackRetentionStore(new MemoryWorkspace());
  await retention.hydrate();
  const source: StackItemState[] = [
    { ...ON_AIR_ITEM, itemId: 'a', status: 'on-air' },
    { ...ON_AIR_ITEM, itemId: 'b', status: 'loaded' },
    { ...ON_AIR_ITEM, itemId: 'c', status: 'idle' },
    { ...ON_AIR_ITEM, itemId: 'd', status: 'error', errorCode: 'no-layer' },
  ];
  await retention.mirror(source);
  const before = retention.items().map((i) => i.state);

  const sock = new FakeSocket();
  respondLikeBridge(sock, false);
  const rt = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => sock,
    stackRetention: retention,
  });
  runtime = rt;
  // Project it out, then mirror the projection straight back in.
  await retention.mirror(await rt.stack.snapshot());
  expect(retention.items().map((i) => i.state)).toEqual(before);
  expect(retention.items()[3]?.errorCode).toBe('no-layer');
});

// ── B-108: what a restore could not bring back is REPORTED ────────────────────

it('B-108: rows the restore could not re-seat are reported, with their reason', async () => {
  const { reportedSkips } = await reconnectWith(false, [
    { itemId: 'gone-template', reason: 'unknown-template' },
    { itemId: 'no-room', reason: 'no-layer' },
  ]);

  // `#resync` used to await the restore and DISCARD its result, so these rows
  // vanished from the operator's stack with nothing said.
  const latest = reportedSkips.at(-1);
  expect(latest).toEqual([
    { itemId: 'gone-template', reason: 'unknown-template' },
    { itemId: 'no-room', reason: 'no-layer' },
  ]);
});

it('B-108: the BENIGN skip raises no alarm — a page reload against a live bridge loses nothing', async () => {
  const { reportedSkips } = await reconnectWith(false, [
    { itemId: 'item1', reason: 'already-held' },
  ]);
  // Filtered in `#resync`, so no subscriber can raise a false alarm by forgetting to.
  expect(reportedSkips.at(-1)).toEqual([]);
});

it('B-108: a mixed report keeps the losses and drops the benign one', async () => {
  const { reportedSkips } = await reconnectWith(false, [
    { itemId: 'item1', reason: 'already-held' },
    { itemId: 'no-room', reason: 'no-layer' },
  ]);
  expect(reportedSkips.at(-1)).toEqual([{ itemId: 'no-room', reason: 'no-layer' }]);
});
