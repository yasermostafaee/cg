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

/** What the console holds between reloads. Never leaves this browser except as the `auth` frame. */
export type StoredSession = PlayoutTokens;

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

/** Is this session past `exp`? The browser's own view; the bridge decides for itself. */
export function sessionExpired(session: StoredSession, nowMs: number): boolean {
  return nowMs >= session.expiresAtMs;
}
