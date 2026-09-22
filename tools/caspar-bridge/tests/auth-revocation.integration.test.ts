import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_REQUIRED_REFUSAL } from '@cg/shared-ipc';
import { REVOCATION_POLL_MS, type BridgeHandle } from '../src/index.js';
import type { FakePlayout } from './support/fake-playout.js';
import {
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  waitFor,
  type Client,
} from './support/auth-harness.js';

/**
 * 🔴 `C-037` acceptance — **WHEN a `jti` appears on `GET /api/cg/revoked` (D9, live) THEN
 * within 60 s NEW intents from that token are refused with the sentence, reads keep
 * answering, and an unreachable Playout leaves the bridge holding the last list it saw**
 *
 * ── WHAT DRIVES THE 60 s, AND WHY NOTHING HERE SLEEPS ───────────────────────
 *
 * The cadence is a READ OF A CLOCK, not a timer: `PlayoutAuth`'s poller compares
 * `now() - lastPoll` against {@link REVOCATION_POLL_MS} at the moment a gate check finds a
 * live principal. So the clock is INJECTED (`playoutAuthOptions.now`) and a minute passes in
 * one assignment. Nothing in this file sleeps for longer than a loopback HTTP round trip
 * takes to settle.
 *
 * ⚠ {@link REVOCATION_POLL_MS} is IMPORTED rather than spelled `60_000` here. A local copy is
 * a second place the cadence is stated, and golden rule 6's whole subject is what happens
 * when the second copy stops agreeing with the first.
 *
 * ── RED BEFORE? — SAID PRECISELY, BECAUSE THE HONEST ANSWER IS NARROW ───────
 *
 * ⚠ **NOT OBSERVED RED.** This file was written after the gate landed, so it cannot make the
 * sibling suite's claim. What is true and checkable is that it could not have COMPILED before
 * `C-037`: there was no `auth` frame, no `handle.playoutAuth`, no `pollRevokedNow` and no
 * revocation list at all.
 *
 * What stands in for a watched red is the POSITIVE CONTROL in every spec below. Each negative
 * claim here — "still refused", "the count did not move", "nothing was served" — is preceded
 * by a measurement of that same instrument MOVING, because a negative observation is void
 * until the instrument is proven live, and this file is made almost entirely of negative
 * observations.
 */

/** The verifier, with `null` spent once at {@link authorityOf} instead of at every read. */
type PlayoutAuthority = NonNullable<BridgeHandle['playoutAuth']>;

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;
/** The bridge's injected clock, in ms. Advanced by assignment; never by waiting. */
let clock = 0;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

/**
 * An authed bridge whose Playout reads run on {@link clock}, with teardown already wired.
 *
 * ⚠ The clock starts at the real `Date.now()` rather than at `0`. The fake mints `iat`/`exp`
 * from the real clock, and `verify()` hands the injected one to `jose` as `currentDate`: a
 * clock at zero would make every fixture token 56 years from the future and refuse the
 * sign-in, so every spec in this file would fail for a reason that has nothing to do with D9.
 */
async function start(): Promise<{
  bridge: BridgeHandle;
  fake: FakePlayout;
  authority: PlayoutAuthority;
}> {
  clock = Date.now();
  const started = await startAuthedBridge({ playoutAuthOptions: { now: () => clock } });
  handle = started.handle;
  playout = started.playout;
  return {
    bridge: started.handle,
    fake: started.playout,
    authority: authorityOf(started.handle),
  };
}

/**
 * The verifier, or a loud failure.
 *
 * A spec that silently skipped its assertions on a bridge with auth OFF would pass having
 * measured nothing — the exact vacuum `expectRefusedWith` exists to refuse one layer down.
 */
function authorityOf(bridge: BridgeHandle): PlayoutAuthority {
  const authority = bridge.playoutAuth;
  if (authority === null) {
    throw new Error('the bridge came up with auth OFF — every assertion below would be vacuous');
  }
  return authority;
}

