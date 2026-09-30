import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayoutFetchLike } from '@cg/shared-ipc';
import {
  BridgeSession,
  loadBridgeSession,
  saveBridgeSession,
  type BridgeSessionRecord,
  type VerifyAccess,
} from '../src/bridge-session.js';
import { PlayoutAuth } from '../src/playout-auth.js';
import { playoutFetch } from '../src/playout-http.js';
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

/** `playoutFetch`, recording every refresh token PRESENTED to D2 — the instrument for 5.2. */
function recordingFetch(presented: string[]): PlayoutFetchLike {
  return (url, init) => {
    if (url.endsWith('/refresh')) {
      presented.push((JSON.parse(init.body) as { refresh_token: string }).refresh_token);
    }
    return playoutFetch(url, init);
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
      fetchImpl: playoutFetch,
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

  it('a REFUSED refresh (spent, revoked, or a new password) is a lost session: it says it needs an admin', async () => {
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

  it('the residual the Playout’s letter names: a crash BEFORE the save leaves the spent token, and the bridge says it needs an admin rather than looping', async () => {
    const p = await playout();
    const file = scratchFile();
    const setup = session(p, file);
    await setup.start();
    await setup.signIn(FAKE_ADMIN.username, FAKE_PLAYOUT_PASSWORD);
    setup.dispose();

    const presented: string[] = [];
    // The save itself fails — as a process killed mid-write, the file keeps the old (now spent) one.
    const doomed = session(p, file, {
      fetchImpl: recordingFetch(presented),
      save: () => {
        throw new Error('killed before the write finished');
      },
    });
    await doomed.start();
    doomed.dispose();

    const restarted = session(p, file, { fetchImpl: recordingFetch(presented) });
    await restarted.start();
    expect(restarted.state().state).toBe('needs-admin');
    // It asked once with the spent token, was refused, and stopped asking.
    expect(presented).toHaveLength(2);
    expect(presented[1]).toBe(presented[0]);
  });
});
