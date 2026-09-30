import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import * as ipc from '@cg/shared-ipc';
import {
  BRIDGE_SKEW_MESSAGE,
  BridgeSkewError,
  bridgeErrorFrom,
  isBridgeSkewMessage,
  skewChannelOf,
} from '../src/shared/bridgeSkew.js';
import { WebSocketRuntime, type WebSocketLike } from '../src/platform/WebSocketRuntime.js';

/**
 * 🔴 **`B-152` + `B-153` — the two halves of "the operator must not learn about a version
 * mismatch by pressing a button on air".**
 *
 * The real incident: a LOOK button answered `unknown channel: stack.set-active-look` during a
 * live show. Two defects, and the second is why the first was possible at all:
 *
 *   - `B-152` — a wire identifier reached a broadcast surface. Not one careless call site:
 *     fourteen places pass a caught `err.message` to a toast and exactly two translated it.
 *   - `B-153` — nothing asked the bridge what it could do. `caspar-bridge` is a separate
 *     long-lived process; a browser reload updates the SPA and not the bridge.
 */

// ── `B-152` / test 4.3 — the failure text carries no internal identifier ──────────────

describe('B-152 — a bridge error never reaches a surface as a wire identifier', () => {
  it('🔴 4.3 — `unknown channel: <name>` becomes an operator sentence, and the NAME is gone', () => {
    const err = bridgeErrorFrom('unknown channel: stack.set-active-look');
    expect(err).toBeInstanceOf(BridgeSkewError);
    // THE assertion. The wording may change; a channel name on a broadcast surface is the
    // defect, and it is the same defect whatever words surround it.
    expect(err.message).not.toContain('stack.set-active-look');
    expect(err.message).not.toMatch(/unknown channel/i);
    expect(err.message).toMatch(/older build/i);
    expect(err.message).toMatch(/restarted/i);
    // …and a developer still has it, on the object rather than on the screen.
    expect((err as BridgeSkewError).channel).toBe('stack.set-active-look');
  });

  it('all THREE shapes are one fact — the two that used to be missed are covered', () => {
    /*
      `invalid request for X` and `invalid response for X` are the case where the bridge KNOWS
      the channel and disagrees about its shape. `delimiterStore` tested only `unknown
      channel`, so a payload-shape mismatch fell straight through to the operator as written.
    */
    for (const raw of [
      'unknown channel: delimiters.set',
      'invalid request for sources.set-config',
      'invalid response for stack.take',
    ]) {
      expect(isBridgeSkewMessage(raw), raw).toBe(true);
      expect(bridgeErrorFrom(raw).message).toBe(BRIDGE_SKEW_MESSAGE);
    }
  });

  it('a REFUSAL keeps the bridge’s own sentence — its specifics are the actionable part', () => {
    /*
      The opposite failure, and it would be easy to cause while fixing this one: the bridge's
      refusals carry facts this side cannot know (which template is already on air, how many
      boxes it has). Swallowing those into a generic sentence trades one unhelpful message
      for another.
    */
    const raw = 'This template has no look called "solo".';
    const err = bridgeErrorFrom(raw);
    expect(err).not.toBeInstanceOf(BridgeSkewError);
    expect(err.message).toBe(raw);
  });

  it('the channel is extracted for logs, and an unshaped message yields none', () => {
    expect(skewChannelOf('unknown channel: fixedLayers.load')).toBe('fixedLayers.load');
    expect(skewChannelOf('CasparCG refused the substitution')).toBeUndefined();
  });
});

// ── `B-153` / test 4.4 — the skew is found at CONNECT ─────────────────────────────────

const wsFactory = (url: string): WebSocketLike => new WsWebSocket(url) as unknown as WebSocketLike;

let handle: BridgeHandle | null = null;
let runtime: WebSocketRuntime | null = null;

afterEach(async () => {
  runtime?.dispose();
  runtime = null;
  await handle?.close();
  handle = null;
});

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
}

/**
 * A socket that speaks the bridge's frame protocol and answers ONLY the capability
 * handshake — with whatever channel list the test dictates. Everything else is ignored,
 * which is all these tests need: the connect-time check is the unit under test.
 */
