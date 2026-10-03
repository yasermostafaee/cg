import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import { auditFiles, rotatedFiles, stampOf } from '../src/files.js';
import { readAuditPage, type AuditPageCursor } from '../src/reader.js';
import { AuditWriter, type AuditRotation } from '../src/writer.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — the record, a page at a time, across rotated files.
 */

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir !== undefined) await fs.promises.rm(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

async function dir(): Promise<string> {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-page-'));
  return tmpDir;
}

/** Row `n` at a second after `base`, by `actor`, on channel `1 + n % 2`. */
function row(n: number, base = Date.parse('2026-10-01T09:00:00.000Z')): AuditEntry {
  return {
    ts: new Date(base + n * 1000).toISOString(),
    actor: n % 3 === 0 ? 'سارا' : 'Reza',
    action: 'take',
    itemId: `item-${String(n)}`,
    slot: { channel: 1 + (n % 2), layer: 70, server: 'primary' },
    outcome: 'ok',
  };
}

/** `n` rows straight to disk, oldest first — the writer's own format, without its per-row await. */
async function seed(filePath: string, count: number, base?: number): Promise<void> {
  const lines: string[] = [];
  for (let n = 0; n < count; n++) lines.push(JSON.stringify(row(n, base)));
  await fs.promises.writeFile(filePath, `${lines.join('\n')}\n`);
}

const all = (): boolean => true;
const ids = (entries: readonly AuditEntry[]): string[] => entries.map((e) => e.itemId ?? '');

describe('readAuditPage', () => {
  it('🔴 50,000 rows: the first page is the newest 100, read from the end; the next page the 100 before', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    await seed(filePath, 50_000);

    const started = performance.now();
    const first = await readAuditPage({ filePath, limit: 100, accept: all });
    const took = performance.now() - started;
    expect(ids(first.entries)).toEqual(
      Array.from({ length: 100 }, (_, i) => `item-${String(49_999 - i)}`),
    );
    expect(took, 'one chunk, not the whole file').toBeLessThan(250);
    expect(first.next).not.toBeNull();

    const second = await readAuditPage({
      filePath,
      cursor: first.next as AuditPageCursor,
      limit: 100,
      accept: all,
    });
    expect(ids(second.entries)).toEqual(
      Array.from({ length: 100 }, (_, i) => `item-${String(49_899 - i)}`),
    );
  });

  it('a filter runs BEFORE the page is cut: 100 of that user’s rows, newest first', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    await seed(filePath, 3_000);
    const page = await readAuditPage({
      filePath,
      limit: 100,
      accept: (e) => e.actor === 'سارا',
    });
    expect(page.entries).toHaveLength(100);
    expect(page.entries.every((e) => e.actor === 'سارا')).toBe(true);
    expect(page.entries[0]?.itemId).toBe('item-2997');
    expect(page.entries[1]?.itemId).toBe('item-2994');
  });

  it('the last page says there is nothing older', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    await seed(filePath, 150);
    const first = await readAuditPage({ filePath, limit: 100, accept: all });
    const last = await readAuditPage({
      filePath,
      cursor: first.next as AuditPageCursor,
      limit: 100,
      accept: all,
    });
    expect(last.entries).toHaveLength(50);
    expect(last.entries.at(-1)?.itemId).toBe('item-0');
    expect(last.next).toBeNull();
  });

  it('a torn line is skipped, never thrown; a missing record is an empty page', async () => {
    const d = await dir();
    const filePath = path.join(d, 'bridge-audit.ndjson');
    await fs.promises.writeFile(
      filePath,
      `${JSON.stringify(row(1))}\n{"ts":"2026-10-01T0\n${JSON.stringify(row(2))}\n`,
    );
    expect(ids((await readAuditPage({ filePath, limit: 100, accept: all })).entries)).toEqual([
      'item-2',
      'item-1',
    ]);
    expect(
      await readAuditPage({ filePath: path.join(d, 'none.ndjson'), limit: 100, accept: all }),
    ).toEqual({ entries: [], next: null });
  });

  it('🔴 a rotation between two pages: the second continues where the first ended', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    await seed(filePath, 250);
    const first = await readAuditPage({ filePath, limit: 100, accept: all });

    // The writer rotates it (a new day), and a row lands in the fresh file.
    const writer = new AuditWriter({ filePath, rotation: ROTATION });
    await writer.append(row(0, Date.parse('2026-10-03T09:00:00.000Z')));
    await writer.close();
    expect(await rotatedFiles(filePath)).toHaveLength(1);

    const second = await readAuditPage({
      filePath,
      cursor: first.next as AuditPageCursor,
      limit: 100,
      accept: all,
    });
    expect(ids(second.entries)).toEqual(
      Array.from({ length: 100 }, (_, i) => `item-${String(149 - i)}`),
    );
    // And a fresh read starts in the new file, then walks into the rotated one.
    const fresh = await readAuditPage({ filePath, limit: 3, accept: all });
    expect(ids(fresh.entries)).toEqual(['item-0', 'item-249', 'item-248']);
  });
});

