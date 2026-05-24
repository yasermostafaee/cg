import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRecentEntries } from '../src/reader.js';
import { AuditWriter } from '../src/writer.js';

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

async function setup(): Promise<{ filePath: string; writer: AuditWriter }> {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-reader-'));
  const filePath = path.join(tmpDir, 'audit.ndjson');
  const writer = new AuditWriter({ filePath });
  return { filePath, writer };
}

describe('readRecentEntries', () => {
  it('returns [] for a missing file (first-boot case)', async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-reader-'));
    const entries = await readRecentEntries({
      filePath: path.join(tmpDir, 'never-written.ndjson'),
    });
    expect(entries).toEqual([]);
  });

  it('returns entries newest-first', async () => {
    const { filePath, writer } = await setup();
    await writer.append({ actor: 'a', action: 'load', itemId: 'i1', outcome: 'ok' });
    await writer.append({ actor: 'a', action: 'take', itemId: 'i1', outcome: 'ok' });
    await writer.append({ actor: 'a', action: 'out', itemId: 'i1', outcome: 'ok' });
    await writer.close();
    const entries = await readRecentEntries({ filePath });
    expect(entries.map((e) => e.action)).toEqual(['out', 'take', 'load']);
  });

  it('caps the result at `limit` (newest-first)', async () => {
    const { filePath, writer } = await setup();
    for (let i = 0; i < 10; i++) {
      await writer.append({ actor: 'a', action: 'load', itemId: `i${String(i)}`, outcome: 'ok' });
    }
    await writer.close();
    const entries = await readRecentEntries({ filePath, limit: 3 });
    expect(entries).toHaveLength(3);
    expect(entries[0]?.itemId).toBe('i9');
    expect(entries[2]?.itemId).toBe('i7');
  });

  it('returns [] when limit is 0', async () => {
    const { filePath, writer } = await setup();
    await writer.append({ actor: 'a', action: 'load', outcome: 'ok' });
    await writer.close();
    expect(await readRecentEntries({ filePath, limit: 0 })).toEqual([]);
  });

  it('filters by action', async () => {
    const { filePath, writer } = await setup();
    await writer.append({ actor: 'a', action: 'load', outcome: 'ok' });
    await writer.append({ actor: 'a', action: 'take', outcome: 'ok' });
    await writer.append({ actor: 'a', action: 'lock-engage', outcome: 'ok' });
    await writer.close();
    const entries = await readRecentEntries({ filePath, action: 'lock-engage' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('lock-engage');
  });

  it('filters by actor', async () => {
    const { filePath, writer } = await setup();
    await writer.append({ actor: 'alice', action: 'load', outcome: 'ok' });
    await writer.append({ actor: 'bob', action: 'load', outcome: 'ok' });
    await writer.close();
    const entries = await readRecentEntries({ filePath, actor: 'bob' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actor).toBe('bob');
  });

  it('skips malformed JSON lines without throwing', async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-reader-'));
    const filePath = path.join(tmpDir, 'audit.ndjson');
    const writer = new AuditWriter({ filePath });
    await writer.append({ actor: 'a', action: 'load', outcome: 'ok' });
    await writer.close();
    // Manually append junk to simulate a corrupted line.
    await fs.promises.appendFile(filePath, 'not-json\n{"missing":"required-fields"}\n');
    const entries = await readRecentEntries({ filePath });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('load');
  });
});
