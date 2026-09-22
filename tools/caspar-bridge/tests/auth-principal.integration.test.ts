import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_TOKEN_INVALID,
  AUTH_TOKEN_WRONG_STATION,
  MAX_ACTOR_LENGTH,
  serializeWsFrame,
  type PlayoutPrincipal,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import {
  FAKE_LONG_NAME_USER,
  FAKE_OPERATOR,
  FAKE_VIEWER,
  type FakePlayout,
  type IssueTokenOptions,
} from './support/fake-playout.js';
import {
  deadConnection,
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  waitFor,
  type Client,
} from './support/auth-harness.js';

/**
 * 🔴 `C-037` acceptance — **WHEN a valid ES256 token arrives (its `kid` in the cached JWKS,
 * `iss` byte-equal to config, `aud` containing `cg-control`, within ±60 s) THEN the principal
 * is set, `operatorActor()` yields the token's `name`, the audit record carries `sub` beside
 * it, and two browsers with two tokens interleave without crossing (the ALS seam).**
 *
 * `auth-gate.integration.test.ts` is the REFUSAL half of the same bullet list — what a socket
 * with no principal gets. This file is the other half: what a socket WITH one gets, and whose
 * name the record then writes.
 *
 * ── RED BEFORE, GREEN AFTER ─────────────────────────────────────────────────
 *
 * Every spec here was red before this change, for the same reason its sibling was: there was
 * no `auth` frame, no `PlayoutAuth`, no principal and no `actorSub` on an audit row. The
 * `auth` frame type did not exist in `ws-frame.ts`, so `parseWsFrame` returned `null` for
 * every frame this file sends and `client.authenticate()` would have timed out rather than
 * failed an assertion.
 *
 * ── WHY EVERY VERB HERE IS A REFUSED ONE ────────────────────────────────────
 *
 * The bridge points at {@link deadConnection} — AMCP port 1, nothing behind it — so
 * `stack.take` on an unseated item answers `{ accepted: false, errorCode: 'unknown-item' }`
 * WITHOUT reaching the wire. That is exactly what these specs need: the subject is WHO the
 * record says acted, not what reached CasparCG, and an audited verb that refuses still writes
 * its row (`#audited` derives the outcome and appends on every exit). Nothing in this file
 * can put anything on air, which is the property that lets it run in an ordinary suite.
 */

/*
  Two bridges live in one test exactly once — the auth-OFF control in §6 — so the lifecycle is
  the sibling file's, generalised from one handle to a list. Registered at CREATION, never on
  the last line of a test body: `harness.ts` flake family 1.
*/
let handles: BridgeHandle[] = [];
let playouts: FakePlayout[] = [];

afterEach(async () => {
  for (const handle of handles) await handle.close();
  handles = [];
  for (const playout of playouts) await playout.stop();
  playouts = [];
});

/** A bridge with auth ON plus its fake Playout, both released by `afterEach`. */
async function authedBridge(): Promise<{ bridge: BridgeHandle; playout: FakePlayout }> {
  const started = await startAuthedBridge();
  handles.push(started.handle);
  playouts.push(started.playout);
  return { bridge: started.handle, playout: started.playout };
}

/** A bridge with auth OFF — the §6 control. Same release path. */
async function unauthedBridge(): Promise<BridgeHandle> {
  const handle = await createBridge({ port: 0, connection: deadConnection() });
  handles.push(handle);
  return handle;
}

/**
 * Mint a token and present it, asserting the bridge ACCEPTED it.
 *
 * ⚠ The assertion is inside the helper on purpose: every spec below is about what follows a
 * successful sign-in, and a silently refused token would leave each of them asserting about a
 * socket that never signed in — the vacuous shape, arrived at by a helper rather than by a
 * test. Failing here names the cause instead.
 */
