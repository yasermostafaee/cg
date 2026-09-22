import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_TOKEN_INVALID } from '@cg/shared-ipc';
import { createBridge, JWKS_COOLDOWN_MS, type BridgeHandle } from '../src/index.js';
import {
  deadConnection,
  expectRefusedWith,
  openClient,
  startAuthedBridge,
} from './support/auth-harness.js';
import { FAKE_OPERATOR, FAKE_PLAYOUT_PASSWORD, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `C-037` acceptance — **WHEN the `kid` is unknown THEN the JWKS is re-fetched at most
 * once per 60 s before refusing.**
 *
 * …and ADR 0010 rule 9's half of it: the BRIDGE reads the JWKS server-side, the BROWSER gets
 * the token, and the bridge never calls D1 at all.
 *
 * ── RED BEFORE, GREEN AFTER ─────────────────────────────────────────────────
 *
 * Red before the change for the same reason every spec in `auth-gate.integration.test.ts` was:
 * there was no `auth` frame, no verifier and no JWKS to fetch. `PlayoutAuth`,
 * {@link JWKS_COOLDOWN_MS} and the fake Playout's key rotation all arrive with `C-037`, so
 * there was nothing here to present a token to.
 *
 * ── 🔴 MEASURED FIRST, THEN ASSERTED — and it changed two of the four claims ─
 *
 * The brief for this file assumed a rotated key would verify and that a key the JWKS has
 * dropped would stop verifying. Both were run before a single assertion was written, against
 * `jose@6.2.12`, and both came back the other way. The numbers are quoted at each `it()`. The
 * mechanism is one line of `jose`'s `createRemoteJWKSet`, worth spelling out once because
 * every measurement below follows from it:
 *
 * ```js
 * if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration))
 *   return await reload(), local(protectedHeader, token);
 * throw err;
 * ```
 *
 * `jwksTimestamp` is the time of the LAST SUCCESSFUL FETCH, so the cooldown clock starts at
 * the fetch rather than at the unknown `kid`. A sign-in that warms the cache therefore puts
 * the next 60 s of unknown-`kid` lookups inside the cooldown, and they are refused with NO
 * re-fetch at all — one fewer than the bullet permits, which still satisfies "at most once".
 *
 * ⚠ **The half of the bullet this file CANNOT measure, said plainly rather than implied by
 * its absence: that the re-fetch DOES happen once the 60 s have passed.** `jose` reads
 * `Date.now()` directly for the cooldown — the injectable clock on `PlayoutAuth` reaches
 * `jwtVerify`'s `currentDate` and `isExpired`, not the key set — so proving that half needs
 * 60 s of real sleeping, which no spec in this repo may do. The nearest honest instrument is
 * a SECOND BRIDGE against the SAME fake Playout: nothing is cached there, so its first
 * verify must fetch. That is what every "fresh bridge" control below is for, and it is a
 * control for the COUNTER being live, not a substitute for the unmeasured half.
 *
 * ⚠ No fake clock is installed anywhere in this file, deliberately. Every claim here is
 * about key LOOKUP, not expiry; a `now` that lied about the time would move `exp` and the D9
 * cadence without moving the one clock that decides these answers. The whole file runs in
 * well under a second of real time, comfortably inside one cooldown window.
 */

let handle: BridgeHandle | null = null;
/** A second bridge against the SAME Playout — every positive control below needs one. */
let second: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await second?.close();
  second = null;
  await playout?.stop();
  playout = null;
});

/**
 * A second bridge pointed at an ALREADY-RUNNING fake Playout.
 *
 * ⚠ `startAuthedBridge()` cannot be used for this and the reason is the whole point of the
 * control: it starts a FRESH Playout with a fresh `requestCounts`, so the second bridge's
 * fetch would land on a different counter and could not witness the first one moving. Six
 * lines of configuration are copied from the harness rather than the harness being widened —
 * this file is not allowed to edit it, and a second caller is not yet a shape worth sharing.
 */
