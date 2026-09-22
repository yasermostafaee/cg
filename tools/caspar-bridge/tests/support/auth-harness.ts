import { WebSocket } from 'ws';
import {
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type WsFrame,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle, type BridgeOptions } from '../../src/index.js';
import { track } from './harness.js';
import { startFakePlayout, type FakePlayout } from './fake-playout.js';

/**
 * Shared plumbing for the `C-037` auth suites.
 *
 * ⚠ Extracted rather than copied into each file, because every one of these specs turns on the
 * SAME two questions — "what did the bridge answer?" and "did anything reach CasparCG?" — and
 * eight private copies of `ask()` is eight chances for one of them to assert something
 * slightly weaker than the others. `lock-refuses-intents.integration.test.ts` keeps its own
 * copy; that file predates this one and moving it would edit a passing suite for tidiness.
 */

/**
 * Unreachable AMCP + ephemeral OSC bind — no fixed ports, and NOTHING can reach a real server.
 *
 * ⭐ That is a FEATURE of every spec here, not a limitation: the acceptance bullets say
 * "nothing is sent to CasparCG", and a connection that could not send anything anyway would
 * make such an assertion vacuous. So the specs assert the refusal SHAPE (the bridge answered
 * the one sentence before any handler ran) rather than an absence at the wire, and the wire
 * itself is proven untouched by `air-sensitive-endtoend` and its siblings, which this change
 * does not modify.
 */
export function deadConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

export function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = track(new WebSocket(url), (w) => {
      w.close();
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

export async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

export interface Client {
  readonly ws: WebSocket;
  readonly frames: WsFrame[];
  /** One request round-trip, as `{ payload, error }`. */
  ask(
    id: string,
    channel: string,
    payload?: unknown,
  ): Promise<{ payload?: unknown; error?: string }>;
  /** One `auth` frame round-trip, as `{ payload, error }`. */
  authenticate(id: string, token: string): Promise<{ payload?: unknown; error?: string }>;
  /** Every `publish` frame this socket has received. */
  publishes(): WsFrame[];
}

export async function openClient(handle: BridgeHandle): Promise<Client> {
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });

  const awaitReply = async (id: string): Promise<{ payload?: unknown; error?: string }> => {
    await waitFor(() => frames.some((f) => f.type === 'response' && f.id === id));
    const resp = frames.find((f) => f.type === 'response' && f.id === id);
    if (resp?.type !== 'response') throw new Error('no response');
    return { payload: resp.payload, ...(resp.error ? { error: resp.error.message } : {}) };
  };

  return {
    ws,
    frames,
    ask: (id, channel, payload) => {
      ws.send(serializeWsFrame({ type: 'request', id, channel, payload }));
      return awaitReply(id);
    },
    authenticate: (id, token) => {
      ws.send(serializeWsFrame({ type: 'auth', id, token }));
      return awaitReply(id);
    },
    publishes: () => frames.filter((f) => f.type === 'publish'),
  };
}

/**
 * A bridge with auth ON, pointed at a fresh fake Playout on loopback.
 *
 * 🔴 The fake generates its ES256 key pair IN MEMORY at start and writes nothing to disk. No
 * credential of any kind is committed by this suite — see `fake-playout.ts`.
 */
export async function startAuthedBridge(
  overrides: Partial<BridgeOptions> = {},
): Promise<{ handle: BridgeHandle; playout: FakePlayout }> {
  const playout = await startFakePlayout();
  const handle = await createBridge({
    port: 0,
    connection: deadConnection(),
    playout: {
      auth: 'playout',
      issuer: playout.issuer,
      jwksUrl: playout.jwksUrl,
      tokenUrl: playout.tokenUrl,
      refreshUrl: playout.refreshUrl,
      revokedUrl: playout.revokedUrl,
    },
    ...overrides,
  });
  return { handle, playout };
}

/**
 * The refusal assertion, written so it cannot pass vacuously.
 *
 * 🔴 `lock-refuses-intents.integration.test.ts` records why this shape is mandatory: written
 * the obvious way — `expect(res.error).toBe(CONSTANT)` — those specs PASSED against the
 * unfixed bridge, because before the constant existed the import resolved to `undefined` and
 * an ungated bridge answers with no error, making the comparison
 * `expect(undefined).toBe(undefined)`. So the refusal is checked for being a non-empty STRING
 * first, and only then for being the shared one.
 */
export function expectRefusedWith(error: string | undefined, expected: string, what: string): void {
  if (typeof expected !== 'string' || expected === '') {
    throw new Error(
      `the expected refusal is not a string — the import resolved to ${String(expected)}`,
    );
  }
  if (typeof error !== 'string') {
    throw new Error(`${what}: expected a refusal, got no error at all`);
  }
  if (error !== expected) {
    throw new Error(`${what}: refused with the wrong sentence — got ${JSON.stringify(error)}`);
  }
}
