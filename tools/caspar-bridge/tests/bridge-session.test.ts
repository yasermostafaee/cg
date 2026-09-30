import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayoutFetchLike } from '@cg/shared-ipc';
import {
  BridgeSession,
  loadBridgeSession,
  refreshTokenId,
  saveBridgeSession,
  type BridgeSessionRecord,
  type VerifyAccess,
} from '../src/bridge-session.js';
import { PlayoutAuth } from '../src/playout-auth.js';
import { playoutFetch, playoutFetchForSession } from '../src/playout-http.js';
import { waitFor } from './support/auth-harness.js';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from './support/fake-playout.js';
import { track } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8; tasks 5.1 and 5.2) — **CG BRIDGE SIGNS
 * ITSELF IN, KEEPS THE ROTATING REFRESH TOKEN, AND NEVER STORES THE PASSWORD.**
 *
 * Against the fake Playout, which rotates the refresh token on every use and refuses a spent one
 * (its §4.2), so "the old token is never reused" is not a claim about our code alone: reusing it
 * would be REFUSED, and the session would say so.
 */

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function scratchFile(): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bridge-session-'));
  return path.join(dir, 'bridge-session.json');
}

async function playout(): Promise<FakePlayout> {
  return track(await startFakePlayout(), (p) => p.stop());
}

/** The bridge's real verifier against the fake's key set — the account is read from the JWT. */
function verifierFor(p: FakePlayout): VerifyAccess {
  const auth = track(
    new PlayoutAuth({
      address: null,
      issuer: p.issuer,
      jwksUrl: p.jwksUrl,
      tokenUrl: p.tokenUrl,
      refreshUrl: p.refreshUrl,
      channelsUrl: p.channelsUrl,
      revokedUrl: p.revokedUrl,
      inputsUrl: p.inputsUrl,
      mediaUrl: p.mediaUrl,
      audience: 'cg-control',
    }),
    (a) => a.dispose(),
  );
  return async (token) => {
    const v = await auth.verify(token);
    return v.ok
      ? { ok: true, name: v.token.principal.name, sub: v.token.principal.sub }
      : { ok: false, reason: v.refusal };
  };
}

/**
 * The bridge's own request, recording every refresh token PRESENTED to D2 — at the moment of the
 * call, whether or not it reached anyone. The instrument for 5.2 and A1.
 */
function recordingFetch(presented: string[]): PlayoutFetchLike {
  return (url, init) => {
    if (url.endsWith('/refresh')) {
      presented.push((JSON.parse(init.body) as { refresh_token: string }).refresh_token);
    }
    return playoutFetchForSession(url, init);
  };
}

function session(
  p: FakePlayout,
  file: string,
  extra: Partial<ConstructorParameters<typeof BridgeSession>[0]> = {},
): BridgeSession {
  return track(
    new BridgeSession({
      file,
      tokenUrl: p.tokenUrl,
      refreshUrl: p.refreshUrl,
      verify: verifierFor(p),
      fetchImpl: playoutFetchForSession,
      log: () => undefined,
      ...extra,
    }),
    (s) => s.dispose(),
  );
}

