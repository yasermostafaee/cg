import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_REQUIRED_REFUSAL, authzChannelRefusal } from '@cg/shared-ipc';
import { HttpTickets } from '../src/http-tickets.js';
import { expectRefusedWith, openClient, startAuthedBridge } from './support/auth-harness.js';
import { track } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D9) — **CG BRIDGE'S HTTP RESOURCES OPEN ONLY WITH A TICKET FROM A VERIFIED
 * SOCKET.** The console is on another machine; its `<img>` and its download link carry no token, so
 * it asks for a ticket over the socket and the HTTP route takes nothing else: `/pgm/<n>` for a
 * channel the sign-in holds, `/logs.zip` for a station admin, once.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function bridge(overrides: Parameters<typeof startAuthedBridge>[0] = {}) {
  const started = await startAuthedBridge(overrides);
  track(started.playout, (p) => p.stop());
  track(started.handle, (h) => h.close());
  return started;
}

const at = (port: number, p: string): string => `http://127.0.0.1:${String(port)}${p}`;

describe('the programme return, behind a ticket', () => {
  it('🔴 a console whose sign-in holds channel 1 is given a ticket that opens /pgm/1 — control: none, another channel’s, a guessed one: 403', async () => {
    const { handle, playout } = await bridge();
    const c = await openClient(handle);
    await c.authenticate('a', (await playout.issueToken({ user: 'operator' })).token);
    const res = await c.ask('t', 'pgmReturn.ticket', { channel: 1 });
    expect(res.error).toBeUndefined();
    const ticketed = (res.payload as { path: string }).path;
    expect(ticketed).toMatch(/^\/pgm\/1\?ticket=[A-Za-z0-9_-]+$/);

    const opened = await fetch(at(handle.port, ticketed), { method: 'HEAD' });
    expect(opened.status).toBe(200);
    expect(opened.headers.get('content-type')).toMatch(/^multipart\/x-mixed-replace/);
    const query = ticketed.split('?')[1] ?? '';
    for (const [what, p] of [
      ['no ticket', '/pgm/1'],
      ['channel 1’s ticket on channel 2', `/pgm/2?${query}`],
      ['a guessed ticket', '/pgm/1?ticket=guessed-ticket'],
    ] as const) {
      expect((await fetch(at(handle.port, p), { method: 'HEAD' })).status, what).toBe(403);
    }
  });

  it('a sign-in that does not hold the channel is given no ticket — refused by the permission gate’s one predicate', async () => {
    const { handle, playout } = await bridge();
    const c = await openClient(handle);
    // `channelTwo` is granted channel 2 alone; the station declares channel 1.
    await c.authenticate('a', (await playout.issueToken({ user: 'channelTwo' })).token);
    const res = await c.ask('t', 'pgmReturn.ticket', { channel: 1 });
    expectRefusedWith(res.error, authzChannelRefusal(1), 'a ticket for a channel not held');
  });

  it('a socket with no sign-in is given nothing (the auth gate)', async () => {
    const { handle } = await bridge();
    const c = await openClient(handle);
    const res = await c.ask('t', 'pgmReturn.ticket', { channel: 1 });
    expectRefusedWith(res.error, AUTH_REQUIRED_REFUSAL, 'an unsigned ticket');
  });
});

