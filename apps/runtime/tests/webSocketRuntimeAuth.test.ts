import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ipc from '@cg/shared-ipc';
import { WebSocketRuntime, type WebSocketLike } from '../src/platform/WebSocketRuntime.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `R-066` acceptance 2 — **"WHEN signed in THEN the token is held per console, survives a
 * reload, is presented on every (re)connect, and is refreshed about 10 minutes before expiry
 * while the page is open; sign-out clears it"**.
 *
 * This file owns the TRANSPORT half of that sentence: what `WebSocketRuntime` writes on the
 * socket, in what ORDER, on a first connect and on every reconnect after it — and what it stops
 * writing once the operator signs out. The surface half is `signInOverlay.dom.test.ts`; the
 * bridge half is `tools/caspar-bridge/tests/auth-gate.integration.test.ts`. Three files, three
 * sides of one door, and none of them stands in for another.
 *
 * ── WHY THE ORDER IS ASSERTED AND NOT JUST THE PRESENCE ─────────────────────
 *
 * `WebSocketRuntime`'s own connect note says it: single-socket FIFO means the frame written
 * first is processed first, so seating the principal ahead of the resync is what makes a
 * reconnect come back **with its stack** instead of with sixty refusals from a bridge that has
 * nobody on the socket yet. A spec that only checked both frames were sent would read green
 * through exactly that regression, which is why every order claim below names an INDEX.
 *
 * ── HOW IT IS DRIVEN ────────────────────────────────────────────────────────
 *
 * Through the injected `createWebSocket` factory `WebSocketRuntime.test.ts` and
 * `bridgeSkew.test.ts` already use — the same seam, a fuller fake: this one records every frame
 * the runtime writes (parsed through the REAL `parseWsFrame`, so a frame the shared schema would
 * refuse fails here rather than being asserted against), answers only what a test tells it to,
 * and can be dropped and reopened so a reconnect is a real lifecycle event on ONE runtime rather
 * than a second constructor call.
 *
 * ⚠ It measures no geometry and renders nothing: there is nothing on screen here to measure, and
 * jsdom could not answer it anyway (golden rule 12(c)).
 */

// ── the fake socket ──────────────────────────────────────────────────────────

/** Every listener is stored under one shape; the three argument-less kinds ignore the event. */
type SocketListener = (ev: { data: unknown }) => void;

/** What the fake answers a frame with, or `null` for "this bridge stays silent". */
type Answer = (frame: ipc.WsFrame) => ipc.WsResponseFrame | null;

class FakeSocket implements WebSocketLike {
  /** `1` is `WS_OPEN` — the only value `WebSocketRuntime` compares against. */
  readyState = 0;
  /** Every frame the runtime wrote, in order. The whole point of this fake. */
  readonly sent: ipc.WsFrame[] = [];
  closeCalls = 0;
  /**
   * A throw that escaped a `message` listener — `B-152`'s pump crash, made measurable.
   * Unrecorded it would leave the socket as an unhandled rejection and the spec still green.
   */
  readonly listenerErrors: unknown[] = [];

  readonly #answer: Answer;
  readonly #opened: SocketListener[] = [];
  readonly #closed: SocketListener[] = [];
  readonly #errored: SocketListener[] = [];
  readonly #messages: SocketListener[] = [];

  constructor(answer: Answer) {
    this.#answer = answer;
  }

  send(data: string): void {
    const frame = ipc.parseWsFrame(data);
    if (frame === null) {
      throw new Error(`the runtime wrote a frame the shared schema refuses: ${data}`);
    }
    this.sent.push(frame);
    const response = this.#answer(frame);
    // A real socket never answers inside `send`. A resolved-promise hop is the smallest delay
    // that is still a hop, and it is never faked, so it works under fake timers unchanged.
    if (response !== null) void Promise.resolve().then(() => this.deliver(response));
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
    // A real socket's `close()` reaches the `close` listener, which is what makes "the socket
    // was NOT closed" measurable on the LINK as well as on this counter.
    this.#fire(this.#closed);
  }

  addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: SocketListener): void {
    if (type === 'open') this.#opened.push(listener);
    else if (type === 'close') this.#closed.push(listener);
    else if (type === 'error') this.#errored.push(listener);
    else this.#messages.push(listener);
  }

  // ── what a test drives ──
  /** The bridge accepted the connection. */
  open(): void {
    this.readyState = 1;
    this.#fire(this.#opened);
  }

  /** The link went away under the runtime — a bridge restart, a LAN blink, a sleeping laptop. */
  drop(): void {
    this.readyState = 3;
    this.#fire(this.#closed);
  }

  /** Push a frame at the runtime, as the bridge would. */
  deliver(frame: ipc.WsFrame): void {
    for (const listener of [...this.#messages]) {
      try {
        listener({ data: ipc.serializeWsFrame(frame) });
      } catch (err) {
        this.listenerErrors.push(err);
      }
    }
  }

  /** `error` is part of the contract and unused by these tests; kept so the shape is honest. */
  fail(): void {
    this.#fire(this.#errored);
  }

  #fire(listeners: SocketListener[]): void {
    for (const listener of [...listeners]) listener({ data: undefined });
  }
}

// ── the fake bridge ──────────────────────────────────────────────────────────

type Capabilities = ipc.ChannelResponse<typeof ipc.BridgeCapabilitiesChannel>;

type AuthAnswer =
  | { readonly kind: 'accept'; readonly principal: ipc.PlayoutPrincipal }
  | { readonly kind: 'refuse'; readonly message: string }
  | { readonly kind: 'silent' };

type SignOutAnswer =
  | { readonly kind: 'ok' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'silent' };

/**
 * A bridge that routes exactly three things — the `auth` frame, `bridge.capabilities` and
 * `auth.sign-out` — and answers everything else as unrouted.
 *
 * ⚠ That last part is deliberate and it is not laziness: the reconnect resync re-pulls
 * `stack.snapshot` / `connections.health` / `lock.state`, and a bridge that never answered them
 * would leave `#resync` waiting out its 8-second request timeout inside an `await` a test is
 * holding. An `unknown channel:` answer is the fastest honest reply a bridge that routes nothing
 * can give, every one of those call sites already catches it, and none of them is what is under
 * test here.
 */
class FakeBridge {
  capabilities: Capabilities | null = null;
  authAnswer: AuthAnswer = { kind: 'silent' };
  signOutAnswer: SignOutAnswer = { kind: 'ok' };
  readonly sockets: FakeSocket[] = [];

  readonly connect = (): WebSocketLike => {
    const socket = new FakeSocket((frame) => this.#answerTo(frame));
    this.sockets.push(socket);
    return socket;
  };

  /** The socket the runtime is on now (the newest), or the one at `index`. */
  socket(index = this.sockets.length - 1): FakeSocket {
    const socket = this.sockets[index];
    if (socket === undefined) throw new Error(`no socket at index ${String(index)}`);
    return socket;
  }

  /**
   * Answer a request this bridge left hanging, correlating by the id the runtime really used.
   * It is what lets one runtime be driven through "no answer yet" → "answered" without a
   * second construction.
   */
  answerLate(channel: string, payload: unknown): void {
    const socket = this.socket();
    const request = [...socket.sent]
      .reverse()
      .find((f): f is ipc.WsRequestFrame => f.type === 'request' && f.channel === channel);
    if (request === undefined) throw new Error(`the runtime never asked for ${channel}`);
    socket.deliver({ type: 'response', id: request.id, payload });
  }

  #answerTo(frame: ipc.WsFrame): ipc.WsResponseFrame | null {
    if (frame.type === 'auth') {
      if (this.authAnswer.kind === 'silent') return null;
      if (this.authAnswer.kind === 'refuse') {
        return { type: 'response', id: frame.id, error: { message: this.authAnswer.message } };
      }
      const state: ipc.AuthState = { mode: 'playout', principal: this.authAnswer.principal };
      return { type: 'response', id: frame.id, payload: state };
    }
    if (frame.type !== 'request') return null;
    if (frame.channel === ipc.BridgeCapabilitiesChannel.name) {
      if (this.capabilities === null) return null;
      return { type: 'response', id: frame.id, payload: this.capabilities };
    }
    if (frame.channel === ipc.AuthSignOutChannel.name) {
      if (this.signOutAnswer.kind === 'silent') return null;
      if (this.signOutAnswer.kind === 'error') {
        return { type: 'response', id: frame.id, error: { message: this.signOutAnswer.message } };
      }
      return { type: 'response', id: frame.id, payload: { ok: true } };
    }
    return {
      type: 'response',
      id: frame.id,
      error: { message: `unknown channel: ${frame.channel}` },
    };
  }
}

