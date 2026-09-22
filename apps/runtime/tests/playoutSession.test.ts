import { beforeEach, describe, expect, it } from 'vitest';
import {
  PlayoutSignInError,
  REFRESH_LEAD_MS,
  loadPlayoutSession,
  refreshDelayMs,
  refreshPlayoutToken,
  savePlayoutSession,
  sessionExpired,
  signInToPlayout,
  type StoredSession,
} from '../src/platform/playoutSession.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `R-066` acceptance — **WHEN signed in THEN the token is held per console, survives a
 * reload, … and is refreshed about 10 minutes before expiry while the page is open; sign-out
 * clears it.**
 *
 * ── WHAT THIS FILE ASSERTS, AND WHY IT IS A PLAIN UNIT SPEC ─────────────────
 *
 * `platform/playoutSession.ts` is the only place in the SPA that talks to the Playout, and it
 * is the half of `R-066` with no surface at all: a store, a pair of POSTs and the arithmetic
 * that decides WHEN the console goes back for a new token. None of that renders, so none of it
 * can be measured by an e2e — and all of it fails silently. A refresh timer computed from a
 * lifetime we guessed at does not look wrong until 21:00 on a shift.
 *
 * Three properties carry the acceptance clause, and each is pinned here:
 *
 *   1. **SURVIVES A RELOAD** — `loadPlayoutSession` reads THROUGH to storage every time, with
 *      no module-level cache to go stale. That is what makes a reload a non-event, and it is
 *      asserted by having another "tab" write the key directly and reading it back.
 *   2. **REFRESHED ABOUT TEN MINUTES BEFORE EXPIRY** — `refreshDelayMs` / `REFRESH_LEAD_MS`.
 *      The ten minutes is asserted ONCE against the constant's own value, and every other
 *      expectation is COMPUTED FROM the constant, so a change to it cannot slip through a spec
 *      that quietly restated the old number.
 *   3. **SIGN-OUT CLEARS IT** — `savePlayoutSession(null)` removes the key, not merely the
 *      in-memory view.
 *
 * On top of that, every way the Playout can say no is mapped to the contract's own `error`
 * code (§4.6), because the surface picks its sentence from that code and a code that collapsed
 * would send half the operators to the wrong remedy — "wrong password" and "the Playout cannot
 * be reached" are two different rooms to walk to.
 *
 * ⚠ **POSITIVE CONTROLS ARE NOT DECORATION HERE.** Nearly every claim below is a NEGATIVE one
 * — `null`, a throw, a refusal — and an implementation that answered `null` to everything, or
 * a stub that never got called at all, would satisfy them without testing anything. Each
 * describe therefore carries a control that a broken-or-absent mechanism FAILS, and says what
 * it controls for.
 *
 * ⚠ Node environment, not jsdom: this module renders nothing, and the only browser API it
 * touches is `localStorage`, which the in-memory stand-in supplies (jsdom's opaque origin has
 * no store of its own, so jsdom would buy nothing and hide the dependency).
 */

/** The census pins this same literal in `persistedKeyCensus.test.ts`; see the key spec below. */
const CENSUS_KEY = 'cg.runtime.playoutSession';

let storage: Storage;

beforeEach(() => {
  storage = installMemoryStorage();
});

/** A session with no meaning of its own — its fields exist to be compared, not believed. */
function aSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    accessToken: 'header.payload.signature',
    refreshToken: 'opaque-refresh-1',
    expiresAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

/**
 * Storage that refuses everything, as a browser in private mode does.
 *
 * ⚠ It throws on EVERY member, not only the one under test: the module's guard is a `try`
 * around the whole read, and a stand-in that threw on `getItem` alone would let a future
 * `length` or `key()` read escape the guard unnoticed.
 */
function installThrowingStorage(): void {
  const refuse = (): never => {
    throw new Error('storage is disabled for this origin');
  };
  const hostile: Storage = {
    get length(): number {
      return refuse();
    },
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: hostile, configurable: true });
}

interface FetchCall {
  readonly url: string;
  /** The JSON this console POSTed, parsed back. `null` when it sent no string body. */
  readonly payload: unknown;
}

