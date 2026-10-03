import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import type { AuditCursor } from '@cg/shared-ipc';
import { openClient, startAuthedBridge } from './support/auth-harness.js';
import { track } from './support/harness.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **THE LOG, A PAGE AT A TIME, THROUGH THE REAL SOCKET.**
 *
 * `audit.recent` scoped AFTER its limit, so a console holding channel 1 could be handed fewer rows
 * than exist. `audit.page` asks the console's grant BEFORE it cuts the page: a channel-1 operator gets
 * a full page of channel-1 rows. Its filters and its search run on CG Bridge, the search reading what
 * a row SHOWS — its row's name from this station's bank. And a row recorded while a console is
 * connected is pushed (`audit.appended`) to that console only if it may see the row.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Row `n`, newest last: a take on channel `1 + n % 2`, layer 80 (`زیرنویس` on channel 1). */
function row(n: number): AuditEntry {
  return {
    ts: new Date(Date.parse('2026-10-01T08:00:00.000Z') + n * 1000).toISOString(),
    actor: n % 5 === 0 ? 'سارا' : 'Reza',
    action: 'take',
    itemId: `item-${String(n)}`,
    slot: { channel: 1 + (n % 2), layer: 80, server: 'primary' },
    outcome: 'ok',
  };
}

async function station(rows: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-audit-page-'));
  dirs.push(dir);
  const auditLogPath = path.join(dir, 'bridge-audit.ndjson');
  fs.writeFileSync(
    auditLogPath,
    Array.from({ length: rows }, (_, n) => `${JSON.stringify(row(n))}\n`).join(''),
  );
  const started = await startAuthedBridge({
    auditLogPath,
    fixedLayers: {
      channel: 1,
      start: 80,
      count: 4,
      low: { start: 50, count: 9 },
      aliases: { '80': 'زیرنویس' },
    },
  });
  track(started.playout, (p) => p.stop());
  track(started.handle, (h) => h.close());
  return started;
}

interface Page {
  entries: AuditEntry[];
  next: AuditCursor | null;
}

describe('audit.page', () => {
  it('🔴 a console holding channel 1 gets a FULL page of channel-1 rows, newest first — control: a `*` grant gets both', async () => {
    const { handle, playout } = await station(300);
    const operator = await openClient(handle);
    await operator.authenticate('a', (await playout.issueToken({ user: 'operator' })).token);
    const first = (await operator.ask('p1', 'audit.page', {})).payload as Page;
    expect(first.entries).toHaveLength(100);
    expect(first.entries.every((e) => e.slot?.channel === 1)).toBe(true);
    // Row 299 is channel 2's; the newest of channel 1 is 298.
    expect(first.entries[0]?.itemId).toBe('item-298');
    const second = (await operator.ask('p2', 'audit.page', { cursor: first.next })).payload as Page;
    expect(second.entries).toHaveLength(50);
    expect(second.entries.at(-1)?.itemId).toBe('item-0');
    expect(second.next).toBeNull();

    const admin = await openClient(handle);
    await admin.authenticate(
      'a',
      (await playout.issueToken({ user: 'admin', cgChannels: '*' })).token,
    );
    const all = (await admin.ask('p3', 'audit.page', { filter: { action: 'take' } }))
      .payload as Page;
    expect(all.entries.map((e) => e.itemId).slice(0, 2)).toEqual(['item-299', 'item-298']);
  });

  it('the filters and the search run on CG Bridge — the search finds a row by the NAME it shows', async () => {
    const { handle, playout } = await station(300);
    const admin = await openClient(handle);
    await admin.authenticate(
      'a',
      (await playout.issueToken({ user: 'admin', cgChannels: '*' })).token,
    );

    const byUser = (await admin.ask('a1', 'audit.page', { filter: { actor: 'سارا' } }))
      .payload as Page;
    expect(byUser.entries).toHaveLength(60);
    expect(byUser.entries.every((e) => e.actor === 'سارا')).toBe(true);

    // `زیرنویس` is channel 1's layer 80 by its alias — on no field of the record itself.
    const byName = (await admin.ask('a2', 'audit.page', { filter: { search: 'زیرنویس' } }))
      .payload as Page;
    expect(byName.entries.length).toBeGreaterThan(0);
    expect(byName.entries.every((e) => e.slot?.channel === 1)).toBe(true);

    const byChannel = (await admin.ask('a3', 'audit.page', { filter: { channel: 2 } }))
      .payload as Page;
    expect(byChannel.entries.every((e) => e.slot?.channel === 2)).toBe(true);
  });

  it('🔴 a row recorded while a console is connected is pushed to it — control: not to a console that may not see it', async () => {
    const { handle, playout } = await station(0);
    const operator = await openClient(handle);
    await operator.authenticate('a', (await playout.issueToken({ user: 'operator' })).token);
    const admin = await openClient(handle);
    await admin.authenticate(
      'a',
      (await playout.issueToken({ user: 'admin', cgChannels: '*' })).token,
    );

    // A refusal about channel 2: the station records it. The operator holds channel 1 only.
    handle.runtime.recordAuthzRefusal({
      actor: 'Reza',
      actorSub: 'u-2',
      channel: 'stack.take',
      casparChannel: 2,
    });
    // The refusals pushed — the sign-ins (on no channel) are told to everyone, and are not this.
    const appended = (c: Awaited<ReturnType<typeof openClient>>): AuditEntry[] =>
      c
        .publishes()
        .flatMap((f) =>
          f.type === 'publish' && f.channel === 'audit.appended' ? [f.payload as AuditEntry] : [],
        )
        .filter((e) => e.action === 'refused');
    const deadline = Date.now() + 3000;
    while (appended(admin).length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(appended(admin).map((e) => e.refused?.casparChannel)).toEqual([2]);
    // The same push loop told every socket it was going to; give a stray one time to arrive.
    await new Promise((r) => setTimeout(r, 150));
    expect(appended(operator)).toEqual([]);
  });
});