/** Sign this socket in, and refuse to continue if the sign-in itself did not take. */
async function signIn(client: Client, id: string, token: string): Promise<void> {
  const res = await client.authenticate(id, token);
  expect(res.error, 'the sign-in was refused — nothing below would be testing revocation').toBe(
    undefined,
  );
}

/**
 * ⭐ **THE PROBE, and why it is a take of an item that does not exist.**
 *
 * `stack.take` is an `operator` route, so the auth gate refuses it in every not-signed-in
 * state — and an unknown item is refused by `CasparRuntime` itself with an ordinary RESPONSE
 * (`{ accepted: false, errorCode: 'unknown-item' }`), never an error frame, having touched
 * neither the wire nor the ledger. That makes the two outcomes a clean discriminator with no
 * side effect to clean up: an error frame carrying the one sentence means the GATE answered,
 * a payload carrying `unknown-item` means the HANDLER did.
 */
async function driveIntent(
  client: Client,
  id: string,
): Promise<{ payload?: unknown; error?: string }> {
  return client.ask(id, 'stack.take', { itemId: 'no-such-item' });
}

/** The intent reached the handler: the gate let it through. */
function expectIntentDriven(res: { payload?: unknown; error?: string }, what: string): void {
  expect(res.error, what).toBe(undefined);
  expect((res.payload as { errorCode?: string } | undefined)?.errorCode, what).toBe('unknown-item');
}

/**
 * Wait until `atLeast` D9 requests have been SERVED, then let the poller settle.
 *
 * ⚠ Both halves are needed and they are not the same thing. The wait proves the request
 * arrived; the 50 ms proves the bridge has finished reading the answer and cleared its
 * in-flight flag — and that flag makes a poll a NO-OP while one is running, so a cadence
 * assertion taken before it clears would be counting a skip as a cadence.
 */
async function settlePolls(fake: FakePlayout, atLeast: number): Promise<void> {
  await waitFor(() => fake.requestCounts.revoked >= atLeast);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
}

/** An `exp` comfortably in the future of the injected clock, so the bridge does not prune it. */
function futureExpSec(): number {
  return Math.floor(clock / 1000) + 3600;
}

describe('C-037 D9 — a revoked `jti` stops being accepted, and the READS keep answering', () => {
  it('🔴 THE CLAIM: a revoked token is refused with the one sentence on the SAME socket, while `stack.snapshot` still answers', async () => {
    const { bridge, fake, authority } = await start();
    const issued = await fake.issueToken();
    const client = await openClient(bridge);
    await signIn(client, 'auth-1', issued.token);

    /*
      THE POSITIVE CONTROL, taken BEFORE the revocation and on the same socket with the same
      verb. Without it "refused after revoking" passes on a bridge that refuses this socket
      for any of five other reasons — a bad token, a mis-typed channel, an unrouted verb — and
      the spec would be asserting the gate is shut without ever having seen it open.
    */
    expectIntentDriven(
      await driveIntent(client, 'take-before'),
      'the signed-in socket could not drive the verb at all — the probe is not measuring D9',
    );

    fake.revoke(issued.jti, futureExpSec());
    await authority.pollRevokedNow();

    const refused = await driveIntent(client, 'take-after');
    expectRefusedWith(
      refused.error,
      AUTH_REQUIRED_REFUSAL,
      'a revoked token was still allowed to drive an intent',
    );

    /*
      "…reads keep answering" — the second half of the acceptance bullet, and the half that
      makes the refusal survivable. A revoked console still SEES the stack it may no longer
      touch, which is `refusedByAuth`'s carve-out for `read` and `resync` routes.
    */
    const snapshot = await client.ask('snap', 'stack.snapshot', undefined);
    expect(snapshot.error, 'a read was refused to a revoked session').toBe(undefined);
    expect(Array.isArray(snapshot.payload), 'the read answered with something else').toBe(true);
  });
});

