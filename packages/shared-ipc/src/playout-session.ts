/**
 * 🔴 `R-066` / ADR 0010 rule 9, and `CENTRAL-BRIDGE-01` (D7) — **THE PLAYOUT'S D1 (sign in) AND D2
 * (refresh), ONCE, FOR EVERY CALLER.**
 *
 * Two callers now: the console signs its operator in (in a browser with `fetch`, and — 7.2 — in CG
 * Control natively), and CG Bridge signs ITSELF in as the station's own account (rule 8), through
 * its server-side `playoutFetch` (no `Origin`, no proxy, one IPv4). Both read the same two answers
 * the same way, so the parsing lives here once — moved from the console's `playoutSession.ts`,
 * which keeps only what is the browser's own (where the session is stored).
 *
 * Nothing here stores anything, and nothing here ever holds a password beyond the one request that
 * carries it.
 */

/**
 * The contract's error CODES (§4.6), carried rather than the Playout's own `message`.
 *
 * The contract says so in as many words: the free-text `message` is _"never shown verbatim on
 * air surfaces — CG Control maps `error` to its own sentence"_. A Persian sentence written by
 * another team, rendered unread onto a console at 21:00, is exactly the class of surface text
 * this repo refuses.
 *
 * `unreachable` is ours and not theirs: it is the one failure with no HTTP answer at all.
 */
export const SIGN_IN_FAILURES = [
  'invalid_credentials',
  'no_cg_access',
  'account_locked',
  'rate_limited',
  'invalid_refresh_token',
  'unreachable',
  'unexpected',
] as const;

export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

/**
 * `DELTA-MULTI-CHANNEL-01-B` B3 — **WHAT THE PLAYOUT ACTUALLY ANSWERED, FOR THE RECORD.** The
 * surface shows its own sentence for the `code`, never the Playout's text; the text is kept here
 * so the station's log can carry it, which is where a person diagnosing a refusal looks.
 */
export interface SignInFailureDetail {
  /** The HTTP status, or `null` when nothing answered at all. */
  readonly status: number | null;
  /** The body as the Playout sent it, cut to {@link RECORD_BODY_MAX}; empty when there was none. */
  readonly body: string;
}

/** The most of a Playout body the record keeps. */
export const RECORD_BODY_MAX = 2000;

/** Thrown by {@link signInToPlayout} / {@link refreshPlayoutToken}; the surface maps `code`. */
export class PlayoutSignInError extends Error {
  readonly code: SignInFailure;
  readonly detail: SignInFailureDetail | null;
  constructor(code: SignInFailure, detail: SignInFailureDetail | null = null) {
    super(`playout sign-in failed: ${code}`);
    this.name = 'PlayoutSignInError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * The part of a `fetch` answer this module reads. STRUCTURAL, because this package is built with no
 * DOM library: a browser's `Response` and Node's are both this shape, so both callers' own `fetch`
 * is accepted as it is.
 */
export interface PlayoutResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** A `fetch` as this module calls it — a browser's `fetch`, or the bridge's `playoutFetch`. */
export type PlayoutFetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<PlayoutResponseLike>;

/** A D1/D2 answer, reduced to what a holder keeps. */
export interface PlayoutTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** `exp`, epoch milliseconds — what the refresh timer counts down to. */
  readonly expiresAtMs: number;
}

/** The D1/D2 body, as the contract defines it. Only the fields a caller uses. */
interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  principal?: unknown;
}

/**
 * ADR 0010 rule 9 — the D1 `principal` is a CONVENIENCE ECHO for a UI and nothing more. The bridge
 * trusts only the JWT; anything shown from here is a guess the verified answer replaces.
 */
export interface PlayoutEcho {
  readonly name: string;
}

export interface SignInOutcome {
  readonly session: PlayoutTokens;
  readonly echo: PlayoutEcho | null;
}

/**
 * Map an HTTP answer onto one of the contract's codes.
 *
 * ⚠ The STATUS is the fallback, never the primary: the contract says `error` is the stable
 * snake_case code and a status can be reused (both `invalid_credentials` and
 * `invalid_refresh_token` are `401`). Reading the body first is what keeps the two apart.
 */
async function failureFrom(res: PlayoutResponseLike): Promise<PlayoutSignInError> {
  // B3 — the body is read as TEXT first and kept, whatever it turns out to be.
  let text = '';
  try {
    text = await res.text();
  } catch {
    // No body to keep.
  }
  const detail: SignInFailureDetail = { status: res.status, body: text.slice(0, RECORD_BODY_MAX) };
  try {
    const body: unknown = JSON.parse(text);
    const code = (body as { error?: unknown } | null)?.error;
    if (
      code === 'invalid_credentials' ||
      code === 'no_cg_access' ||
      code === 'account_locked' ||
      code === 'rate_limited' ||
      code === 'invalid_refresh_token'
    ) {
      return new PlayoutSignInError(code, detail);
    }
  } catch {
    // No body, or not JSON. Fall through to the status.
  }
  const byStatus: SignInFailure =
    res.status === 401
      ? 'invalid_credentials'
      : res.status === 403
        ? 'no_cg_access'
        : res.status === 423
          ? 'account_locked'
          : res.status === 429
            ? 'rate_limited'
            : 'unexpected';
  return new PlayoutSignInError(byStatus, detail);
}