type Answer = () => Promise<Response>;

/**
 * A `fetch` stand-in that RECORDS what was asked and answers from a queue.
 *
 * The recording is the point as much as the answering: a spec that only asserted "it threw"
 * would pass against a function that threw before ever reaching the network, so the specs
 * below check the call was made, to the URL they named, carrying the fields the contract
 * defines.
 */
function stubFetch(answers: readonly Answer[], calls: FetchCall[]): typeof fetch {
  let n = 0;
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body;
    let payload: unknown = null;
    if (typeof body === 'string') payload = JSON.parse(body);
    calls.push({ url: String(input), payload });
    const answer = answers[n] ?? answers[answers.length - 1];
    n += 1;
    if (answer === undefined) throw new Error('stubFetch: no answer was configured');
    return answer();
  };
}

const jsonAnswer =
  (status: number, body: unknown): Answer =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    );

const textAnswer =
  (status: number, text: string): Answer =>
  () =>
    Promise.resolve(new Response(text, { status }));

/** No HTTP answer at all — the DNS/refused/offline case, which `fetch` surfaces as a reject. */
const networkFailure: Answer = () => Promise.reject(new TypeError('Failed to fetch'));

/** Resolve a rejection into a value, so the spec can assert about it rather than around it. */
async function rejectionFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err: unknown) {
    return err;
  }
  throw new Error('expected a rejection; the call RESOLVED');
}

/**
 * Narrow to the module's own error type.
 *
 * ⚠ This is an assertion, not a cast of convenience: a plain `Error` escaping from here means
 * the surface would fall back to its "unexpected" sentence, which is precisely the failure the
 * code table exists to prevent. It must fail loudly rather than be read as a `code`.
 */
function asSignInError(err: unknown): PlayoutSignInError {
  if (!(err instanceof PlayoutSignInError)) {
    throw new Error(`expected a PlayoutSignInError, got: ${String(err)}`);
  }
  return err;
}

const TOKEN_URL = 'https://playout.example/api/cg/auth/token';
const REFRESH_URL = 'https://playout.example/api/cg/auth/refresh';

