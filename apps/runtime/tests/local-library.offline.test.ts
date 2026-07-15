import { afterEach, describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import {
  parseWsFrame,
  serializeWsFrame,
  type StackItemState,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { LibraryStore } from '../src/platform/library/LibraryStore.js';
import {
  BridgeDisconnectedError,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';

/**
 * B-085 — the whole point: the template LIBRARY works with the SPA↔bridge WS DOWN.
 * These drive the live `WebSocketRuntime` with a scripted socket (never opened =
 * `disconnected`) and assert that `templates.*` are served locally and never
 * refused, while on-air commands STAY refused (frozen). Then they open the socket
 * and assert the offline-imported library is DELIVERED to the bridge on connect.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  name: 'Lower Third',
  templateType: 'lower-third',
  fields: [],
};

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** A scriptable `WebSocketLike`: the test plays the bridge. Starts CONNECTING (not open). */
class FakeSocket implements WebSocketLike {
  readyState = 0;
  readonly sent: { channel: string; id: string; payload: unknown }[] = [];
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
      const payload = this.respond(frame.channel, frame.payload);
      this.#fire('message', {
        data: serializeWsFrame({ type: 'response', id: frame.id, payload }),
      });
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
    for (const l of this.#listeners.get(type) ?? []) l(ev);
  }

  importedIds(): string[] {
    return this.sent
      .filter((f) => f.channel === 'templates.import')
      .map((f) => (f.payload as { template: TemplateInfo }).template.templateId)
      .sort();
  }
}

const HEALTH = {
  primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
};

function respondLikeBridge(sock: FakeSocket, stack: StackItemState[] = []): void {
  sock.respond = (channel, payload) => {
    switch (channel) {
      case 'templates.import': {
        const req = payload as { template: TemplateInfo };
        return { registered: true, templateId: req.template.templateId };
      }
      case 'templates.remove':
        return { ok: true };
      case 'stack.snapshot':
        return stack;
      case 'connections.health':
        return HEALTH;
      case 'lock.state':
        return { engaged: false };
      default:
        return undefined;
    }
  };
}

let runtime: WebSocketRuntime | null = null;
afterEach(() => {
  runtime?.dispose();
  runtime = null;
});

/** Build a runtime over a fresh scripted socket; returns both. */
function makeRuntime(stack: StackItemState[] = []): {
  runtime: WebSocketRuntime;
  getSock: () => FakeSocket;
} {
  let sock: FakeSocket | undefined;
  const rt = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => {
      sock = new FakeSocket();
      respondLikeBridge(sock, stack);
      return sock;
    },
    library: new LibraryStore(new MemoryWorkspace()),
  });
  return {
    runtime: rt,
    getSock: () => {
      if (sock === undefined) throw new Error('socket not created');
      return sock;
    },
  };
}

describe('B-085 — the template library works while the SPA↔bridge WS is down', () => {
  it('imports, lists, gets and removes locally while DISCONNECTED — and NEVER round-trips the bridge', async () => {
    const { runtime: rt, getSock } = makeRuntime();
    runtime = rt;
    // Never opened → the link is `disconnected`.
    expect(rt.link.status()).toBe('disconnected');

    // Import succeeds locally — no rejection, nothing sent to the (unopened) socket.
    const res = await rt.templates.import({ template: TEMPLATE, html: '<html>v1</html>' });
    expect(res).toEqual({ registered: true, templateId: 'lower-third' });
    expect(await rt.templates.list()).toEqual([TEMPLATE]);
    expect(await rt.templates.get({ templateId: 'lower-third' })).toEqual(TEMPLATE);
    expect(getSock().sent).toHaveLength(0); // no bridge round-trip at all

    // Remove (unreferenced) also works offline.
    expect(await rt.templates.remove({ templateId: 'lower-third' })).toEqual({ ok: true });
    expect(await rt.templates.list()).toEqual([]);
    expect(getSock().sent).toHaveLength(0);
  });

  it('FROZEN: an on-air command is STILL refused while disconnected (R-006)', async () => {
    const { runtime: rt } = makeRuntime();
    runtime = rt;
    await expect(rt.stack.take({ itemId: 'x' })).rejects.toBeInstanceOf(BridgeDisconnectedError);
  });

  it('delivers the OFFLINE-imported library to the bridge on the FIRST connect (reconcile)', async () => {
    const { runtime: rt, getSock } = makeRuntime();
    runtime = rt;

    // Import two templates entirely offline.
    await rt.templates.import({ template: TEMPLATE, html: 'A' });
    await rt.templates.import({ template: { ...TEMPLATE, templateId: 'ticker' }, html: 'B' });

    // The bridge comes up for the first time → both are delivered without operator action.
    getSock().open();
    await rt.whenReady();
    await waitFor(() => getSock().importedIds().length >= 2);
    expect(getSock().importedIds()).toEqual(['lower-third', 'ticker']);
  });

  it('conflict policy local-wins: a template REMOVED offline is not resurrected on connect', async () => {
    const { runtime: rt, getSock } = makeRuntime();
    runtime = rt;

    await rt.templates.import({ template: { ...TEMPLATE, templateId: 't-keep' }, html: 'A' });
    await rt.templates.import({ template: { ...TEMPLATE, templateId: 't-gone' }, html: 'B' });
    // Removed offline (unreferenced — the stack is empty and cannot change while down).
    expect(await rt.templates.remove({ templateId: 't-gone' })).toEqual({ ok: true });

    getSock().open();
    await rt.whenReady();
    await waitFor(() => getSock().importedIds().length >= 1);
    // Only the surviving template is delivered — the removed one does NOT walk back in.
    expect(getSock().importedIds()).toEqual(['t-keep']);
  });

  it('offline remove is refused while a last-known stack item references the template (R-005)', async () => {
    const referencing: StackItemState[] = [
      { itemId: 'i1', templateId: 'ref', fields: {}, status: 'on-air', pending: false },
    ];
    const { runtime: rt, getSock } = makeRuntime(referencing);
    runtime = rt;

    // Go live, register the referenced template, and observe the stack (populates #lastStack).
    getSock().open();
    await rt.whenReady();
    await rt.templates.import({ template: { ...TEMPLATE, templateId: 'ref' }, html: 'A' });
    expect((await rt.stack.snapshot()).map((i) => i.templateId)).toContain('ref');

    // Drop → disconnected. The stack cannot change while the bridge is unreachable, so the
    // last-known snapshot is exact: removing 'ref' must be refused as in-use.
    getSock().drop();
    await waitFor(() => rt.link.status() === 'disconnected');
    const res = await rt.templates.remove({ templateId: 'ref' });
    expect(res).toMatchObject({ ok: false, reason: 'in-use' });
    expect(await rt.templates.get({ templateId: 'ref' })).not.toBeNull();
  });
});