function tokensFrom(body: TokenResponse, nowMs: number): PlayoutTokens {
  const accessToken = body.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new PlayoutSignInError('unexpected');
  }
  /*
    ⚠ `expires_in` is the contract's field and it is SECONDS. A default is deliberately NOT
    invented when it is missing: an absent lifetime that we guessed at would put the refresh
    timer at a moment we made up, and a refresh that fires late is a session that goes quiet
    mid-shift. A malformed answer is an error, not a value.
  */
  const expiresIn = body.expires_in;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PlayoutSignInError('unexpected');
  }
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresAtMs: nowMs + expiresIn * 1000,
  };
}

function echoFrom(body: TokenResponse): PlayoutEcho | null {
  const principal = body.principal;
  if (typeof principal !== 'object' || principal === null) return null;
  const name = (principal as { name?: unknown }).name;
  return typeof name === 'string' && name !== '' ? { name } : null;
}

async function postJson(
  url: string,
  payload: unknown,
  fetchImpl: PlayoutFetchLike,
): Promise<PlayoutResponseLike> {
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch {
    /*
      🔴 A NETWORK failure and an HTTP failure are DIFFERENT FACTS and get different sentences.
      "Wrong password" and "the Playout cannot be reached" send the operator to two different
      places, and flattening them would send half of them to the wrong one.
    */
    throw new PlayoutSignInError('unreachable', { status: null, body: '' });
  }
}

async function tokenBody(res: PlayoutResponseLike): Promise<TokenResponse> {
  if (!res.ok) throw await failureFrom(res);
  try {
    return (await res.json()) as TokenResponse;
  } catch {
    throw new PlayoutSignInError('unexpected');
  }
}

export interface PlayoutTokenDeps {
  /** The request. A browser's `fetch`, or the bridge's `playoutFetch` (no `Origin`). */
  readonly fetchImpl?: PlayoutFetchLike;
  readonly nowMs?: () => number;
}

/** The runtime's own `fetch`, read when called — a test that replaces `globalThis.fetch` is honoured. */
const globalFetch: PlayoutFetchLike = (url, init) => {
  const f = (globalThis as { fetch?: PlayoutFetchLike }).fetch;
  if (f === undefined) return Promise.reject(new Error('no fetch in this runtime'));
  return f(url, init);
};

/** D1 — `POST /api/cg/auth/token`. The password is in this one request body and nowhere else. */
export async function signInToPlayout(
  tokenUrl: string,
  username: string,
  password: string,
  deps: PlayoutTokenDeps = {},
): Promise<SignInOutcome> {
  const nowMs = deps.nowMs ?? ((): number => Date.now());
  const body = await tokenBody(
    await postJson(tokenUrl, { username, password }, deps.fetchImpl ?? globalFetch),
  );
  return { session: tokensFrom(body, nowMs()), echo: echoFrom(body) };
}

/**
 * D2 — `POST /api/cg/auth/refresh`. A rotated `refresh_token` replaces the old one, which the
 * Playout then refuses: the refresh token is single-use, so a holder persists the new one before
 * it uses anything the answer carries.
 */
export async function refreshPlayoutToken(
  refreshUrl: string,
  refreshToken: string,
  deps: PlayoutTokenDeps = {},
): Promise<PlayoutTokens> {
  const nowMs = deps.nowMs ?? ((): number => Date.now());
  const body = await tokenBody(
    await postJson(refreshUrl, { refresh_token: refreshToken }, deps.fetchImpl ?? globalFetch),
  );
  return tokensFrom(body, nowMs());
}

/**
 * 🔴 **WHEN TO REFRESH — about ten minutes before `exp`, and never in the past.**
 *
 * The contract's own number (§3.5): _"refreshes ~10 min before expiry"_. Access tokens live twelve
 * hours, one shift, so this fires roughly once per shift and the ten minutes is the margin for a
 * Playout that is briefly busy.
 *
 * ⚠ Clamped at zero rather than allowed to go negative, because a session restored from storage
 * may ALREADY be inside the window.
 */
export const REFRESH_LEAD_MS = 10 * 60 * 1000;

export function refreshDelayMs(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, expiresAtMs - REFRESH_LEAD_MS - nowMs);
}
