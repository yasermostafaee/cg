import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/main/services/AuditService.js';
import type { StackService } from '../src/main/services/StackService.js';

let tmpDir: string | undefined;
let audit: AuditService | undefined;

afterEach(async () => {
  if (audit) {
    await audit.close();
    audit = undefined;
  }
  if (tmpDir) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

async function setup(): Promise<{ audit: AuditService; filePath: string; stack: StackService }> {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-audit-svc-'));
  const filePath = path.join(tmpDir, 'audit.ndjson');
  audit = new AuditService({ filePath, actor: 'test' });
  const stack = makeFakeStack();
  audit.bindStack(stack);
  return { audit, filePath, stack };
}

interface FakeStack {
  snapshot(): { itemId: string; status: string }[];
  emit(event: 'state-changed', snapshot: { itemId: string; status: string }[]): boolean;
}

function makeFakeStack(): StackService {
  const e = new EventEmitter() as unknown as StackService & FakeStack;
  let snapshot: { itemId: string; status: string }[] = [];
  Object.assign(e, {
    snapshot: () => [...snapshot],
    setSnapshot(next: { itemId: string; status: string }[]): void {
      snapshot = next;
      e.emit('state-changed', next);
    },
  });
  return e;
}

async function readLines(filePath: string): Promise<string[]> {
  const text = await fs.promises.readFile(filePath, 'utf-8');
  return text.split('\n').filter(Boolean);
}

describe('AuditService', () => {
  it('writes a load entry when a new item appears', async () => {
    const { stack, filePath } = await setup();
    (
      stack as unknown as { setSnapshot: (s: { itemId: string; status: string }[]) => void }
    ).setSnapshot([{ itemId: 'i1', status: 'loaded' }]);
    // give the async append a chance
    await new Promise((r) => setTimeout(r, 30));
    const lines = await readLines(filePath);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ action: 'load', itemId: 'i1', actor: 'test' });
  });

  it('writes a take entry on the loaded → playing transition', async () => {
    const { stack, filePath } = await setup();
    const setSnap = (s: { itemId: string; status: string }[]): void =>
      (
        stack as unknown as { setSnapshot: (s: { itemId: string; status: string }[]) => void }
      ).setSnapshot(s);
    setSnap([{ itemId: 'i1', status: 'loaded' }]);
    await new Promise((r) => setTimeout(r, 30));
    setSnap([{ itemId: 'i1', status: 'playing' }]);
    await new Promise((r) => setTimeout(r, 30));
    const lines = await readLines(filePath);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!)).toMatchObject({ action: 'take', itemId: 'i1' });
  });

  it('writes an out entry on the playing → exiting transition', async () => {
    const { stack, filePath } = await setup();
    const setSnap = (s: { itemId: string; status: string }[]): void =>
      (
        stack as unknown as { setSnapshot: (s: { itemId: string; status: string }[]) => void }
      ).setSnapshot(s);
    setSnap([{ itemId: 'i1', status: 'loaded' }]);
    setSnap([{ itemId: 'i1', status: 'playing' }]);
    setSnap([{ itemId: 'i1', status: 'exiting' }]);
    await new Promise((r) => setTimeout(r, 30));
    const lines = await readLines(filePath);
    const actions = lines.map((l) => (JSON.parse(l) as { action: string }).action);
    expect(actions).toEqual(['load', 'take', 'out']);
  });

  it('writes a remove entry when an item disappears from the snapshot', async () => {
    const { stack, filePath } = await setup();
    const setSnap = (s: { itemId: string; status: string }[]): void =>
      (
        stack as unknown as { setSnapshot: (s: { itemId: string; status: string }[]) => void }
      ).setSnapshot(s);
    setSnap([{ itemId: 'i1', status: 'loaded' }]);
    await new Promise((r) => setTimeout(r, 30));
    setSnap([]);
    await new Promise((r) => setTimeout(r, 30));
    const lines = await readLines(filePath);
    const last = JSON.parse(lines[lines.length - 1]!) as { action: string; itemId: string };
    expect(last).toMatchObject({ action: 'remove', itemId: 'i1' });
  });

  it('record() writes an arbitrary entry', async () => {
    const { audit, filePath } = await setup();
    await audit.record({ action: 'failover', outcome: 'ok' });
    const lines = await readLines(filePath);
    const last = JSON.parse(lines[lines.length - 1]!) as { action: string; actor: string };
    expect(last).toMatchObject({ action: 'failover', actor: 'test' });
  });

  it("doesn't emit duplicate audit rows for identical-status pushes", async () => {
    const { stack, filePath } = await setup();
    const setSnap = (s: { itemId: string; status: string }[]): void =>
      (
        stack as unknown as { setSnapshot: (s: { itemId: string; status: string }[]) => void }
      ).setSnapshot(s);
    setSnap([{ itemId: 'i1', status: 'loaded' }]);
    setSnap([{ itemId: 'i1', status: 'loaded' }]);
    setSnap([{ itemId: 'i1', status: 'loaded' }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(await readLines(filePath)).toHaveLength(1);
  });

  it('unbindStack() stops further appends', async () => {
    const { stack, filePath, audit } = await setup();
    audit.unbindStack();
    (
      stack as unknown as { setSnapshot: (s: { itemId: string; status: string }[]) => void }
    ).setSnapshot([{ itemId: 'i1', status: 'loaded' }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