async function signIn(
  client: Client,
  id: string,
  playout: FakePlayout,
  options: IssueTokenOptions = {},
): Promise<{ token: string; principal: PlayoutPrincipal }> {
  const issued = await playout.issueToken(options);
  const res = await client.authenticate(id, issued.token);
  expect(
    res.error,
    'the fixture token was REFUSED — every assertion after this is void',
  ).toBeUndefined();
  const state = res.payload as { mode: string; principal: PlayoutPrincipal | null };
  expect(state.principal, 'accepted with no principal — nothing was seated').not.toBeNull();
  return { token: issued.token, principal: state.principal as PlayoutPrincipal };
}

/**
 * One request round-trip carrying an explicit, SELF-DECLARED `actor` on the frame.
 *
 * The harness's `ask()` deliberately sends none, so §6 — which is about the verified name
 * beating the wire's claim — needs this. It is the same round-trip otherwise.
 */
async function askAs(
  client: Client,
  id: string,
  channel: string,
  payload: unknown,
  actor: string,
): Promise<{ payload?: unknown; error?: string }> {
  client.ws.send(serializeWsFrame({ type: 'request', id, channel, payload, actor }));
  await waitFor(() => client.frames.some((f) => f.type === 'response' && f.id === id));
  const resp = client.frames.find((f) => f.type === 'response' && f.id === id);
  if (resp?.type !== 'response') throw new Error('no response');
  return { payload: resp.payload, ...(resp.error ? { error: resp.error.message } : {}) };
}

/** `exp` off a minted token, or a loud failure — a fixture that stopped setting it must not
 *  turn an `expiresAt` assertion into a comparison of two `Invalid Date`s. */
function expSecOf(claims: Record<string, unknown>): number {
  const exp = claims['exp'];
  if (typeof exp !== 'number') {
    throw new Error(`the fixture minted a token whose \`exp\` is ${String(exp)}, not a number`);
  }
  return exp;
}

