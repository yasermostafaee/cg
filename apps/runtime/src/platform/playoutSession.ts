/**
 * 🔴 `R-066` / ADR 0010 rule 9 — **THE CONSOLE'S HALF OF THE PLAYOUT LINK: get a token, hold
 * it, and give it back on every (re)connect.**
 *
 * The browser obtains the token and the bridge only verifies it, so the bridge never sees an
 * operator's password. This module is the only place in the SPA that talks to the Playout, and it
 * talks to it DIRECTLY — never through the bridge, and above all never through the template
 * origin, which since `SELF-STOP-24` runs `connect-src 'self'` and is therefore a security boundary
 * a template page can call (ADR 0010 rule 13).
 *
 * `CENTRAL-BRIDGE-01` (D7) — the D1/D2 requests and their answers now live once in
 * `@cg/shared-ipc` (`playout-session.ts`), because CG Bridge signs ITSELF in with the same two
 * calls; they are re-exported below so every caller here keeps its import. What stays here is the
 * browser's own half: where the session is stored.
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
import type { PlayoutTokens } from '@cg/shared-ipc';

export {
  PlayoutSignInError,
  RECORD_BODY_MAX,
  REFRESH_LEAD_MS,
  refreshDelayMs,
  refreshPlayoutToken,
  signInToPlayout,
  type PlayoutEcho,
  type SignInFailure,
  type SignInFailureDetail,
  type SignInOutcome,
} from '@cg/shared-ipc';

const STORAGE_KEY = 'cg.runtime.playoutSession';

/**
 * `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §8) — the stored session's refresh token is OUT: a tab sent
 * it to D2 at `since` and has not yet stored the answer. While it is set, no other tab sends that
 * token; a mark nobody can still be waiting on means it may have been used, and it is never sent
 * again (`playoutRefresh.ts`).
 */
export interface RefreshInFlight {
  /** Epoch ms the mark was written. */
  readonly since: number;
  /** Which tab wrote it — how a read-back tells its own mark from another tab's. */
  readonly by: string;
}

/** What the console holds between reloads. Never leaves this browser except as the `auth` frame. */
export interface StoredSession extends PlayoutTokens {
  readonly refreshInFlight?: RefreshInFlight;
}

function readStored(): StoredSession | null {
  return readPlayoutStore().session;
}

/**
 * `CENTRAL-BRIDGE-01-A` — the store AND what it holds. `usable: false` when the store itself cannot
 * be read (blocked site data): the session then lives in this tab's memory alone — no other tab can
 * hold its refresh token and no restart can find it — so "nothing stored" must not be read as
 * "another tab signed out".
 */
export function readPlayoutStore(): {
  readonly usable: boolean;
  readonly session: StoredSession | null;
} {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / blocked storage: no session is the honest answer, not a crash.
    return { usable: false, session: null };
  }
  return { usable: true, session: parseStored(raw) };
}

function parseStored(raw: string | null): StoredSession | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { accessToken, refreshToken, expiresAtMs, refreshInFlight } = parsed as Record<
      string,
      unknown
    >;
    if (typeof accessToken !== 'string' || accessToken === '') return null;
    if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return null;
    const mark = markFrom(refreshInFlight);
    return {
      accessToken,
      refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
      expiresAtMs,
      ...(mark !== null ? { refreshInFlight: mark } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * A stored mark, or `null`. ⚠ A mark that is present but unreadable still MEANS a D2 may be out, so
 * it reads as the oldest possible mark (`since: 0`, nobody's) — never as no mark at all, which would
 * send the token.
 */
function markFrom(value: unknown): RefreshInFlight | null {
  if (value === undefined || value === null) return null;
  const { since, by } = (typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    since: typeof since === 'number' && Number.isFinite(since) ? since : 0,
    by: typeof by === 'string' ? by : '',
  };
}

function writeStored(session: StoredSession | null): boolean {
  try {
    if (session === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    // Storage refused. The in-memory session still works for this page's lifetime; what must
    // not happen is a pretence that it was saved — so the caller is told it was not.
    return false;
  }
}

/** The session this console holds, or `null`. Read through to storage; no cache to go stale. */
export function loadPlayoutSession(): StoredSession | null {
  return readStored();
}

/** Replace the held session, or clear it. `false` when the store refused the write. */
export function savePlayoutSession(session: StoredSession | null): boolean {
  return writeStored(session);
}

/** Is this session past `exp`? The browser's own view; the bridge decides for itself. */
export function sessionExpired(session: StoredSession, nowMs: number): boolean {
  return nowMs >= session.expiresAtMs;
}