function fakeBridge(
  reply: (channel: string) => unknown | 'unknown-channel',
  /** How long this channel's answer takes, in ms (default 0). */
  delayFor: (channel: string) => number = () => 0,
): WebSocketLike {
  const listeners = new Map<string, ((ev?: unknown) => void)[]>();
  const socket: WebSocketLike = {
    readyState: 1,
    send(data: string) {
      const frame = JSON.parse(data) as { id: string; channel: string };
      const answer = reply(frame.channel);
      const response =
        answer === 'unknown-channel'
          ? {
              type: 'response',
              id: frame.id,
              error: { message: `unknown channel: ${frame.channel}` },
            }
          : { type: 'response', id: frame.id, payload: answer };
      // Asynchronously, like a real socket — so the connect path is exercised as it runs.
      setTimeout(() => {
        for (const l of listeners.get('message') ?? []) l({ data: JSON.stringify(response) });
      }, delayFor(frame.channel));
    },
    close() {
      /* nothing to tear down */
    },
    addEventListener(type: string, listener: (ev?: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
      if (type === 'open') setTimeout(() => listener(), 0);
    },
  } as unknown as WebSocketLike;
  return socket;
}

describe('B-153 — the bridge is asked what it can do, at connect', () => {
  it('🔴 4.4 — a bridge missing channels is named at CONNECT, before any button is pressed', async () => {
    const all = ipc.runtimeRequestChannelNames(ipc);
    const withheld = ['stack.set-active-look', 'stack.swap-live-source'];
    runtime = new WebSocketRuntime('ws://fake', {
      createWebSocket: () =>
        fakeBridge((channel) =>
          channel === ipc.BridgeCapabilitiesChannel.name
            ? { channels: all.filter((n) => !withheld.includes(n)) }
            : 'unknown-channel',
        ),
    });

    await waitFor(() => runtime?.link.skew() !== null);

    const skew = runtime.link.skew();
    expect(skew, 'names exactly what is missing').toEqual(withheld.sort());
    // The point of the whole guard: this is known WITHOUT anyone having issued the command.
    expect(runtime.link.status()).toBe('live');
  });

  it('🔴 a bridge too old to answer the handshake is the LOUDEST match, not a miss', async () => {
    /*
      The bootstrap case. A bridge predating this channel replies `unknown channel:
      bridge.capabilities` — which `B-152` has already turned into a `BridgeSkewError`, so the
      connect check reads it as the strongest possible evidence of skew rather than swallowing
      it. There is no "too old to check" state that slips past.
    */
    runtime = new WebSocketRuntime('ws://fake', {
      createWebSocket: () => fakeBridge(() => 'unknown-channel'),
    });

    await waitFor(() => runtime?.link.skew() !== null);
    expect(runtime.link.skew()).toEqual([ipc.BridgeCapabilitiesChannel.name]);
  });

  it('🔴 a MATCHING bridge reports NO skew — the derivation and the routes really do agree', async () => {
    /*
      The positive control, and the one that would catch this guard rotting into a permanent
      false alarm. It runs a REAL bridge: if `runtimeRequestChannelNames` and `buildRoutes`
      ever disagree about what the runtime owns, every operator sees a skew banner on a
      perfectly matched pair — which would train them to ignore it, and the next real skew
      with it.
    */
    handle = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
    });
    runtime = new WebSocketRuntime(`ws://127.0.0.1:${String(handle.port)}`, {
      createWebSocket: wsFactory,
    });

    await waitFor(() => runtime?.link.status() === 'live');
    // Give the handshake a chance to answer — and assert it stays null rather than merely
    // being null before it ran.
    await new Promise((r) => setTimeout(r, 300));
    expect(runtime.link.skew(), 'a matched pair must be silent').toBeNull();
    // `CENTRAL-BRIDGE-01` — …and a real bridge of this build is this console's release.
    expect(runtime.link.versionMismatch(), 'a matched pair read as two releases').toBeNull();
  });
});

// ── `CENTRAL-BRIDGE-01` (`R-068`) — another release than CG Bridge sends nothing ─────────────

