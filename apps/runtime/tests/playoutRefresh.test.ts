import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayoutFetchLike, PlayoutResponseLike } from '@cg/shared-ipc';
import {
  IN_FLIGHT_STALE_MS,
  refreshConsoleSession,
  type ConsoleRefreshDeps,
  type LockManagerLike,
} from '../src/platform/playoutRefresh.js';
import { loadPlayoutSession, type StoredSession } from '../src/platform/playoutSession.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §8) — **A CONSOLE NEVER SENDS ONE REFRESH TOKEN TWICE** —
 * not across a crash, not across tabs, not after an answer that did not arrive. The Playout on the
 * other side of these specs rotates on every use and counts every token presented to it, so "sent
 * twice" is a number here, not an inference.
 *
 * The wiring half — the runtime's retry never resending — is `webSocketRuntimeAuth.test.ts`.
 */

const KEY = 'cg.runtime.playoutSession';
const T0 = 'refresh-0';
const NOW = 1_700_000_000_000;

let storage: Storage;
beforeEach(() => {
  storage = installMemoryStorage();
});

function stored(): StoredSession | null {
  return loadPlayoutSession();
}

function seed(session: Record<string, unknown>): StoredSession {
  storage.setItem(KEY, JSON.stringify(session));
  const s = stored();
  if (s === null) throw new Error('seed did not store');
  return s;
}

const HELD = { accessToken: 'jwt-0', refreshToken: T0, expiresAtMs: NOW + 600_000 };

function answer(status: number, body: unknown): PlayoutResponseLike {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
  };
}

/** A D2 that rotates, refuses a spent token, and records every token presented (and when). */
function rotatingPlayout(
  onPresent: (token: string) => void = () => undefined,
): PlayoutFetchLike & { presented: string[] } {
  const spent = new Set<string>();
  let n = 0;
  const presented: string[] = [];
  const f = (_url: string, init: { body: string }): Promise<PlayoutResponseLike> => {
    const token = (JSON.parse(init.body) as { refresh_token: string }).refresh_token;
    presented.push(token);
    onPresent(token);
    if (spent.has(token)) return Promise.resolve(answer(401, { error: 'invalid_refresh_token' }));
    spent.add(token);
    n += 1;
    return Promise.resolve(
      answer(200, {
        access_token: `jwt-${String(n)}`,
        refresh_token: `refresh-${String(n)}`,
        expires_in: 43_200,
      }),
    );
  };
  return Object.assign(f, { presented });
}

function deps(
  fetchImpl: PlayoutFetchLike,
  extra: Partial<ConsoleRefreshDeps> = {},
): ConsoleRefreshDeps {
  return {
    refreshUrl: 'http://playout.test/api/cg/auth/refresh',
    tabId: 'tab-a',
    probe: () => Promise.resolve(true),
    fetchImpl,
    nowMs: () => NOW,
    sleep: () => Promise.resolve(),
    ...extra,
  };
}

/** A Web Lock manager that grants at once (one tab) — enough to take the locked path. */
const LOCKS: LockManagerLike = { request: (_name, callback) => callback() };

describe('a refresh, cleanly', () => {
  it('rotates, with the MARK on the stored session while the D2 is out — and none after', async () => {
    seed(HELD);
    const seen: (StoredSession | null)[] = [];
    const playout = rotatingPlayout(() => seen.push(stored()));
    const out = await refreshConsoleSession(stored() ?? HELD, deps(playout));
    expect(out.kind).toBe('rotated');
    expect(playout.presented).toEqual([T0]);
    // While the token was out, the store said so — with this tab's name on it.
    expect(seen[0]?.refreshInFlight).toEqual({ since: NOW, by: 'tab-a' });
    expect(stored()).toEqual({
      accessToken: 'jwt-1',
      refreshToken: 'refresh-1',
      expiresAtMs: NOW + 43_200_000,
    });
  });
});

