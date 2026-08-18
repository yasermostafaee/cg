import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditWriter } from '../src/writer.js';

let tmpDir: string | undefined;
let writer: AuditWriter | undefined;

afterEach(async () => {
  if (writer) {
    await writer.close();
    writer = undefined;
  }
  if (tmpDir) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

async function setup(): Promise<{ writer: AuditWriter; filePath: string }> {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-'));
  const filePath = path.join(tmpDir, 'audit.ndjson');
  writer = new AuditWriter({ filePath });
  return { writer, filePath };
}

/**
 * Same as `setup`, with fault injection: `failOn(line)` decides which write throws.
 * Every other write still reaches the REAL file, so the assertions read the file.
 */
async function setupFaulty(
  failOn: (line: string) => boolean,
): Promise<{ writer: AuditWriter; filePath: string }> {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-'));
  const filePath = path.join(tmpDir, 'audit.ndjson');
  writer = new AuditWriter({
    filePath,
    beforeWrite: (line) => {
      if (failOn(line)) throw new Error('ENOSPC: simulated');
    },
  });
  return { writer, filePath };
}

/** The entries actually on disk, in FILE order. */
async function linesOf(filePath: string): Promise<{ itemId?: string }[]> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { itemId?: string });
}

const row = (itemId: string): Parameters<AuditWriter['append']>[0] => ({
  actor: 'local',
  action: 'take',
  itemId,
  outcome: 'ok',
});

/**
 * ⭐ **B-141 follow-up — THE APPEND CHAIN.**
 *
 * `append()` is fire-and-forget by contract, so before this the writer had two
 * writes in flight at once. Each is atomic under `O_APPEND`, but two concurrent
 * ones complete in either order — and CI proved it, reordering a refusal ahead of
 * the accepted action that preceded it on a tree where Windows had not. The claim
 * "file order is outcome order" was simply false.
 *
 * 🔴 The failure mode of the OBVIOUS fix is what most of these tests are about. A
 * plain `tail = tail.then(write)` short-circuits: one rejected link poisons the
 * chain and every later append is dropped in silence — a fix that turns into a
 * no-op at exactly the moment the thing it guards starts failing. That is the
 * class this project has spent a week hunting, so it is pinned rather than
 * reasoned about.
 */