describe('R-066 — the token is HELD PER CONSOLE and survives a reload', () => {
  it('a saved session loads back identical — the whole round trip, field for field', () => {
    const session = aSession();
    savePlayoutSession(session);
    expect(loadPlayoutSession()).toEqual(session);
  });

  it('the key it writes is the one the persisted-key census knows about', () => {
    /*
      The census (`persistedKeyCensus.test.ts`) pins the NAME from the other direction. This
      pins that `savePlayoutSession` actually writes THAT key — the two specs together are what
      stop a rename from silently orphaning every signed-in console's stored session.
    */
    savePlayoutSession(aSession());
    expect(storage.length, 'nothing was written at all').toBe(1);
    expect(storage.key(0)).toBe(CENSUS_KEY);
  });

  it('🔴 loadPlayoutSession READS THROUGH — a value another tab wrote is seen, with no reload', () => {
    /*
      This is what "survives a reload" reduces to for a browser console: there is no cached
      view to go stale, so every read is the current truth. Asserted the hard way — a SECOND
      writer puts a different session under the key and the next read must return THAT one.

      The first expectation is the positive control for the second: without it, a
      `loadPlayoutSession` that always returned the freshest thing in storage and a
      `loadPlayoutSession` that always returned `null` would be indistinguishable.
    */
    const first = aSession({ accessToken: 'token-from-this-tab' });
    savePlayoutSession(first);
    expect(loadPlayoutSession()).toEqual(first);

    const fromAnotherTab = aSession({
      accessToken: 'token-from-another-tab',
      refreshToken: 'opaque-refresh-9',
      expiresAtMs: 1_700_000_999_000,
    });
    storage.setItem(CENSUS_KEY, JSON.stringify(fromAnotherTab));

    expect(loadPlayoutSession(), 'the module cached its own view of storage').toEqual(
      fromAnotherTab,
    );
  });

  it('🔴 SIGN-OUT CLEARS IT — the key is removed, not merely forgotten in memory', () => {
    savePlayoutSession(aSession());
    expect(loadPlayoutSession(), 'the control: there was something to clear').not.toBeNull();

    savePlayoutSession(null);

    expect(loadPlayoutSession()).toBeNull();
    // …and the storage slot itself is gone, so the next reload has nothing to half-parse.
    expect(storage.getItem(CENSUS_KEY)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('an empty store is not a session — the baseline every other spec here stands on', () => {
    expect(loadPlayoutSession()).toBeNull();
  });
});

describe('R-066 — a CORRUPT stored session is survived, never thrown', () => {
  /*
    A console whose stored session was truncated by a crash, half-written by an older build, or
    edited by hand must come up SIGNED OUT and usable. A throw here happens at module read time
    on a boot path, which is the one moment a console cannot afford to be a blank page.

    Every row is a distinct way the value can be wrong, named by what is wrong with it, because
    a table that only said "bad" is a table nobody can tell has stopped covering a branch.
  */
  const corrupt: readonly { readonly what: string; readonly raw: string }[] = [
    { what: 'not JSON at all', raw: '{"accessToken": "tru' },
    { what: 'JSON, but a string rather than an object', raw: '"just-a-bare-token"' },
    { what: 'JSON, but a number', raw: '42' },
    { what: 'the literal null, which `typeof` calls an object', raw: 'null' },
    {
      what: 'an object with no accessToken',
      raw: JSON.stringify({ refreshToken: 'r', expiresAtMs: 1_700_000_000_000 }),
    },
    {
      what: 'an accessToken that is the empty string',
      raw: JSON.stringify({ accessToken: '', refreshToken: 'r', expiresAtMs: 1_700_000_000_000 }),
    },
    {
      what: 'an accessToken that is a number',
      raw: JSON.stringify({ accessToken: 7, expiresAtMs: 1_700_000_000_000 }),
    },
    {
      what: 'an expiresAtMs that is a string',
      raw: JSON.stringify({ accessToken: 'a', expiresAtMs: '1700000000000' }),
    },
    // JSON has no NaN, so a NaN expiry round-trips through `JSON.stringify` as `null`.
    {
      what: 'an expiresAtMs that is null (what a NaN expiry becomes)',
      raw: '{"accessToken":"a","expiresAtMs":null}',
    },
    /*
      ⚠ The one a `typeof x === 'number'` check alone would WAVE THROUGH. `JSON.parse('1e999')`
      is `Infinity`, which is a number; a session that never expires is a refresh timer that
      never fires. This row is why the guard reads `Number.isFinite`.
    */
    { what: 'an expiresAtMs that is Infinity', raw: '{"accessToken":"a","expiresAtMs":1e999}' },
  ];

  for (const { what, raw } of corrupt) {
    it(`${what} → null, and no throw`, () => {
      storage.setItem(CENSUS_KEY, raw);
      expect(() => loadPlayoutSession()).not.toThrow();
      expect(loadPlayoutSession()).toBeNull();
    });
  }

  it('🔴 POSITIVE CONTROL — a VALID stored value yields a session, so "always null" cannot pass', () => {
    /*
      Without this, every row above is satisfied by `loadPlayoutSession = () => null`, and the
      console would come up signed out after every reload while the whole table stayed green.
      It is written against a HAND-BUILT string rather than `savePlayoutSession`'s output so it
      controls for the reader alone, not for the writer-and-reader pair agreeing on nonsense.
    */
    storage.setItem(
      CENSUS_KEY,
      '{"accessToken":"header.payload.signature","refreshToken":"opaque-refresh-1","expiresAtMs":1700000000000}',
    );
    expect(loadPlayoutSession()).toEqual({
      accessToken: 'header.payload.signature',
      refreshToken: 'opaque-refresh-1',
      expiresAtMs: 1_700_000_000_000,
    });
  });

  it('a missing refreshToken is NORMALISED to null, not treated as corruption', () => {
    /*
      The contract only SHOULDs a refresh token. A session without one is a valid session that
      simply cannot be refreshed — `#scheduleRefresh` reads exactly this `null` and declines to
      arm a timer — so rejecting it would sign out a console that is perfectly able to work.
    */
    storage.setItem(CENSUS_KEY, '{"accessToken":"a","expiresAtMs":1700000000000}');
    expect(loadPlayoutSession()).toEqual({
      accessToken: 'a',
      refreshToken: null,
      expiresAtMs: 1_700_000_000_000,
    });
  });
});

describe('R-066 — STORAGE THAT REFUSES is an absent session, never a crash', () => {
  it('loadPlayoutSession returns null when the store itself throws', () => {
    installThrowingStorage();
    expect(() => loadPlayoutSession()).not.toThrow();
    expect(loadPlayoutSession()).toBeNull();
  });

  it('savePlayoutSession does not throw when the write is refused', () => {
    installThrowingStorage();
    expect(() => savePlayoutSession(aSession())).not.toThrow();
  });

  it('…and neither does the sign-out clear, which runs on the same refusing store', () => {
    installThrowingStorage();
    expect(() => savePlayoutSession(null)).not.toThrow();
  });

  it('🔴 POSITIVE CONTROL — the identical calls SUCCEED against a working store', () => {
    /*
      The control for all three above: it proves they returned `null` / stayed silent because
      the STORE refused, not because the session value was junk or the functions are no-ops.
      Same value, same calls, one difference — the store.
    */
    const session = aSession();
    savePlayoutSession(session);
    expect(loadPlayoutSession()).toEqual(session);
  });
});

describe('R-066 / contract §4.6 — D1 maps EVERY refusal to its own code', () => {
  /*
    The surface picks its Persian sentence from `code` and never from the Playout's free-text
    `message`. So a code that collapsed into a neighbour is not a cosmetic defect: it sends an
    operator whose ACCOUNT IS LOCKED to go and retype a password they already typed correctly.
  */
  const cases: readonly { readonly code: string; readonly status: number }[] = [
    { code: 'invalid_credentials', status: 401 },
    { code: 'no_cg_access', status: 403 },
    { code: 'account_locked', status: 423 },
    { code: 'rate_limited', status: 429 },
  ];

  for (const { code, status } of cases) {
    it(`${status} carrying \`${code}\` throws a PlayoutSignInError with THAT code`, async () => {
      const calls: FetchCall[] = [];
      const err = asSignInError(
        await rejectionFrom(
          signInToPlayout(TOKEN_URL, 'cg-op1', 'test-only-not-a-secret', {
            fetchImpl: stubFetch(
              [jsonAnswer(status, { error: code, message: 'a sentence in someone else"s words' })],
              calls,
            ),
          }),
        ),
      );
      expect(err.code).toBe(code);
      // It reached the network at all, and went where it was told — without this the spec
      // would also pass against a function that threw before ever calling fetch.
      expect(calls.length).toBe(1);
      expect(calls[0]?.url).toBe(TOKEN_URL);
    });
  }

  it('🔴 a REJECTED fetch is `unreachable` — the one failure with a different remedy', async () => {
    /*
      No HTTP answer at all. "Wrong password" and "the Playout cannot be reached" send the
      operator to two different places; flattening them would send half of them to the wrong
      one, and this is the half that cannot be fixed by typing more carefully.
    */
    const calls: FetchCall[] = [];
    const err = asSignInError(
      await rejectionFrom(
        signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
          fetchImpl: stubFetch([networkFailure], calls),
        }),
      ),
    );
    expect(err.code).toBe('unreachable');
    expect(calls.length, 'it must actually have tried').toBe(1);
  });

  it('🔴 a 401 whose BODY says `invalid_refresh_token` maps to THAT, not to invalid_credentials', async () => {
    /*
      The proof that the BODY is read before the STATUS. Both codes are 401 by the contract's
      own design, so a mapper that switched on the status would answer `invalid_credentials`
      here — and the console would tell an operator their password was wrong when what expired
      was a token they never typed.
    */
    const err = asSignInError(
      await rejectionFrom(
        signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
          fetchImpl: stubFetch([jsonAnswer(401, { error: 'invalid_refresh_token' })], []),
        }),
      ),
    );
    expect(err.code).toBe('invalid_refresh_token');
  });

  it('the STATUS is the fallback when there is no usable body — 423 with junk is still locked', async () => {
    const err = asSignInError(
      await rejectionFrom(
        signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
          fetchImpl: stubFetch([textAnswer(423, '<html>Gateway</html>')], []),
        }),
      ),
    );
    expect(err.code).toBe('account_locked');
  });

  it('a status nobody defined is `unexpected` — never guessed into a neighbouring code', async () => {
    const err = asSignInError(
      await rejectionFrom(
        signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
          fetchImpl: stubFetch([textAnswer(500, 'boom')], []),
        }),
      ),
    );
    expect(err.code).toBe('unexpected');
  });

  it('the five codes are DISTINCT — a mapper that answered one code would pass each spec above', () => {
    /*
      🔴 The control for the table. Every spec above asserts a single expected code in
      isolation, which a `code` that had been collapsed to a constant cannot fail one at a
      time. This is what makes them mean what they read as.
    */
    const codes = [...cases.map((c) => c.code), 'unreachable', 'unexpected'];
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('R-066 — a 200 with a MALFORMED body is an error, not a value', () => {
  /*
    ⚠ WHY NO DEFAULT LIFETIME IS INVENTED. `expires_in` is the contract's field and it is
    SECONDS. When it is missing or nonsense the honest answer is an error, because a guessed
    expiry puts the REFRESH TIMER at a moment we made up: guess too long and the console goes
    quiet mid-shift with an `exp` already behind it, guess too short and it hammers the Playout.
    A wrong number here is invisible until the exact moment it matters, which is why it must
    never be manufactured.
  */
  const malformed: readonly { readonly what: string; readonly body: unknown }[] = [
    { what: 'no access_token', body: { expires_in: 43200 } },
    { what: 'an access_token that is the empty string', body: { access_token: '', expires_in: 1 } },
    { what: 'an access_token that is not a string', body: { access_token: 12345, expires_in: 1 } },
    { what: 'no expires_in', body: { access_token: 'jwt' } },
    { what: 'an expires_in that is a string', body: { access_token: 'jwt', expires_in: '43200' } },
    { what: 'an expires_in of zero', body: { access_token: 'jwt', expires_in: 0 } },
    { what: 'a negative expires_in', body: { access_token: 'jwt', expires_in: -1 } },
    { what: 'an expires_in that is null', body: { access_token: 'jwt', expires_in: null } },
  ];

  for (const { what, body } of malformed) {
    it(`200 with ${what} → code \`unexpected\``, async () => {
      const err = asSignInError(
        await rejectionFrom(
          signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
            fetchImpl: stubFetch([jsonAnswer(200, body)], []),
            nowMs: () => 1_700_000_000_000,
          }),
        ),
      );
      expect(err.code).toBe('unexpected');
    });
  }

  it('200 whose body is not JSON at all → code `unexpected`', async () => {
    const err = asSignInError(
      await rejectionFrom(
        signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
          fetchImpl: stubFetch([textAnswer(200, 'OK')], []),
        }),
      ),
    );
    expect(err.code).toBe('unexpected');
  });

  it('🔴 POSITIVE CONTROL — the same plumbing with a WELL-FORMED body resolves', async () => {
    /*
      Without this, the table above is satisfied by a `signInToPlayout` that rejects every 200,
      and nobody could ever sign in while the file stayed green.
    */
    const outcome = await signInToPlayout(TOKEN_URL, 'cg-op1', 'pw', {
      fetchImpl: stubFetch([jsonAnswer(200, { access_token: 'jwt', expires_in: 1 })], []),
      nowMs: () => 1_700_000_000_000,
    });
    expect(outcome.session.accessToken).toBe('jwt');
  });
});

