import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayoutFetchLike, PlayoutResponseLike } from '@cg/shared-ipc';
import { BridgeSession, loadBridgeSession, saveBridgeSession } from '../src/bridge-session.js';

/**
 * 🔴 `RELEASE-0112-01-C` C2 — **D2'S OUTCOME TABLE, AS THE PLAYOUT TEAM CORRECTED IT, ON EVERY ENGINE'S
 * SESSION** (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §4):
 *
 * | D2 answer                      | the token                                   |
 * | ------------------------------ | ------------------------------------------- |
 * | `400`, `415`, `403`, `404`, `429` | KEPT — refused before it was used        |
 * | `401`                          | discarded — a new D1 is needed              |
 * | `5xx`, `423`, no answer        | never sent again (the outcome is unknown)   |
 *
 * The same table for the primary engine's session and the backup's (bound to its engine's address):
 * one `BridgeSession`, one reading (`refreshTokenFate`). CONTROL: a `5xx` is never sent again.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const BACKUP = 'http://192.0.2.20:8080';

function sessionFile(engine: 'primary' | 'backup'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-d2-table-'));
  dirs.push(dir);
  const file = path.join(
    dir,
    engine === 'primary' ? 'bridge-session.json' : 'bridge-session-backup.json',
  );
  saveBridgeSession(file, {
    version: 1,
    refreshToken: 'refresh-t0',
    obtainedAt: '2026-10-04T08:00:00.000Z',
    ...(engine === 'backup' ? { address: BACKUP } : {}),
  });
  return file;
}

function answering(status: number, presented: string[]): PlayoutFetchLike {
  return (_url, init) => {
    const body = JSON.parse(String((init as { body?: unknown }).body)) as {
      refresh_token?: string;
    };
    presented.push(body.refresh_token ?? '');
    const text = JSON.stringify({ error: 'x', message: 'y' });
    const res: PlayoutResponseLike = {
      ok: false,
      status,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(JSON.parse(text) as unknown),
    };
    return Promise.resolve(res);
  };
}

function start(
  engine: 'primary' | 'backup',
  file: string,
  fetchImpl: PlayoutFetchLike,
): BridgeSession {
  const s = new BridgeSession({
    file,
    ...(engine === 'backup' ? { address: BACKUP } : {}),
    tokenUrl: 'http://engine/api/cg/auth/token',
    refreshUrl: 'http://engine/api/cg/auth/refresh',
    verify: () => Promise.resolve({ ok: false, reason: 'not reached' }),
    fetchImpl,
    retryMs: 40,
    refusedRetryMs: 40,
    log: () => undefined,
  });
  return s;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('RELEASE-0112-01-C C2 — D2’s outcome table, per engine', () => {
  for (const engine of ['primary', 'backup'] as const) {
    describe(`the ${engine} engine’s session`, () => {
      for (const status of [400, 415, 403, 404, 429]) {
        it(`${String(status)} — refused BEFORE use: the token is KEPT, unmarked, and asked again`, async () => {
          const file = sessionFile(engine);
          const presented: string[] = [];
          const s = start(engine, file, answering(status, presented));
          await s.start();
          expect(s.state().state).toBe('refused');
          const record = loadBridgeSession(file).record;
          expect(record?.refreshToken).toBe('refresh-t0');
          expect(record?.refreshInFlight).toBeUndefined();
          await delay(150);
          expect(presented.length, 'the kept token is asked with again').toBeGreaterThan(1);
          expect(new Set(presented)).toEqual(new Set(['refresh-t0']));
          s.dispose();
        });
      }

      it('401 — used, revoked, or its user disabled: DISCARDED; never sent again; a station admin signs in', async () => {
        const file = sessionFile(engine);
        const presented: string[] = [];
        const s = start(engine, file, answering(401, presented));
        await s.start();
        expect(s.state().state).toBe('needs-admin');
        await delay(150);
        expect(presented).toEqual(['refresh-t0']);
        s.dispose();
      });

      for (const status of [500, 502, 423]) {
        it(`🔴 ${String(status)} — the outcome is unknown: NEVER sent again, the mark kept on disk (CONTROL for the 5xx rule)`, async () => {
          const file = sessionFile(engine);
          const presented: string[] = [];
          const s = start(engine, file, answering(status, presented));
          await s.start();
          expect(s.state().state).toBe('needs-admin');
          await delay(150);
          expect(presented, 'sent once, never again').toEqual(['refresh-t0']);
          // Whatever the file holds, a restart sends nothing: the in-flight mark stayed.
          const again: string[] = [];
          const restarted = start(engine, file, answering(200, again));
          await restarted.start();
          expect(again).toEqual([]);
          s.dispose();
          restarted.dispose();
        });
      }
    });
  }

  it('🔴 the backup’s session never sends a token saved for ANOTHER engine (server B moved): it reads as needs-admin, and nothing is sent', async () => {
    const file = sessionFile('backup');
    const presented: string[] = [];
    const moved = new BridgeSession({
      file,
      address: 'http://192.0.2.99:8080',
      tokenUrl: 'http://other/api/cg/auth/token',
      refreshUrl: 'http://other/api/cg/auth/refresh',
      verify: () => Promise.resolve({ ok: false, reason: 'not reached' }),
      fetchImpl: answering(200, presented),
      log: () => undefined,
    });
    await moved.start();
    expect(moved.state().state).toBe('needs-admin');
    expect(presented).toEqual([]);
    // CONTROL — at its own address the same file is used.
    const own: string[] = [];
    const home = start('backup', file, answering(403, own));
    await home.start();
    expect(own).toEqual(['refresh-t0']);
    moved.dispose();
    home.dispose();
  });
});
