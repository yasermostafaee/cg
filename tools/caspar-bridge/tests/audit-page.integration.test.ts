import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const ROWS_DAY = Date.parse('2026-10-01T08:00:00.000Z');

/** Row `n`, newest last: a take on channel `1 + n % 2`, layer 80 (`زیرنویس` on channel 1). */
function row(n: number, base = ROWS_DAY): AuditEntry {
  return {
    ts: new Date(base + n * 1000).toISOString(),
    actor: n % 5 === 0 ? 'سارا' : 'Reza',
    action: 'take',
    itemId: `item-${String(n)}`,
    slot: { channel: 1 + (n % 2), layer: 80, server: 'primary' },
    outcome: 'ok',
  };
}

async function station(rows: number, base = ROWS_DAY) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-audit-page-'));
  dirs.push(dir);
  const auditLogPath = path.join(dir, 'bridge-audit.ndjson');
  fs.writeFileSync(
    auditLogPath,
    Array.from({ length: rows }, (_, n) => `${JSON.stringify(row(n, base))}\n`).join(''),
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
  return { ...started, dir, auditLogPath };
}

/**
 * `B-310` — the next `times` listings of `folder` answer what they found, then `during` runs: a
 * rotation put exactly between the two reads of the record's list. The bridge runs in this process,
 * so its reader lists through this `readdir`.
 */
function onListing(folder: string, during: () => void, times = 1): void {
  const real = fs.promises.readdir;
  let left = times;
  const listing = async (p: fs.PathLike, ...rest: unknown[]): Promise<unknown> => {
    const names: unknown = await (
      real as (p: fs.PathLike, ...r: unknown[]) => Promise<unknown>
    ).call(fs.promises, p, ...rest);
    if (left > 0 && path.resolve(String(p)) === path.resolve(folder)) {
      left -= 1;
      during();
    }
    return names;
  };
  vi.spyOn(fs.promises, 'readdir').mockImplementation(listing as typeof fs.promises.readdir);
}

/** Wait until the record holds the operator's sign-in row: the writer is idle again. */
async function signInRecorded(auditLogPath: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (
      fs.existsSync(auditLogPath) &&
      fs.readFileSync(auditLogPath, 'utf8').includes('"sign-in"')
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('the sign-in row never reached the record');
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
    /*
      🔴 `B-310` — the TAKES are asked for. The operator's own sign-in row (on no channel, so told to
      every console) lands in the record while this page is read, and — its day not being the rows'
      — it ROTATES the record as it lands: before, during or after this read. Unfiltered, the page
      held that row only when the rotation won, and the CI red (run 37185337111: 0 rows of 100) was
      the read landing inside it. Every order now answers this the same.
    */
    const takes = { filter: { action: 'take' } };
    const first = (await operator.ask('p1', 'audit.page', takes)).payload as Page;
    expect(first.entries).toHaveLength(100);
    expect(first.entries.every((e) => e.slot?.channel === 1)).toBe(true);
    // Row 299 is channel 2's; the newest of channel 1 is 298.
    expect(first.entries[0]?.itemId).toBe('item-298');
    const second = (await operator.ask('p2', 'audit.page', { ...takes, cursor: first.next }))
      .payload as Page;
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

describe('audit.page — B-310, a page read that overlaps a rotation', () => {
  /** Rows dated just before now: the sign-in lands in the same file and rotates nothing. */
  const recent = (): number => Date.now() - 10 * 60 * 1000;

  it('🔴 the record rotates INSIDE the page’s listing: the console still gets its full page — the CI red got 0 of 100', async () => {
    const { handle, playout, dir, auditLogPath } = await station(300, recent());
    const operator = await openClient(handle);
    await operator.authenticate('a', (await playout.issueToken({ user: 'operator' })).token);
    await signInRecorded(auditLogPath);
    // The writer's rename at midnight, between the reader's two reads of the list.
    onListing(dir, () => {
      fs.renameSync(auditLogPath, path.join(dir, 'bridge-audit.2026-10-01T08-00-00.000Z.ndjson'));
    });
    const page = (await operator.ask('r1', 'audit.page', { filter: { action: 'take' } }))
      .payload as Page;
    expect(page.entries).toHaveLength(100);
    expect(page.entries[0]?.itemId).toBe('item-298');
    expect(page.entries.every((e) => e.slot?.channel === 1)).toBe(true);
  });

  it('a record that never holds still across a read is refused in words — never the in-memory tail in its place', async () => {
    const { handle, playout, dir, auditLogPath } = await station(300, recent());
    const operator = await openClient(handle);
    await operator.authenticate('a', (await playout.issueToken({ user: 'operator' })).token);
    await signInRecorded(auditLogPath);
    let n = 0;
    onListing(
      dir,
      () => {
        n += 1;
        if (fs.existsSync(auditLogPath)) {
          fs.renameSync(
            auditLogPath,
            path.join(dir, `bridge-audit.2026-10-01T08-00-00.000Z-${String(n)}.ndjson`),
          );
        } else {
          fs.writeFileSync(auditLogPath, `${JSON.stringify(row(n, Date.now()))}\n`);
        }
      },
      Number.POSITIVE_INFINITY,
    );
    const answer = await operator.ask('r2', 'audit.page', { filter: { action: 'take' } });
    expect(answer.payload).toBeUndefined();
    expect(answer.error).toMatch(/kept rotating while it was read/);
  });
});