// ── fixtures and readings ────────────────────────────────────────────────────

/** The one persisted key this feature owns; `persistedKeyCensus.test.ts` is its other reader. */
const SESSION_KEY = 'cg.runtime.playoutSession';
/** `RECONNECT_DELAY_MS` in `WebSocketRuntime.ts` — not exported, so it is named here. */
const RECONNECT_DELAY_MS = 1000;
/** `REQUEST_TIMEOUT_MS` in `WebSocketRuntime.ts` — likewise. */
const REQUEST_TIMEOUT_MS = 8000;
/** One shift, the access token's life per ADR 0010. */
const TOKEN_LIFE_MS = 12 * 60 * 60 * 1000;

function seedSession(storage: Storage, accessToken: string): void {
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken,
      refreshToken: 'refresh-token-under-test',
      expiresAtMs: Date.now() + TOKEN_LIFE_MS,
    }),
  );
}

function principalNamed(name: string): ipc.PlayoutPrincipal {
  return {
    name,
    sub: 'u-1042',
    roles: ['operator'],
    channels: [{ host: 'A', channel: 1 }],
    expiresAt: new Date(Date.now() + TOKEN_LIFE_MS).toISOString(),
    nameTruncated: false,
  };
}

function playoutCapabilities(): Capabilities {
  return {
    channels: ipc.runtimeRequestChannelNames(ipc),
    auth: 'playout',
    signInUrl: 'https://playout.example.test/api/cg/auth/token',
    refreshUrl: 'https://playout.example.test/api/cg/auth/refresh',
    authContractVersion: '1.1',
  };
}

/** How a frame reads in an order assertion: `auth`, or `request <channel>`. */
function label(frame: ipc.WsFrame): string {
  return frame.type === 'request' ? `request ${frame.channel}` : frame.type;
}

function frameAt(socket: FakeSocket, index: number): ipc.WsFrame {
  const frame = socket.sent[index];
  if (frame === undefined) {
    throw new Error(
      `no frame at index ${String(index)} — the runtime wrote [${socket.sent.map(label).join(', ')}]`,
    );
  }
  return frame;
}

/** Every token this socket has been given, in order. Empty is a real answer. */
function authTokensOn(socket: FakeSocket): string[] {
  return socket.sent.filter((f): f is ipc.WsAuthFrame => f.type === 'auth').map((f) => f.token);
}

function requestedChannelsOn(socket: FakeSocket): string[] {
  return socket.sent
    .filter((f): f is ipc.WsRequestFrame => f.type === 'request')
    .map((f) => f.channel);
}