describe("C-037 — a verified token seats a principal, in the operator's own name", () => {
  it('🔴 a valid Playout token is ACCEPTED, and the principal carries the PERSIAN name', async () => {
    const { bridge, playout } = await authedBridge();
    const client = await openClient(bridge);

    const issued = await playout.issueToken();
    const res = await client.authenticate('a', issued.token);

    expect(res.error, 'a token this bridge itself configured was refused').toBeUndefined();
    expect(res.payload).toEqual({
      mode: 'playout',
      principal: {
        name: FAKE_OPERATOR.name,
        sub: FAKE_OPERATOR.sub,
        roles: FAKE_OPERATOR.roles,
        channels: FAKE_OPERATOR.cgChannels,
        expiresAt: new Date(expSecOf(issued.claims) * 1000).toISOString(),
        nameTruncated: false,
      },
      // The gate's own verdict, carried beside the principal so that a surface reading this
      // cannot reach a different answer from the same facts (golden rule 6).
      status: 'signed-in',
    });

    /*
      ⚠ The name is asserted a SECOND time, against what it must NOT be. `toEqual` above would
      be satisfied by a fixture whose `name` had drifted to a placeholder, because both sides
      read the same constant. These three say the value is the operator's DISPLAY name: not
      the login (`cg-op1`), not the opaque id, and genuinely Persian script rather than a
      transliteration or a mojibake round-trip through a byte-counted `Content-Length`.
    */
    const { principal } = res.payload as { principal: PlayoutPrincipal };
    expect(principal.name).not.toBe(FAKE_OPERATOR.username);
    expect(principal.name).not.toBe(FAKE_OPERATOR.sub);
    /*
      ⚠ Spelled as a CODE POINT RANGE rather than a regex literal, because a literal here has
      to be written with the range's boundary CHARACTERS in the source — `prettier --write`
      rewrites a `\u06xx` escape inside a character class into the character itself — and a
      source file whose assertion is about encoding should not itself depend on how two
      exotic bytes survived an editor. `0x0600–0x06FF` is the Arabic block Persian is written
      in.
    */
    const inArabicBlock = [...principal.name].some((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp >= 0x0600 && cp <= 0x06ff;
    });
    expect(inArabicBlock, 'the name is not Persian script — something re-encoded it').toBe(true);
  });

  it('…and an intent refused a moment ago now ANSWERS on the SAME socket, with no reload', async () => {
    const { bridge, playout } = await authedBridge();
    const client = await openClient(bridge);

    /*
      RED FIRST, on this very socket. `authGateState` is read PER REQUEST and never latched at
      connect, and the inverse half of the gate — that signing in restores every control
      without a reconnect — is the half a latched read would break silently.
    */
    const snapBefore = await client.ask('s1', 'stack.snapshot', undefined);
    const lockBefore = await client.ask('l1', 'lock.state', undefined);
    const takeBefore = await client.ask('t1', 'stack.take', { itemId: 'nothing-here' });
    expect(typeof snapBefore.error, 'a read answered an unsigned socket').toBe('string');
    expect(typeof lockBefore.error, 'a read answered an unsigned socket').toBe('string');
    expect(typeof takeBefore.error, 'an intent answered an unsigned socket').toBe('string');

    await signIn(client, 'auth', playout);

    /*
      GREEN AFTER, same socket, no reconnect — which is the POSITIVE CONTROL for the three
      refusals above: without it they would also pass on a bridge whose routes were simply
      broken, or whose socket had died.
    */
    const snapAfter = await client.ask('s2', 'stack.snapshot', undefined);
    expect(snapAfter.error, 'the read is still refused after a successful sign-in').toBeUndefined();
    expect(Array.isArray(snapAfter.payload), 'stack.snapshot answered a non-array').toBe(true);

    const lockAfter = await client.ask('l2', 'lock.state', undefined);
    expect(lockAfter.error).toBeUndefined();
    expect((lockAfter.payload as { engaged: boolean }).engaged).toBe(false);

    /*
      🔴 THE DISTINCTION THIS SPEC EXISTS TO DRAW. A take against a dead AMCP is not an AUTH
      failure and must not wear its shape: the AUTH refusal is a frame `error` (no payload at
      all), while a refused take is a PAYLOAD carrying its own reason. A console that could not
      tell them apart would send the operator to a sign-in screen over an unreachable server.
    */
    const takeAfter = await client.ask('t2', 'stack.take', { itemId: 'nothing-here' });
    expect(
      takeAfter.error,
      'the take still came back as a frame error after signing in',
    ).toBeUndefined();
    expect(takeAfter.payload).toEqual({ accepted: false, errorCode: 'unknown-item' });
  });
});