describe('🔴 A1 — a crash between SENDING and STORING the answer', () => {
  it('a mark left by a tab that is gone is an ORPHAN: the token is dropped and NOTHING is sent', async () => {
    seed({ ...HELD, refreshInFlight: { since: NOW - IN_FLIGHT_STALE_MS, by: 'tab-that-died' } });
    const playout = rotatingPlayout();
    const out = await refreshConsoleSession(HELD, deps(playout));
    expect(out).toMatchObject({ kind: 'dropped', why: 'orphaned' });
    expect(playout.presented).toEqual([]);
    // The access token lives on to `exp`; nothing will renew it.
    expect(stored()).toEqual({
      accessToken: 'jwt-0',
      refreshToken: null,
      expiresAtMs: HELD.expiresAtMs,
    });
  });

  it('under a Web Lock, ANY mark is an orphan — nobody else can be refreshing', async () => {
    seed({ ...HELD, refreshInFlight: { since: NOW - 1, by: 'tab-that-died' } });
    const playout = rotatingPlayout();
    const out = await refreshConsoleSession(HELD, deps(playout, { locks: LOCKS }));
    expect(out).toMatchObject({ kind: 'dropped', why: 'orphaned' });
    expect(playout.presented).toEqual([]);
  });

  it('without one, a FRESH mark is another tab mid-refresh: nothing is sent and nothing is touched', async () => {
    const marked = seed({ ...HELD, refreshInFlight: { since: NOW - 1_000, by: 'tab-b' } });
    const playout = rotatingPlayout();
    expect(await refreshConsoleSession(HELD, deps(playout))).toEqual({ kind: 'busy' });
    expect(playout.presented).toEqual([]);
    expect(stored()).toEqual(marked);
  });

  it('an unreadable mark still MEANS a D2 may be out — it is never read as "no mark"', async () => {
    seed({ ...HELD, refreshInFlight: 'garbage' });
    const playout = rotatingPlayout();
    const out = await refreshConsoleSession(HELD, deps(playout));
    expect(out).toMatchObject({ kind: 'dropped', why: 'orphaned' });
    expect(playout.presented).toEqual([]);
  });
});

describe('🔴 A1 — an outcome that is not known is never retried', () => {
  it('an answer lost AFTER the Playout answered the probe: the token is dropped — never sent again', async () => {
    seed(HELD);
    const presented: string[] = [];
    const lost: PlayoutFetchLike = (_url, init) => {
      presented.push((JSON.parse(init.body) as { refresh_token: string }).refresh_token);
      return Promise.reject(new TypeError('Failed to fetch'));
    };
    const out = await refreshConsoleSession(HELD, deps(lost));
    expect(out).toMatchObject({ kind: 'dropped', why: 'unknown' });
    expect(stored()).toEqual({
      accessToken: 'jwt-0',
      refreshToken: null,
      expiresAtMs: HELD.expiresAtMs,
    });
    // Asked again (a timer, another tab): the store no longer holds the token — nothing is sent.
    const again = await refreshConsoleSession(HELD, deps(lost));
    expect(again.kind).toBe('adopted');
    expect(presented).toEqual([T0]);
  });

  it('CONTROL — a Playout that does not answer the PROBE never receives the token, which is kept', async () => {
    seed(HELD);
    const playout = rotatingPlayout();
    const out = await refreshConsoleSession(
      HELD,
      deps(playout, { probe: () => Promise.resolve(false) }),
    );
    expect(out).toEqual({ kind: 'not-sent' });
    expect(playout.presented).toEqual([]);
    expect(stored()).toEqual(HELD);
    // …and once it answers, the same token rotates.
    expect((await refreshConsoleSession(HELD, deps(playout))).kind).toBe('rotated');
    expect(playout.presented).toEqual([T0]);
  });

  it('a mark that cannot be STORED is not sent: no mark, no send', async () => {
    seed(HELD);
    const playout = rotatingPlayout();
    const real = storage.setItem.bind(storage);
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(await refreshConsoleSession(HELD, deps(playout))).toEqual({ kind: 'not-sent' });
    } finally {
      storage.setItem = real;
    }
    expect(playout.presented).toEqual([]);
  });
});