function bridgeAgainst(p: FakePlayout): Promise<BridgeHandle> {
  return createBridge({
    port: 0,
    connection: deadConnection(),
    playout: {
      auth: 'playout',
      issuer: p.issuer,
      jwksUrl: p.jwksUrl,
      tokenUrl: p.tokenUrl,
      refreshUrl: p.refreshUrl,
      revokedUrl: p.revokedUrl,
    },
  });
}

/** The `access_token` out of a D1 body, or a loud failure naming what came back instead. */
function accessTokenOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'access_token' in body) {
    const value = (body as { access_token: unknown }).access_token;
    if (typeof value === 'string' && value !== '') return value;
  }
  throw new Error(`the fake Playout's D1 returned no access_token: ${JSON.stringify(body)}`);
}

describe('C-037 — an unknown `kid` is refused, and the JWKS is not re-fetched to find it', () => {
  it('a key rotated in AFTER the fetch is REFUSED inside the cooldown — and the SAME token verifies on a bridge that fetches after the rotation', async () => {
    /*
      🔴 MEASURED, and the OPPOSITE of what this file was briefed to expect.

      The brief assumed a freshly rotated `kid` would verify, because the contract (§3.5)
      publishes a key BEFORE signing with it — so a JWKS fetched at that moment already
      contains it. That is true of a bridge that fetches AFTER the rotation, and this test
      proves it with the second bridge below. It is NOT true of a bridge that fetched BEFORE:
      measured `jwks = 1` after the sign-in and `jwks = 1` after the rotated token was
      presented, with the refusal `AUTH_TOKEN_INVALID` in between. No re-fetch happened,
      because `jose`'s cooldown clock started at the sign-in's own fetch.

      That is the contract's answer rather than a bug to route around, and the reason the
      contract is written the way it is: publish-then-sign means a real Playout's new `kid` is
      in the JWKS long before any token carries it, so every bridge's next scheduled fetch
      (`cacheMaxAge`, one hour) picks it up before it is needed. A station that rotates a key
      and signs with it in the same minute would refuse sign-ins for the rest of that minute.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    /*
      POSITIVE CONTROL #1, and it comes first on purpose: it is controlling for the whole
      apparatus. Without an ACCEPTED sign-in here, the refusal below could mean an unreachable
      Playout, a mis-signed fixture token, a bridge with auth off, or a socket that answers
      everything with an error — four readings that have nothing to do with a `kid`. It is
      also what WARMS the cache, so it is the instrument and the provocation at once.
    */
    const first = await playout.issueToken();
    const signIn = await client.authenticate('warm', first.token);
    expect(signIn.error, 'the apparatus is dead — a good token was refused').toBeUndefined();
    const afterWarmUp = playout.requestCounts.jwks;
    expect(afterWarmUp, 'the sign-in never read the JWKS at all').toBeGreaterThan(0);

    /*
      Rotation, the contract's own way (§3.5): BOTH keys published. That the new `kid` really
      is in the JWKS is proven by the mint itself — `issueToken({ kid })` throws when the kid
      is not published (`#signingKeyFor`), so a fixture that silently failed to publish could
      not reach the assertion below. It is proven a second time by the fresh bridge, which
      accepts a token signed with exactly this key.
    */
    const rotated = await playout.rotateKey();
    const withNewKey = await playout.issueToken({ kid: rotated.kid });
    const refused = await client.authenticate('rotated', withNewKey.token);
    expectRefusedWith(
      refused.error,
      AUTH_TOKEN_INVALID,
      'a kid rotated in after the fetch was accepted without the JWKS being re-read',
    );
    expect(
      playout.requestCounts.jwks,
      `the unknown kid triggered a re-fetch inside the ${String(JWKS_COOLDOWN_MS)} ms cooldown`,
    ).toBe(afterWarmUp);

    /*
      POSITIVE CONTROL #2 — the SAME token, a bridge that has cached nothing.

      This is what stops the refusal above being read as "that token was malformed". One
      token, two bridges, two answers: the only difference between them is WHEN each fetched
      the JWKS, which is the claim.
    */
    second = await bridgeAgainst(playout);
    const fresh = await openClient(second);
    const accepted = await fresh.authenticate('rotated-elsewhere', withNewKey.token);
    expect(
      accepted.error,
      'the rotated token is refused even by a bridge with no cache — it is the TOKEN that is bad, not the cooldown',
    ).toBeUndefined();
    expect(
      playout.requestCounts.jwks,
      'the second bridge answered without reading the JWKS — it cannot have verified anything',
    ).toBe(afterWarmUp + 1);
  });

  it('🔴 TWO unknown-`kid` tokens in a row cost AT MOST ONE JWKS fetch — measured: none at all', async () => {
    /*
      🔴 THE ACCEPTANCE BULLET ITSELF, counted at the fake Playout rather than inferred.

      MEASURED: `jwks` went 1 → 1 → 1 across the two refusals. Zero re-fetches, where the
      bullet permits one — for the reason in the file header: the cooldown window opened at
      the sign-in's fetch, not at the first unknown `kid`. The assertion is written to the
      BULLET (`<= 1`) rather than to the measurement (`0`), because the contract is what must
      hold: a future `jose` that started its cooldown at the first miss instead would spend
      exactly one fetch here and would still be correct.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const good = await playout.issueToken();
    const signIn = await client.authenticate('warm', good.token);
    expect(signIn.error, 'the apparatus is dead — a good token was refused').toBeUndefined();

    /*
      POSITIVE CONTROL #1 for the count: the fetch mechanism is LIVE before anything is
      claimed about it standing still. `fake-playout.ts` records this exact requirement on
      `requestCounts` — a counter that never moves passes "the count did not move" having
      measured nothing (a wrong URL, an unbound port, a 404 that lands before the counter).
    */
    const before = playout.requestCounts.jwks;
    expect(
      before,
      'the JWKS was never fetched — the counter cannot testify to anything',
    ).toBeGreaterThan(0);

    const one = await playout.issueToken({ signWithRetiredKey: true });
    const first = await client.authenticate('unknown-1', one.token);
    expectRefusedWith(
      first.error,
      AUTH_TOKEN_INVALID,
      'a token signed by a key that is not in the JWKS was accepted',
    );

    const two = await playout.issueToken({ signWithRetiredKey: true });
    const secondTry = await client.authenticate('unknown-2', two.token);
    expectRefusedWith(
      secondTry.error,
      AUTH_TOKEN_INVALID,
      'the second unknown-kid token was accepted',
    );

    const spent = playout.requestCounts.jwks - before;
    expect(
      spent,
      `two unknown kids cost ${String(spent)} JWKS fetches — the 60 s cooldown is not holding`,
    ).toBeLessThanOrEqual(1);

    /*
      POSITIVE CONTROL #2, and the one that matters most here: the counter MOVES when a
      verifier with nothing cached asks. Without it, `spent <= 1` would pass against a fake
      Playout whose jwks route had been renamed, a bridge pointed at the wrong URL, or a
      counter frozen at whatever it happened to hold.
    */
    const beforeFreshBridge = playout.requestCounts.jwks;
    second = await bridgeAgainst(playout);
    const fresh = await openClient(second);
    const elsewhere = await fresh.authenticate('warm-2', (await playout.issueToken()).token);
    expect(elsewhere.error, 'the second bridge could not verify a good token').toBeUndefined();
    expect(
      playout.requestCounts.jwks,
      'a bridge with an EMPTY cache verified without reading the JWKS — the counter is stuck',
    ).toBe(beforeFreshBridge + 1);
  });
});