describe('C-037 — the record learns who arrived, and keeps saying so', () => {
  it("🔴 THE AUDIT ROW: `sign-in` carries the verified name and the token's `sub`, and so does the next verb", async () => {
    const { bridge, playout } = await authedBridge();
    const client = await openClient(bridge);

    const { token } = await signIn(client, 'auth', playout);

    const afterSignIn = await bridge.runtime.auditRecent(200);
    /*
      THE POSITIVE CONTROL, and it controls for the emptiest failure there is: with no
      `auditLogPath` configured this runtime answers from its in-memory tail, and a tail that
      was never appended to returns `[]` — against which `rows.find(...)` is `undefined` and
      every `?.` assertion below would read as a pass. So the row must EXIST before anything is
      asked about its contents.
    */
    expect(
      afterSignIn.length,
      'the audit tail is empty — nothing was recorded at all',
    ).toBeGreaterThan(0);
    const signInRow = afterSignIn.find((r) => r.action === 'sign-in');
    expect(signInRow, 'no `sign-in` row was written for a verified token').toBeDefined();
    expect(signInRow?.actor).toBe(FAKE_OPERATOR.name);
    expect(signInRow?.actorSub).toBe(FAKE_OPERATOR.sub);
    expect(signInRow?.outcome).toBe('ok');

    /*
      ⚠ Nothing REPLAYABLE is in the record — the row keeps who and when, never a credential.
      The first line is this negative's control: it proves the row serialises to something the
      search can actually see, so a miss on the second line means the token is absent rather
      than that there was nothing to search.
    */
    const serialized = JSON.stringify(signInRow);
    expect(serialized, 'the row serialised to nothing searchable').toContain(FAKE_OPERATOR.sub);
    expect(serialized, 'the raw token reached the audit record').not.toContain(token);

    /*
      …and now an ORDINARY verb, driven through the socket rather than on the runtime, so the
      value comes from `operatorActor()` inside the request's actor context — which is the
      thing the acceptance bullet actually names.
    */
    const take = await client.ask('t', 'stack.take', { itemId: 'row-after-sign-in' });
    expect(take.error, 'the verb was refused, so its row proves nothing').toBeUndefined();

    const afterVerb = await bridge.runtime.auditRecent(200);
    const takeRow = afterVerb.find((r) => r.action === 'take' && r.itemId === 'row-after-sign-in');
    expect(takeRow, 'the verb wrote no audit row').toBeDefined();
    expect(takeRow?.actor, '`operatorActor()` did not yield the verified name').toBe(
      FAKE_OPERATOR.name,
    );

    /*
      🔴 **AND THE VERB'S ROW CARRIES THE `sub` TOO — the second half of the acceptance
      bullet, which was NOT met when this file was first written.**

      Measured then: `#recordOutcome` stamped `actor: operatorActor()` and nothing else, and
      `operatorSub()` was exported with ZERO call sites tree-wide, so the verified id reached
      the record on the `sign-in` / `sign-out` rows alone — while the bullet says plainly
      _"the audit record carries `sub` beside it"_. The fix went where `B-211`'s rule points:
      the ONE place a row becomes an `AuditEntry` (`#recordAudit`), not at the seven sites that
      name the actor, because seven sites are seven chances to forget and the eighth arrives
      next month.

      ⚠ This is pinned on an ORDINARY verb deliberately. A spec that only checked the
      `sign-in` row would have passed against the broken code, which is exactly what it did.
    */
    expect(takeRow?.actorSub, 'the verified `sub` did not reach an ordinary row').toBe(
      FAKE_OPERATOR.sub,
    );

    /*
      …and the POSITIVE CONTROL for the negative one level up: with auth OFF the same verb
      writes a row with NO `actorSub` at all. Without this, "the id is present" could be
      satisfied by a field that is always present, and the absent case — which is every row
      written today — would be untested.
    */
    const offBridge = await createBridge({ port: 0, connection: deadConnection() });
    handles.push(offBridge);
    const offClient = await openClient(offBridge);
    await offClient.ask('t', 'stack.take', { itemId: 'row-with-auth-off' });
    const offRows = await offBridge.runtime.auditRecent(200);
    const offRow = offRows.find((r) => r.action === 'take' && r.itemId === 'row-with-auth-off');
    expect(offRow, 'the auth-off control wrote no row at all').toBeDefined();
    expect(offRow?.actorSub, 'a bridge with no identity invented one').toBeUndefined();
  });
});

