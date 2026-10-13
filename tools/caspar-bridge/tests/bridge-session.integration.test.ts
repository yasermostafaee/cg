import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTHZ_ROLE_REFUSAL,
  BridgeSessionStateChangedChannel,
  type BridgeSessionState,
} from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import {
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  waitFor,
  type Client,
} from './support/auth-harness.js';
import {
  FAKE_ADMIN,
  FAKE_CHANNEL_TWO_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
  type FakeUserKey,
} from './support/fake-playout.js';
import { track } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8; tasks 5.1 and 5.5) — **CG BRIDGE'S OWN
 * SESSION, OVER THE SOCKET.**
 *
 * The bridge starts needing a station admin; a station admin — at a console, as themselves — gives
 * it the station account's password once; every console is told; the record names the admin and
 * never the password; and from then on the bridge's Playout reads carry ITS OWN bearer, still after
 * the admin's console has gone. Every request the fake Playout received is then read for the two
 * headers the Playout's letter forbids.
 */

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function station(): Promise<{
  playout: FakePlayout;
  handle: Awaited<ReturnType<typeof startAuthedBridge>>['handle'];
}> {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bridge-session-int-'));
  const { handle, playout } = await startAuthedBridge({
    bridgeSessionPath: path.join(dir, 'bridge-session.json'),
  });
  track(handle, (h) => h.close());
  track(playout, (p) => p.stop());
  return { handle, playout };
}

async function signedIn(
  s: { playout: FakePlayout; handle: Awaited<ReturnType<typeof startAuthedBridge>>['handle'] },
  user: FakeUserKey,
): Promise<{ client: Client; token: string }> {
  const client = await openClient(s.handle);
  const { token } = await s.playout.issueToken({ user });
  expect((await client.authenticate(`auth-${user}`, token)).error, user).toBeUndefined();
  return { client, token };
}

/** The JWT's claims, read without verifying — the test's instrument, never a decision. */
function claimsOf(bearer: string): { sub?: string } {
  const [, payload] = bearer.replace(/^Bearer /, '').split('.');
  return JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as { sub?: string };
}

let n = 0;
const id = (): string => `q-${String(++n)}`;

describe('CENTRAL-BRIDGE-01 5.1 — a station admin signs CG Bridge in, once', () => {
  it('🔴 needs an admin → an operator cannot → an admin does; every console is told, the record names the admin and never the password, and the bridge reads with its OWN bearer', async () => {
    const s = await station();
    const operator = await signedIn(s, 'operator');
    const state = async (c: Client): Promise<BridgeSessionState> =>
      (await c.ask(id(), 'bridgeSession.state')).payload as BridgeSessionState;
    expect(await state(operator.client)).toEqual({ state: 'needs-admin' });

    // An operator may not give the bridge a credential.
    expectRefusedWith(
      (
        await operator.client.ask(id(), 'bridgeSession.sign-in', {
          username: FAKE_ADMIN.username,
          password: FAKE_PLAYOUT_PASSWORD,
        })
      ).error,
      AUTHZ_ROLE_REFUSAL,
      'an operator signing the bridge in',
    );

    // A station admin — at their own console, as themselves — signs the bridge in as `cg-admin`.
    const admin = await signedIn(s, 'adminChannelTwo');
    const answer = await admin.client.ask(id(), 'bridgeSession.sign-in', {
      username: FAKE_ADMIN.username,
      password: FAKE_PLAYOUT_PASSWORD,
    });
    expect(answer.payload).toEqual({ ok: true });

    // Every console is told — the operator's too, with no request of its own.
    await waitFor(() =>
      operator.client
        .publishes()
        .some(
          (f) =>
            f.type === 'publish' &&
            f.channel === BridgeSessionStateChangedChannel.name &&
            (f.payload as BridgeSessionState).state === 'signed-in',
        ),
    );
    expect(await state(operator.client)).toEqual({ state: 'signed-in', name: FAKE_ADMIN.name });

    // The record: the ADMIN did it, from their machine — and no row anywhere carries the password.
    const rows = (await admin.client.ask(id(), 'audit.recent', { limit: 50 }))
      .payload as AuditEntry[];
    const signIn = rows.find((r) => r.action === 'bridge-sign-in');
    expect(signIn).toMatchObject({
      action: 'bridge-sign-in',
      actor: FAKE_CHANNEL_TWO_ADMIN.name,
      outcome: 'ok',
    });
    expect(JSON.stringify(rows)).not.toContain(FAKE_PLAYOUT_PASSWORD);

    // Its OWN bearer: the introducing D9 read went out with the `cg-admin` token, not a console's.
    await waitFor(() =>
      s.playout.requestLog.some(
        (r) =>
          r.path.startsWith('/api/cg/revoked') &&
          typeof r.headers.authorization === 'string' &&
          claimsOf(r.headers.authorization).sub === FAKE_ADMIN.sub,
      ),
    );

    // …and it keeps reading with it after every console has gone: the service outlives them.
    const before = s.playout.requestLog.length;
    admin.client.ws.close();
    operator.client.ws.close();
    await waitFor(
      () =>
        s.playout.requestLog
          .slice(before)
          .some(
            (r) =>
              r.path.startsWith('/api/cg/channels') &&
              typeof r.headers.authorization === 'string' &&
              claimsOf(r.headers.authorization).sub === FAKE_ADMIN.sub,
          ),
      12_000,
    );
  }, 30_000);
});

describe('CENTRAL-BRIDGE-01 5.5 — no Origin and no X-Apasai-Mirrored on anything the bridge sends the Playout', () => {
  it('🔴 every request the fake Playout received, across sign-in, refresh-driven reads and the D9/D4 polls', async () => {
    const s = await station();
    const admin = await signedIn(s, 'adminChannelTwo');
    await admin.client.ask(id(), 'bridgeSession.sign-in', {
      username: FAKE_ADMIN.username,
      password: FAKE_PLAYOUT_PASSWORD,
    });
    await waitFor(() => s.playout.requestLog.some((r) => r.path.startsWith('/api/cg/revoked')));
    await waitFor(() => s.playout.requestLog.some((r) => r.path.startsWith('/api/cg/auth/token')));

    const log = s.playout.requestLog;
    // CONTROL — the instrument sees headers: the bridge's own D1 and a bearer-carrying read are there.
    expect(log.some((r) => r.method === 'POST' && r.path === '/api/cg/auth/token')).toBe(true);
    expect(log.some((r) => typeof r.headers.authorization === 'string')).toBe(true);
    // THE RULE — on every one of them.
    expect(log.filter((r) => r.headers.origin !== undefined).map((r) => r.path)).toEqual([]);
    expect(
      log.filter((r) => r.headers['x-apasai-mirrored'] !== undefined).map((r) => r.path),
    ).toEqual([]);
  }, 30_000);
});