describe('R-066 — a GOOD 200 becomes a session, and the expiry is COMPUTED not copied', () => {
  const NOW = 1_700_000_000_000;
  const TWELVE_HOURS_S = 12 * 60 * 60;

  it('🔴 expiresAtMs is nowMs() + expires_in × 1000 — seconds converted, clock injected', async () => {
    const calls: FetchCall[] = [];
    const outcome = await signInToPlayout(TOKEN_URL, 'cg-op1', 'test-only-not-a-secret', {
      fetchImpl: stubFetch(
        [
          jsonAnswer(200, {
            access_token: 'header.payload.signature',
            refresh_token: 'opaque-refresh-1',
            expires_in: TWELVE_HOURS_S,
            principal: { name: 'علی رضایی', sub: 'u-1042' },
          }),
        ],
        calls,
      ),
      nowMs: () => NOW,
    });

    expect(outcome.session).toEqual({
      accessToken: 'header.payload.signature',
      refreshToken: 'opaque-refresh-1',
      // Computed from the injected clock and the answer's own seconds — never a literal, or
      // the spec would agree with a unit mix-up as readily as with the right answer.
      expiresAtMs: NOW + TWELVE_HOURS_S * 1000,
    });

    // The credentials go to the PLAYOUT, in the contract's field names, and the bridge is not
    // in this conversation at all.
    expect(calls).toEqual([
      { url: TOKEN_URL, payload: { username: 'cg-op1', password: 'test-only-not-a-secret' } },
    ]);
  });

  it('the principal ECHO is carried as `echo.name` — the name that appears before the bridge answers', async () => {
    const outcome = await signInToPlayout(TOKEN_URL, 'u', 'p', {
      fetchImpl: stubFetch(
        [
          jsonAnswer(200, {
            access_token: 'jwt',
            expires_in: 60,
            principal: { name: 'علی رضایی' },
          }),
        ],
        [],
      ),
      nowMs: () => NOW,
    });
    expect(outcome.echo?.name).toBe('علی رضایی');
    // The positive control for "it is really Persian": at least one Arabic-script codepoint
    // survived. A string comparison alone would pass against mojibake from a bad round trip,
    // which `P-025` records as a real event in this tree.
    expect(/[؀-ۿ]/.test(outcome.echo?.name ?? '')).toBe(true);
  });

  it('an ABSENT or unusable principal is `null`, not an empty name on the pill', async () => {
    /*
      The echo is a convenience the bridge's answer replaces one round trip later. A blank name
      rendered for that moment would read as a console that knows who you are and will not say
      — worse than the pill simply waiting.
    */
    for (const principal of [undefined, null, {}, { name: '' }, { name: 7 }, 'علی']) {
      const outcome = await signInToPlayout(TOKEN_URL, 'u', 'p', {
        fetchImpl: stubFetch(
          [jsonAnswer(200, { access_token: 'jwt', expires_in: 60, principal })],
          [],
        ),
        nowMs: () => NOW,
      });
      expect(outcome.echo, `principal ${JSON.stringify(principal)} produced an echo`).toBeNull();
    }
  });

  it('a 200 with no refresh_token still signs in, with refreshToken null', async () => {
    const outcome = await signInToPlayout(TOKEN_URL, 'u', 'p', {
      fetchImpl: stubFetch([jsonAnswer(200, { access_token: 'jwt', expires_in: 60 })], []),
      nowMs: () => NOW,
    });
    expect(outcome.session.refreshToken).toBeNull();
  });
});

