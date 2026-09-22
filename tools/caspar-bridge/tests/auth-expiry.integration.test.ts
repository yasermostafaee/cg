import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_REQUIRED_REFUSAL, type TemplateInfo } from '@cg/shared-ipc';
import type { RetainedStackItem } from '@cg/shared-schema';
import type { BridgeHandle } from '../src/index.js';
import type { FakePlayout } from './support/fake-playout.js';
import {
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  waitFor,
  type Client,
} from './support/auth-harness.js';

/**
 * 🔴 `C-037` acceptance — **WHEN the token expires mid-session THEN intents are refused with
 * the sentence, `read` keeps answering, the socket stays open, nothing on air changes; and a
 * fresh `auth` frame on the SAME socket restores every control with no reload.**
 *
 * ── RED BEFORE, GREEN AFTER ─────────────────────────────────────────────────
 *
 * Red before the change for the same reason every spec in
 * `auth-gate.integration.test.ts` was: there was no `auth` mode, no `auth` frame and no
 * gate, so the sign-in each test here opens with had nothing to answer it — `waitFor` would
 * have timed out on the very first round trip. One layer in from that, none of the machinery
 * this file measures existed either: `PlayoutAuth.isExpired`, the per-request
 * `authGateState`, and `refusedByAuth`'s `read`/`resync` carve-out are all new.
 *
 * ── WHY EXPIRY NEEDS ITS OWN FILE, NEXT TO THE GATE'S ───────────────────────
 *
 * `auth-gate` asks what a socket that NEVER signed in may do. This asks what happens to a
 * socket that DID, hours ago, while the operator is mid-shift — which is a different
 * situation with three properties the never-signed-in case cannot exercise at all: the
 * console still holds a principal it can SHOW, the publish stream is still open to it
 * (`authGateState` is `invalid`, not `absent`), and the way back in must work on the socket
 * it already has. The census in `auth-gate` walks `refusedByAuth(route, 'invalid')` over the
 * whole route table; what it cannot walk is a real clock crossing a real `exp` on a real
 * socket, which is what this file does.
 *
 * ── THE CLOCK IS INJECTED; NOTHING HERE SLEEPS ──────────────────────────────
 *
 * `createBridge({ playoutAuthOptions: { now: () => clock } })` is the one seam, and
 * {@link clock} is an ordinary `let` the specs move by hand. Every token is minted with an
 * EXPLICIT `expEpochSec` relative to that same variable, so "past `exp`" is arithmetic rather
 * than a wait. The longest real-time pause in this file is a publish round trip.
 *
 * ⚠ The seam reaches `PlayoutAuth` only. `jose`'s own JWKS cooldown and cache age run on REAL
 * time and cannot be faked — no spec here depends on either, because every token is signed by
 * the fake Playout's single published `kid`, which is fetched once and cached for the life of
 * the file.
 */

/**
 * The bridge's fake "now", in MILLISECONDS. Reset by {@link boot} at the top of every spec so
 * one test's advance cannot leak into the next.
 */
let clock = Date.now();

/** How long a session runs before `exp`, in seconds. An hour — long enough to be ordinary. */
const SESSION_SEC = 3600;

/**
 * 🔴 The contract's clock tolerance, in seconds, restated here as the number this file
 * STRADDLES rather than imported from `playout-auth.ts`.
 *
 * Imported, the tolerance specs would agree with the implementation BY CONSTRUCTION: widen
 * `CLOCK_TOLERANCE_SEC` to an hour and both the "inside" and the "past" case would move with
 * it and stay green, having stopped measuring anything. The contract fixes ±60 s (§3.5), so
 * the spec quotes the contract — exactly as `fake-playout.ts` quotes the contract's paths
 * instead of importing the bridge's own `CONTRACT_PATHS`, and for the same reason.
 */
const CONTRACT_TOLERANCE_SEC = 60;

/** The one template the seeded row names. Nothing renders it — it exists to be resolvable. */
const SEED_TEMPLATE: TemplateInfo = {
  templateId: 'expiry-seed',
  templateType: 'lower-third',
  fields: [],
};

const SEED_HTML =
  '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

const SEED_ITEM_ID = 'expiry-row';

/**
 * One retained row, `loaded` rather than on air.
 *
 * ⚠ `loaded` is deliberate. `restore()` gates every wire-touching branch on
 * `isRetainedOnAir`, so this row is seated in the Reconciler, given its layer, and sends
 * NOTHING — which is what lets a suite whose CasparCG is unreachable still have a non-empty
 * stack to measure. A retained `on-air` row would put the adopt-vs-re-ADD decision inside a
 * test whose subject is a clock.
 */
