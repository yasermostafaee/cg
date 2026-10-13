import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_REQUIRED_REFUSAL,
  AUTH_TOKEN_INVALID,
  type AuthState,
  type WsFrame,
} from '@cg/shared-ipc';
import type { BridgeHandle } from '../src/index.js';
import { FAKE_OPERATOR, type FakePlayout } from './support/fake-playout.js';
import { expectRefusedWith, openClient, startAuthedBridge } from './support/auth-harness.js';

/**
 * 🔴 `C-037` acceptance — **WHEN the Playout is unreachable THEN already-verified tokens keep
 * working to expiry and a new sign-in fails with a sentence naming the Playout.**
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 *
 * Every other auth spec asks whether the gate refuses the right things. This one asks the
 * opposite question, and it is the one the STATION cares about: **an HTTP service being down
 * must not take a console off the air.** ADR 0010 rule 1's offline verification and the
 * contract's 12 h access-token lifetime exist for exactly this hour, and neither is worth
 * anything unless something measures it.
 *
 * ── RED BEFORE, GREEN AFTER ─────────────────────────────────────────────────
 *
 * Red before this change for the strongest possible reason, the same one
 * `auth-gate.integration.test.ts` records: there was no `auth` frame, no `PlayoutAuth` and no
 * gate, so `startAuthedBridge()` had nothing to start and this file could not compile. Green
 * against the change as it stands.
 *
 * ── WHAT IS MEASURED HERE AND WHAT IS NOT ───────────────────────────────────
 *
 * The BROWSER half of the acceptance bullet — the sentence NAMING the Playout, shown when a
 * NEW sign-in cannot reach it — is not observable here and is not asserted here. The console
 * POSTs its username and password to the Playout DIRECTLY (ADR 0010 rule 9); the bridge never
 * sees a sign-in attempt, only the token that came out of one. That sentence is the Runtime's
 * `signInMessages.ts` `unreachable` copy and is pinned by the Runtime's own dom spec. What is
 * measured HERE is the bridge's half: a token minted by a key the bridge cannot look up is
 * refused with {@link AUTH_TOKEN_INVALID}, promptly, rather than hanging a socket on a dead
 * HTTP port.
 */

/**
 * The verb every spec in this file drives, and it is an **operator INTENT**, never a read.
 *
 * ⚠ That choice is load-bearing. `refusedByAuth` lets `read` and `resync` routes through in
 * the EXPIRED state as well as the signed-in one, so a read answering would be consistent with
 * the session having quietly fallen to `invalid` — precisely the failure this file is here to
 * detect. An `operator` route answers in ONE gate state, so its answer names that state.
 *
 * `air.dismiss-emptied` is the harmless one: `dismissEmptiedAir()` touches nothing on the wire
 * (its own docblock says so) and answers `{ ok: false }` when there is no notice to dismiss.
 * `ok: false` is the expected value, and it is not a refusal — it is the handler having RUN.
 */
const OPERATOR_VERB = 'air.dismiss-emptied';

/**
 * What "did not hang" means as a number.
 *
 * `HTTP_TIMEOUT_MS` in `playout-auth.ts` is 5 s and `jose`'s own `timeoutDuration` is set to
 * the same, so a bridge that WAITED on the dead port would answer at ~5 s or not at all. This
 * bound is comfortably under that and far under the file's own 45 s test timeout, while
 * staying loose enough for a contended fork (B-098) not to fail an innocent suite.
 */
const PROMPT_REPLY_MS = 2000;

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

/** Every refusal this socket has been sent, as sentences — for "and nothing was refused". */
function refusalsSeen(frames: readonly WsFrame[]): string[] {
  return frames.flatMap((f) =>
    f.type === 'response' && f.error !== undefined ? [f.error.message] : [],
  );
}

