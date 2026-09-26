/**
 * 🔴 `R-066` / ADR 0010 rule 9 — **THE CONSOLE'S HALF OF THE PLAYOUT LINK: get a token, hold
 * it, and give it back on every (re)connect.**
 *
 * The browser obtains the token and the bridge only verifies it, so the bridge never sees a
 * password. This module is the only place in the SPA that talks to the Playout, and it talks
 * to it DIRECTLY — never through the bridge, and above all never through the template origin,
 * which since `SELF-STOP-24` runs `connect-src 'self'` and is therefore a security boundary a
 * template page can call (ADR 0010 rule 13).
 *
 * ── WHAT IS STORED, AND THE LIMIT OF IT ─────────────────────────────────────
 *
 * The access token and the opaque refresh token live in `localStorage`, under one key that
 * joins `persistedKeyCensus.test.ts` like every other. That is what "survives a reload" means
 * for a browser console, and the alternative — re-typing a password after every refresh — is
 * the thing that gets a password written on the desk.
 *
 * ⚠ It is per BROWSER PROFILE, not per person. Two operators sharing one console share one
 * stored session until somebody signs out, exactly as they share one chair. The audit record
 * says who signed in and when, which is the fact that makes the sharing legible rather than
 * invisible.
 */

const STORAGE_KEY = 'cg.runtime.playoutSession';

/** What the console holds between reloads. Never leaves this browser except as the `auth` frame. */
export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** `exp`, epoch milliseconds — what the refresh timer counts down to. */
  readonly expiresAtMs: number;
}

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
export type SignInFailure =
  | 'invalid_credentials'
  | 'no_cg_access'
  | 'account_locked'
  | 'rate_limited'
  | 'invalid_refresh_token'
  | 'unreachable'
  | 'unexpected';

/**
 * `DELTA-MULTI-CHANNEL-01-B` B3 — **WHAT THE PLAYOUT ACTUALLY ANSWERED, FOR THE RECORD.** The
 * surface shows this console's own sentence for the `code`, never the Playout's text; the text is
 * kept here so the station's log can carry it (`auth.sign-in-failure`), which is where a person
 * diagnosing a refusal looks.
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

/** The D1/D2 body, as the contract defines it. Only the fields this console uses. */
interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  principal?: unknown;
}

/**
 * ADR 0010 rule 9 — the D1 `principal` is a CONVENIENCE ECHO for the UI and nothing more.
 *
 * ⚠ It is shown, if at all, only in the moment between a successful POST and the bridge's
 * answer to the `auth` frame — and the bridge's answer replaces it. The bridge trusts only the
 * JWT, so anything this side displays from here is a guess that is about to be corrected; the
 * reason to carry it at all is that the correction arrives a round trip later and a name that
 * appears instantly reads as the console working.
 */
export interface PlayoutEcho {
  readonly name: string;
}

export interface SignInOutcome {
  readonly session: StoredSession;
  readonly echo: PlayoutEcho | null;
}

function readStored(): StoredSession | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / blocked storage: no session is the honest answer, not a crash.
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { accessToken, refreshToken, expiresAtMs } = parsed as Record<string, unknown>;
    if (typeof accessToken !== 'string' || accessToken === '') return null;
    if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return null;
    return {
      accessToken,
      refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
      expiresAtMs,
    };
  } catch {
    return null;
  }
}

function writeStored(session: StoredSession | null): void {
  try {
    if (session === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage refused. The in-memory session still works for this page's lifetime; what must
    // not happen is a pretence that it was saved, so nothing else is done here.
  }
}

/** The session this console holds, or `null`. Read through to storage; no cache to go stale. */
export function loadPlayoutSession(): StoredSession | null {
  return readStored();
}

/** Replace the held session, or clear it. */
export function savePlayoutSession(session: StoredSession | null): void {
  writeStored(session);
}

/**
 * Map an HTTP answer onto one of the contract's codes.
 *
 * ⚠ The STATUS is the fallback, never the primary: the contract says `error` is the stable
 * snake_case code and a status can be reused (both `invalid_credentials` and
 * `invalid_refresh_token` are `401`). Reading the body first is what keeps the two apart.
 */
async function failureFrom(res: Response): Promise<PlayoutSignInError> {
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

function sessionFrom(body: TokenResponse, nowMs: number): StoredSession {
  const accessToken = body.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new PlayoutSignInError('unexpected');
  }
  /*
    ⚠ `expires_in` is the contract's field and it is SECONDS. A default is deliberately NOT
    invented when it is missing: an absent lifetime that we guessed at would put the refresh
    timer at a moment we made up, and a refresh that fires late is a console that goes quiet
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

async function postJson(url: string, payload: unknown, fetchImpl: typeof fetch): Promise<Response> {
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

/** D1 — `POST /api/cg/auth/token`. Browser → Playout, directly. The bridge is not involved. */
export async function signInToPlayout(
  tokenUrl: string,
  username: string,
  password: string,
  deps: { fetchImpl?: typeof fetch; nowMs?: () => number } = {},
): Promise<SignInOutcome> {
  const fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const nowMs = deps.nowMs ?? ((): number => Date.now());
  const res = await postJson(tokenUrl, { username, password }, fetchImpl);
  if (!res.ok) throw await failureFrom(res);
  let body: TokenResponse;
  try {
    body = (await res.json()) as TokenResponse;
  } catch {
    throw new PlayoutSignInError('unexpected');
  }
  return { session: sessionFrom(body, nowMs()), echo: echoFrom(body) };
}

/** D2 — `POST /api/cg/auth/refresh`. A rotated `refresh_token` replaces the old one. */
export async function refreshPlayoutToken(
  refreshUrl: string,
  refreshToken: string,
  deps: { fetchImpl?: typeof fetch; nowMs?: () => number } = {},
): Promise<StoredSession> {
  const fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const nowMs = deps.nowMs ?? ((): number => Date.now());
  const res = await postJson(refreshUrl, { refresh_token: refreshToken }, fetchImpl);
  if (!res.ok) throw await failureFrom(res);
  let body: TokenResponse;
  try {
    body = (await res.json()) as TokenResponse;
  } catch {
    throw new PlayoutSignInError('unexpected');
  }
  return sessionFrom(body, nowMs());
}

/**
 * 🔴 **WHEN TO REFRESH — about ten minutes before `exp`, and never in the past.**
 *
 * The contract's own number (§3.5): _"the browser refreshes ~10 min before expiry while the
 * page is open"_. Access tokens live twelve hours, one shift, so this fires roughly once per
 * shift and the ten minutes is the margin for a Playout that is briefly busy.
 *
 * ⚠ Clamped at zero rather than allowed to go negative, because a session restored from
 * storage may ALREADY be inside the window — a console that was closed overnight comes back
 * with eleven hours gone. A negative delay silently becomes "immediately" in `setTimeout`,
 * which is right, but only by accident; saying so here makes it a decision.
 */
export const REFRESH_LEAD_MS = 10 * 60 * 1000;

export function refreshDelayMs(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, expiresAtMs - REFRESH_LEAD_MS - nowMs);
}

/** Is this session past `exp`? The browser's own view; the bridge decides for itself. */
export function sessionExpired(session: StoredSession, nowMs: number): boolean {
  return nowMs >= session.expiresAtMs;
}