describe('C-037 D9 — THE CADENCE, COUNTED', () => {
  it('polls D9 at most once per 60 s however many requests arrive, and exactly once more when the minute passes', async () => {
    const { bridge, fake, authority } = await start();
    const issued = await fake.issueToken();
    const client = await openClient(bridge);
    await signIn(client, 'auth-1', issued.token);

    /*
      🔴 TWO POSITIVE CONTROLS, and this spec is worthless without both — "it did not poll
      more" is exactly the assertion a poller that never runs passes with full marks.

        1. `pollCount` is already non-zero: the bridge DECIDED to poll.
        2. `requestCounts.revoked` is already non-zero: the request reached the Playout and
           was served. (1) alone would pass against a wrong URL, an unbound port or a request
           that 404s — the fixture's own note on these counters says so in as many words.
    */
    await settlePolls(fake, 1);
    const pollsAtStart = authority.pollCount;
    expect(
      pollsAtStart,
      'the bridge never even decided to poll — nothing to bound',
    ).toBeGreaterThan(0);
    expect(
      fake.requestCounts.revoked,
      'no D9 request was ever SERVED — the counter this spec bounds is dead',
    ).toBeGreaterThan(0);

    // Five gate checks, the clock untouched. Each one reaches `authGateState`, which is where
    // a live principal offers the bearer and kicks the poller.
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const read = await client.ask(id, 'stack.snapshot', undefined);
      expect(read.error, 'a read was refused mid-cadence — the requests are not landing').toBe(
        undefined,
      );
    }

    /*
      MEASURED: the rise is 0, not 1 — the sign-in's own poll already closed the window. The
      assertion is written as "at most one" anyway, because that is the CONTRACT (a suite that
      happened to take its baseline before the first poll would legitimately see 1), and it
      still bites: an ungated poller would be at +5 here.
    */
    expect(
      authority.pollCount,
      'the bridge polled D9 again inside the same minute',
    ).toBeLessThanOrEqual(pollsAtStart + 1);

    // …and now the minute passes, in one assignment.
    clock += REVOCATION_POLL_MS + 1000;
    const read = await client.ask('r6', 'stack.snapshot', undefined);
    expect(read.error, 'the request that should have triggered the next poll was refused').toBe(
      undefined,
    );
    expect(authority.pollCount, 'the next minute did not produce a poll').toBe(pollsAtStart + 1);
    // It really went out, not merely counted.
    await settlePolls(fake, 2);

    /*
      The inverse half, on the same clock: the window has just closed again, so the very next
      request must NOT poll. Without this the spec would be satisfied by a bridge that polls on
      every request AFTER the first minute — which is the same defect, one minute later.
    */
    const again = await client.ask('r7', 'stack.snapshot', undefined);
    expect(again.error, 'the follow-up request was refused').toBe(undefined);
    expect(authority.pollCount, 'the new minute was not bounded the way the first one was').toBe(
      pollsAtStart + 1,
    );
  });
});