describe('C-037 — THE ALS SEAM: two sockets, two tokens, no crossing', () => {
  it('🔴 two signed-in sockets each drive a verb — sequentially and INTERLEAVED — and neither row wears the other name', async () => {
    const { bridge, playout } = await authedBridge();
    const operator = await openClient(bridge);
    const viewer = await openClient(bridge);

    await signIn(operator, 'auth-op', playout);
    await signIn(viewer, 'auth-view', playout, { user: 'viewer' });

    /*
      🔴 **WHY A MUTABLE "CURRENT PRINCIPAL" FIELD WOULD FAIL THIS AND `AsyncLocalStorage`
      DOES NOT.**

      `CasparRuntime.take()` is `#audited`: it AWAITS the impl and only then reads
      `operatorActor()` to stamp the row. So the read happens strictly after an await. With a
      single mutable field on the bridge, the second socket's request would overwrite that
      field while the first was suspended, and the first request would come back and write the
      SECOND operator's name onto its own row — silently, with no error anywhere, and more
      often the busier the gallery. ALS binds the value to the request's async execution
      instead, so each resumed continuation reads its own store at any depth and across every
      await. The interleaved phase below is what makes that a measurement rather than a claim.

      THE POSITIVE CONTROL for the whole spec: the two names must DIFFER. Two fixture users
      that happened to share a display name would make every assertion here pass while the
      seam was broken.
    */
    expect(FAKE_OPERATOR.name).not.toBe(FAKE_VIEWER.name);

    // ── Phase 1: sequential. Each verb completes before the next begins.
    const seqOp = await operator.ask('s-op', 'stack.take', { itemId: 'seq-op' });
    const seqView = await viewer.ask('s-view', 'stack.take', { itemId: 'seq-view' });
    expect(seqOp.error, 'phase 1: the operator verb was refused').toBeUndefined();
    expect(seqView.error, 'phase 1: the viewer verb was refused').toBeUndefined();

    const seqRows = await bridge.runtime.auditRecent(200);
    const seqOpRow = seqRows.find((r) => r.action === 'take' && r.itemId === 'seq-op');
    const seqViewRow = seqRows.find((r) => r.action === 'take' && r.itemId === 'seq-view');
    expect(seqOpRow, 'phase 1: no row for the operator verb').toBeDefined();
    expect(seqViewRow, 'phase 1: no row for the viewer verb').toBeDefined();
    expect(seqOpRow?.actor, 'phase 1: the operator row').toBe(FAKE_OPERATOR.name);
    expect(seqViewRow?.actor, 'phase 1: the viewer row').toBe(FAKE_VIEWER.name);

    /*
      The two `sign-in` rows are where the verified `sub` DOES live (see the note in the audit
      spec above), so the identity half of "no crossing" is asserted there: two sockets, two
      principals, two ids, and neither row wearing the other's.
    */
    const signIns = seqRows.filter((r) => r.action === 'sign-in');
    expect(signIns.map((r) => r.actorSub).sort()).toEqual(
      [FAKE_OPERATOR.sub, FAKE_VIEWER.sub].sort(),
    );

    // ── Phase 2: INTERLEAVED. Both in flight; neither awaited before the other is sent.
    const opInFlight = operator.ask('i-op', 'stack.take', { itemId: 'int-op' });
    const viewInFlight = viewer.ask('i-view', 'stack.take', { itemId: 'int-view' });
    /*
      THE PRECONDITION, CHECKED RATHER THAN ASSUMED. Both frames are on the wire and neither
      reply can have arrived — a socket message is an I/O event and cannot land inside this
      synchronous block. If `ask()` ever resolved without a round trip, this phase would
      silently become a second sequential one and would keep passing while measuring nothing.
    */
    expect(
      operator.frames.some((f) => f.type === 'response' && f.id === 'i-op'),
      'the operator request completed before the viewer request was sent — nothing overlapped',
    ).toBe(false);
    const [intOp, intView] = await Promise.all([opInFlight, viewInFlight]);
    expect(intOp.error, 'phase 2: the operator verb was refused').toBeUndefined();
    expect(intView.error, 'phase 2: the viewer verb was refused').toBeUndefined();

    const intRows = await bridge.runtime.auditRecent(200);
    const intOpRow = intRows.find((r) => r.action === 'take' && r.itemId === 'int-op');
    const intViewRow = intRows.find((r) => r.action === 'take' && r.itemId === 'int-view');
    expect(intOpRow, 'phase 2: no row for the operator verb').toBeDefined();
    expect(intViewRow, 'phase 2: no row for the viewer verb').toBeDefined();
    expect(
      intOpRow?.actor,
      'phase 2: the operator row wears the wrong name — the seam CROSSED',
    ).toBe(FAKE_OPERATOR.name);
    expect(
      intViewRow?.actor,
      'phase 2: the viewer row wears the wrong name — the seam CROSSED',
    ).toBe(FAKE_VIEWER.name);
  });
});