const SEED_ROW: readonly RetainedStackItem[] = [
  {
    itemId: SEED_ITEM_ID,
    templateId: 'expiry-seed',
    fields: { headline: 'سلام' },
    state: 'loaded',
    slot: { channel: 1, layer: 15, server: 'primary' },
  },
];

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

/** A bridge with auth ON, its verifier reading {@link clock}, plus one open client socket. */
async function boot(): Promise<{ client: Client; expSec: number }> {
  clock = Date.now();
  const started = await startAuthedBridge({ playoutAuthOptions: { now: () => clock } });
  handle = started.handle;
  playout = started.playout;
  const client = await openClient(started.handle);
  return { client, expSec: Math.floor(clock / 1000) + SESSION_SEC };
}

/** Sign this socket in with a token that expires at `expSec`. Asserts the sign-in landed. */
async function signIn(client: Client, id: string, expSec: number): Promise<void> {
  if (playout === null) throw new Error('signIn called before boot()');
  const issued = await playout.issueToken({ expEpochSec: expSec });
  const res = await client.authenticate(id, issued.token);
  expect(res.error, 'the sign-in this spec is built on was refused').toBeUndefined();
}

/** Move the fake clock to `sec` seconds since the epoch. */
function setClockToSec(sec: number): void {
  clock = sec * 1000;
}

/**
 * 🔴 **THE PROVOCATION, and why this one.**
 *
 * `stack.take` is an `operator` route, so the gate is the only thing between the frame and
 * `CasparRuntime.take`. The item id is deliberately one no stack holds: `#takeImpl` answers
 * `{ accepted: false, errorCode: 'unknown-item' }` at its third line — BEFORE the
 * reachability check and long before anything is built for the wire.
 *
 * That is what makes the same call serve both directions. Gate OPEN → a RESPONSE frame whose
 * payload proves the handler ran. Gate CLOSED → an ERROR frame carrying the one sentence. The
 * two outcomes are different FRAME SHAPES, not two spellings of an error, so neither can be
 * mistaken for the other and neither can pass vacuously.
 */
async function takeUnknownItem(
  client: Client,
  id: string,
): Promise<{ payload?: unknown; error?: string }> {
  return client.ask(id, 'stack.take', { itemId: 'no-such-row' });
}

/** Assert an intent ANSWERED, and that the answer came out of the runtime rather than a gate. */
function expectIntentAnswered(res: { payload?: unknown; error?: string }, what: string): void {
  expect(res.error, what).toBeUndefined();
  expect(res.payload, what).toEqual({ accepted: false, errorCode: 'unknown-item' });
}

/** Every `publish` frame's channel name, in arrival order. */
function publishedChannels(client: Client): string[] {
  return client.publishes().map((f) => (f.type === 'publish' ? f.channel : ''));
}

/**
 * 🔴 **HOW LONG A COALESCED PUBLISH MAY TAKE TO ARRIVE — the one real-time wait in this file.**
 *
 * `CasparRuntime.#markDirty` batches stack deltas behind a 20 ms timer, so `stackChanged` is
 * the ONE publish here that does not leave the process on the call that caused it. Any spec
 * asserting that NO stack publish arrived has to outlast that timer or it is asserting that
 * none has arrived YET — which is not the same sentence and reads exactly like it. 150 ms is
 * seven of those windows plus a loopback round trip, and it is a floor on the wait rather than
 * a budget for the assertion, which is why it is generous and still far inside the ~300 ms
 * this suite allows itself.
 */
const SETTLE_MS = 150;

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, SETTLE_MS));