describe('CENTRAL-BRIDGE-01 — the release line is checked at connect: one line, no command', () => {
  const all = ipc.runtimeRequestChannelNames(ipc);
  /** Not a channel: the entry `bridgeOf` writes when the handshake's answer is delivered. */
  const ANSWERED = '(capabilities answered)';

  /**
   * A bridge answering the handshake with `bridgeVersion` (after `handshakeMs`), and
   * `{ accepted: true }` to anything else.
   */
  function bridgeOf(
    bridgeVersion: string | undefined,
    sent: string[],
    handshakeMs = 0,
  ): WebSocketLike {
    return fakeBridge(
      (channel) => {
        sent.push(channel);
        if (channel === ipc.BridgeCapabilitiesChannel.name) {
          // Marks the moment the answer is delivered: this timer is armed first, so it fires
          // just before the answer's own timer of the same delay.
          setTimeout(() => sent.push(ANSWERED), handshakeMs);
          return { channels: all, ...(bridgeVersion !== undefined ? { bridgeVersion } : {}) };
        }
        return { accepted: true };
      },
      (channel) => (channel === ipc.BridgeCapabilitiesChannel.name ? handshakeMs : 0),
    );
  }

  it('🔴 a take pressed BEFORE the release answer lands waits for it — and is refused, no frame written', async () => {
    /*
      The window the first spelling left open: the refusal read `#versionMismatch` at once, and
      until the answer lands that holds no verdict, so the take went out to another release.
    */
    const sent: string[] = [];
    runtime = new WebSocketRuntime('ws://fake', {
      consoleVersion: '0.10.0',
      createWebSocket: () => bridgeOf('0.9.1', sent, 200),
    });
    await waitFor(() => runtime?.link.status() === 'live');
    expect(runtime.link.versionMismatch(), 'the answer has not landed yet').toBeNull();

    await expect(runtime.stack.take({ itemId: 'row-1' })).rejects.toThrow(
      ipc.versionMismatchRefusal('0.10.0', '0.9.1'),
    );
    expect(sent, 'a take reached another release before its answer').not.toContain('stack.take');
  });

  it('CONTROL — the same slow answer from the SAME release: the take waits for it, then goes out', async () => {
    const sent: string[] = [];
    runtime = new WebSocketRuntime('ws://fake', {
      consoleVersion: '0.10.0',
      createWebSocket: () => bridgeOf('0.10.0', sent, 200),
    });
    await waitFor(() => runtime?.link.status() === 'live');
    await expect(runtime.stack.take({ itemId: 'row-1' })).resolves.toEqual({ accepted: true });
    // It went out AFTER the answer landed — the order the wait promises. (The answer must be IN
    // the list: an absent one reads as index -1, which every take would follow.)
    const answeredAt = sent.indexOf(ANSWERED);
    expect(answeredAt, 'the take resolved before the answer landed').toBeGreaterThanOrEqual(0);
    expect(sent.indexOf('stack.take')).toBeGreaterThan(answeredAt);
  });

  it('🔴 a bridge on ANOTHER release line: the line names both, and a take is refused HERE — no frame written', async () => {
    const sent: string[] = [];
    runtime = new WebSocketRuntime('ws://fake', {
      consoleVersion: '0.10.0',
      createWebSocket: () => bridgeOf('0.9.1', sent),
    });
    await waitFor(() => runtime?.link.versionMismatch() !== null);
    const line = runtime.link.versionMismatch();
    expect(line).toBe(ipc.versionMismatchRefusal('0.10.0', '0.9.1'));

    await expect(runtime.stack.take({ itemId: 'row-1' })).rejects.toThrow(line ?? '');
    expect(sent, 'a command went out from another release').not.toContain('stack.take');
    // CONTROL — the socket works: the handshake itself went out and was answered.
    expect(sent).toContain(ipc.BridgeCapabilitiesChannel.name);
  });

  it('a PATCH difference is the same release line — CONTROL: the take goes out', async () => {
    const sent: string[] = [];
    runtime = new WebSocketRuntime('ws://fake', {
      consoleVersion: '0.10.0',
      createWebSocket: () => bridgeOf('0.10.3', sent),
    });
    await waitFor(() => runtime?.link.status() === 'live');
    await new Promise((r) => setTimeout(r, 100)); // the handshake answered
    expect(runtime.link.versionMismatch()).toBeNull();
    await expect(runtime.stack.take({ itemId: 'row-1' })).resolves.toEqual({ accepted: true });
    expect(sent).toContain('stack.take');
  });

  it('🔴 §5 — a planted 0.9 console against a REAL 0.10 bridge: the line, and nothing sent', async () => {
    handle = await createBridge({
      port: 0,
      version: '0.10.0',
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
    });
    const written: string[] = [];
    runtime = new WebSocketRuntime(`ws://127.0.0.1:${String(handle.port)}`, {
      consoleVersion: '0.9.1',
      createWebSocket: (url) => {
        // Every frame this console writes, by channel — "nothing sent" is read on the wire.
        const ws = wsFactory(url);
        const send = ws.send.bind(ws);
        ws.send = (data: string): void => {
          written.push((JSON.parse(data) as { channel?: string }).channel ?? '');
          send(data);
        };
        return ws;
      },
    });
    await waitFor(() => runtime?.link.versionMismatch() !== null);
    const line = runtime.link.versionMismatch();
    expect(line).toBe(ipc.versionMismatchRefusal('0.9.1', '0.10.0'));

    await expect(runtime.stack.take({ itemId: 'row-1' })).rejects.toThrow(line ?? '');
    await expect(runtime.stack.snapshot()).rejects.toThrow(line ?? '');
    expect(written).not.toContain('stack.take');
    expect(written).not.toContain('stack.snapshot');
    // CONTROL — the socket and the bridge work: the handshake went out and was answered.
    expect(written).toContain(ipc.BridgeCapabilitiesChannel.name);
  });

  it('a bridge that names NO release predates 0.10 — another release, and it says so', async () => {
    const sent: string[] = [];
    runtime = new WebSocketRuntime('ws://fake', {
      consoleVersion: '0.10.0',
      createWebSocket: () => bridgeOf(undefined, sent),
    });
    await waitFor(() => runtime?.link.versionMismatch() !== null);
    expect(runtime.link.versionMismatch()).toContain('older than 0.10');
  });
});

