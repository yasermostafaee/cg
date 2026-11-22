import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagedCgJournal, type ManagedCgPending } from '../src/managed-cg-journal.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, linkSync: vi.fn(actual.linkSync) };
});

const scope = 'station-a/programme';
const first: ManagedCgPending = {
  ownerOrigin: 'http://127.0.0.1:8090',
  localChannelCode: 'programme',
  commandId: 'command-first',
  requestBody: '{  "operation": "layout", "layout": [] }',
};
const second: ManagedCgPending = {
  ...first,
  ownerOrigin: 'http://127.0.0.1:8091',
  localChannelCode: 'programme-reserve',
  commandId: 'command-second',
};

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(tmpdir(), 'cg-managed-journal-'));
});

afterEach(() => {
  const actualDirectory = fs.realpathSync(directory);
  if (
    path.dirname(actualDirectory) !== fs.realpathSync(tmpdir()) ||
    !path.basename(actualDirectory).startsWith('cg-managed-journal-')
  ) {
    throw new Error('Unexpected journal test directory');
  }
  vi.mocked(fs.linkSync).mockClear();
  fs.rmSync(actualDirectory, { recursive: true, force: true });
});

describe('ManagedCgJournal', () => {
  it('recovers the exact request on restart and prevents an owner switch replacing it', () => {
    const writer = new ManagedCgJournal(directory);
    expect(writer.get(scope)).toBeUndefined();
    writer.reserve(scope, first);

    const restarted = new ManagedCgJournal(directory);
    expect(restarted.get(scope)).toEqual(first);
    expect(() => restarted.reserve(scope, second)).toThrow(/already pending/);
    expect(() => restarted.resolve(scope, second.commandId)).toThrow(/ID does not match/);
    expect(writer.get(scope)).toEqual(first);

    restarted.resolve(scope, first.commandId);
    writer.resolve(scope, first.commandId);
    expect(writer.get(scope)).toBeUndefined();
    restarted.reserve(scope, second);
    expect(() => writer.resolve(scope, first.commandId)).toThrow(/ID does not match/);
    expect(new ManagedCgJournal(directory).get(scope)).toEqual(second);
  });

  it('keeps separate channel scopes independent', () => {
    const journal = new ManagedCgJournal(directory);
    journal.reserve(scope, first);
    journal.reserve('station-a/other', second);
    journal.resolve(scope, first.commandId);
    expect(journal.get(scope)).toBeUndefined();
    expect(journal.get('station-a/other')).toEqual(second);
  });

  it('publishes one reservation when another writer wins after the initial read', async () => {
    const { linkSync } = await vi.importActual<typeof fs>('node:fs');
    const journal = new ManagedCgJournal(directory);
    const other = new ManagedCgJournal(directory);
    vi.mocked(fs.linkSync).mockImplementationOnce((temporary, target) => {
      other.reserve(scope, second);
      linkSync(temporary, target);
    });
    expect(() => journal.reserve(scope, first)).toThrow(/EEXIST/);
    expect(journal.get(scope)).toEqual(second);
  });

  it('keeps the next reservation when a concurrent resolver finishes the previous one', async () => {
    const { linkSync } = await vi.importActual<typeof fs>('node:fs');
    const journal = new ManagedCgJournal(directory);
    const other = new ManagedCgJournal(directory);
    journal.reserve(scope, first);
    vi.mocked(fs.linkSync).mockImplementationOnce((temporary, target) => {
      other.resolve(scope, first.commandId);
      other.reserve(scope, second);
      linkSync(temporary, target);
    });
    journal.resolve(scope, first.commandId);
    expect(journal.get(scope)).toEqual(second);
  });

  it('fails shut on an unreadable pending reservation or conflicting receipt', () => {
    const journal = new ManagedCgJournal(directory);
    journal.reserve(scope, first);
    const [entry] = fs.readdirSync(directory);
    if (entry === undefined) throw new Error('Missing channel directory');
    const channelDirectory = path.join(directory, entry);
    const receipt = path.join(channelDirectory, '1-resolved.json');
    fs.writeFileSync(receipt, JSON.stringify({ version: 1, commandId: second.commandId }));
    expect(() => journal.get(scope)).toThrow(/receipt does not match/);
    expect(() => journal.reserve(scope, second)).toThrow(/receipt does not match/);

    fs.unlinkSync(receipt);
    fs.writeFileSync(path.join(channelDirectory, '1-pending.json'), '{');
    expect(() => journal.get(scope)).toThrow();
    expect(() => journal.reserve(scope, second)).toThrow();
  });

  it('rejects owner credentials and unknown fields before writing', () => {
    const journal = new ManagedCgJournal(directory);
    expect(() =>
      journal.reserve(scope, { ...first, ownerOrigin: 'http://user:secret@127.0.0.1:8090' }),
    ).toThrow();
    const unsafe = { ...first, bearer: 'secret' };
    expect(() => journal.reserve(scope, unsafe)).toThrow();
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