describe('C-037 D9 — an OUTAGE never changes a verdict, it only stops it being updated', () => {
  /*
    ⭐ Golden rule 8 applied to an axis the bridge CANNOT probe. The Playout being unreachable
    is evidence that the revocation verdict cannot be UPDATED — nothing more. It can never be
    read as the verdict FLIPPING, in either direction: not "the list is unreadable, so trust
    everybody", and not "the list is unreadable, so trust nobody". The last list the bridge
    saw stands until a newer one replaces it, which is `PlayoutAuth`'s swallow-everything poll
    in one sentence and ADR 0010 rule 5 in another.
  */

  it('a REVOKED token stays refused through an outage — even after the list at the source was emptied', async () => {
    const { bridge, fake, authority } = await start();
    const issued = await fake.issueToken();
    const client = await openClient(bridge);
    await signIn(client, 'auth-1', issued.token);
    await settlePolls(fake, 1);

    fake.revoke(issued.jti, futureExpSec());
    await authority.pollRevokedNow();
    expectRefusedWith(
      (await driveIntent(client, 'take-revoked')).error,
      AUTH_REQUIRED_REFUSAL,
      'the revocation never took, so the outage below would be proving nothing',
    );

    const pollsBefore = authority.pollCount;
    const servedBefore = fake.requestCounts.revoked;
    await fake.goOffline();
    /*
      🔴 THE ABLATION. The SOURCE list is now EMPTY, so a bridge that could read it would let
      this token straight back in — which is precisely what the next spec measures it doing
      when the Playout is reachable. The only difference between the two is reachability, so
      "still refused" here can mean one thing and one thing only.
    */
    fake.unrevokeAll();
    await authority.pollRevokedNow();

    // The bridge TRIED (the attempt is counted before the fetch)…
    expect(authority.pollCount, 'the bridge did not even attempt a poll').toBe(pollsBefore + 1);
    // …and nothing answered it. This is what proves the outage is real rather than notional.
    expect(
      fake.requestCounts.revoked,
      'the Playout served a request while it was supposed to be unreachable',
    ).toBe(servedBefore);

    expectRefusedWith(
      (await driveIntent(client, 'take-offline')).error,
      AUTH_REQUIRED_REFUSAL,
      'an unreachable Playout un-revoked a token',
    );

    /*
      THE CONTROL FOR THE ABLATION, in the same spec rather than by reference: bring the
      Playout back, poll once more, and the emptied list lands. If this failed, the
      `unrevokeAll()` above would have been a no-op and the assertion it controls would have
      been passing for the wrong reason for as long as the file existed.
    */
    await fake.goOnline();
    await authority.pollRevokedNow();
    expectIntentDriven(
      await driveIntent(client, 'take-online'),
      'the emptied list never landed even with the Playout back — the ablation was inert',
    );
  });

  it('a still-VALID token stays accepted through an outage', async () => {
    const { bridge, fake, authority } = await start();
    const mine = await fake.issueToken();
    const somebodyElse = await fake.issueToken();
    const client = await openClient(bridge);
    await signIn(client, 'auth-1', mine.token);
    await settlePolls(fake, 1);

    // A non-empty list that does NOT name this token: the bridge is holding a real answer,
    // not an empty set that would accept everybody by accident.
    fake.revoke(somebodyElse.jti, futureExpSec());
    await authority.pollRevokedNow();

    /*
      THE POSITIVE CONTROL for "accepted": a second socket on the SAME bridge that never signed
      in is refused the same verb. Without it, "the token is still accepted" would pass just as
      well on a bridge whose gate is not running at all.
    */
    const stranger = await openClient(bridge);
    expectRefusedWith(
      (await driveIntent(stranger, 'stranger-1')).error,
      AUTH_REQUIRED_REFUSAL,
      'the gate is not running — an unsigned socket drove an intent',
    );
    expectIntentDriven(
      await driveIntent(client, 'take-online'),
      'the valid token was refused before any outage',
    );

    const pollsBefore = authority.pollCount;
    const servedBefore = fake.requestCounts.revoked;
    await fake.goOffline();
    await authority.pollRevokedNow();
    expect(authority.pollCount, 'the bridge did not even attempt a poll').toBe(pollsBefore + 1);
    expect(
      fake.requestCounts.revoked,
      'the Playout served a request while it was supposed to be unreachable',
    ).toBe(servedBefore);

    expectIntentDriven(
      await driveIntent(client, 'take-offline'),
      'an unreachable Playout signed a valid operator out — the outage flipped a verdict',
    );
    // …and the stranger is still refused, so the outage did not open the gate either way.
    expectRefusedWith(
      (await driveIntent(stranger, 'stranger-2')).error,
      AUTH_REQUIRED_REFUSAL,
      'an unreachable Playout let an unsigned socket in',
    );
  });
});