describe('CENTRAL-BRIDGE-01 5.1 — the bridge’s own session', () => {
  it('with no saved session it NEEDS A STATION ADMIN, and holds no bearer', async () => {
    const p = await playout();
    const s = session(p, scratchFile());
    await s.start();
    expect(s.state()).toEqual({ state: 'needs-admin' });
    expect(s.accessToken()).toBeNull();
  });

  it('🔴 an admin signs it in once: signed in as that account, the refresh token on disk — and NEVER the password', async () => {
    const p = await playout();
    const file = scratchFile();
    const s = session(p, file);
    await s.start();
    const changes: string[] = [];
    s.onChanged((st) => changes.push(st.state));

    expect(await s.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD)).toEqual({ ok: true });
    expect(s.state()).toEqual({ state: 'signed-in', name: FAKE_ADMIN.name });
    expect(s.accessToken()).not.toBeNull();
    expect(changes).toEqual(['signed-in']);

    const text = fs.readFileSync(file, 'utf8');
    expect(text, 'the password reached the file').not.toContain(FAKE_PLAYOUT_PASSWORD);
    const { record } = loadBridgeSession(file);
    expect(record?.refreshToken).toMatch(/^refresh-/);
    expect(record?.name).toBe(FAKE_ADMIN.name);
    // Nothing half-written is left beside it.
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('a wrong password is the contract’s CODE, nothing is written, and it still needs an admin', async () => {
    const p = await playout();
    const file = scratchFile();
    const s = session(p, file);
    await s.start();
    expect(await s.signIn(FAKE_ADMIN.username, 'not-the-password')).toEqual({
      ok: false,
      failure: 'invalid_credentials',
    });
    expect(s.state().state).toBe('needs-admin');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('a restart refreshes from the file: signed in again, and the token on disk ROTATED', async () => {
    const p = await playout();
    const file = scratchFile();
    const first = session(p, file);
    await first.start();
    await first.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD);
    const before = loadBridgeSession(file).record?.refreshToken;
    first.dispose();

    const second = session(p, file);
    await second.start();
    expect(second.state()).toEqual({ state: 'signed-in', name: FAKE_ADMIN.name });
    const after = loadBridgeSession(file).record?.refreshToken;
    expect(after).toMatch(/^refresh-/);
    expect(after, 'the refresh token did not rotate').not.toBe(before);
  });

  it('a `401` refresh (spent, revoked, or a new password) is a lost session: it says it needs an admin', async () => {
    const p = await playout();
    const file = scratchFile();
    const record: BridgeSessionRecord = {
      version: 1,
      refreshToken: 'refresh-never-issued',
      obtainedAt: new Date().toISOString(),
    };
    saveBridgeSession(file, record);
    const s = session(p, file);
    await s.start();
    expect(s.state().state).toBe('needs-admin');
    expect(s.accessToken()).toBeNull();
  });
});

describe('CENTRAL-BRIDGE-01 5.2 — a crash between RECEIVING a rotated token and USING it', () => {
  it('🔴 the restarted bridge still holds a usable token — CONTROL: the old token is never presented again', async () => {
    const p = await playout();
    const file = scratchFile();
    // A signed-in session on disk: T0.
    const setup = session(p, file);
    await setup.start();
    await setup.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD);
    setup.dispose();
    const t0 = loadBridgeSession(file).record?.refreshToken;
    expect(t0).toMatch(/^refresh-/);

    // The bridge starts, refreshes (T0 → T1), SAVES T1 — and dies before it uses anything: the
    // verify step, the first thing after the save, is where this process stops.
    const presented: string[] = [];
    const doomed = session(p, file, {
      fetchImpl: recordingFetch(presented),
      verify: () => Promise.reject(new Error('the process died here')),
    });
    await expect(doomed.start()).rejects.toThrow('the process died here');
    doomed.dispose();
    const t1 = loadBridgeSession(file).record?.refreshToken;
    expect(t1, 'the rotated token was not on disk before use').toMatch(/^refresh-/);
    expect(t1).not.toBe(t0);

    // The restart: a fresh session on the same file refreshes with T1 and is signed in.
    const restarted = session(p, file, { fetchImpl: recordingFetch(presented) });
    await restarted.start();
    expect(restarted.state()).toEqual({ state: 'signed-in', name: FAKE_ADMIN.name });
    expect(restarted.accessToken()).not.toBeNull();

    // CONTROL — T0 was presented exactly once (the refresh that rotated it), then never again.
    expect(presented).toEqual([t0, t1]);
  });
});

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §8) — **A SPENT REFRESH TOKEN IS NEVER SENT AGAIN.**
 *
 * From `2.9.2`, a spent token back more than 10 s later is THEFT: its family is revoked and every
 * access token of the account goes on D9 — every console signed in as that account is signed out.
 * So the bridge marks a D2 in flight ON DISK before its token leaves; a crash with the mark set, or
 * an answer that never arrives, ends the session instead of risking a second send.
 */