describe('C-037 — truncation is MEASURED, and said out loud exactly once', () => {
  it('🔴 a 75-unit Playout name arrives cut to MAX_ACTOR_LENGTH, flagged on the principal and on the `sign-in` row ALONE', async () => {
    const { bridge, playout } = await authedBridge();
    const client = await openClient(bridge);

    const { principal } = await signIn(client, 'auth', playout, { user: 'longName' });

    /*
      MEASURED, not assumed — the fixture's own docblock records 75 UTF-16 units and every
      character BMP, so `slice(0, MAX_ACTOR_LENGTH)` cannot leave a lone surrogate and the cut
      lands mid-word rather than on a space it would then trim away.

      ⚠ `MAX_ACTOR_LENGTH` is IMPORTED, never written as 64. A literal here would keep passing
      the day the constant moved, on a surface whose whole subject is that number.
    */
    expect(
      FAKE_LONG_NAME_USER.name.length,
      'the fixture name is no longer the long one',
    ).toBeGreaterThan(MAX_ACTOR_LENGTH);
    expect(principal.name.length).toBe(MAX_ACTOR_LENGTH);
    expect(principal.name).toBe(FAKE_LONG_NAME_USER.name.slice(0, MAX_ACTOR_LENGTH));
    expect(principal.nameTruncated).toBe(true);
    expect(principal.sub).toBe(FAKE_LONG_NAME_USER.sub);

    const afterSignIn = await bridge.runtime.auditRecent(200);
    const signInRow = afterSignIn.find((r) => r.action === 'sign-in');
    expect(signInRow, 'no `sign-in` row at all').toBeDefined();
    expect(signInRow?.actor).toBe(principal.name);
    expect(signInRow?.actorNameTruncated).toBe(true);

    /*
      …and the flag is written ONCE. The line above is the POSITIVE CONTROL for the negative
      claim below: it proves the field can be set and that this reader can see it, so
      `undefined` on the later row means "not written" rather than "not visible from here".
    */
    const verb = await client.ask('t', 'stack.take', { itemId: 'later-row' });
    expect(verb.error, 'the verb was refused, so its row proves nothing').toBeUndefined();

    const afterVerb = await bridge.runtime.auditRecent(200);
    const takeRow = afterVerb.find((r) => r.action === 'take' && r.itemId === 'later-row');
    expect(takeRow, 'the verb wrote no audit row').toBeDefined();
    expect(takeRow?.actor, 'the shortened name is what the record keeps writing').toBe(
      principal.name,
    );
    expect(
      takeRow?.actorNameTruncated,
      'the flag was repeated on an ordinary row — it is a fact about the SESSION, not the take',
    ).toBeUndefined();
  });
});