describe('C-037 D9 — the list is READ at every poll, never latched', () => {
  it('un-revoking plus one poll lets the same token back in', async () => {
    const { bridge, fake, authority } = await start();
    const issued = await fake.issueToken();
    const client = await openClient(bridge);
    await signIn(client, 'auth-1', issued.token);
    await settlePolls(fake, 1);

    fake.revoke(issued.jti, futureExpSec());
    await authority.pollRevokedNow();
    expectRefusedWith(
      (await driveIntent(client, 'take-revoked')).error,
      AUTH_REQUIRED_REFUSAL,
      'the revocation never took',
    );

    const servedBefore = fake.requestCounts.revoked;
    fake.unrevokeAll();
    await authority.pollRevokedNow();

    /*
      The two halves control EACH OTHER, which is why they are one spec. A gate stuck at
      "refuse" fails the second assertion; a gate stuck at "allow" fails the first; and the
      served-count check means neither half can be explained by a poll that never happened.
    */
    expect(fake.requestCounts.revoked, 'the second poll never reached the Playout').toBe(
      servedBefore + 1,
    );
    expectIntentDriven(
      await driveIntent(client, 'take-unrevoked'),
      'the token is LATCHED — the bridge remembered a revocation the list no longer carries',
    );
  });
});

describe('C-037 D9 — the ETag round trip', () => {
  it('two forced polls are two real requests, and a 304 leaves the last list exactly as it was', async () => {
    const { bridge, fake, authority } = await start();
    const issued = await fake.issueToken();
    const client = await openClient(bridge);
    await signIn(client, 'auth-1', issued.token);
    await settlePolls(fake, 1);

    fake.revoke(issued.jti, futureExpSec());
    await authority.pollRevokedNow();
    expectRefusedWith(
      (await driveIntent(client, 'take-revoked')).error,
      AUTH_REQUIRED_REFUSAL,
      'the revocation never took, so "the list survived" would be a claim about an empty list',
    );

    /*
      🔴 MEASURE THE OTHER PARTY FIRST, THEN ASSERT WHAT WAS MEASURED.

      Whether the bridge's next poll gets a `304` is a fact about the FAKE, and from outside
      the bridge it is unobservable — `requestCounts.revoked` rises either way. So the fixture
      is interrogated directly over its own public URL, with no edit to it: a plain `GET`
      returns `200` and an `ETag`, and the same `GET` carrying that `ETag` returns `304` with
      no body. Nothing has mutated the list in between, so the `ETag` the bridge is holding is
      this one, and its next poll is therefore the 304 branch rather than a re-read.

      ⚠ These two requests are SERVED, so they count. The baseline below is taken after them.
    */
    const bearer = { Authorization: `Bearer ${issued.token}` };
    const full = await fetch(fake.revokedUrl, { headers: bearer });
    expect(full.status, 'the fake did not serve the revocation list at all').toBe(200);
    const etag = full.headers.get('etag');
    expect(etag, 'the fake served no ETag, so there is no 304 branch to reach').not.toBe(null);
    expect(
      await full.text(),
      'the list the bridge polls does not name the revoked token',
    ).toContain(issued.jti);
    const cached = await fetch(fake.revokedUrl, {
      headers: { ...bearer, 'If-None-Match': etag ?? '' },
    });
    expect(cached.status, 'a matching ETag did not produce a 304 — measure again').toBe(304);

    const servedBefore = fake.requestCounts.revoked;
    const pollsBefore = authority.pollCount;
    await authority.pollRevokedNow();
    await authority.pollRevokedNow();

    // The bridge really ASKED twice — a conditional request is still a request, and a bridge
    // that skipped the wire because it believed its cache was fresh would sit here at +0.
    expect(fake.requestCounts.revoked, 'the two forced polls did not both reach the Playout').toBe(
      servedBefore + 2,
    );
    expect(authority.pollCount, 'the forced polls were not both counted').toBe(pollsBefore + 2);

    // …and two 304s later the verdict is byte-for-byte what it was: the list was KEPT, not
    // replaced by the empty body a 304 carries.
    expectRefusedWith(
      (await driveIntent(client, 'take-after-304')).error,
      AUTH_REQUIRED_REFUSAL,
      'a 304 emptied the list the bridge was holding',
    );
  });
});