/**
 * Let every queued microtask and zero-delay timer run.
 *
 * Four rounds rather than one: the connect path chains `open` → `#presentToken` → the bridge's
 * answer → `#setPrincipal`, and `#resync` yields again beneath it. Under-flushing here would
 * read as "the runtime never sent it", which is the most misleading failure this file could have.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(0);
}

const realFetch: typeof fetch = globalThis.fetch;

/** Stand the Playout's D1 answer in, so `signIn` can run without a network. */
function stubPlayout(body: Record<string, unknown>): void {
  globalThis.fetch = (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
}

let storage: Storage;
const runtimes: WebSocketRuntime[] = [];

function start(bridge: FakeBridge): WebSocketRuntime {
  const runtime = new WebSocketRuntime('ws://fake-bridge', {
    createWebSocket: bridge.connect,
    // The resync's re-pull is answered `unknown channel:` by design (see `FakeBridge`); the
    // default handler would print that to the console on every test in this file.
    onResyncError: () => {
      /* not under test here */
    },
  });
  runtimes.push(runtime);
  return runtime;
}

beforeEach(() => {
  vi.useFakeTimers();
  storage = installMemoryStorage();
});

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

// ── 1 + 3 — the frame, its place in the queue, and the console that has no token ─────────────

describe('R-066 — the `auth` frame is the FIRST thing on a connected socket', () => {
  it('🔴 writes `auth` at index 0 and `bridge.capabilities` at index 1 — the order, not just both', async () => {
    seedSession(storage, 'jwt-held-by-this-console');
    const bridge = new FakeBridge();
    bridge.capabilities = playoutCapabilities();
    const principal = principalNamed('نگار احمدی');
    bridge.authAnswer = { kind: 'accept', principal };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    /*
      🔴 THE claim. FIFO on one socket means the principal is seated before the resync's first
      channel request reaches the bridge — reverse these two and a reconnected console comes
      back to a bridge that refuses every channel it then asks for.
    */
    expect(label(frameAt(bridge.socket(), 0)), 'the token must not queue behind a channel').toBe(
      'auth',
    );
    expect(label(frameAt(bridge.socket(), 1))).toBe(
      `request ${ipc.BridgeCapabilitiesChannel.name}`,
    );
    expect(authTokensOn(bridge.socket())).toEqual(['jwt-held-by-this-console']);
    expect(runtime.auth.state()).toEqual({ kind: 'signed-in', principal });
  });

  it('with NO session in storage writes no `auth` frame — and still asks the handshake', async () => {
    /*
      The control for the spec above. Without the second half it would pass against a runtime
      that had stopped writing anything at all on connect: "no auth frame" would be true for the
      worst possible reason. The handshake is the positive control that this socket is live and
      that frames written on it are seen.
    */
    const bridge = new FakeBridge();
    bridge.capabilities = playoutCapabilities();
    bridge.authAnswer = { kind: 'accept', principal: principalNamed('هرگز ارائه نشده') };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    expect(storage.getItem(SESSION_KEY), 'this console holds nothing to present').toBeNull();
    expect(authTokensOn(bridge.socket())).toEqual([]);
    expect(requestedChannelsOn(bridge.socket())).toContain(ipc.BridgeCapabilitiesChannel.name);
    // …and the console says what it is: auth is on, nobody is signed in here.
    expect(runtime.auth.state()).toEqual({ kind: 'signed-out' });
  });
});

// ── 2 — and on every reconnect ───────────────────────────────────────────────────────────────

describe('R-066 — the token is presented again on every RECONNECT', () => {
  it('🔴 after a drop and a retry the NEW socket is given the token, first, on one runtime', async () => {
    seedSession(storage, 'jwt-across-the-blink');
    const bridge = new FakeBridge();
    bridge.capabilities = playoutCapabilities();
    bridge.authAnswer = { kind: 'accept', principal: principalNamed('نگار احمدی') };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    /*
      ⭐ POSITIVE CONTROL, and it is the reason this test is not satisfied by a single connect:
      socket 0 got the token too. Without this line "an auth frame exists" would be true of a
      runtime that presented once and never again — which is the defect, exactly.
    */
    expect(authTokensOn(bridge.socket(0))).toEqual(['jwt-across-the-blink']);

    bridge.socket(0).drop();
    await settle();
    expect(runtime.link.status()).toBe('disconnected');
    expect(bridge.sockets.length, 'nothing reconnects before the retry delay').toBe(1);

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
    expect(bridge.sockets.length, 'the runtime never retried').toBe(2);
    expect(bridge.socket(1)).not.toBe(bridge.socket(0));

    bridge.socket(1).open();
    await settle();

    expect(authTokensOn(bridge.socket(1))).toEqual(['jwt-across-the-blink']);
    expect(label(frameAt(bridge.socket(1), 0)), 'the reconnect re-seats the principal FIRST').toBe(
      'auth',
    );
    expect(label(frameAt(bridge.socket(1), 1))).toBe(
      `request ${ipc.BridgeCapabilitiesChannel.name}`,
    );
    expect(runtime.link.status()).toBe('live');
    expect(runtime.auth.state().kind).toBe('signed-in');
  });
});

// ── 4 — what the console DISPLAYS is the bridge's answer ─────────────────────────────────────

describe("R-066 — the bridge's answer is what the console shows", () => {
  it('adopts the principal the BRIDGE returned for the presented token', async () => {
    seedSession(storage, 'jwt-held-by-this-console');
    const bridge = new FakeBridge();
    bridge.capabilities = playoutCapabilities();
    const principal = principalNamed('مریم قاسمی');
    bridge.authAnswer = { kind: 'accept', principal };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    expect(runtime.auth.state()).toEqual({ kind: 'signed-in', principal });
  });

  it("🔴 a D1 `principal` echo NEVER wins — the bridge's name is displayed, not the Playout's", async () => {
    /*
      ADR 0010 rule 9: the D1 `principal` is a CONVENIENCE ECHO. The bridge trusts only the JWT,
      so what a console displays must come from the bridge's answer to the `auth` frame — one
      round trip later and authoritative. Adopting the echo would mean a console showing a name
      nothing had verified, and the two are indistinguishable in every test where they agree.
      So here they DISAGREE by construction: the Playout echoes one name, the bridge returns
      another, and the assertion says which one reached the surface.
    */
    const ECHO_NAME = 'اکوی تأییدنشده';
    const VERIFIED_NAME = 'مریم قاسمی';
    const bridge = new FakeBridge();
    bridge.capabilities = playoutCapabilities();
    const principal = principalNamed(VERIFIED_NAME);
    bridge.authAnswer = { kind: 'accept', principal };
    stubPlayout({
      access_token: 'jwt-from-playout',
      refresh_token: 'refresh-from-playout',
      expires_in: TOKEN_LIFE_MS / 1000,
      principal: { name: ECHO_NAME },
    });

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();
    // The lifecycle, on one runtime: signed out on an open socket, then a real sign-in.
    expect(runtime.auth.state()).toEqual({ kind: 'signed-out' });
    expect(authTokensOn(bridge.socket()), 'nothing to present yet').toEqual([]);

    const signingIn = runtime.auth.signIn('cg-op1', 'test-only-not-a-secret');
    await settle();
    await signingIn;
    await settle();

    // The token the Playout issued reached the ALREADY-OPEN socket — no reconnect needed.
    expect(authTokensOn(bridge.socket())).toEqual(['jwt-from-playout']);
    const state = runtime.auth.state();
    expect(state).toEqual({ kind: 'signed-in', principal });
    expect(JSON.stringify(state), 'the echo reached the surface').not.toContain(ECHO_NAME);
    expect(JSON.stringify(state)).toContain(VERIFIED_NAME);
    // …and it is held per console, so a reload finds it (the other half of the acceptance).
    expect(storage.getItem(SESSION_KEY)).toContain('jwt-from-playout');
  });
});

// ── 5 — capabilities drive the mode, and silence is not a mode ───────────────────────────────

describe('R-066 — the MODE comes from `bridge.capabilities`, and `unknown` is not `off`', () => {
  it('🔴 before the handshake answers, the state is UNKNOWN — even with a principal seated', async () => {
    /*
      The strongest form of the claim: the bridge has ALREADY accepted this console's token, and
      the state is still `unknown`, because nothing has said whether this station authenticates
      at all. A sign-in that flashed in this window would appear on every reload of every
      console, including stations where auth is off.
    */
    seedSession(storage, 'jwt-held-by-this-console');
    const bridge = new FakeBridge();
    bridge.capabilities = null; // the handshake is asked and left hanging
    const principal = principalNamed('نگار احمدی');
    bridge.authAnswer = { kind: 'accept', principal };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    expect(authTokensOn(bridge.socket()), 'the token was presented all the same').toEqual([
      'jwt-held-by-this-console',
    ]);
    expect(runtime.auth.capabilities()).toBeNull();
    expect(runtime.auth.state()).toEqual({ kind: 'unknown' });

    // Now answer it, on the SAME runtime and the same socket — the transition is the test.
    const caps = playoutCapabilities();
    bridge.answerLate(ipc.BridgeCapabilitiesChannel.name, caps);
    await settle();

    expect(runtime.auth.capabilities()).toEqual({
      mode: 'playout',
      signInUrl: caps.signInUrl,
      refreshUrl: caps.refreshUrl,
      contractVersion: caps.authContractVersion,
    });
    expect(runtime.auth.state()).toEqual({ kind: 'signed-in', principal });
  });

  it('a bridge that answers with NO `auth` field at all reads `off` — the absent case', async () => {
    /*
      The control for the spec above, and the case that actually ships: a bridge predating auth
      cannot say, and "cannot say" and "does not authenticate" are the same fact about that
      process. Read through `capabilitiesAuthMode`, the one site that decides what absent means.
    */
    const bridge = new FakeBridge();
    bridge.capabilities = { channels: ipc.runtimeRequestChannelNames(ipc) };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    expect(runtime.auth.capabilities()).toEqual({
      mode: 'off',
      signInUrl: null,
      refreshUrl: null,
      contractVersion: null,
    });
    expect(runtime.auth.state()).toEqual({ kind: 'off' });
  });
});

// ── 6 + 7 — sign-out ─────────────────────────────────────────────────────────────────────────

describe('R-066 — sign-out clears it, and does NOT take the link down with it', () => {
  async function signedIn(bridge: FakeBridge): Promise<WebSocketRuntime> {
    seedSession(storage, 'jwt-held-by-this-console');
    bridge.capabilities = playoutCapabilities();
    bridge.authAnswer = { kind: 'accept', principal: principalNamed('مریم قاسمی') };
    const runtime = start(bridge);
    bridge.socket().open();
    await settle();
    expect(runtime.auth.state().kind, 'the fixture did not reach signed-in').toBe('signed-in');
    return runtime;
  }

  it('🔴 clears the persisted key, asks the bridge, and reports signed-out', async () => {
    const bridge = new FakeBridge();
    const runtime = await signedIn(bridge);
    // The "before" reading, so the assertion below is about a CHANGE and not about a key that
    // was never written.
    expect(storage.getItem(SESSION_KEY)).toContain('jwt-held-by-this-console');

    await runtime.auth.signOut();
    await settle();

    expect(storage.getItem(SESSION_KEY), 'the token outlived the sign-out').toBeNull();
    expect(requestedChannelsOn(bridge.socket())).toContain(ipc.AuthSignOutChannel.name);
    expect(runtime.auth.state()).toEqual({ kind: 'signed-out' });
  });

  it('🔴 the SAME socket stays up — a fresh socket would read as a link failure', async () => {
    /*
      A new socket has no principal by construction, so reconnecting WOULD sign the bridge out.
      It was rejected as the mechanism because it takes this console's live state down with it:
      the operator presses sign-out and the console reports a dropped link, which is a different
      fact about a different thing. `auth.sign-out` is the one route that says what happened.
    */
    const bridge = new FakeBridge();
    const runtime = await signedIn(bridge);

    await runtime.auth.signOut();
    await settle();

    expect(bridge.sockets.length, 'signing out opened a second socket').toBe(1);
    expect(bridge.socket(0).closeCalls, 'signing out closed the socket').toBe(0);
    // The second instrument on the same claim: a close would have reached `#onDown` and flipped
    // the link. It did not, so the console is still live and still holding its state.
    expect(runtime.link.status()).toBe('live');

    /*
      ⭐ POSITIVE CONTROL for both readings above. `closeCalls` and the link status are only
      evidence if a close would actually move them — a counter nothing ever increments reads
      exactly like a socket nothing ever closed. Disposing the runtime closes it for real.
    */
    runtime.dispose();
    expect(bridge.socket(0).closeCalls).toBe(1);
  });

  it('a bridge that REFUSES the sign-out still clears this console', async () => {
    const bridge = new FakeBridge();
    const runtime = await signedIn(bridge);
    bridge.signOutAnswer = { kind: 'error', message: 'the bridge did not like it' };

    await runtime.auth.signOut();
    await settle();

    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(runtime.auth.state()).toEqual({ kind: 'signed-out' });
    // It was ASKED — the clearing is not the runtime skipping the round trip.
    expect(requestedChannelsOn(bridge.socket())).toContain(ipc.AuthSignOutChannel.name);
  });

  it('a bridge that never ANSWERS the sign-out clears it before the round trip even fails', async () => {
    /*
      The other failure shape, and the one that takes eight seconds to become visible: a bridge
      that is up and silent. The token is gone from storage the moment the operator asks — what
      must never happen is a console that looks signed in because a round trip is outstanding.
    */
    const bridge = new FakeBridge();
    const runtime = await signedIn(bridge);
    bridge.signOutAnswer = { kind: 'silent' };

    const signingOut = runtime.auth.signOut();
    expect(storage.getItem(SESSION_KEY), 'storage waited on the bridge').toBeNull();

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await signingOut;
    await settle();

    expect(runtime.auth.state()).toEqual({ kind: 'signed-out' });
  });
});

// ── 8 — a refused token ──────────────────────────────────────────────────────────────────────

describe('R-066 — a token the bridge refuses leaves the console signed out, not broken', () => {
  it('🔴 an error answer to the `auth` frame reports signed-out and never crashes the pump', async () => {
    seedSession(storage, 'jwt-the-bridge-will-not-verify');
    const bridge = new FakeBridge();
    bridge.capabilities = playoutCapabilities();
    bridge.authAnswer = { kind: 'refuse', message: ipc.AUTH_TOKEN_INVALID };

    const runtime = start(bridge);
    bridge.socket().open();
    await settle();

    expect(runtime.auth.state()).toEqual({ kind: 'signed-out' });
    expect(runtime.link.status(), 'a refused sign-in is not a dropped link').toBe('live');
    /*
      `B-152` — a throw inside the socket's `message` listener does not reject a promise, it
      escapes as an uncaught exception and the caller hangs. `FakeSocket` records one; this
      asserts there was none, and the spec below proves that recorder is live.
    */
    expect(bridge.socket().listenerErrors).toEqual([]);

    /*
      …and the pump is not merely un-crashed but still CARRYING traffic: this resolves only
      because a response frame was received and routed. With a dead pump it would sit until the
      8-second timeout, which no timer here advances — so the test would fail rather than pass
      for the wrong reason.
    */
    await runtime.auth.signOut();
    expect(requestedChannelsOn(bridge.socket())).toContain(ipc.AuthSignOutChannel.name);
  });

  it('…and `listenerErrors` really does record a throw — the control for the line above', () => {
    /*
      Without this, `listenerErrors` being empty is satisfied by a recorder that can never
      record anything, which is the shape of a vacuous assertion.
    */
    const socket = new FakeSocket(() => null);
    socket.addEventListener('message', () => {
      throw new Error('a listener that throws');
    });
    socket.deliver({ type: 'publish', channel: 'stack.state-changed', payload: [] });
    expect(socket.listenerErrors.length).toBe(1);
  });
});
