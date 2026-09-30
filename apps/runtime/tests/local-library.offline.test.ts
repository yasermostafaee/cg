import { afterEach, describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import type { StackItemState } from '@cg/shared-schema';
import { parseWsFrame, serializeWsFrame, type TemplateInfo } from '@cg/shared-ipc';
import { LibraryStore } from '../src/platform/library/LibraryStore.js';
import { currentBridgeCapabilities } from './support/currentBridge.js';
import {
  BridgeDisconnectedError,
  TEMPLATE_IMPORT_NEEDS_BRIDGE,
  TEMPLATE_REMOVE_NEEDS_BRIDGE,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';

/**
 * B-085 — the template LIBRARY stays visible with the SPA↔bridge WS DOWN. These drive the live
 * `WebSocketRuntime` with a scripted socket (never opened = `disconnected`) and assert that the
 * reads are served from this console's display copy, while on-air commands STAY refused (frozen).
 *
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`) reversed the other half: an import or a removal used to land
 * locally and be DELIVERED on the next connect. With one bridge serving several consoles that
 * delivery was a stale copy's claim on the truth. Now both need the bridge; offline they are
 * refused, and a connect delivers nothing.
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
      case 'bridge.capabilities':
        return currentBridgeCapabilities();
      case 'stack.snapshot':
        return stack;
      case 'stack.restore-report':
        return null;
      case 'station.strays':
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

let runtime: WebSocketRuntime | null = null;
afterEach(() => {
  runtime?.dispose();
  runtime = null;
});

/** Build a runtime over a fresh scripted socket; returns it, the socket and the display copy. */
function makeRuntime(stack: StackItemState[] = []): {
  runtime: WebSocketRuntime;
  getSock: () => FakeSocket;
  library: LibraryStore;
} {
  let sock: FakeSocket | undefined;
  const library = new LibraryStore(new MemoryWorkspace());
  const rt = new WebSocketRuntime('ws://fake', {
    createWebSocket: () => {
      sock = new FakeSocket();
      respondLikeBridge(sock, stack);
      return sock;
    },
    library,
  });
  return {
    runtime: rt,
    library,
    getSock: () => {
      if (sock === undefined) throw new Error('socket not created');
      return sock;
    },
  };
}

describe('B-085 → CENTRAL-BRIDGE-01 — while the link is down the library is a DISPLAY copy: it answers, and it changes nothing', () => {
  it('lists and gets from the display copy while DISCONNECTED — and NEVER round-trips the bridge', async () => {
    const { runtime: rt, getSock, library } = makeRuntime();
    runtime = rt;
    // What an earlier session saw the bridge accept, kept for display.
    await library.import(TEMPLATE, '<html>v1</html>');
    // Never opened → the link is `disconnected`.
    expect(rt.link.status()).toBe('disconnected');

    expect(await rt.templates.list()).toEqual([TEMPLATE]);
    expect(await rt.templates.get({ templateId: 'lower-third' })).toEqual(TEMPLATE);
    expect(getSock().sent).toHaveLength(0); // no bridge round-trip at all
  });

  it('🔴 an import or a removal while DISCONNECTED is refused with its sentence — the display copy does not move, and nothing is queued', async () => {
    const { runtime: rt, getSock, library } = makeRuntime();
    runtime = rt;
    await library.import({ ...TEMPLATE, templateId: 'held' }, 'A');

    await expect(rt.templates.import({ template: TEMPLATE, html: 'B' })).rejects.toThrow(
      TEMPLATE_IMPORT_NEEDS_BRIDGE,
    );
    await expect(rt.templates.remove({ templateId: 'held' })).rejects.toThrow(
      TEMPLATE_REMOVE_NEEDS_BRIDGE,
    );
    expect((await rt.templates.list()).map((t) => t.templateId)).toEqual(['held']);

    // …and the first connect delivers NOTHING — CONTROL: the resync ran (it read the strays).
    getSock().open();
    await rt.whenReady();
    await waitFor(() => getSock().sent.some((f) => f.channel === 'station.strays'));
    expect(getSock().importedIds()).toEqual([]);
  });

  it('FROZEN: an on-air command is STILL refused while disconnected (R-006)', async () => {
    const { runtime: rt } = makeRuntime();
    runtime = rt;
    await expect(rt.stack.take({ itemId: 'x' })).rejects.toBeInstanceOf(BridgeDisconnectedError);
  });

  it('live, a removal is the BRIDGE’s answer (R-005 is decided where the stack is), and the display copy follows it', async () => {
    const { runtime: rt, getSock, library } = makeRuntime();
    runtime = rt;
    getSock().open();
    await rt.whenReady();
    await rt.templates.import({ template: { ...TEMPLATE, templateId: 'ref' }, html: 'A' });
    expect(library.list().map((t) => t.templateId)).toEqual(['ref']);

    expect(await rt.templates.remove({ templateId: 'ref' })).toEqual({ ok: true });
    expect(getSock().sent.some((f) => f.channel === 'templates.remove')).toBe(true);
    expect(library.list()).toEqual([]);
  });
});
