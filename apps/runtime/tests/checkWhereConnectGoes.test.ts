import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as ipc from '@cg/shared-ipc';
import { WebSocketRuntime, type WebSocketLike } from '../src/platform/WebSocketRuntime.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `B-317` (`RELEASE-0114-01` A3) — **THE OWNER'S CASE, AT THE RUNTIME.** This console's station
 * names `.111` (its socket is on `.111`'s CG Bridge); the operator types `127.0.0.1`. The check and
 * `Connect` must both go to `127.0.0.1:5280` — the check never runs on `.111`. Before: the check rode
 * `.111`'s socket and described `.111`, and Connect then dialled `127.0.0.1:5280`.
 */

type Listener = (ev: { data: unknown }) => void;

/** A socket at `url` that opens (a CG Bridge there) or is refused at once (nothing there). */
class Socket implements WebSocketLike {
  readyState = 0;
  readonly sent: ipc.WsFrame[] = [];
  readonly #listeners = new Map<string, Listener[]>();
  constructor(
    readonly url: string,
    answering: boolean,
  ) {
    void Promise.resolve().then(() => {
      if (answering) {
        this.readyState = 1;
        this.#fire('open');
      } else {
        this.readyState = 3;
        this.#fire('error');
        this.#fire('close');
      }
    });
  }
  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }
  send(data: string): void {
    const frame = ipc.parseWsFrame(data);
    if (frame === null) throw new Error(`bad frame ${data}`);
    this.sent.push(frame);
    if (frame.type !== 'request') return;
    const payload =
      frame.channel === ipc.BridgeCapabilitiesChannel.name
        ? {
            channels: ipc.runtimeRequestChannelNames(ipc),
            bridgeVersion: '0.11.4',
          }
        : frame.channel === ipc.SetupCheckChannel.name
          ? {
              lines: [{ id: 'api', status: 'pass', text: `checked at ${this.url}` }],
              localAddress: null,
            }
          : undefined;
    void Promise.resolve().then(() => {
      const reply: ipc.WsFrame =
        payload === undefined
          ? {
              type: 'response',
              id: frame.id,
              error: { message: `unknown channel: ${frame.channel}` },
            }
          : { type: 'response', id: frame.id, payload };
      this.#fire('message', ipc.serializeWsFrame(reply));
    });
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.#fire('close');
  }
  #fire(type: string, data: unknown = undefined): void {
    for (const l of [...(this.#listeners.get(type) ?? [])]) l({ data });
  }
}

const STALE = 'ws://192.168.21.111:5280';
const REQ = { playoutAddress: 'http://127.0.0.1:8080', origin: 'http://tauri.localhost' };

let sockets: Socket[] = [];
let answering = new Set<string>();
let runtime: WebSocketRuntime | null = null;

beforeEach(() => {
  installMemoryStorage();
  sockets = [];
  answering = new Set([STALE]);
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
    invoke: () => Promise.reject(new Error('no shell command in this test')),
  };
});

afterEach(() => {
  runtime?.dispose();
  runtime = null;
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

async function onTheStaleStation(): Promise<WebSocketRuntime> {
  const r = new WebSocketRuntime(STALE, {
    consoleVersion: '0.11.4',
    portProblems: () => Promise.resolve([]),
    createWebSocket: (url) => {
      const s = new Socket(url, answering.has(url));
      sockets.push(s);
      return s;
    },
  });
  runtime = r;
  await r.whenReady();
  return r;
}

const checksSentTo = (url: string): number =>
  sockets
    .filter((s) => s.url === url)
    .flatMap((s) => s.sent)
    .filter((f) => f.type === 'request' && f.channel === ipc.SetupCheckChannel.name).length;

describe('B-317 — the check and Connect go to the ONE address the fields resolve to', () => {
  it('🔴 nothing at 127.0.0.1: the check says so, naming 127.0.0.1:5280 — and never runs on the remembered .111', async () => {
    const r = await onTheStaleStation();
    expect(r.link.bridgeAddress()).toBe('192.168.21.111:5280');
    const err = await r.setup.check(REQ, { bridgeAddress: '' }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('CG Bridge is not answering at 127.0.0.1:5280.');
    expect(sockets.map((s) => s.url)).toContain('ws://127.0.0.1:5280');
    // The remembered CG Bridge was not asked — and the console is still on it, untouched.
    expect(checksSentTo(STALE)).toBe(0);
    expect(r.link.bridgeAddress()).toBe('192.168.21.111:5280');
    expect(r.link.status()).toBe('live');
  });

  it('CG Bridge at 127.0.0.1: the check runs THERE, and says so; then Connect dials the same address', async () => {
    answering.add('ws://127.0.0.1:5280');
    const r = await onTheStaleStation();
    const answer = await r.setup.check(REQ, { bridgeAddress: '' });
    expect(answer.bridge?.address).toBe('127.0.0.1:5280');
    expect(answer.bridge?.version).toBe('0.11.4');
    expect(answer.lines[0]?.text).toBe('checked at ws://127.0.0.1:5280');
    expect(checksSentTo(STALE)).toBe(0);
    expect(r.setup.bridgeAddressFor(REQ.playoutAddress, '')).toBe('127.0.0.1:5280');

    await r.setup.setPlayoutAddress(REQ.playoutAddress, '');
    expect(r.link.bridgeAddress()).toBe('127.0.0.1:5280');
    // …and the console's own socket really is dialled there.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(sockets.filter((s) => s.url === 'ws://127.0.0.1:5280').length).toBeGreaterThan(1);
  });

  it('CONTROL — with no fields named (a check of this console’s own station) it runs on the console’s own CG Bridge', async () => {
    const r = await onTheStaleStation();
    const answer = await r.setup.check({ ...REQ, playoutAddress: 'http://192.168.21.111:8080' });
    expect(answer.bridge?.address).toBe('192.168.21.111:5280');
    expect(checksSentTo(STALE)).toBe(1);
  });
});