describe('R-066 / contract D2 — the refresh ROTATES the token it was given', () => {
  const NOW = 1_700_000_000_000;

  it('🔴 sends the OLD refresh token and returns a session holding the NEW one', async () => {
    /*
      The contract SHOULDs rotation, and a console that kept the spent token would be refused
      at the NEXT refresh with `invalid_refresh_token` — indistinguishable, from the operator's
      seat, from having been revoked. Asserted in both directions: what went out, and what came
      back.
    */
    const calls: FetchCall[] = [];
    const session = await refreshPlayoutToken(REFRESH_URL, 'opaque-refresh-1', {
      fetchImpl: stubFetch(
        [
          jsonAnswer(200, {
            access_token: 'jwt-2',
            refresh_token: 'opaque-refresh-2',
            expires_in: 43200,
          }),
        ],
        calls,
      ),
      nowMs: () => NOW,
    });

    expect(calls).toEqual([{ url: REFRESH_URL, payload: { refresh_token: 'opaque-refresh-1' } }]);
    expect(session.refreshToken).toBe('opaque-refresh-2');
    expect(session.refreshToken).not.toBe('opaque-refresh-1');
    expect(session.accessToken).toBe('jwt-2');
    expect(session.expiresAtMs).toBe(NOW + 43200 * 1000);
  });

  it('🔴 `invalid_refresh_token` gets its OWN code, not the sign-in code that shares its status', async () => {
    const err = asSignInError(
      await rejectionFrom(
        refreshPlayoutToken(REFRESH_URL, 'opaque-refresh-spent', {
          fetchImpl: stubFetch([jsonAnswer(401, { error: 'invalid_refresh_token' })], []),
        }),
      ),
    );
    expect(err.code).toBe('invalid_refresh_token');
    expect(err.code).not.toBe('invalid_credentials');
  });

  it('a refresh that cannot reach the Playout is `unreachable`, same as a sign-in', async () => {
    const err = asSignInError(
      await rejectionFrom(
        refreshPlayoutToken(REFRESH_URL, 'opaque-refresh-1', {
          fetchImpl: stubFetch([networkFailure], []),
        }),
      ),
    );
    expect(err.code).toBe('unreachable');
  });

  it('a malformed 200 on the refresh path is `unexpected` too — no guessed lifetime here either', async () => {
    const err = asSignInError(
      await rejectionFrom(
        refreshPlayoutToken(REFRESH_URL, 'opaque-refresh-1', {
          fetchImpl: stubFetch([jsonAnswer(200, { access_token: 'jwt-2' })], []),
        }),
      ),
    );
    expect(err.code).toBe('unexpected');
  });
});