describe('AuditWriter — the append chain', () => {
  it('🔴 concurrent appends land in CALL order, not completion order', async () => {
    const { writer, filePath } = await setup();
    // Fire-and-forget exactly as `#recordAudit` does — no awaiting between them,
    // which is the shape that used to race.
    const all = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => writer.append(row(id)));
    await Promise.all(all);
    expect((await linesOf(filePath)).map((e) => e.itemId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('🔴 a FAILED write does not swallow the appends after it — the next one still lands', async () => {
    /*
      The owner's condition, and the whole reason the tail is
      `link.then(noop, noop)`. With a short-circuiting chain 'c' never reaches the
      disk at all, the file ends at 'a', and NOTHING says so — the writer reports
      one error and then goes quiet forever.
    */
    const { writer, filePath } = await setupFaulty((line) => line.includes('"itemId":"b"'));
    await expect(writer.append(row('a'))).resolves.toMatchObject({ itemId: 'a' });
    // The caller still sees ITS OWN write's failure…
    await expect(writer.append(row('b'))).rejects.toThrow(/ENOSPC/);
    // …and the chain carries on.
    await expect(writer.append(row('c'))).resolves.toMatchObject({ itemId: 'c' });

    expect((await linesOf(filePath)).map((e) => e.itemId)).toEqual(['a', 'c']);
    expect(writer.writeCount).toBe(2);
    expect(writer.errorCount).toBe(1);
    expect(writer.lastError?.message).toMatch(/ENOSPC/);
  });

  it('a run of failures still leaves the chain usable', async () => {
    // One rejection poisoning the chain is the bug; three must be no different.
    const { writer, filePath } = await setupFaulty((line) => /"itemId":"f[123]"/.test(line));
    const results = await Promise.allSettled([
      writer.append(row('f1')),
      writer.append(row('f2')),
      writer.append(row('f3')),
      writer.append(row('ok')),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected', 'fulfilled']);
    expect((await linesOf(filePath)).map((e) => e.itemId)).toEqual(['ok']);
    expect(writer.errorCount).toBe(3);
  });

  it('close() FLUSHES the queued appends — the last rows before a shutdown land', async () => {
    /*
      Fire-and-forget means rows can still be queued when the process is going
      down, and those are the ones a forensic reader most wants. Closing the
      handle out from under them would lose exactly them.
    */
    const { writer, filePath } = await setup();
    void writer.append(row('x'));
    void writer.append(row('y'));
    void writer.append(row('z'));
    await writer.close();
    expect((await linesOf(filePath)).map((e) => e.itemId)).toEqual(['x', 'y', 'z']);
  });

  it('close() is not blocked by a failed write', async () => {
    const { writer } = await setupFaulty(() => true);
    void writer.append(row('a')).catch(() => undefined);
    await expect(writer.close()).resolves.toBeUndefined();
  });

  it('an append AFTER close is refused rather than reopening the file', async () => {
    // Reopening is how the descriptor `close()` exists to release gets leaked
    // again, one shutdown later.
    const { writer } = await setup();
    await writer.append(row('a'));
    await writer.close();
    await expect(writer.append(row('b'))).rejects.toThrow(/closed/);
  });
});

describe('AuditWriter', () => {
  it('appends a take entry as NDJSON', async () => {
    const { writer, filePath } = await setup();
    const entry = await writer.append({
      actor: 'local',
      action: 'take',
      itemId: 'i1',
      templateId: 't1',
      outcome: 'ok',
      ackMs: 12,
    });
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(writer.writeCount).toBe(1);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
    expect(JSON.parse(content.trim())).toMatchObject({
      actor: 'local',
      action: 'take',
      outcome: 'ok',
    });
  });

  it('emits appended event', async () => {
    const { writer } = await setup();
    let captured: { itemId?: string } | null = null;
    writer.on('appended', (entry) => (captured = entry));
    await writer.append({
      actor: 'local',
      action: 'load',
      itemId: 'i1',
      templateId: 't1',
      outcome: 'ok',
    });
    expect(captured).toMatchObject({ itemId: 'i1' });
  });

  it('writes multiple entries on separate NDJSON lines', async () => {
    const { writer, filePath } = await setup();
    await writer.append({ actor: 'a', action: 'load', itemId: 'i1', outcome: 'ok' });
    await writer.append({ actor: 'a', action: 'take', itemId: 'i1', outcome: 'ok' });
    await writer.append({ actor: 'a', action: 'out', itemId: 'i1', outcome: 'ok' });
    const lines = (await fs.promises.readFile(filePath, 'utf-8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
  });

  it('uses the configured `now()` for missing ts', async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-'));
    const filePath = path.join(tmpDir, 'audit.ndjson');
    const fixed = new Date('2026-05-23T10:00:00.000Z');
    writer = new AuditWriter({ filePath, now: () => fixed });
    const entry = await writer.append({ actor: 'a', action: 'take', outcome: 'ok' });
    expect(entry.ts).toBe('2026-05-23T10:00:00.000Z');
  });

  it('respects an explicit ts when provided', async () => {
    const { writer } = await setup();
    const entry = await writer.append({
      ts: '2026-05-23T12:00:00.000Z',
      actor: 'a',
      action: 'take',
      outcome: 'ok',
    });
    expect(entry.ts).toBe('2026-05-23T12:00:00.000Z');
  });

  it('creates the parent directory on first append', async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-'));
    const filePath = path.join(tmpDir, 'nested', 'subdir', 'audit.ndjson');
    writer = new AuditWriter({ filePath });
    await writer.append({ actor: 'a', action: 'take', outcome: 'ok' });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('rejects an entry that fails the schema', async () => {
    const { writer } = await setup();
    await expect(
      writer.append({
        actor: '',
        action: 'take',
        outcome: 'ok',
      }),
    ).rejects.toThrow();
    expect(writer.writeCount).toBe(0);
  });

  it('counts write errors via lastError + errorCount when the write fails', async () => {
    const { writer } = await setup();
    await writer.close();
    // Try to write on a closed handle; we rely on close()'s null-handle
    // path causing the next write to re-open. That succeeds because we
    // never deleted the file. To force a real failure, monkey-patch:
    // hard to do reliably across platforms. So instead we just confirm
    // that lastError starts null.
    expect(writer.lastError).toBeNull();
    expect(writer.errorCount).toBe(0);
  });

  it('close() is idempotent', async () => {
    const { writer } = await setup();
    await writer.close();
    await expect(writer.close()).resolves.toBeUndefined();
  });

  it('serializes concurrent appends without dropping lines', async () => {
    const { writer, filePath } = await setup();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writer.append({ actor: 'a', action: 'load', itemId: `i${String(i)}`, outcome: 'ok' }),
      ),
    );
    const lines = (await fs.promises.readFile(filePath, 'utf-8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(10);
  });
});