describe('B-152 — a malformed response rejects its caller instead of crashing the pump', () => {
  it('🔴 an unshaped payload becomes a rejection, not an uncaught exception', async () => {
    /*
      Found by `B-153`: the capability handshake is the first request on every connect, so any
      peer answering it with something unshaped turned a contract mismatch into a
      process-level crash — `channel.response.parse` throws inside the socket's `message`
      listener, which does not reject the promise.

      The bug predates the handshake and applies to EVERY channel; the handshake merely made
      it reachable on every boot. Asserted as a rejection the caller can act on.
    */
    runtime = new WebSocketRuntime('ws://fake', {
      /*
        `CENTRAL-BRIDGE-01` — the handshake is answered in shape and names this console's release:
        a bridge that cannot answer it is another release, and the version gate would then refuse
        the read below before its envelope was ever reached — measuring the gate, not the pump.
      */
      createWebSocket: () =>
        fakeBridge((channel) =>
          channel === ipc.BridgeCapabilitiesChannel.name
            ? {
                channels: ipc.runtimeRequestChannelNames(ipc),
                bridgeVersion: __CG_BUILD__.version,
              }
            : { nothing: 'that matches the contract' },
        ),
    });

    await waitFor(() => runtime?.link.status() === 'live');
    /*
      ⚠ Any REQUEST channel does; this used `settings.get`, which no longer exists (its
      whole `settings.*` namespace was dead code and was deleted). `delimiters.list` is a
      like-for-like stand-in — a plain read whose response the fake bridge answers with
      something unshaped — and the claim being made is about the ENVELOPE, not about which
      channel carries it.
    */
    await expect(runtime.delimiters.list()).rejects.toThrow(/older build/i);
    // …and the process is still standing: the skew check resolved rather than exploding.
    await new Promise((r) => setTimeout(r, 50));
    expect(runtime.link.status()).toBe('live');
  });
});