describe('CENTRAL-BRIDGE-01-A A1 — a crash between SENDING a refresh and SAVING its answer', () => {
  /** A signed-in session on disk; answers its refresh token (T0). */
  async function signedInOnDisk(p: FakePlayout, file: string): Promise<string> {
    const setup = session(p, file);
    await setup.start();
    await setup.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD);
    setup.dispose();
    const t0 = loadBridgeSession(file).record?.refreshToken;
    if (t0 === undefined) throw new Error('no session on disk');
    return t0;
  }

  it('🔴 the restart sends NO refresh with the old token and says it needs a station admin', async () => {
    let now = Date.now();
    const p = track(await startFakePlayout({ now: () => now }), (x) => x.stop());
    const file = scratchFile();
    const t0 = await signedInOnDisk(p, file);

    // The bridge marks the refresh, SENDS it (the Playout uses T0) — and dies before the answer is
    // saved: the successor's write is where this process stops.
    const presented: string[] = [];
    let writes = 0;
    const doomed = session(p, file, {
      fetchImpl: recordingFetch(presented),
      save: (f, record) => {
        writes += 1;
        if (writes > 1) throw new Error('the process died here');
        saveBridgeSession(f, record);
      },
    });
    await doomed.start();
    doomed.dispose();
    expect(presented, 'the refresh went out once').toEqual([t0]);
    expect(loadBridgeSession(file).record?.refreshInFlight?.tokenId).toBe(refreshTokenId(t0));

    // The restart comes after the Playout's 10 s grace, so a second send WOULD be a reuse (their §8)
    // — the mark is there, so NOTHING is sent, and the station is told why.
    now += 11_000;
    const restarted = session(p, file, { fetchImpl: recordingFetch(presented) });
    await restarted.start();
    expect(restarted.state()).toEqual({ state: 'needs-admin' });
    expect(presented, 'the old token was sent again').toEqual([t0]);
    // …so the Playout never saw a reuse.
    expect(p.theftTrips).toBe(0);
  });

  it('🔴 an answer that never arrives is an UNKNOWN outcome: no retry with the old token, now or after a restart', async () => {
    const p = await playout();
    const file = scratchFile();
    const t0 = await signedInOnDisk(p, file);
    const presented: string[] = [];
    // The request REACHES the Playout (which uses T0), and the answer is lost on the way back.
    const dropping: PlayoutFetchLike = async (url, init) => {
      const answer = await recordingFetch(presented)(url, init);
      if (url.endsWith('/refresh')) throw new Error('socket hang up');
      return answer;
    };
    const s = session(p, file, { fetchImpl: dropping, retryMs: 20 });
    await s.start();
    expect(s.state()).toEqual({ state: 'needs-admin' });
    await new Promise((r) => setTimeout(r, 100)); // several retry periods: nothing is retried
    expect(presented).toEqual([t0]);

    const restarted = session(p, file, { fetchImpl: recordingFetch(presented) });
    await restarted.start();
    expect(restarted.state().state).toBe('needs-admin');
    expect(presented).toEqual([t0]);
    expect(p.theftTrips).toBe(0);
  });

  it('no mark, no send: a refresh that cannot be MARKED on disk is not sent at all', async () => {
    const p = await playout();
    const file = scratchFile();
    await signedInOnDisk(p, file);
    const presented: string[] = [];
    const s = session(p, file, {
      fetchImpl: recordingFetch(presented),
      save: () => {
        throw new Error('disk full');
      },
    });
    await s.start();
    expect(presented).toEqual([]);
    expect(s.state().state).toBe('waiting');
  });

  it('a refresh that NEVER REACHED the Playout keeps its token and asks again — CONTROL: the same token then works', async () => {
    const p = await playout();
    const file = scratchFile();
    const t0 = await signedInOnDisk(p, file);
    await p.goOffline();
    const presented: string[] = [];
    const s = session(p, file, { fetchImpl: recordingFetch(presented), retryMs: 50 });
    await s.start();
    expect(s.state().state).toBe('waiting');
    expect(loadBridgeSession(file).record?.refreshInFlight, 'the mark stayed').toBeUndefined();
    await p.goOnline();
    await waitFor(() => s.state().state === 'signed-in', 5_000);
    // Presented twice — the first never reached anyone — and the Playout counted one refresh.
    expect(presented).toEqual([t0, t0]);
    expect(p.requestCounts.refresh).toBe(1);
    expect(p.theftTrips).toBe(0);
  });

  it('CONTROL — a clean refresh keeps working across restarts', async () => {
    const p = await playout();
    const file = scratchFile();
    const tokens = [await signedInOnDisk(p, file)];
    for (let restart = 0; restart < 3; restart++) {
      const s = session(p, file);
      await s.start();
      expect(s.state().state, `restart ${String(restart)}`).toBe('signed-in');
      s.dispose();
      const next = loadBridgeSession(file).record;
      expect(next?.refreshInFlight).toBeUndefined();
      tokens.push(next?.refreshToken ?? '');
    }
    expect(new Set(tokens).size, 'every restart rotated the token').toBe(4);
    expect(p.theftTrips).toBe(0);
  });

  it('the INSTRUMENT: the fake Playout does trip on a reuse after 10 s (and not within)', async () => {
    let now = Date.now();
    const p = track(await startFakePlayout({ now: () => now }), (x) => x.stop());
    const file = scratchFile();
    const t0 = await signedInOnDisk(p, file);
    const s = session(p, file);
    await s.start(); // T0 spent here, T1 issued
    const reuse = (): Promise<number> =>
      playoutFetch(p.refreshUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: t0 }),
      }).then((r) => r.status);
    expect(await reuse(), 'within 10 s').toBe(401);
    expect(p.theftTrips).toBe(0);
    now += 11_000;
    const revokedBefore = p.revokedJtis.length;
    expect(await reuse(), 'after 10 s').toBe(401);
    expect(p.theftTrips).toBe(1);
    // …and every access token of the account went on the D9 list.
    expect(p.revokedJtis.length).toBeGreaterThan(revokedBefore);
  });
});

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §2) — **A D2 REFUSAL COMES BEFORE THE TOKEN IS USED.**
 * `cg_not_licensed`, `no_cg_access`, a disabled account: the token is kept, the Playout's reason is
 * shown, and the refresh is asked again on the normal cadence. Never a lost session.
 */