describe('R-066 — REFRESHED ABOUT TEN MINUTES BEFORE EXPIRY', () => {
  it('🔴 REFRESH_LEAD_MS IS ten minutes — asserted once, by value, so the lead cannot drift', () => {
    /*
      Every other expectation in this describe is COMPUTED FROM the constant, which makes them
      immune to a change of the number — and therefore blind to one. This one spec is where the
      ten minutes of the acceptance clause is actually pinned. Without it the whole describe
      would accept a lead of zero.
    */
    expect(REFRESH_LEAD_MS).toBe(10 * 60 * 1000);
  });

  it('the delay is exactly `expiresAtMs - REFRESH_LEAD_MS - nowMs` while that is positive', () => {
    const now = 1_700_000_000_000;
    const expiresAtMs = now + 12 * 60 * 60 * 1000;
    expect(refreshDelayMs(expiresAtMs, now)).toBe(expiresAtMs - REFRESH_LEAD_MS - now);
    // The positive control for the clamp specs below: a real, non-zero delay comes out of this
    // function, so "always 0" cannot pass them.
    expect(refreshDelayMs(expiresAtMs, now)).toBeGreaterThan(0);
  });

  it('one millisecond before the window opens it is still 1 ms, not rounded to nothing', () => {
    const now = 1_700_000_000_000;
    // Exactly one millisecond of waiting left: the boundary a `<` / `<=` slip would move.
    expect(refreshDelayMs(now + REFRESH_LEAD_MS + 1, now)).toBe(1);
  });

  it('🔴 at the edge of the window it is 0 — fire now, neither early nor never', () => {
    const now = 1_700_000_000_000;
    expect(refreshDelayMs(now + REFRESH_LEAD_MS, now)).toBe(0);
  });

  it('🔴 a session ALREADY inside the window clamps to 0 and never goes negative', () => {
    /*
      A console closed overnight comes back with eleven hours gone, so the restored session is
      already past the lead. `setTimeout` treats a negative delay as "immediately", which is the
      right behaviour — but only by accident, and an accident is not a contract. The clamp makes
      it a decision, and this is where that decision is held.
    */
    const now = 1_700_000_000_000;
    for (const expiresAtMs of [now + REFRESH_LEAD_MS - 1, now, now - 1, now - 11 * 3600 * 1000]) {
      const delay = refreshDelayMs(expiresAtMs, now);
      expect(delay, `expiry ${expiresAtMs} produced a negative delay`).toBe(0);
    }
  });

  it('the lead is taken from the EXPIRY, not from the delay being a fixed number', () => {
    /*
      Two different expiries, same clock: the difference between the delays must equal the
      difference between the expiries. A function that returned a constant — or that measured
      the lead from `now` instead of from `exp` — fails this and passes several above.
    */
    const now = 1_700_000_000_000;
    const a = refreshDelayMs(now + 2 * 60 * 60 * 1000, now);
    const b = refreshDelayMs(now + 3 * 60 * 60 * 1000, now);
    expect(b - a).toBe(60 * 60 * 1000);
  });
});