describe('🔴 two tabs, one stored session, one family', () => {
  it('a token another tab already rotated is ADOPTED, never sent', async () => {
    seed({ accessToken: 'jwt-1', refreshToken: 'refresh-1', expiresAtMs: NOW + 43_200_000 });
    const playout = rotatingPlayout();
    const out = await refreshConsoleSession(HELD, deps(playout, { tabId: 'tab-b' }));
    expect(out).toEqual({
      kind: 'adopted',
      session: { accessToken: 'jwt-1', refreshToken: 'refresh-1', expiresAtMs: NOW + 43_200_000 },
    });
    expect(playout.presented).toEqual([]);
  });

  it('two tabs marking at once: the READ-BACK lets exactly ONE send', async () => {
    seed(HELD);
    const playout = rotatingPlayout();
    /*
      The race a LAN `http://` page (no Web Lock) is exposed to: tab B read the store BEFORE tab A's
      mark reached it, so both saw no mark and both write one — and the last write is the store's.
      Driven here as it interleaves: while A's mark settles, B runs its whole pass up to its own
      settle (starting from the unmarked store it saw), so B's mark is the one that stands.
    */
    let releaseB: () => void = () => undefined;
    const bSettles = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const tabB: { pass?: ReturnType<typeof refreshConsoleSession> } = {};
    const a = refreshConsoleSession(
      HELD,
      deps(playout, {
        tabId: 'tab-a',
        sleep: async () => {
          storage.setItem(KEY, JSON.stringify(HELD)); // what B read: no mark
          tabB.pass = refreshConsoleSession(
            HELD,
            deps(playout, { tabId: 'tab-b', sleep: () => bSettles }),
          );
          await new Promise((resolve) => setTimeout(resolve, 0)); // B reaches its own settle
        },
      }),
    );
    // A reads back B's mark and stands down, having sent nothing…
    expect(await a).toEqual({ kind: 'busy' });
    expect(playout.presented).toEqual([]);
    // …and B reads back its own and sends: ONE D2 between the two tabs.
    releaseB();
    expect((await tabB.pass)?.kind).toBe('rotated');
    expect(playout.presented).toEqual([T0]);
  });

  it('a sign-out while the D2 is out is not undone: the successor is NOT written back', async () => {
    seed(HELD);
    const playout = rotatingPlayout(() => storage.removeItem(KEY));
    const out = await refreshConsoleSession(HELD, deps(playout));
    expect(out).toEqual({ kind: 'gone' });
    expect(stored()).toBeNull();
  });
});

describe('🔴 A2 — a refusal BEFORE use keeps the token', () => {
  it('`cg_not_licensed`: the code and the Playout’s message, the token kept and unmarked — CONTROL: the same token then works', async () => {
    seed(HELD);
    const message = 'لایسنسِ Playout منقضی شده است.';
    let licensed = false;
    const presented: string[] = [];
    const playout: PlayoutFetchLike = (_url, init) => {
      presented.push((JSON.parse(init.body) as { refresh_token: string }).refresh_token);
      return Promise.resolve(
        licensed
          ? answer(200, { access_token: 'jwt-1', refresh_token: 'refresh-1', expires_in: 60 })
          : answer(403, { error: 'cg_not_licensed', message }),
      );
    };
    expect(await refreshConsoleSession(HELD, deps(playout))).toEqual({
      kind: 'refused',
      code: 'cg_not_licensed',
      message,
    });
    expect(stored()).toEqual(HELD);
    licensed = true;
    expect((await refreshConsoleSession(HELD, deps(playout))).kind).toBe('rotated');
    expect(presented).toEqual([T0, T0]);
  });

  it('a `401` is SPENT: dropped, never retried', async () => {
    seed(HELD);
    const playout: PlayoutFetchLike = () =>
      Promise.resolve(answer(401, { error: 'invalid_refresh_token' }));
    expect(await refreshConsoleSession(HELD, deps(playout))).toMatchObject({
      kind: 'dropped',
      why: 'spent',
    });
    expect(stored()?.refreshToken).toBeNull();
  });
});

describe('a page whose store cannot be read keeps the session in memory', () => {
  it('refreshes from what the tab holds, and writes nothing', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('SecurityError');
        },
        removeItem: () => undefined,
      },
      configurable: true,
    });
    const playout = rotatingPlayout();
    const out = await refreshConsoleSession(HELD, deps(playout));
    expect(out).toMatchObject({ kind: 'rotated', session: { refreshToken: 'refresh-1' } });
    expect(playout.presented).toEqual([T0]);
  });
});
