import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import {
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import { WebSocketRuntime, type WebSocketLike } from '../src/platform/WebSocketRuntime.js';

/**
 * Reconnect-reconciliation (Face 1) — the browser retains every successful
 * `templates.import` payload and re-delivers it on reconnect, BEFORE the
 * stack/health/lock snapshot re-pull, so a bridge restart (in-memory registry
 * wiped) no longer requires a manual re-import while the page stays open.
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

afterEach(async () => {
  runtime?.dispose();
  runtime = null;
  await handle?.close();
  handle = null;
});

it('re-delivers the retained (latest) payload across a REAL bridge restart — no manual re-import', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  const port = handle.port;
  runtime = new WebSocketRuntime(handle.url, { createWebSocket: wsFactory });
  await runtime.whenReady();

  // Import, then re-import with different HTML — retention keeps the LATEST.
  await runtime.templates.import({ template: TEMPLATE, html: '<html>v1</html>' });
  expect(handle.runtime.templateHtml('lower-third')).toBe('<html>v1</html>');
  await runtime.templates.import({ template: TEMPLATE, html: '<html>v2</html>' });
  expect(handle.runtime.templateHtml('lower-third')).toBe('<html>v2</html>');

  // The bridge process dies with the page still open…
  await handle.close();
  handle = null;
  await awaitStatus(runtime, 'disconnected');

  // …and a fresh bridge starts on the same port with an EMPTY registry.
  handle = await createBridge({ port, connection: ephemeralConnection() });
  expect(handle.runtime.templateHtml('lower-third')).toBeNull();

  // On reconnect the runtime re-delivers the retained payload — the registry
  // serves the replacement HTML again without any operator action.
  await awaitStatus(runtime, 'live');
  const h = handle;
  await waitFor(() => h.runtime.templateHtml('lower-third') === '<html>v2</html>');
  expect(h.runtime.templateList().map((t) => t.templateId)).toContain('lower-third');
});

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
    // Answer asynchronously, like a real socket.
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
  backup: { label: 'B', state: 'healthy', amcpAxisOk: true },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
};

function respondLikeBridge(sock: FakeSocket, failImportOf: string | null): void {
  sock.respond = (channel, payload) => {
    switch (channel) {
      case 'templates.import': {
        const req = payload as { template: TemplateInfo };
        if (req.template.templateId === failImportOf) throw new Error('registry rejected import');
        return { registered: true, templateId: req.template.templateId };
      }
      case 'stack.snapshot':
        return [];
      case 'connections.health':
        return HEALTH;
      case 'lock.state':
        return { engaged: false };
      default:
        return undefined;
    }
  };
}

it('resync re-delivers each retained template exactly once, BEFORE the snapshot pulls; a failure is surfaced and never aborts', async () => {
  const sockets: FakeSocket[] = [];
  const factory = (): WebSocketLike => {
    const s = new FakeSocket();
    respondLikeBridge(s, sockets.length === 0 ? null : 't-fail');
    sockets.push(s);
    return s;
  };
  const onResyncError = vi.fn();
  runtime = new WebSocketRuntime('ws://fake', { createWebSocket: () => factory(), onResyncError });

  sockets[0]?.open();
  await runtime.whenReady();

  // Two successful imports — both retained.
  await runtime.templates.import({ template: { ...TEMPLATE, templateId: 't-ok' }, html: 'A' });
  await runtime.templates.import({ template: { ...TEMPLATE, templateId: 't-fail' }, html: 'B' });

  // Drop; the auto-reconnect (1s) creates socket #2, which we open.
  sockets[0]?.drop();
  await awaitStatus(runtime, 'disconnected');
  await waitFor(() => sockets.length >= 2);
  sockets[1]?.open();
  await awaitStatus(runtime, 'live');

  const resyncSock = sockets[1];
  await waitFor(() => (resyncSock?.sent.length ?? 0) >= 5); // 2 imports + 3 pulls

  const channels = resyncSock?.sent.map((f) => f.channel) ?? [];
  const importIdx = channels
    .map((c, i) => (c === 'templates.import' ? i : -1))
    .filter((i) => i >= 0);
  const pullIdx = channels
    .map((c, i) =>
      c === 'stack.snapshot' || c === 'connections.health' || c === 'lock.state' ? i : -1,
    )
    .filter((i) => i >= 0);

  // Exactly the retained set, re-imported once each…
  const importedIds = (resyncSock?.sent ?? [])
    .filter((f) => f.channel === 'templates.import')
    .map((f) => (f.payload as { template: TemplateInfo }).template.templateId);
  expect(importedIds.sort()).toEqual(['t-fail', 't-ok']);
  // …and every re-delivery frame precedes every snapshot pull.
  expect(Math.max(...importIdx)).toBeLessThan(Math.min(...pullIdx));
  // The failed re-delivery surfaced without aborting the rest.
  expect(onResyncError).toHaveBeenCalledTimes(1);
  expect(String(onResyncError.mock.calls[0]?.[0])).toContain('t-fail');
  expect(pullIdx.length).toBe(3);
});

// ── R-005 — removal must survive a reconnect (the resurrection guard) ──

/**
 * The retention that heals a bridge restart is also the thing that can UNDO a removal:
 * `#resync()` re-delivers every retained import payload on each reconnect, so a template
 * dropped from the registry alone walks right back in on the next blip. A confirmed
 * removal must prune the retention — and a REFUSED one must not, or a reconnect would
 * silently de-register a template the operator was just told they could not remove.
 */
function respondWithRemove(sock: FakeSocket, removeResult: unknown): void {
  sock.respond = (channel, payload) => {
    switch (channel) {
      case 'templates.import': {
        const req = payload as { template: TemplateInfo };
        return { registered: true, templateId: req.template.templateId };
      }
      case 'templates.remove':
        return removeResult;
      case 'stack.snapshot':
        return [];
      case 'connections.health':
        return HEALTH;
      case 'lock.state':
        return { engaged: false };
      default:
        return undefined;
    }
  };
}

async function reimportedIdsAfterReconnect(removeResult: {
  ok: boolean;
  reason?: string;
  message?: string;
}): Promise<{ result: unknown; reimported: string[] }> {
  const sockets: FakeSocket[] = [];
  runtime = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => {
      const s = new FakeSocket();
      respondWithRemove(s, removeResult);
      sockets.push(s);
      return s;
    },
  });

  sockets[0]?.open();
  await runtime.whenReady();
  await runtime.templates.import({ template: { ...TEMPLATE, templateId: 't-keep' }, html: 'A' });
  await runtime.templates.import({ template: { ...TEMPLATE, templateId: 't-gone' }, html: 'B' });

  const result = await runtime.templates.remove({ templateId: 't-gone' });

  sockets[0]?.drop();
  await awaitStatus(runtime, 'disconnected');
  await waitFor(() => sockets.length >= 2);
  sockets[1]?.open();
  await awaitStatus(runtime, 'live');

  const resyncSock = sockets[1];
  // Wait for the 3 snapshot pulls, which resync sends AFTER every re-delivery — so once
  // they have landed, the re-delivery set is complete and can be asserted on.
  await waitFor(
    () => (resyncSock?.sent.filter((f) => f.channel === 'stack.snapshot').length ?? 0) >= 1,
  );

  return {
    result,
    reimported: (resyncSock?.sent ?? [])
      .filter((f) => f.channel === 'templates.import')
      .map((f) => (f.payload as { template: TemplateInfo }).template.templateId)
      .sort(),
  };
}

it('a CONFIRMED removal prunes the retention — the template does NOT come back on reconnect', async () => {
  const { result, reimported } = await reimportedIdsAfterReconnect({ ok: true });

  expect(result).toEqual({ ok: true });
  // 't-gone' is gone for good; the untouched template still heals a bridge restart.
  expect(reimported).toEqual(['t-keep']);
});

it('a REFUSED removal keeps the retention — the template is still re-delivered on reconnect', async () => {
  const { result, reimported } = await reimportedIdsAfterReconnect({
    ok: false,
    reason: 'in-use',
    message: '1 stack item(s) still use this template — remove them (or Remove All) first.',
  });

  expect(result).toMatchObject({ ok: false, reason: 'in-use' });
  // Nothing was removed, so nothing may be dropped from the retention either.
  expect(reimported).toEqual(['t-gone', 't-keep']);
});
