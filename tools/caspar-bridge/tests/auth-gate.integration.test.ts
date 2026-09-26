import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_REQUIRED_REFUSAL,
  CHECK_BEFORE_SIGN_IN_REFUSAL,
  capabilitiesAuthMode,
  type ConnectionCheckResult,
} from '@cg/shared-ipc';
import {
  buildRoutes,
  createBridge,
  openToUnauthenticated,
  realProbes,
  refusedByAuth,
  refusedWhileLocked,
  type BridgeHandle,
  type CheckProbes,
} from '../src/index.js';
import { SIGN_IN_NOTE_MAX, SIGN_IN_NOTES_PER_MINUTE, signInFailureLine } from '../src/bridge.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { TEST_LAYER_POLICY } from './support/harness.js';
import type { FakePlayout } from './support/fake-playout.js';
import {
  deadConnection,
  expectRefusedWith,
  openClient,
  startAuthedBridge,
} from './support/auth-harness.js';

/**
 * 🔴 `C-037` acceptance 1 — **WHEN auth is ON and a socket sends no `auth` frame THEN only
 * `bridge.capabilities` and the `auth.*` channels answer; everything else is refused with the
 * one sentence and nothing is sent to CasparCG.**
 *
 * …and `C-037` acceptance 7's second clause — **`bridge.capabilities` says so.**
 *
 * ── RED BEFORE, GREEN AFTER ─────────────────────────────────────────────────
 *
 * Every spec in this file was red before the change and for the strongest possible reason:
 * there was no `auth` mode, no `auth` frame and no gate. `wss.on('connection', …)` served
 * every socket that arrived, and `ws-frame.ts` said so in as many words — _"the control socket
 * is unauthenticated loopback"_.
 */

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

describe('C-037 §1 — an unauthenticated socket gets two answers, not every answer', () => {
  it('🔴 THE BUG: `stack.take` is REFUSED on a socket that has not signed in', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const res = await client.ask('a', 'stack.take', { itemId: 'nope' });
    expectRefusedWith(
      res.error,
      AUTH_REQUIRED_REFUSAL,
      'an unauthenticated bridge accepted a take',
    );
  });

  it('the two open doors ANSWER — capabilities and `auth.*`, on the same unsigned socket', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    /*
      The POSITIVE CONTROL for the spec above. Without it a refusal could mean the channel is
      unrouted, the socket is broken, or the bridge never started — and the test would pass for
      three reasons that have nothing to do with a gate.
    */
    const caps = await client.ask('c', 'bridge.capabilities', {});
    expect(caps.error, 'bridge.capabilities must answer an unsigned socket').toBeUndefined();
    expect(capabilitiesAuthMode(caps.payload as { auth?: 'off' | 'playout' })).toBe('playout');

    const state = await client.ask('s', 'auth.state', undefined);
    expect(state.error, 'auth.state must answer an unsigned socket').toBeUndefined();
    expect(state.payload).toEqual({
      mode: 'playout',
      principal: null,
      status: 'absent',
      // `C-038` — nothing is signed in, so no channel is permitted.
      permittedChannels: [],
    });

    const out = await client.ask('o', 'auth.sign-out', undefined);
    expect(out.error, 'auth.sign-out must answer an unsigned socket').toBeUndefined();
  });

  it('capabilities carries the SIGN-IN ADDRESS, so the console never has to guess it', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const caps = (await client.ask('c', 'bridge.capabilities', {})).payload as {
      signInUrl?: string;
      refreshUrl?: string;
      authContractVersion?: string;
    };
    expect(caps.signInUrl).toBe(playout.tokenUrl);
    expect(caps.refreshUrl).toBe(playout.refreshUrl);
    expect(caps.authContractVersion).toBe('1.1');
  });

  it('a bridge with auth OFF says `off`, and carries no sign-in address at all', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);

    const caps = (await client.ask('c', 'bridge.capabilities', {})).payload as Record<
      string,
      unknown
    >;
    expect(capabilitiesAuthMode(caps as { auth?: 'off' | 'playout' })).toBe('off');
    expect(caps['auth']).toBe('off');
    /*
      ⚠ ABSENT, not empty-string. A console reading `signInUrl: ''` would have to decide what
      an empty address means; an absent one has one meaning and the optional type says it.
    */
    expect(caps['signInUrl']).toBeUndefined();
    expect(caps['refreshUrl']).toBeUndefined();
  });

  it('🔴 no PUBLISH reaches a socket that has not signed in — the second door', async () => {
    /*
      `wirePublishes` subscribed every socket to stack state, health, the lock and the ledger
      the instant it connected, BEFORE a frame was read. A request-level gate does not touch
      that path, so without this the socket would be refused every command and still be told
      everything — and ADR 0010 rule 4 says a never-authenticated socket gets the two doors and
      "nothing else".

      The provocation is `lock.engage`, because it is (a) refused to this socket, so the
      publish cannot come from this client's own action, and (b) driven directly on the runtime
      so a publish genuinely fires.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    handle.runtime.engage('1234');
    await new Promise((r) => setTimeout(r, 120));

    expect(
      client.publishes().map((f) => (f.type === 'publish' ? f.channel : '')),
      'an unsigned socket was sent state it is not entitled to',
    ).toEqual([]);
  });

  it('…and the same publish DOES reach a socket with auth OFF — the positive control', async () => {
    /*
      Without this the spec above passes on a bridge that publishes nothing at all, which is
      the vacuous shape this repo keeps meeting. Same provocation, same wait, auth off.
    */
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);

    handle.runtime.engage('1234');
    await new Promise((r) => setTimeout(r, 120));

    expect(
      client.publishes().map((f) => (f.type === 'publish' ? f.channel : '')),
      'the instrument is dead — no publish fires even with auth off',
    ).toContain('lock.state-changed');
  });
});