const ROTATION: AuditRotation = {
  maxBytes: 20 * 1024 * 1024,
  daily: true,
  retainDays: 90,
  retainBytes: 200 * 1024 * 1024,
};

describe('AuditWriter rotation and retention', () => {
  it('🔴 rotates at a new local day, naming the old file by its first row', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    const writer = new AuditWriter({ filePath, rotation: ROTATION });
    const day1 = row(0, Date.parse('2026-10-01T12:00:00.000Z'));
    await writer.append(day1);
    await writer.append(row(1, Date.parse('2026-10-01T12:00:00.000Z')));
    await writer.append(row(2, Date.parse('2026-10-03T12:00:00.000Z')));
    await writer.close();
    const rotated = await rotatedFiles(filePath);
    expect(rotated.map((f) => f.stamp)).toEqual([stampOf(day1.ts)]);
    expect(path.basename(rotated[0]?.path ?? '')).toBe(`bridge-audit.${stampOf(day1.ts)}.ndjson`);
    // Control: the same day does not rotate — two rows in the rotated file, one in the current.
    const files = await auditFiles(filePath);
    const lines = async (p: string): Promise<number> =>
      (await fs.promises.readFile(p, 'utf8')).split('\n').filter((l) => l !== '').length;
    expect(await lines(files[0]?.path ?? '')).toBe(1);
    expect(await lines(files[1]?.path ?? '')).toBe(2);
  });

  it('rotates at the size limit', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    const size = Buffer.byteLength(`${JSON.stringify(row(0))}\n`);
    const writer = new AuditWriter({ filePath, rotation: { ...ROTATION, maxBytes: size * 3 } });
    for (let n = 0; n < 7; n++) await writer.append(row(n));
    await writer.close();
    // 3 + 3 rotated, 1 current.
    expect(await rotatedFiles(filePath)).toHaveLength(2);
  });

  it('🔴 retention: a file whose last row is older than retainDays goes; the newer stay', async () => {
    const d = await dir();
    const filePath = path.join(d, 'bridge-audit.ndjson');
    // Two rotated files: one that ended 100 days ago, one that ended 10 days ago.
    const old = Date.parse('2026-06-01T09:00:00.000Z');
    const recent = Date.parse('2026-06-25T09:00:00.000Z');
    await fs.promises.writeFile(
      path.join(d, `bridge-audit.${stampOf(new Date(old).toISOString())}.ndjson`),
      `${JSON.stringify(row(0, old))}\n`,
    );
    await fs.promises.writeFile(
      path.join(d, `bridge-audit.${stampOf(new Date(recent).toISOString())}.ndjson`),
      `${JSON.stringify(row(0, recent))}\n`,
    );
    await fs.promises.writeFile(filePath, `${JSON.stringify(row(0, recent + 86_400_000))}\n`);
    const writer = new AuditWriter({ filePath, rotation: ROTATION });
    // A row 100 days after the first file ENDED (it ended where the second began).
    await writer.append(row(0, recent + 100 * 86_400_000));
    await writer.close();
    const stamps = (await rotatedFiles(filePath)).map((f) => f.stamp);
    expect(stamps).not.toContain(stampOf(new Date(old).toISOString()));
    // The second file ended 101 days ago too (where the current one began) — it goes as well; the
    // file that just rotated is kept.
    expect(stamps).toEqual([stampOf(new Date(recent + 86_400_000).toISOString())]);
  });

  it('retention: past retainBytes in all, the oldest go first', async () => {
    const filePath = path.join(await dir(), 'bridge-audit.ndjson');
    const size = Buffer.byteLength(`${JSON.stringify(row(0))}\n`);
    const writer = new AuditWriter({
      filePath,
      rotation: { ...ROTATION, maxBytes: size, retainBytes: size * 3 },
    });
    for (let n = 0; n < 6; n++) await writer.append(row(n));
    await writer.close();
    const kept = await auditFiles(filePath);
    // Three files of one row each, the newest three.
    expect(kept).toHaveLength(3);
    const firsts = await Promise.all(
      kept.map(
        async (f) => JSON.parse((await fs.promises.readFile(f.path, 'utf8')).trim()) as AuditEntry,
      ),
    );
    expect(firsts.map((e) => e.itemId)).toEqual(['item-5', 'item-4', 'item-3']);
  });
});