describe('CG Bridge’s logs, downloaded', () => {
  it('🔴 a station admin downloads them as a zip, ONCE per ticket — control: an operator is given no ticket', async () => {
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-logs-'));
    dirs.push(logsDir);
    fs.writeFileSync(path.join(logsDir, 'amcp.log'), 'CG 1-80 PLAY\r\n');
    /*
      `CONSOLE-POLISH-01` (`R-083`) — the audit lives outside the log folder (`.cg-runtime`), and it
      rotates: the zip carries the current file AND every kept rotated one.
    */
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'));
    dirs.push(stateDir);
    const auditLogPath = path.join(stateDir, 'bridge-audit.ndjson');
    const row = (ts: string): string =>
      `${JSON.stringify({ ts, actor: 'Sara', action: 'take', outcome: 'ok' })}\n`;
    fs.writeFileSync(
      path.join(stateDir, 'bridge-audit.2026-09-30T08-00-00.000Z.ndjson'),
      row('2026-09-30T08:00:00.000Z'),
    );
    /*
      The current file's first row is NOW: the sign-ins below append to it, and a first row from an
      earlier day would rotate it on the first append — its name would then be briefly absent, and the
      assertion on it a race (no row is lost; the zip carries the renamed file).
    */
    fs.writeFileSync(auditLogPath, row(new Date().toISOString()));
    const { handle, playout } = await bridge({ logsDir, auditLogPath });

    const operator = await openClient(handle);
    await operator.authenticate('a', (await playout.issueToken({ user: 'operator' })).token);
    const refused = await operator.ask('t', 'bridge.logs-ticket');
    expect(typeof refused.error).toBe('string');

    const admin = await openClient(handle);
    await admin.authenticate(
      'a',
      (await playout.issueToken({ user: 'admin', cgChannels: '*' })).token,
    );
    const res = await admin.ask('t', 'bridge.logs-ticket');
    expect(res.error).toBeUndefined();
    const ticketed = (res.payload as { path: string }).path;
    expect(ticketed).toMatch(/^\/logs\.zip\?ticket=/);

    const zip = await fetch(at(handle.port, ticketed));
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    expect(zip.headers.get('content-disposition')).toMatch(
      /^attachment; filename="cg-bridge-logs-/,
    );
    const bytes = Buffer.from(await zip.arrayBuffer());
    expect(bytes.subarray(0, 4).readUInt32LE(0), 'a zip begins with a local header').toBe(
      0x04034b50,
    );
    expect(bytes.includes(Buffer.from('amcp.log'))).toBe(true);
    // `R-083` — every kept audit file, under `audit/`.
    expect(bytes.includes(Buffer.from('audit/bridge-audit.ndjson'))).toBe(true);
    expect(bytes.includes(Buffer.from('audit/bridge-audit.2026-09-30T08-00-00.000Z.ndjson'))).toBe(
      true,
    );
    // Once.
    expect((await fetch(at(handle.port, ticketed))).status).toBe(403);
  });

  it('a bridge with no log folder says so rather than zipping nothing', async () => {
    const { handle, playout } = await bridge();
    const admin = await openClient(handle);
    await admin.authenticate(
      'a',
      (await playout.issueToken({ user: 'admin', cgChannels: '*' })).token,
    );
    expect((await admin.ask('t', 'bridge.logs-ticket')).error).toBe(
      'This CG Bridge keeps no log folder.',
    );
  });
});

describe('the ticket store', () => {
  it('a ticket opens only what it was issued for, until it expires; a logs ticket once, a picture ticket until then', () => {
    let now = 1_000;
    const tickets = new HttpTickets(() => now, 30_000);
    const pgm = tickets.issue({ kind: 'pgm', channel: 2 });
    const logs = tickets.issue({ kind: 'logs' });
    expect(tickets.redeem(pgm, (g) => g.kind === 'pgm' && g.channel === 1)).toBeNull();
    expect(tickets.redeem(pgm, (g) => g.kind === 'pgm' && g.channel === 2)).not.toBeNull();
    expect(
      tickets.redeem(pgm, (g) => g.kind === 'pgm' && g.channel === 2),
      'asked again',
    ).not.toBeNull();
    expect(tickets.redeem(logs, (g) => g.kind === 'logs')).not.toBeNull();
    expect(
      tickets.redeem(logs, (g) => g.kind === 'logs'),
      'a logs ticket is spent',
    ).toBeNull();
    now += 30_000;
    expect(
      tickets.redeem(pgm, () => true),
      'expired',
    ).toBeNull();
    expect(tickets.redeem(null, () => true)).toBeNull();
  });
});