describe('R-066 — `sessionExpired` is true AT `exp`, not merely after it', () => {
  const session = aSession({ expiresAtMs: 1_700_000_000_000 });

  it('false before `exp` — including the last millisecond of validity', () => {
    expect(sessionExpired(session, session.expiresAtMs - 60_000)).toBe(false);
    expect(sessionExpired(session, session.expiresAtMs - 1)).toBe(false);
  });

  it('🔴 true AT `exp` — the boundary, which is the only interesting instant', () => {
    expect(sessionExpired(session, session.expiresAtMs)).toBe(true);
  });

  it('true after `exp`', () => {
    expect(sessionExpired(session, session.expiresAtMs + 1)).toBe(true);
    expect(sessionExpired(session, session.expiresAtMs + 12 * 3600 * 1000)).toBe(true);
  });
});

describe('R-066 — the whole session LIFECYCLE, on one store', () => {
  it('🔴 sign in → reload → refresh → sign out, with the store carrying it across each seam', async () => {
    /*
      Each step above is a property in isolation; this is the sequence an actual console lives.
      It is driven on ONE storage rather than a fresh one per step, because the defects worth
      catching are at the SEAMS — a refresh that saves the old refresh token, a sign-out that
      clears an in-memory view and leaves the key behind — and a spec that started clean at
      every step could not see any of them.
    */
    const now = 1_700_000_000_000;
    const twelveHoursS = 12 * 60 * 60;

    // 1. Sign in. The token is held per console.
    const outcome = await signInToPlayout(TOKEN_URL, 'cg-op1', 'test-only-not-a-secret', {
      fetchImpl: stubFetch(
        [
          jsonAnswer(200, {
            access_token: 'jwt-1',
            refresh_token: 'opaque-refresh-1',
            expires_in: twelveHoursS,
            principal: { name: 'علی رضایی' },
          }),
        ],
        [],
      ),
      nowMs: () => now,
    });
    savePlayoutSession(outcome.session);

    // 2. Reload. A brand-new page reads the same store and finds the same session.
    const afterReload = loadPlayoutSession();
    expect(afterReload, 'the session did not survive the reload').not.toBeNull();
    expect(afterReload?.accessToken).toBe('jwt-1');

    // 3. The refresh is armed for ten minutes before expiry, from the RESTORED session.
    const armedAt = now + 60_000;
    expect(refreshDelayMs(afterReload?.expiresAtMs ?? 0, armedAt)).toBe(
      now + twelveHoursS * 1000 - REFRESH_LEAD_MS - armedAt,
    );

    // 4. It fires. The rotated token replaces the spent one IN THE STORE, not only in memory.
    const refreshedAt = now + twelveHoursS * 1000 - REFRESH_LEAD_MS;
    const next = await refreshPlayoutToken(REFRESH_URL, afterReload?.refreshToken ?? '', {
      fetchImpl: stubFetch(
        [
          jsonAnswer(200, {
            access_token: 'jwt-2',
            refresh_token: 'opaque-refresh-2',
            expires_in: twelveHoursS,
          }),
        ],
        [],
      ),
      nowMs: () => refreshedAt,
    });
    savePlayoutSession(next);
    expect(loadPlayoutSession()?.accessToken).toBe('jwt-2');
    expect(loadPlayoutSession()?.refreshToken).toBe('opaque-refresh-2');
    expect(sessionExpired(next, refreshedAt)).toBe(false);

    // 5. Sign out. Nothing is left for the next operator at this console to inherit.
    savePlayoutSession(null);
    expect(loadPlayoutSession()).toBeNull();
    expect(storage.getItem(CENSUS_KEY)).toBeNull();
  });
});