describe('C-037 — a Playout outage does not sign anybody out', () => {
  it('🔴 a VERIFIED token keeps driving intents after the Playout goes away', async () => {
    /*
      🔴 THIS IS THE ENTIRE POINT OF OFFLINE VERIFICATION AND OF THE 12 h TOKEN LIFETIME.

      The signature already proved who this is; the Playout has nothing left to say about it
      until `exp`. A bridge that asked the Playout again — at gate time, on a reconnect, on a
      timer — would put an HTTP service in the path to air, and a station would go dark because
      a web server was restarted. That is the coupling ADR 0010 rule 1 exists to remove, and
      this spec is what stops it being re-introduced by somebody who thinks a liveness check is
      free.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const issued = await playout.issueToken();
    const signIn = await client.authenticate('in', issued.token);
    expect(
      signIn.error,
      'the fixture could not even sign in while the Playout was UP',
    ).toBeUndefined();

    /*
      POSITIVE CONTROL 1 — the verb answers WHILE SIGNED IN, with the handler's own payload.
      Without it "it still works offline" could pass on a channel that was never gated, never
      routed, or answering an error the assertion did not look at.
    */
    const before = await client.ask('v1', OPERATOR_VERB, undefined);
    expect(
      before.error,
      'the verb was refused BEFORE the outage — the instrument is wrong',
    ).toBeUndefined();
    expect(before.payload).toEqual({ ok: false });

    await playout.goOffline();

    // The same socket, the same verb, with the issuer unreachable.
    const after = await client.ask('v2', OPERATOR_VERB, undefined);
    expect(
      after.error,
      'a Playout outage refused an intent from an already-verified socket',
    ).toBeUndefined();
    expect(after.payload).toEqual({ ok: false });

    // …and the bridge still reports WHO is on the socket, not a blank.
    const state = (await client.ask('s', 'auth.state', undefined)).payload as AuthState;
    expect(state.mode).toBe('playout');
    expect(state.principal?.sub).toBe(FAKE_OPERATOR.sub);
    expect(state.principal?.name).toBe(FAKE_OPERATOR.name);

    /*
      POSITIVE CONTROL 2 — the gate is STILL LIVE during the outage.

      "Nothing was refused" is a negative observation, and on its own it is satisfied by a
      bridge whose gate has fallen off entirely. A second socket that never signed in is
      refused the same verb at the same moment, so the silence above is the gate saying yes,
      not the gate being gone.
    */
    const stranger = await openClient(handle);
    const strangerRes = await stranger.ask('v3', OPERATOR_VERB, undefined);
    expectRefusedWith(
      strangerRes.error,
      AUTH_REQUIRED_REFUSAL,
      'the gate stopped refusing while the Playout was down',
    );

    expect(refusalsSeen(client.frames), 'the verified socket was refused something').toEqual([]);
  });

  it('a SECOND socket signs in with a pre-minted token while the Playout is down — the JWKS is cached', async () => {
    /*
      The key set is fetched once and cached for the contract's own `max-age` (1 h), by the ONE
      `PlayoutAuth` the whole bridge process shares. So a console that opens a second tab — or
      reconnects after a dropped socket — during the outage can still present a token it
      already holds, and the bridge can still check the signature, because checking it needs a
      PUBLIC KEY and not a conversation.

      MEASURED, not assumed: the `jwks` counter goes 0 → 1 on the first sign-in and then does
      NOT move for the second. The 0 → 1 half is the positive control the fixture's own
      docblock demands — a counter that never moves at all would satisfy "did not move" having
      measured nothing.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;

    expect(playout.requestCounts.jwks, '`createRemoteJWKSet` is lazy: nothing fetched yet').toBe(0);

    const first = await openClient(handle);
    const firstToken = await playout.issueToken();
    const firstIn = await first.authenticate('in-1', firstToken.token);
    expect(firstIn.error, 'the first sign-in failed while the Playout was UP').toBeUndefined();
    expect(playout.requestCounts.jwks, 'the JWKS was never read — the instrument is dead').toBe(1);

    // Minted BEFORE the outage, exactly as a real second tab would be holding one.
    const secondToken = await playout.issueToken();

    await playout.goOffline();

    const second = await openClient(handle);
    const secondIn = await second.authenticate('in-2', secondToken.token);
    expect(
      secondIn.error,
      'a cached JWKS did not verify a pre-minted token during the outage',
    ).toBeUndefined();
    expect((secondIn.payload as AuthState).principal?.sub).toBe(FAKE_OPERATOR.sub);

    // The verification took no network read at all.
    expect(playout.requestCounts.jwks, 'the bridge went back to the Playout to verify').toBe(1);

    // And the new socket really is signed in — an operator intent, not a read.
    const verb = await second.ask('v1', OPERATOR_VERB, undefined);
    expect(verb.error, 'the second socket verified but was not seated').toBeUndefined();
    expect(verb.payload).toEqual({ ok: false });
  });

  it('a token from an UNCACHED key is refused promptly, not hung, while the Playout is down', async () => {
    /*
      The bridge half of the acceptance bullet's second clause. `signWithRetiredKey` signs with
      a key that was NEVER published, under a `kid` that is not in the cached set, so the only
      way to accept it would be to go and ask — which is the thing that cannot be done right
      now. The requirement is that it be REFUSED, and refused at once.

      ⭐ MEASURED, and it differs from what "not hung" suggests: no network read is attempted
      on this path at all — the tail of this spec proves that with the Playout back UP and the
      counter watched. `jose`'s remote key set only re-fetches on an unknown `kid` once its
      cooldown has lapsed (`JWKS_COOLDOWN_MS`, 60 s, real time and unfakeable), and the
      sign-in above refreshed that cooldown milliseconds ago — so the refusal comes straight
      out of the cached set. The complementary path, where a fetch IS attempted and the port
      refuses it, is measured by the last spec in this file, which starts from a bridge that
      has never read the JWKS at all.

      ⚠ The browser-facing half of this same bullet — the sentence NAMING the Playout — is NOT
      here and cannot be: the console POSTs its credentials to the Playout directly (ADR 0010
      rule 9), so the bridge never sees a sign-in attempt that failed to reach it. That
      sentence is the Runtime's `signInMessages.ts` `unreachable` copy, covered by the
      Runtime's own dom spec.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;

    const good = await playout.issueToken();
    const warm = await openClient(handle);
    const warmIn = await warm.authenticate('in-1', good.token);
    expect(warmIn.error, 'the fixture could not sign in while the Playout was UP').toBeUndefined();

    await playout.goOffline();

    const client = await openClient(handle);
    const retired = await playout.issueToken({ signWithRetiredKey: true });

    const startedAt = Date.now();
    const refused = await client.authenticate('bad', retired.token);
    const elapsedMs = Date.now() - startedAt;

    expectRefusedWith(
      refused.error,
      AUTH_TOKEN_INVALID,
      'a token signed by a key the bridge cannot look up was accepted',
    );
    expect(elapsedMs, 'the bridge waited on the dead Playout instead of answering').toBeLessThan(
      PROMPT_REPLY_MS,
    );

    /*
      POSITIVE CONTROL — the refusal is about the KEY, not about the outage.

      The same socket, the same instant, the same dead Playout, a token whose `kid` IS cached:
      accepted. Without this the spec above passes on a bridge that refuses EVERY `auth` frame
      while the Playout is down — which is the exact regression the first spec in this file
      forbids, and it would read here as a pass.
    */
    const accepted = await client.authenticate('good', good.token);
    expect(
      accepted.error,
      'a cached key was refused too — the bridge is refusing on the outage, not on the key',
    ).toBeUndefined();
    expect((accepted.payload as AuthState).principal?.sub).toBe(FAKE_OPERATOR.sub);

    /*
      ⭐ WHY THE REPLY WAS PROMPT, MEASURED — with the Playout back UP so the counter can move.

      An unknown `kid` inside the 60 s cooldown is answered from the cached key set without a
      network read, which is why the outage cost nothing above. Asserting "the counter did not
      move" while the server is DOWN would measure nothing at all (no request could be served
      either way), so the Playout is brought back first and the same token re-presented: still
      refused, and the counter still 1.

      The positive control is on the NEXT line and at the same instant — a direct read of the
      JWKS from this test moves the counter to 2, so the port really is serving and a request
      really would have been counted. Negative observation, live instrument.
    */
    await playout.goOnline();
    const jwksReadsBefore = playout.requestCounts.jwks;
    const stillRefused = await client.authenticate('bad-2', retired.token);
    expectRefusedWith(
      stillRefused.error,
      AUTH_TOKEN_INVALID,
      'the never-published key became acceptable once the Playout answered again',
    );
    expect(
      playout.requestCounts.jwks,
      'the bridge re-fetched the JWKS inside its own cooldown',
    ).toBe(jwksReadsBefore);

    const probe = await fetch(playout.jwksUrl);
    expect(probe.status, 'the fake Playout is not actually serving — the check above is void').toBe(
      200,
    );
    expect(playout.requestCounts.jwks, 'the counter is dead').toBe(jwksReadsBefore + 1);
  });

  it('the bridge RECOVERS when the Playout comes back — a rotated key verifies on the same socket', async () => {
    /*
      A failure must not LATCH. This bridge has never read the JWKS (nothing has verified
      anything yet), so with the Playout down the very first verification has no cached key to
      fall back on and MUST fail — that is the complementary path to the spec above, and this
      is where the fetch is genuinely attempted and genuinely refused by the closed port.

      What matters is the next line: once the Playout answers again, a key that did not even
      exist during the outage verifies on the SAME socket, with no reconnect. The gate is read
      per request and the key set re-fetches on demand, so nothing had to be restarted.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    expect(playout.requestCounts.jwks, 'the JWKS was read before the outage began').toBe(0);

    await playout.goOffline();

    const duringOutage = await playout.issueToken();
    const startedAt = Date.now();
    const refused = await client.authenticate('down', duringOutage.token);
    const elapsedMs = Date.now() - startedAt;

    expectRefusedWith(
      refused.error,
      AUTH_TOKEN_INVALID,
      'a bridge that has never read the JWKS accepted a token it could not verify',
    );
    expect(elapsedMs, 'the bridge sat on the refused connection instead of answering').toBeLessThan(
      PROMPT_REPLY_MS,
    );

    await playout.goOnline();
    const rotated = await playout.rotateKey();
    expect(playout.activeKid, 'the fixture did not actually rotate').toBe(rotated.kid);

    const fresh = await playout.issueToken();
    const accepted = await client.authenticate('up', fresh.token);
    expect(
      accepted.error,
      'the bridge latched the outage failure — a key minted after recovery was refused',
    ).toBeUndefined();
    expect((accepted.payload as AuthState).principal?.sub).toBe(FAKE_OPERATOR.sub);

    /*
      POSITIVE CONTROL — the counter proves a read actually happened.

      0 before the outage and ≥ 1 now: the acceptance came from a key set the bridge went and
      FETCHED after the Playout returned, not from a cache that was somehow already warm. And
      the operator intent below proves the socket is seated, not merely told `mode: 'playout'`.
    */
    expect(
      playout.requestCounts.jwks,
      'the JWKS was never re-read after recovery',
    ).toBeGreaterThanOrEqual(1);

    const verb = await client.ask('v1', OPERATOR_VERB, undefined);
    expect(verb.error, 'the recovered socket verified but was not seated').toBeUndefined();
    expect(verb.payload).toEqual({ ok: false });

    /*
      ⭐ THE SHARPEST CONTROL IN THE FILE — the SAME BYTES, refused and then accepted.

      `duringOutage.token` is the token this spec opened with. It was refused while the Playout
      was unreachable and it is accepted now, unchanged, on the same socket. Nothing about the
      token was ever the reason; the outage was, and the outage is over. Presented AFTER the
      rotated-key check on purpose — that check is what makes the bridge fetch a key set
      carrying BOTH kids, and `rotateKey()` keeps the previous key published exactly as the
      contract's §3.5 rotation rule requires.
    */
    const replayed = await client.authenticate('replay', duringOutage.token);
    expect(
      replayed.error,
      'the token refused during the outage is still refused after recovery',
    ).toBeUndefined();
    expect((replayed.payload as AuthState).principal?.sub).toBe(FAKE_OPERATOR.sub);
  });
});