describe('CENTRAL-BRIDGE-01-A A2 — a refused refresh keeps its token', () => {
  it('🔴 `cg_not_licensed`: refused with the Playout’s message and the token kept — CONTROL: once licensed, the SAME token refreshes', async () => {
    const p = await playout();
    const file = scratchFile();
    const setup = session(p, file);
    await setup.start();
    await setup.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD);
    setup.dispose();
    const t0 = loadBridgeSession(file).record?.refreshToken;

    const message = 'لایسنسِ این Playout شاملِ CG Control نیست.';
    p.setCgNotLicensed(message);
    const presented: string[] = [];
    const s = session(p, file, { fetchImpl: recordingFetch(presented), refusedRetryMs: 50 });
    await s.start();
    expect(s.state()).toEqual({ state: 'refused', message });
    // The token is kept, unmarked, unrotated.
    const kept = loadBridgeSession(file).record;
    expect(kept?.refreshToken).toBe(t0);
    expect(kept?.refreshInFlight).toBeUndefined();

    p.setCgNotLicensed(null);
    await waitFor(() => s.state().state === 'signed-in', 5_000);
    expect(presented[0]).toBe(t0);
    expect(presented[presented.length - 1], 'the same token, once the cause was fixed').toBe(t0);
    // A refusal before use is never a reuse.
    expect(p.theftTrips).toBe(0);
  });

  it('`no_cg_access` is refused before use too — the session is not lost', async () => {
    const p = await playout();
    const file = scratchFile();
    const setup = session(p, file);
    await setup.start();
    await setup.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD);
    setup.dispose();
    p.setRefreshRefusal('no_cg_access');
    const s = session(p, file, { refusedRetryMs: 50 });
    await s.start();
    expect(s.state().state).toBe('refused');
    p.setRefreshRefusal(null);
    await waitFor(() => s.state().state === 'signed-in', 5_000);
  });

  it('D1 `cg_not_licensed` answers the code AND the Playout’s message, and writes nothing', async () => {
    const p = await playout();
    const file = scratchFile();
    const s = session(p, file);
    await s.start();
    p.setCgNotLicensed('لایسنسِ Playout منقضی شده است.');
    expect(await s.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD)).toEqual({
      ok: false,
      failure: 'cg_not_licensed',
      message: 'لایسنسِ Playout منقضی شده است.',
    });
    expect(fs.existsSync(file)).toBe(false);
  });
});
