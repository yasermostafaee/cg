import {
  PlayoutSignInError,
  refreshPlayoutToken,
  refreshTokenFate,
  type PlayoutFetchLike,
  type PlayoutTokens,
  type SignInFailure,
} from '@cg/shared-ipc';
import { readPlayoutStore, savePlayoutSession, type StoredSession } from './playoutSession.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §8) — **THE CONSOLE'S D2, NOW THAT A REUSED REFRESH TOKEN
 * IS TREATED AS THEFT.**
 *
 * From `2.9.2` a spent refresh token that comes back more than 10 s after its use revokes its whole
 * family AND puts every access token of that USER on D9 — every console signed in as that account,
 * not this one alone. Before this, the console retried any failed refresh 15 s later with the SAME
 * token; after an answer lost on its way back, that retry is exactly the reuse the Playout punishes.
 *
 * So a refresh here keeps four rules:
 *
 *   1. **ONE AT A TIME, PER STORED SESSION.** Tabs of one browser share one `localStorage`, so one
 *      stored session, so one refresh-token family. A Web Lock serialises them where the page has one
 *      (a secure context); a console on a LAN `http://` origin has none, and there a MARK written
 *      into the stored session and read back once it has settled decides which tab sends.
 *   2. **THE LATEST TOKEN.** The store is read again inside that guard: a token another tab has
 *      already rotated is ADOPTED, never sent.
 *   3. **MARKED BEFORE IT LEAVES.** While its D2 is out the stored session carries `refreshInFlight`.
 *      A mark nobody can still be waiting on — the tab that wrote it closed or crashed with its D2
 *      out — means the token may have been used: it is dropped, never sent.
 *   4. **SENT ONLY TO A PLAYOUT THAT ANSWERS.** A browser cannot tell "never connected" from "answer
 *      lost" — both are one `TypeError` — so the Playout is first asked something that carries no
 *      token. No answer: the token never left, and it is asked again later. An answer, and then a D2
 *      that fails without saying why: the token may have been used, and it is dropped.
 *
 * A dropped refresh token does not sign anybody out: the access token lives to `exp` (one shift) and
 * the sign-in comes back then — ADR 0010's rule that a failed refresh never ends a working session.
 */

/** How long a D2 may take to answer before its outcome is unknown. */
export const REFRESH_ANSWER_TIMEOUT_MS = 15_000;

/** How long the Playout has to answer the probe. */
export const REFRESH_PROBE_TIMEOUT_MS = 5_000;

/**
 * A mark older than this was left by a D2 nobody can still be waiting on — the probe's bound and the
 * answer's, twice over. Read only where the page has no Web Lock: under one, every mark is an orphan.
 */
export const IN_FLIGHT_STALE_MS = 2 * (REFRESH_PROBE_TIMEOUT_MS + REFRESH_ANSWER_TIMEOUT_MS);

/** How long a mark written without a Web Lock settles before it is read back. */
export const MARK_SETTLE_MS = 150;

/**
 * One lock per origin: one `localStorage`, one stored session, one family. (Named outside the
 * persisted-key namespaces — it is a lock, and nothing is stored under it.)
 */
export const REFRESH_LOCK_NAME = 'cg/playout-session/refresh';

export type ConsoleRefreshOutcome =
  /** D2 answered; the successor is stored. */
  | { readonly kind: 'rotated'; readonly session: StoredSession }
  /** Another tab had already refreshed, or signed in anew: its session is taken; nothing was sent. */
  | { readonly kind: 'adopted'; readonly session: StoredSession }
  /** Nothing is stored any more — another tab signed out. Nothing was sent. */
  | { readonly kind: 'gone' }
  /** Another tab is refreshing this session now. Nothing was sent; ask again shortly. */
  | { readonly kind: 'busy' }
  /** The Playout did not answer the probe, or the mark could not be stored: the token never left. */
  | { readonly kind: 'not-sent' }
  /** Refused BEFORE the token was used (`2.9.2` §2): it is kept; ask again in a minute. */
  | { readonly kind: 'refused'; readonly code: SignInFailure; readonly message: string | null }
  /** Spent, or its fate unknown, or orphaned: the refresh token is dropped; the access token lives on. */
  | {
      readonly kind: 'dropped';
      readonly session: StoredSession;
      readonly why: 'spent' | 'unknown' | 'orphaned';
    };