describe('C-037 — the wire claim loses to the verified one', () => {
  it("a request frame's self-declared `actor` is IGNORED once a principal exists", async () => {
    const { bridge, playout } = await authedBridge();
    const client = await openClient(bridge);

    await signIn(client, 'auth', playout);

    const res = await askAs(client, 'x', 'stack.take', { itemId: 'claimed' }, 'someone-else');
    expect(res.error, 'the verb was refused, so its row proves nothing').toBeUndefined();

    const rows = await bridge.runtime.auditRecent(200);
    const row = rows.find((r) => r.action === 'take' && r.itemId === 'claimed');
    expect(row, 'the verb wrote no audit row').toBeDefined();
    expect(row?.actor, 'the wire beat the signature').toBe(FAKE_OPERATOR.name);

    /*
      🔴 THE POSITIVE CONTROL, and it is not optional: without it this spec passes on a bridge
      that ignores `actor` ALWAYS — including the frame never carrying it, `askAs` serialising
      it away, or the field having been dropped from the schema. So the SAME frame, with the
      SAME field, is sent to a bridge with auth OFF, where the self-declared name is all there
      is and must therefore reach the record.
    */
    const offBridge = await unauthedBridge();
    const offClient = await openClient(offBridge);
    const offRes = await askAs(offClient, 'x', 'stack.take', { itemId: 'claimed' }, 'someone-else');
    expect(offRes.error, 'the control verb was refused').toBeUndefined();

    const offRows = await offBridge.runtime.auditRecent(200);
    const offRow = offRows.find((r) => r.action === 'take' && r.itemId === 'claimed');
    expect(offRow, 'the control wrote no audit row — the instrument is dead').toBeDefined();
    expect(offRow?.actor, 'the `actor` field never reaches the record at all').toBe('someone-else');
  });
});

describe('C-037 — the refusal CLASSES, each with its own sentence', () => {
  it('a wrong `iss` and a wrong `aud` are BOTH "not for this station"; a garbage token is "could not be verified"', async () => {
    const { bridge, playout } = await authedBridge();
    const client = await openClient(bridge);

    /*
      🔴 THE POSITIVE CONTROL, FIRST, on this socket and this bridge. Three refusals in a row
      pass perfectly on a verifier that refuses everything — a broken JWKS URL, an unbound fake
      Playout, a `kid` nothing publishes. So the good token goes first: after this line a
      refusal below means the CHECK fired, not that the door is nailed shut.

      ⭐ The second control is the shape of the result itself: the three sentences are not all
      the same one. A verifier collapsing every failure into one refusal would fail the last
      assertion here, so the three cases discriminate each other.
    */
    const good = await playout.issueToken();
    const accepted = await client.authenticate('ok', good.token);
    expect(
      accepted.error,
      'this bridge refuses even the token it was configured for',
    ).toBeUndefined();

    // A token minted by THIS Playout's key, for a different station.
    const wrongIssuer = await playout.issueToken({ issuer: 'http://elsewhere.invalid' });
    const issRes = await client.authenticate('iss', wrongIssuer.token);
    expectRefusedWith(
      issRes.error,
      AUTH_TOKEN_WRONG_STATION,
      'a token whose `iss` is another Playout was accepted',
    );

    // …and one minted for something other than CG Control. Same FACT, so the same sentence:
    // `verify()` decides `aud` itself rather than reading `jose`'s generic claim failure.
    const wrongAudience = await playout.issueToken({ audience: 'something-else' });
    const audRes = await client.authenticate('aud', wrongAudience.token);
    expectRefusedWith(
      audRes.error,
      AUTH_TOKEN_WRONG_STATION,
      'a token minted for another audience was accepted',
    );

    // Not a JWT at all — it never reaches a key lookup, let alone the network.
    const garbageRes = await client.authenticate('junk', 'not-a-jwt-at-all');
    expectRefusedWith(
      garbageRes.error,
      AUTH_TOKEN_INVALID,
      'a garbage string was accepted as a sign-in',
    );

    /*
      The two sentences are DIFFERENT, and that is the discrimination control: a console shows
      "check which Playout you signed in to" for one and "could not be verified" for the other,
      and they are only useful while they differ.
    */
    expect(AUTH_TOKEN_WRONG_STATION).not.toBe(AUTH_TOKEN_INVALID);

    /*
      ⚠ And every failure LEFT THE PREVIOUS PRINCIPAL IN PLACE. A stray bad `auth` frame must
      not sign an operator out mid-shift — that would make one frame a way to take a console
      off the air, which is the defect class this whole change removes.
    */
    const state = await client.ask('st', 'auth.state', undefined);
    expect((state.payload as { principal: PlayoutPrincipal | null }).principal?.name).toBe(
      FAKE_OPERATOR.name,
    );
  });
});