describe('C-037 — a key the JWKS no longer publishes', () => {
  it('a key dropped BEFORE the bridge ever fetched verifies nothing', async () => {
    /*
      `rotateKeyReplacing()` is the contract VIOLATED on purpose: §3.5 says a retired `kid`
      stays published for at least 24 h, precisely so that every token already in an
      operator's browser — access tokens live 12 h (§3.5's `ACCESS_TOKEN_TTL_SEC`) — keeps
      verifying until it expires on its own. A Playout that dropped a key the moment it
      rotated would sign out every console mid-shift, and no bridge could do anything about
      it: the bridge cannot verify a signature whose public key nobody publishes.

      This spec is about what the BRIDGE does when that happens, which is the only half the
      bridge owns: refuse, with the sentence for "could not be verified", and never with a
      sentence suggesting the operator can fix it by signing in again on the same Playout.

      MEASURED: refused, `jwks = 1` — one fetch, which returned the new key alone.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    /*
      The token is minted BEFORE the rotation because it has to be: after
      `rotateKeyReplacing()` the original kid is no longer published, and `issueToken({ kid })`
      refuses to sign with an unpublished key. Minting touches no socket, so the bridge's
      cache is still empty here — which is what makes the fetch below happen AFTER the drop.
    */
    const originalKid = playout.activeKid;
    const signedByTheDroppedKey = await playout.issueToken();
    const replacement = await playout.rotateKeyReplacing();
    expect(replacement.kid, 'the fixture rotated to the same kid').not.toBe(originalKid);

    const refused = await client.authenticate('dropped', signedByTheDroppedKey.token);
    expectRefusedWith(
      refused.error,
      AUTH_TOKEN_INVALID,
      'a token signed by a key the JWKS no longer publishes was accepted',
    );

    /*
      POSITIVE CONTROL — the same socket, the same bridge, the same fetched JWKS, a token
      signed by the key that IS published. Without it the refusal above reads as "this bridge
      refuses everything": the fake Playout is unreachable, the issuer is wrong, the socket is
      broken. The control shares every one of those failure modes with the claim, which is
      what makes it a control rather than a second test.
    */
    const current = await playout.issueToken();
    const accepted = await client.authenticate('published', current.token);
    expect(
      accepted.error,
      'the bridge refuses even the key the JWKS publishes — the refusal above proves nothing',
    ).toBeUndefined();
  });

  it('a key dropped AFTER the bridge cached it KEEPS verifying — the measured asymmetry, and why the contract publishes a retired key for 24 h', async () => {
    /*
      🔴 MEASURED, and the second place the brief's expectation did not survive contact.

      Same provocation as the spec above, one step later: the bridge fetches the JWKS FIRST
      (a sign-in), and only then does the Playout drop the key. MEASURED, `jwks = 1`
      throughout:

      - the token signed by the DROPPED key is still ACCEPTED — it is verified against the
        cached key set, and nothing re-reads the JWKS for a `kid` that matches;
      - the token signed by the NEW, PUBLISHED key is REFUSED — its `kid` is unknown to the
        cache and the cooldown forbids the re-fetch that would find it.

      For up to `cacheMaxAge` (one hour) the two keys have swapped places from the bridge's
      point of view: the retired one works and the live one does not. This is pinned rather
      than filed as a defect because it is the correct behaviour of an OFFLINE verifier — the
      cache is exactly what keeps a Playout outage out of the path to air (`playout-auth.ts`'s
      header) — and it is the operational argument for §3.5's 24 h rule stated from the
      bridge's side: a Playout that keeps retired keys published costs nobody anything,
      while a Playout that drops one is refusing sign-ins on its own new key for as long as
      any bridge's cache is warm.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const signedByTheKeyAboutToGo = await playout.issueToken();
    const warm = await client.authenticate('warm', signedByTheKeyAboutToGo.token);
    expect(warm.error, 'the apparatus is dead — a good token was refused').toBeUndefined();
    const afterWarmUp = playout.requestCounts.jwks;

    await playout.rotateKeyReplacing();

    const stillAccepted = await client.authenticate('cached-key', signedByTheKeyAboutToGo.token);
    expect(
      stillAccepted.error,
      'the cached key set stopped verifying a token it had already accepted, with no new fetch to explain it',
    ).toBeUndefined();

    /*
      THE CONTROL FOR THAT ACCEPTANCE, and it has to be an acceptance's control: a spec whose
      claim is "yes" passes against a bridge that says yes to everything. The same socket,
      one line later, REFUSES a token signed by the key the JWKS now publishes — so the
      verifier is discriminating on the `kid` and not rubber-stamping.
    */
    const withTheNewKey = await playout.issueToken();
    const refused = await client.authenticate('new-key', withTheNewKey.token);
    expectRefusedWith(
      refused.error,
      AUTH_TOKEN_INVALID,
      'this bridge accepts every token — the acceptance above measures nothing',
    );
    expect(
      playout.requestCounts.jwks,
      'the JWKS was re-read inside the cooldown, so neither answer above is about the cache',
    ).toBe(afterWarmUp);
  });
});