/** The part of `navigator.locks` this uses. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface ConsoleRefreshDeps {
  readonly refreshUrl: string;
  /** This tab's id — how a read-back tells its own mark from another tab's. */
  readonly tabId: string;
  /** Does the Playout answer at all? Must never carry the token. */
  readonly probe: () => Promise<boolean>;
  readonly fetchImpl?: PlayoutFetchLike;
  readonly nowMs?: () => number;
  /** `navigator.locks`, where the page has it. */
  readonly locks?: LockManagerLike | null;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Refresh the session this tab holds — within the rules above. Never throws for a D2 failure. */
export function refreshConsoleSession(
  held: StoredSession,
  deps: ConsoleRefreshDeps,
): Promise<ConsoleRefreshOutcome> {
  const locks = deps.locks ?? null;
  return locks === null
    ? guarded(held, deps, false)
    : locks.request(REFRESH_LOCK_NAME, () => guarded(held, deps, true));
}

type Standing =
  | { readonly kind: 'decided'; readonly outcome: ConsoleRefreshOutcome }
  | {
      readonly kind: 'proceed';
      readonly session: StoredSession;
      readonly token: string;
      /** `false`: the store cannot be read, so the session is this tab's memory alone. */
      readonly durable: boolean;
    };

async function guarded(
  held: StoredSession,
  deps: ConsoleRefreshDeps,
  locked: boolean,
): Promise<ConsoleRefreshOutcome> {
  const now = deps.nowMs ?? ((): number => Date.now());

  // 1 — what the store holds, before the Playout is asked anything.
  const before = standing(held, now(), locked);
  if (before.kind === 'decided') return before.outcome;

  // 2 — does the Playout answer at all? The token does not leave here.
  if (!(await deps.probe())) return { kind: 'not-sent' };

  // 3 — the store AGAIN (the probe was an await), and the mark in the same synchronous step.
  const again = standing(held, now(), locked);
  if (again.kind === 'decided') return again.outcome;
  const { session, token, durable } = again;
  if (durable) {
    const marked: StoredSession = {
      ...unmarked(session),
      refreshInFlight: { since: now(), by: deps.tabId },
    };
    if (!savePlayoutSession(marked)) return { kind: 'not-sent' }; // no mark, no send
    if (!locked) {
      await (deps.sleep ?? delay)(MARK_SETTLE_MS);
      if (!ours(readPlayoutStore().session, token, deps.tabId)) return { kind: 'busy' };
    }
  }

  // 4 — D2, bounded.
  let tokens: PlayoutTokens;
  try {
    tokens = await refreshPlayoutToken(deps.refreshUrl, token, {
      ...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),
      nowMs: now,
      timeoutMs: REFRESH_ANSWER_TIMEOUT_MS,
    });
  } catch (err) {
    return afterFailure(err, session, token, durable, deps.tabId);
  }

  // 5 — PERSIST, THEN USE: the successor is stored before anything the answer carries is used.
  const next: StoredSession = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? token,
    expiresAtMs: tokens.expiresAtMs,
  };
  if (durable) {
    const latest = readPlayoutStore().session;
    if (!ours(latest, token, deps.tabId)) return settledElsewhere(latest);
    // A refused write leaves the MARK on the old token, so no tab and no restart ever sends it.
    savePlayoutSession(next);
  }
  return { kind: 'rotated', session: next };
}

