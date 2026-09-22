import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_REQUIRED_REFUSAL, capabilitiesAuthMode } from '@cg/shared-ipc';
import {
  buildRoutes,
  createBridge,
  openToUnauthenticated,
  refusedByAuth,
  type BridgeHandle,
} from '../src/index.js';
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
    expect(state.payload).toEqual({ mode: 'playout', principal: null });

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
  it('only `bridge.capabilities` and `auth.*` are reachable with NO principal', () => {
    const runtime = new CasparRuntime(deadConnection(), {}, { layerPolicy: TEST_LAYER_POLICY });
    const routes = buildRoutes(runtime);
    expect(routes.size, 'the census is looking at the real table').toBeGreaterThan(50);

    const reachable = [...routes.entries()]
      .filter(([, r]) => !refusedByAuth(r, 'absent'))
      .map(([name]) => name)
      .sort();

    expect(reachable).toEqual(['auth.sign-out', 'auth.state', 'bridge.capabilities']);
  });

  it('an EXPIRED session keeps every READ and every resync, and no intent', () => {
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
    expect(reachable).toContain('stack.restore');
    expect(reachable).toContain('auth.state');
    expect(reachable).toContain('auth.sign-out');
    expect(reachable).not.toContain('stack.take');
    expect(reachable).not.toContain('stack.clear-all');
    expect(reachable).not.toContain('lock.release');
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
  });
});

describe('C-037 — the refusal is ONE exported constant, written for an operator', () => {
  it('names the state, the remedy and that nothing was sent — and is not a SKEW shape', () => {
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
    expect(AUTH_REQUIRED_REFUSAL.toLowerCase()).toContain('nothing was sent');
    // No channel name and no code: the operator is looking at a sign-in screen.
    expect(AUTH_REQUIRED_REFUSAL).not.toContain('stack.take');
    expect(AUTH_REQUIRED_REFUSAL).not.toContain('auth.');
  });
});