describe('C-037 / ADR 0010 rule 9 — the BRIDGE reads the JWKS, the BROWSER gets the token', () => {
  it('a sign-in costs the bridge ONE JWKS read and ZERO calls to D1 — it never sees a password', async () => {
    /*
      ADR 0010 rule 9 split into the two things a counter can actually see: the bridge fetches
      D3 (public keys, no credential) and never fetches D1 (where a password is posted). The
      whole reason the bridge holds no credential of its own is that a signature answers
      "is this token good?" offline — `playout-auth.ts`'s header, and the reason a Playout
      outage cannot take the station off air.

      MEASURED, in this order: `{jwks: 0, token: 0}` at boot · `{jwks: 0, token: 1}` after the
      browser's own D1 post · `{jwks: 1, token: 1}` after the token reached the bridge.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    /*
      A bridge that has verified nothing has read nothing: `createRemoteJWKSet` is lazy, so
      this is also the proof that the fetch measured below is caused by the SIGN-IN and not by
      the boot.
    */
    expect(playout.requestCounts.jwks, 'the bridge read the JWKS before anyone signed in').toBe(0);
    expect(playout.requestCounts.token, 'the bridge called D1 at boot').toBe(0);

    /*
      POSITIVE CONTROL for every `token` assertion in this test, and it doubles as the rule
      itself: the BROWSER's half, performed here by a real HTTP post to D1 exactly as CG
      Control's sign-in screen does it. It moves the counter 0 → 1, so "the bridge never
      called D1" below is a statement about a counter that demonstrably moves when D1 is
      called — and not about a route that 404s before it is counted.
    */
    const response = await fetch(playout.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: FAKE_OPERATOR.username,
        password: FAKE_PLAYOUT_PASSWORD,
      }),
    });
    expect(response.status, 'the fake Playout refused the fixture credentials').toBe(200);
    const token = accessTokenOf(await response.json());
    expect(playout.requestCounts.token, 'the browser post was not counted').toBe(1);
    expect(playout.requestCounts.jwks, 'a D1 post caused a JWKS read — by whom?').toBe(0);

    const signIn = await client.authenticate('browser-token', token);
    expect(signIn.error, 'the bridge refused a token D1 had just issued').toBeUndefined();

    expect(
      playout.requestCounts.jwks,
      'the bridge verified a token without reading the JWKS — it cannot have checked the signature',
    ).toBe(1);
    expect(
      playout.requestCounts.token,
      'the BRIDGE called D1 — it must never post credentials, nor see them (ADR 0010 rule 9)',
    ).toBe(1);
    expect(
      playout.requestCounts.refresh,
      'the bridge called D2 — refreshing a token belongs to the browser too',
    ).toBe(0);
  });
});