/** What the store says this tab may do, before anything is sent. */
function standing(held: StoredSession, nowMs: number, locked: boolean): Standing {
  const store = readPlayoutStore();
  if (!store.usable) {
    // Memory alone: this tab's token and nobody else's, and no restart can find it.
    return held.refreshToken === null
      ? { kind: 'decided', outcome: { kind: 'adopted', session: held } }
      : { kind: 'proceed', session: held, token: held.refreshToken, durable: false };
  }
  const stored = store.session;
  if (stored === null) return { kind: 'decided', outcome: { kind: 'gone' } };
  const mark = stored.refreshInFlight;
  if (mark !== undefined) {
    if (locked || nowMs - mark.since >= IN_FLIGHT_STALE_MS) {
      // Nobody can still be waiting on it: the tab that sent it is gone, and it may have been used.
      const dropped = withoutRefresh(stored);
      savePlayoutSession(dropped);
      return { kind: 'decided', outcome: { kind: 'dropped', session: dropped, why: 'orphaned' } };
    }
    return { kind: 'decided', outcome: { kind: 'busy' } };
  }
  if (
    stored.refreshToken !== held.refreshToken ||
    stored.accessToken !== held.accessToken ||
    stored.refreshToken === null
  ) {
    return { kind: 'decided', outcome: { kind: 'adopted', session: stored } };
  }
  return { kind: 'proceed', session: stored, token: stored.refreshToken, durable: true };
}

/** A D2 that failed: what it did to the token (`refreshTokenFate`), and what is stored. */
function afterFailure(
  err: unknown,
  session: StoredSession,
  token: string,
  durable: boolean,
  tabId: string,
): ConsoleRefreshOutcome {
  if (durable) {
    const latest = readPlayoutStore().session;
    if (!ours(latest, token, tabId)) return settledElsewhere(latest);
  }
  const fate = refreshTokenFate(err);
  if (fate === 'kept') {
    // Refused before use (`2.9.2` §2): the same token works once the cause is fixed.
    if (durable) savePlayoutSession(unmarked(session));
    const failure = err instanceof PlayoutSignInError ? err : null;
    return {
      kind: 'refused',
      code: failure?.code ?? 'unexpected',
      message: failure?.playoutMessage ?? null,
    };
  }
  const dropped = withoutRefresh(session);
  if (durable) savePlayoutSession(dropped);
  return { kind: 'dropped', session: dropped, why: fate === 'spent' ? 'spent' : 'unknown' };
}

/** The store still carries THIS tab's mark on THIS token. */
function ours(latest: StoredSession | null, token: string, tabId: string): boolean {
  return latest?.refreshToken === token && latest.refreshInFlight?.by === tabId;
}

/** Signed out, or signed in anew, while this tab's D2 was out: the store's answer stands. */
function settledElsewhere(latest: StoredSession | null): ConsoleRefreshOutcome {
  return latest === null ? { kind: 'gone' } : { kind: 'adopted', session: unmarked(latest) };
}

function unmarked(s: StoredSession): StoredSession {
  return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAtMs: s.expiresAtMs };
}

function withoutRefresh(s: StoredSession): StoredSession {
  return { accessToken: s.accessToken, refreshToken: null, expiresAtMs: s.expiresAtMs };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Does the Playout answer at all? A `GET` of the D2 address itself — the host and port the refresh
 * goes to, carrying no token — whose answer (a `405`, a `404`: anything) is not read. A `no-cors`
 * request resolves when ANY answer arrives and rejects when none does, which is the one fact
 * wanted; `no-store`, so a cached answer can never stand in for a live one.
 */
export async function probePlayout(
  url: string,
  timeoutMs: number = REFRESH_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (f === undefined) return false;
  try {
    await f(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

/** This page's Web Lock manager, or `null` — an insecure (LAN `http://`) context has none. */
export function pageLocks(): LockManagerLike | null {
  const locks = (
    globalThis as {
      navigator?: {
        locks?: { request: (name: string, cb: () => Promise<unknown>) => Promise<unknown> };
      };
    }
  ).navigator?.locks;
  if (locks === undefined) return null;
  return {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> =>
      locks.request(name, callback) as Promise<T>,
  };
}

/**
 * This tab's id. Not `crypto.randomUUID` — a LAN `http://` page is not a secure context and has
 * none — and it needs no strength: it only tells two tabs' marks apart.
 */
export function newTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