describe('C-037 — a token that expires mid-session', () => {
  it('a session with an hour to run answers an intent — the POSITIVE CONTROL for this file', async () => {
    /*
      Every spec below asserts an ABSENCE (refused, not published, not changed). This one
      proves the instrument: same bridge, same socket, same call, gate OPEN. Without it a
      refusal could mean the route is unrouted, the frame never arrived, or the fake Playout
      minted something the bridge rejected outright — three reasons that have nothing to do
      with expiry and would make every test here pass for the wrong cause.
    */
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);

    expectIntentAnswered(
      await takeUnknownItem(client, 'i1'),
      'a freshly signed-in socket was refused an intent',
    );
  });

  it('🔴 THE CLAIM: past `exp` + the tolerance, an intent is refused with the ONE sentence', async () => {
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);
    expectIntentAnswered(await takeUnknownItem(client, 'before'), 'the gate was shut too early');

    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 60);
    const refused = await takeUnknownItem(client, 'after');
    expectRefusedWith(
      refused.error,
      AUTH_REQUIRED_REFUSAL,
      'an expired session was allowed to take',
    );

    /*
      🔴 **THE SAME SENTENCE, NOT A SECOND ONE.**

      ADR 0010's answer to "do the three states share a sentence" is that they do, because the
      remedy is identical in all three — and a second sentence is the kind of drift a constant
      does not prevent: a new `AUTH_EXPIRED_REFUSAL` would still be a string, still be
      exported, and every test pinning `AUTH_REQUIRED_REFUSAL` would go on passing on the
      never-signed-in path while the expired path quietly grew its own wording.

      So the claim is measured across two sockets of ONE bridge: this one, expired; a second
      that has never presented a token at all. Byte-equal, or the split has happened.
    */
    if (handle === null) throw new Error('no bridge');
    const stranger = await openClient(handle);
    const strangerRefusal = await takeUnknownItem(stranger, 'stranger');
    expectRefusedWith(
      strangerRefusal.error,
      AUTH_REQUIRED_REFUSAL,
      'a never-signed-in socket was allowed to take',
    );
    expect(
      refused.error,
      'the expired session got a DIFFERENT sentence from the never-signed-in one',
    ).toBe(strangerRefusal.error);
  });

  it('…and every READ keeps answering while the same socket is refused every intent', async () => {
    /*
      The carve-out (`refusedByAuth` → `route.lock !== 'read' && route.lock !== 'resync'`),
      measured on live sockets rather than over the route table — `auth-gate`'s census already
      walks the table, and a census cannot show the two outcomes happening at the SAME MOMENT
      on the SAME connection.

      ⚠ That simultaneity is this spec's own positive control, and it is why the refusal is
      asserted here as well as in the spec above rather than being left to it. "The reads
      answered" is worth nothing if the gate happened to be open; the refusal one line earlier
      is what proves it was shut while they answered.
    */
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);
    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 60);

    expectRefusedWith(
      (await takeUnknownItem(client, 'gate')).error,
      AUTH_REQUIRED_REFUSAL,
      'the gate was open, so the reads below prove nothing',
    );

    const snapshot = await client.ask('r1', 'stack.snapshot', undefined);
    expect(snapshot.error, 'stack.snapshot must answer an expired session').toBeUndefined();
    expect(Array.isArray(snapshot.payload)).toBe(true);

    const config = await client.ask('r2', 'connections.config', undefined);
    expect(config.error, 'connections.config must answer an expired session').toBeUndefined();
    expect((config.payload as { servers?: unknown }).servers).toBeDefined();

    const lock = await client.ask('r3', 'lock.state', undefined);
    expect(lock.error, 'lock.state must answer an expired session').toBeUndefined();
    expect((lock.payload as { engaged?: boolean }).engaged).toBe(false);
  });

  it('…and `auth.state` still answers, naming the principal the socket is still holding', async () => {
    /*
      ⭐ The expiry is a VERDICT about a token, not a deletion of what the socket proved.
      `AuthSession` still holds the `VerifiedToken` — nothing clears it but `auth.sign-out`
      and a fresh `auth` frame — so the console can keep showing WHO is signed out, which is
      golden rule 11's split: the identity pill names the STATE, the refusal names the REMEDY.
      A bridge that blanked the principal here would leave the console unable to say whose
      session ended.
    */
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);
    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 60);

    expectRefusedWith(
      (await takeUnknownItem(client, 'gate')).error,
      AUTH_REQUIRED_REFUSAL,
      'the gate was open, so the read below proves nothing',
    );

    const state = await client.ask('s', 'auth.state', undefined);
    expect(state.error, 'auth.state must answer an expired session').toBeUndefined();
    const payload = state.payload as {
      mode?: string;
      principal?: { name?: string; sub?: string } | null;
    };
    expect(payload.mode).toBe('playout');
    // `FAKE_OPERATOR`, through `normalizeActor` — the name the record would carry.
    expect(payload.principal?.name).toBe('علی رضایی');
    expect(payload.principal?.sub).toBe('u-1042');
  });

  it('…and the SOCKET stays OPEN — the bridge never closes a connection over a token', async () => {
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);

    let closes = 0;
    client.ws.on('close', () => {
      closes += 1;
    });

    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 60);
    expectRefusedWith(
      (await takeUnknownItem(client, 'gate')).error,
      AUTH_REQUIRED_REFUSAL,
      'the gate was open, so the liveness claim below proves nothing',
    );

    expect(closes, 'the bridge closed the socket over an expired token').toBe(0);
    expect(client.ws.readyState, 'the socket is no longer OPEN').toBe(client.ws.OPEN);

    /*
      🔴 **THE POSITIVE CONTROL FOR THE TWO ASSERTIONS ABOVE.**

      `closes === 0` and `readyState === OPEN` are both readings of an instrument that has
      never been seen to move in this test. A listener attached to the wrong object, or a
      `readyState` that simply never changes, would satisfy both having measured nothing. So
      the socket is then torn down FROM THE BRIDGE — `dropConnections()` terminates every
      client — and the same two readings must follow it.
    */
    handle?.dropConnections();
    await waitFor(() => closes === 1);
    expect(client.ws.readyState, 'readyState is inert — the assertions above are void').not.toBe(
      client.ws.OPEN,
    );
  });

  it('the ±60 s tolerance is REAL: just past `exp` and inside it, the intent still answers', async () => {
    /*
      🔴 **WITHOUT THIS SPEC, EVERY REFUSAL ABOVE COULD BE "ANY ADVANCE REFUSES".**

      A gate that read `now > exp` with no tolerance — or one that refused on any clock
      movement at all — passes every other test in this file. What separates a correct gate
      from those is a line in TIME, so this spec straddles it with ONE socket and ONE token:
      the only thing that differs between the two halves is which side of `exp + 60` the clock
      sits on.

      ⚠ 30 s past `exp`, not 59: the point is to be unambiguously inside the window, and a
      value pressed against the boundary would make this spec fail on rounding rather than on
      the property it is asserting.
    */
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);

    setClockToSec(expSec + 30);
    expectIntentAnswered(
      await takeUnknownItem(client, 'inside'),
      'a token 30 s past `exp` was refused — the contract allows ±60 s of skew',
    );

    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 1);
    expectRefusedWith(
      (await takeUnknownItem(client, 'outside')).error,
      AUTH_REQUIRED_REFUSAL,
      'a token past `exp` + 60 s was still accepted',
    );
  });

  it('🔴 a fresh `auth` frame on the SAME socket restores every control, with no reconnect', async () => {
    /*
      The inverse half, and the one `B-229` insisted on for the lock: a refusal that cannot be
      undone without a reload is a worse product than the bug it fixes. The gate reads
      `authGateState` PER REQUEST and never latches it at connect, which is the whole
      mechanism — and the only way to see it is to present a second token on a socket that has
      already been refused.
    */
    const { client, expSec } = await boot();
    await signIn(client, 'first', expSec);

    const ws = client.ws;
    let closes = 0;
    ws.on('close', () => {
      closes += 1;
    });

    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 60);
    expectRefusedWith(
      (await takeUnknownItem(client, 'refused')).error,
      AUTH_REQUIRED_REFUSAL,
      'the gate was open, so the restore below proves nothing',
    );

    // A NEW token, another hour from the clock's CURRENT position. Same socket, same client
    // object — `openClient` is deliberately not called again.
    await signIn(client, 'second', Math.floor(clock / 1000) + SESSION_SEC);

    expectIntentAnswered(
      await takeUnknownItem(client, 'restored'),
      'a fresh `auth` frame did not restore the intents on this socket',
    );

    /*
      🔴 **AND IT WAS THE SAME SOCKET, which is the half a reconnect would fake.**

      Identity alone (`client.ws === ws`) is a statement about what this spec DID, not a
      measurement — nothing here reassigns it. What measures the claim is that the bridge
      never closed the connection (`closes`, the same counter the spec above proved moves),
      that `readyState` is still OPEN, and that BOTH the refusal and the restored answer are
      sitting in ONE frame stream: `frames` is bound to this socket's `message` event in
      `openClient`, so a connection that had dropped and come back would have left the second
      response somewhere this array cannot see.
    */
    expect(closes, 'the socket was closed and re-opened — the "no reload" claim is void').toBe(0);
    expect(ws.readyState, 'the socket is no longer OPEN').toBe(ws.OPEN);
    expect(client.ws, 'the client swapped its socket').toBe(ws);
    const ids = client.frames.filter((f) => f.type === 'response').map((f) => f.id);
    expect(ids, 'the refusal is not on the frame stream of this socket').toContain('refused');
    expect(ids, 'the restored answer is not on the frame stream of this socket').toContain(
      'restored',
    );
  });

  it('NOTHING ON AIR CHANGED across the expiry — no stack publish, and the snapshot holds', async () => {
    /*
      🔴 **AN EXPIRY IS A STATE CHANGE ON THE BRIDGE AND MUST NEVER BE A PLAYOUT EVENT.**

      The `exp` on a token is a fact about a PERSON'S SHIFT. Nothing about a graphic that is
      already on air changes when it passes: no `CLEAR`, no `STOP`, no row leaving the stack,
      and no publish telling a second console that one did. A bridge that tore down on air
      when a session lapsed would make a forgotten sign-in an on-air event — the exact shape
      of defect this whole change exists to remove, arriving from the side it was meant to
      protect.

      ── BOTH READINGS NEEDED A LIVE INSTRUMENT, AND BOTH GOT ONE ─────────────

      1. **The stack snapshot.** A bridge with nothing loaded answers `[]`, and `[] → []`
         measures nothing whatsoever. So the stack is SEEDED first, through `restore()` — the
         one verb that puts a row on the stack without a reachable CasparCG (the row comes
         back `loaded`, so `isRestorable` is false and not a byte is built for the wire).
         The baseline is a one-row stack, and a teardown would show as a row leaving it.

      2. **The publish stream.** "No `stack.state-changed` arrived" is void unless publishes
         reach this socket AT ALL during the window being measured — and an expired socket is
         exactly where that could silently be false. It is not: the publish gate asks
         `authGateState(...) !== 'absent'`, and an expired socket is `invalid`. That is
         asserted rather than assumed, by driving `update.state-changed` (a publish that has
         nothing to do with the stack) after the clock has crossed `exp` and waiting for it to
         land.

      🔴 **AND THE SECOND READING NEEDED A SETTLE, WHICH WAS MEASURED RATHER THAN GUESSED.**

      The first draft of this spec asserted the count the instant `update.state-changed`
      arrived, and an ablation caught it: a REAL stack change driven inside the expiry window
      went UNDETECTED by that assertion (the snapshot comparison below is what failed). The
      reason is {@link SETTLE_MS}'s — `stackChanged` is COALESCED (`#markDirty`, a 20 ms
      timer), while `updateChanged` is emitted inline, so the marker publish always overtakes
      a stack publish provoked before it. A negative observation taken at that moment is not
      "nothing was published", it is "nothing has been published YET", and those read
      identically. The settle is what separates them.
    */
    const { client, expSec } = await boot();
    await signIn(client, 'in', expSec);
    if (handle === null) throw new Error('no bridge');
    const runtime = handle.runtime;

    runtime.templateImport(SEED_TEMPLATE, SEED_HTML);
    const seeded = await runtime.restore(SEED_ROW);
    expect(seeded.restored, 'the stack seed failed — the snapshot reading would be vacuous').toBe(
      1,
    );

    const before = runtime.stackSnapshot();
    expect(before, 'the seeded row is not in the snapshot').toHaveLength(1);
    // The publish instrument, proven live BEFORE the expiry: the seed itself moved it.
    await waitFor(() => publishedChannels(client).includes('stack.state-changed'));
    const stackPublishesBefore = publishedChannels(client).filter(
      (c) => c === 'stack.state-changed',
    ).length;

    // ── the clock crosses `exp`, and the operator presses TAKE ──────────────
    setClockToSec(expSec + CONTRACT_TOLERANCE_SEC + 60);
    expectRefusedWith(
      (await client.ask('t', 'stack.take', { itemId: SEED_ITEM_ID })).error,
      AUTH_REQUIRED_REFUSAL,
      'an expired session was allowed to take the seeded row',
    );
    // …and reads on, exactly as an operator's console would while it waits to sign back in.
    expect((await client.ask('r', 'stack.snapshot', undefined)).error).toBeUndefined();

    // The positive control for the absence below: a publish still reaches this expired socket.
    runtime.updateCancel();
    await waitFor(() => publishedChannels(client).includes('update.state-changed'));
    // …and then the settle, because that marker is emitted INLINE and a stack publish is not.
    await settle();

    expect(
      publishedChannels(client).filter((c) => c === 'stack.state-changed').length,
      'a stack change was published while a session merely expired',
    ).toBe(stackPublishesBefore);
    expect(runtime.stackSnapshot(), 'the stack moved when a session expired').toEqual(before);
  });
});