/*
  🔴 `DELTA-MULTI-CHANNEL-01-B` B1 — **THE CHECK RUNS BEFORE A SIGN-IN.** The owner, 2026-09-26, on
  `pnpm dev:station` with the Playout down: Check showed no line at all, only "This console is not
  signed in, so that command was refused — nothing was sent to CasparCG." The check is how a console
  learns whether a sign-in CAN work, so it answers before one — for this station's Playout only.
*/
describe('DELTA-MULTI-CHANNEL-01-B B1 — the check answers before any sign-in, for this station', () => {
  /** The network probes are real; the Windows-only readers are pinned (`connection-check.test.ts`). */
  const quietProbes = (): CheckProbes => ({
    ...realProbes(),
    processes: async () => [],
    systemProxy: async () => null,
    portHolder: async () => ({ kind: 'free' }),
    localAddresses: () => [],
    resolve: async (host) => [host],
  });
  const CONSOLE = 'http://127.0.0.1:5174';

  it('🔴 the Playout DOWN and nobody signed in: Check answers with its lines, not a refusal; control: a take on the same socket is still refused', async () => {
    const started = await startAuthedBridge({ connectionCheckProbes: quietProbes() });
    handle = started.handle;
    const origin = new URL(started.playout.tokenUrl).origin;
    await started.playout.stop(); // the Playout is down
    const client = await openClient(handle);

    const res = await client.ask('k', 'setup.check', { playoutAddress: origin, origin: CONSOLE });
    expect(res.error, 'the check was refused before a sign-in').toBeUndefined();
    const lines = (res.payload as ConnectionCheckResult).lines;
    // The Playout's API line says what did not answer; CORS is not checked — it needs the API.
    expect(lines.find((l) => l.id === 'api')?.status).toBe('fail');
    expect(lines.find((l) => l.id === 'api')?.text).toContain('127.0.0.1');
    expect(lines.find((l) => l.id === 'cors')?.status).toBe('skip');

    // CONTROL — the door is the check's alone: a station command on the same socket is refused.
    const take = await client.ask('t', 'stack.take', { itemId: 'nope' });
    expectRefusedWith(take.error, AUTH_REQUIRED_REFUSAL, 'an unsigned take was accepted');
  });

  it('before a sign-in it checks THIS station only — another address, or a named CasparCG host, is refused; control: with auth OFF another address is checked', async () => {
    const started = await startAuthedBridge({ connectionCheckProbes: quietProbes() });
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);
    const origin = new URL(started.playout.tokenUrl).origin;

    const other = await client.ask('x', 'setup.check', {
      playoutAddress: 'http://127.0.0.1:1',
      origin: CONSOLE,
    });
    expectRefusedWith(
      other.error,
      CHECK_BEFORE_SIGN_IN_REFUSAL,
      'an unsigned check probed elsewhere',
    );
    const named = await client.ask('y', 'setup.check', {
      playoutAddress: origin,
      casparHost: '127.0.0.1',
      origin: CONSOLE,
    });
    expectRefusedWith(named.error, CHECK_BEFORE_SIGN_IN_REFUSAL, 'an unsigned check named a host');

    // CONTROL — the narrowing is the unsigned door's, not the check's: with auth OFF (first-run's
    // `target` phase, where an address is still being typed) any address is checked.
    await handle.close();
    handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      connectionCheckProbes: quietProbes(),
    });
    const open = await openClient(handle);
    const typed = await open.ask('z', 'setup.check', {
      playoutAddress: 'http://127.0.0.1:1',
      origin: CONSOLE,
    });
    expect(typed.error, 'with auth OFF the check was refused').toBeUndefined();
  });
});

/*
  🔴 `DELTA-MULTI-CHANNEL-01-B` B3 — **THE PLAYOUT'S ANSWER TO A FAILED SIGN-IN REACHES THE LOG.**
  The sign-in is browser → Playout; the console shows its own English sentence for the code and
  hands the Playout's own answer to the bridge, which writes ONE line — untrusted text, so it can
  never forge a second line, and a flood cannot fill the log.
*/
describe('DELTA-MULTI-CHANNEL-01-B B3 — a failed sign-in, as the Playout answered it, in the log', () => {
  it('🔴 an unsigned socket’s note is ONE log line carrying the Playout’s own words; control: nothing is written without one', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const written: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      const client = await openClient(handle);
      // CONTROL — the socket is live and nothing about a sign-in has been written yet.
      await client.ask('c', 'bridge.capabilities', {});
      expect(written.filter((l) => l.includes('sign-in refused'))).toEqual([]);

      const note = await client.ask('n', 'auth.sign-in-failure', {
        code: 'invalid_credentials',
        status: 401,
        body: '{"error":"invalid_credentials","message":"نام کاربری یا رمز عبور اشتباه است"}',
      });
      expect(note.error, 'the note was refused before a sign-in').toBeUndefined();
      const lines = written.filter((l) => l.includes('sign-in refused by the Playout'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('invalid_credentials (HTTP 401)');
      expect(lines[0]).toContain('نام کاربری یا رمز عبور اشتباه است');
    } finally {
      spy.mockRestore();
    }
  });

  it('the text is untrusted: a line break cannot forge a second log line, and it is cut short', () => {
    const forged = signInFailureLine({
      code: 'unexpected',
      status: 500,
      body: `boom\n[caspar-bridge] auth: OFF — forged\r\n${'x'.repeat(2000)}`,
    });
    expect(forged.split('\n')).toHaveLength(1);
    const control = [...forged].filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp < 0x20 || cp === 0x7f;
    });
    expect(control, 'a control character reached the log line').toEqual([]);
    expect(forged.length).toBeLessThan(SIGN_IN_NOTE_MAX + 120);
    // A Playout that did not answer has no body to quote — and says so plainly.
    expect(signInFailureLine({ code: 'unreachable', status: null, body: '' })).toBe(
      '[caspar-bridge] sign-in: the Playout did not answer (unreachable)',
    );
  });

  it('a flood of notes cannot fill the log — at most SIGN_IN_NOTES_PER_MINUTE lines a minute', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const written: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      const client = await openClient(handle);
      for (let i = 0; i < SIGN_IN_NOTES_PER_MINUTE + 5; i++) {
        const res = await client.ask(`n${String(i)}`, 'auth.sign-in-failure', {
          code: 'rate_limited',
          status: 429,
          body: '',
        });
        expect(res.error).toBeUndefined();
      }
      expect(written.filter((l) => l.includes('sign-in refused by the Playout'))).toHaveLength(
        SIGN_IN_NOTES_PER_MINUTE,
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('C-037 §1 — THE CENSUS: every route, not a sample', () => {
  /**
   * 🔴 **THE CENSUS, in `refusedWhileLocked`'s own shape and for its own reason.**
   *
   * The specs above press three channels. "Everything else is refused" is a claim about all
   * sixty, and three cannot make it: the channel that gets forgotten is by definition the one
   * nobody wrote a spec for. So this walks the route table itself.
   *
   * It pins the EXEMPTIONS BY NAME rather than counting them. A count would pass when a new
   * channel took an exemption and an old one lost it — the swap most likely to happen and the
   * hardest to see in a diff. A route reachable unauthenticated now fails HERE, with the
   * channel named, and the fix is to reclassify it or to add it to this list deliberately,
   * which is a decision with a diff rather than an omission.
   */
  it('only `bridge.capabilities`, `auth.*` and the connection check are reachable with NO principal', () => {
    const runtime = new CasparRuntime(deadConnection(), {}, { layerPolicy: TEST_LAYER_POLICY });
    const routes = buildRoutes(runtime);
    expect(routes.size, 'the census is looking at the real table').toBeGreaterThan(50);

    const reachable = [...routes.entries()]
      .filter(([, r]) => !refusedByAuth(r, 'absent'))
      .map(([name]) => name)
      .sort();

    // `DELTA-MULTI-CHANNEL-01-B` B1 — `setup.check` joined the door deliberately: it is how a
    // console learns whether a sign-in can work, and before one it checks this station only.
    // B3 — `auth.sign-in-failure` is `auth.*`, the sign-in's own door: the Playout's answer to a
    // failed sign-in, for the log — and it is only ever sent before a sign-in.
    expect(reachable).toEqual([
      'auth.sign-in-failure',
      'auth.sign-out',
      'auth.state',
      'bridge.capabilities',
      'setup.check',
    ]);
  });

  it('🔴 an EXPIRED session keeps every READ and NOTHING ELSE — not even the resync', () => {
    /*
      `C-037` acceptance 4's carve-out, censused rather than sampled. The two classes that stay
      reachable are the ones whose `LockPolicy` already says they answer a question
      (`read`) or belong to the client's own reconnect machinery (`resync`) — see
      `refusedByAuth`'s note for why reading `LockPolicy` here is not a re-derivation.

      ⚠ `lock.release` is deliberately NOT in the list. It is an operator act, and an expired
      session's way out is to sign in — after which unlocking works. Neither gate strands
      anybody.
    */
    const runtime = new CasparRuntime(deadConnection(), {}, { layerPolicy: TEST_LAYER_POLICY });
    const routes = buildRoutes(runtime);

    const reachable = [...routes.entries()]
      .filter(([, r]) => !refusedByAuth(r, 'invalid'))
      .map(([name]) => name);

    expect(reachable).toContain('stack.snapshot');
    expect(reachable).toContain('auth.state');
    expect(reachable).toContain('auth.sign-out');
    expect(reachable).not.toContain('stack.take');
    expect(reachable).not.toContain('stack.clear-all');
    expect(reachable).not.toContain('lock.release');
    /*
      🔴 **`stack.restore` IS REFUSED, and this assertion used to say the opposite.**

      The first spelling let `resync` through for the same reason the LOCK does, and the lock's
      justification does not transfer. The lock exempts it because it is "unreachable from any
      operator control" — an argument about WHO can trigger it. Auth asks whether this
      principal may change anything, and `stack.restore` is not a read: it seeds the
      reconciler, publishes a new stack to every console, and parks items that reach `CG ADD`
      on the wire. A principal the bridge has stopped accepting must not put anything on air,
      whichever door it came through.

      Nobody is stranded — the console is refused its restore, shows its sign-in, and restores
      once it has signed in again.
    */
    expect(reachable, 'an invalid principal can still drive a restore onto the wire').not.toContain(
      'stack.restore',
    );
    /*
      …and the CONTROL for that negative: `stack.restore` IS reachable while merely LOCKED, so
      the assertion above is measuring the auth gate rather than a route that is refused to
      everybody.
    */
    const whileLocked = [...routes.entries()]
      .filter(([, r]) => !refusedWhileLocked(r, {}))
      .map(([name]) => name);
    expect(whileLocked, 'the control is dead — the route is refused everywhere').toContain(
      'stack.restore',
    );
  });

  it('auth OFF refuses NOTHING — the byte-identity claim, over the whole table', () => {
    const runtime = new CasparRuntime(deadConnection(), {}, { layerPolicy: TEST_LAYER_POLICY });
    const routes = buildRoutes(runtime);
    const refused = [...routes.entries()]
      .filter(([, r]) => refusedByAuth(r, 'off'))
      .map(([name]) => name);
    expect(refused).toEqual([]);
  });

  it('the open-door predicate names the door by NAMESPACE, so a new `auth.*` route inherits it', () => {
    expect(openToUnauthenticated('bridge.capabilities')).toBe(true);
    expect(openToUnauthenticated('auth.state')).toBe(true);
    expect(openToUnauthenticated('auth.sign-out')).toBe(true);
    // The two shapes that must NOT be mistaken for the door.
    expect(openToUnauthenticated('stack.take')).toBe(false);
    expect(openToUnauthenticated('authoring.something')).toBe(false);
    // B1 — the check by NAME, and not its `setup.*` neighbours.
    expect(openToUnauthenticated('setup.check')).toBe(true);
    expect(openToUnauthenticated('setup.route-address')).toBe(false);
    expect(openToUnauthenticated('setup.channel-occupancy')).toBe(false);
  });
});

describe('C-037 — the frames BEHIND an `auth` frame wait for it, they are not refused', () => {
  /**
   * 🔴 **THE RECONNECT DEFECT, and nothing covered it until a review found it.**
   *
   * `socket.on('message', …)` dispatches every frame with `void handleMessage(…)`. Nothing
   * serializes them, and `handleAuthFrame` SUSPENDS at `await verify()` — which may fetch a
   * JWKS over the network. The console writes its `auth` frame and then, in the SAME TICK, its
   * whole resync: every retained template and the stack restore.
   *
   * So every one of those frames used to be gated while the principal was still being
   * verified, every one was refused, and a reconnected console came back with an empty library
   * and no stack. The frame ORDER was chosen precisely to avoid that, and ordering alone could
   * not deliver it.
   */
  it('🔴 a request written in the SAME TICK as the `auth` frame is served, not refused', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const issued = await playout.issueToken();

    /*
      Both frames go out back to back with NO await between them — which is exactly what
      `WebSocketRuntime.#connect`'s open handler does: `void #presentToken()` then
      `void #resync()`, neither awaited.
    */
    const authReply = client.authenticate('a', issued.token);
    const behind = client.ask('b', 'stack.snapshot', undefined);

    const [auth, snapshot] = await Promise.all([authReply, behind]);
    expect(auth.error, 'the sign-in itself failed, so this proves nothing').toBeUndefined();
    expect(
      snapshot.error,
      'the frame behind the sign-in was judged before the principal was seated',
    ).toBeUndefined();
  });

  it('…and a frame behind a REFUSED sign-in is still answered — the gate never hangs', async () => {
    /*
      The control for the deferral: a tracker left latched by a FAILED verification would
      deadlock every later frame on that socket, which is worse than refusing them, because a
      gate that fails closed by hanging says nothing at all. Here the sign-in is refused and
      the frame behind it must still get its refusal, promptly.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const bad = await playout.issueToken({ issuer: 'http://elsewhere.invalid' });
    const authReply = client.authenticate('a', bad.token);
    const behind = client.ask('b', 'stack.take', { itemId: 'nope' });

    const [auth, take] = await Promise.all([authReply, behind]);
    expect(typeof auth.error, 'the token should have been refused').toBe('string');
    expectRefusedWith(take.error, AUTH_REQUIRED_REFUSAL, 'the frame behind a refused sign-in');
  });
});

describe('C-037 — `auth.state` answers with THE GATE VERDICT, never a second one', () => {
  /**
   * 🔴 **THE DEFECT THIS PINS WAS MEASURED, NOT IMAGINED.**
   *
   * `auth.state` first reported `session.token.principal` directly. With intents already
   * refused for an expired token, the same socket's read still answered a FULL PRINCIPAL — so
   * a console would have said _signed in as ‹name›_ while every verb said _you are not signed
   * in_. A surface claiming a state the system does not hold is the defect class this whole
   * change exists to remove, and a second derivation of "signed in" is how it got in.
   *
   * Golden rule 6, in one spec: the request gate and this read ask ONE predicate.
   */
  it('🔴 an EXPIRED session reads `invalid` here, while still naming WHOSE it was', async () => {
    let clock = Date.now();
    const started = await startAuthedBridge({ playoutAuthOptions: { now: () => clock } });
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const issued = await playout.issueToken({ expEpochSec: Math.floor(clock / 1000) + 3600 });
    const signedIn = await client.authenticate('a', issued.token);
    expect(signedIn.error).toBeUndefined();

    // The positive control: while it holds, the read says so.
    const live = (await client.ask('s1', 'auth.state', undefined)).payload as {
      status: string;
      principal: { name: string } | null;
    };
    expect(live.status).toBe('signed-in');
    expect(live.principal?.name).toBeTruthy();

    // Past `exp` AND past the ±60 s tolerance.
    clock += 3600_000 + 120_000;

    const refused = await client.ask('t', 'stack.take', { itemId: 'nope' });
    expectRefusedWith(refused.error, AUTH_REQUIRED_REFUSAL, 'an expired session drove a verb');

    const after = (await client.ask('s2', 'auth.state', undefined)).payload as {
      status: string;
      principal: { name: string } | null;
    };
    expect(after.status, 'the read disagreed with the gate that refused the verb').toBe('invalid');
    /*
      ⭐ …and the principal is STILL reported. The surface has to be able to say WHOSE session
      ended — "signed out" and "your session ended" send the operator to the same control by
      two different routes, and only the second explains why the console stopped working.
    */
    expect(after.principal?.name, 'an expired session forgot whose it was').toBe(
      live.principal?.name,
    );
  });

  it('a bridge with auth OFF reads `off`, and holds no principal to report', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);
    expect((await client.ask('s', 'auth.state', undefined)).payload).toEqual({
      mode: 'off',
      principal: null,
      status: 'off',
      // `C-038` — auth off scopes nothing; every control stays reachable.
      permittedChannels: [],
    });
  });
});

describe('C-037 — the refusal is ONE exported constant, written for an operator', () => {
  it('names the state, the remedy and that nothing was done — and is not a SKEW shape', () => {
    /*
      The `R-017` discipline and `B-152`'s constraint together, asserted exactly as
      `LOCK_ENGAGED_REFUSAL`'s own spec asserts them. A refusal worded like one of the three
      skew shapes would reach the operator as "restart the bridge" (`bridgeErrorFrom` rewrites
      those and passes everything else through verbatim).
    */
    expect(typeof AUTH_REQUIRED_REFUSAL).toBe('string');
    expect(AUTH_REQUIRED_REFUSAL).not.toMatch(/^(unknown channel|invalid (request|response) for)/i);
    expect(AUTH_REQUIRED_REFUSAL.toLowerCase()).toContain('signed in');
    expect(AUTH_REQUIRED_REFUSAL.toLowerCase()).toContain('sign in');
    expect(AUTH_REQUIRED_REFUSAL.toLowerCase()).toContain('nothing was done');
    // `DELTA-MULTI-CHANNEL-01-B` B1 — it answers every channel, so it names nothing it cannot
    // know is involved: a refused connection check was never going to CasparCG.
    expect(AUTH_REQUIRED_REFUSAL).not.toContain('CasparCG');
    // No channel name and no code: the operator is looking at a sign-in screen.
    expect(AUTH_REQUIRED_REFUSAL).not.toContain('stack.take');
    expect(AUTH_REQUIRED_REFUSAL).not.toContain('auth.');
  });
});
