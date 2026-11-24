import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  availabilityCommandId,
  ManagedCgAvailabilityStore,
  type ManagedCgAvailabilityIntent,
  type ManagedCgAvailabilityState,
} from '../src/managed-cg-availability-store.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, linkSync: vi.fn(actual.linkSync) };
});

const idA = '57238dfd-d8ef-46a4-8313-6c806281dc9d';
const idB = 'ecf59628-744d-4c77-89f1-22197b349956';
const hash = '8DA53F7D444C514A873090BEBA21325C69EB1F01A386B25EE1837265028C4035';
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(tmpdir(), 'cg-availability-store-'));
});

afterEach(() => {
  const resolved = fs.realpathSync(directory);
  if (
    path.dirname(resolved) !== fs.realpathSync(tmpdir()) ||
    !path.basename(resolved).startsWith('cg-availability-store-')
  ) {
    throw new Error('Unexpected availability test directory.');
  }
  vi.mocked(fs.linkSync).mockClear();
  fs.rmSync(resolved, { recursive: true, force: true });
});

function select(
  state: ManagedCgAvailabilityState,
  engineId: 'A' | 'B',
  epoch: number,
): NonNullable<ManagedCgAvailabilityState['selected']> {
  return {
    selection: {
      controllerId: state.controllerId,
      epoch,
      selectionId: engineId === 'A' ? idA : idB,
      engineId,
    },
    expectedSequence: 0,
    expectedRequestHash: '',
  };
}

function intent(state: ManagedCgAvailabilityState, sequence: number): ManagedCgAvailabilityIntent {
  return {
    controllerId: state.controllerId,
    commandId: availabilityCommandId(state.controllerId, sequence),
    sequence,
    originEpoch: state.selected?.selection.epoch ?? 1,
    operation: 'layout',
    layout: [],
  };
}

describe('Playout availability command IDs', () => {
  it('matches the published .37 network-order UUID v8 vectors', () => {
    const exact = '2907d776-ed31-4a14-abfc-904620b61970';
    expect(availabilityCommandId(exact, 1)).toBe('d64629d7-2f51-888e-bf91-27457dfb550a');
    expect(availabilityCommandId(exact.toUpperCase(), 12)).toBe(
      'c6c45a3f-56f5-8e1b-a963-ffc8e120e859',
    );
    expect(() => availabilityCommandId(exact, 0)).toThrow(/sequence/);
    expect(() => availabilityCommandId(exact, Number.MAX_SAFE_INTEGER + 1)).toThrow(/sequence/);
    expect(() => availabilityCommandId('invalid', 1)).toThrow(/controller ID/);
  });
});

describe('ManagedCgAvailabilityStore', () => {
  it('retains the controller, latest complete layout and unresolved command across restart and selection', () => {
    const store = new ManagedCgAvailabilityStore(directory);
    const initial = store.read();
    const selected = store.write(initial, { ...initial, selected: select(initial, 'A', 1) });
    const first = intent(selected, 1);
    const reserved = store.write(selected, { ...selected, lastSequence: 1, pending: first });
    const settled = store.write(reserved, {
      ...reserved,
      committed: { intent: first, requestHash: hash },
      pending: null,
    });
    const nextIntent = { ...intent(settled, 2), operation: 'clear' as const };
    const reservedNext = store.write(settled, { ...settled, lastSequence: 2, pending: nextIntent });
    const restarted = new ManagedCgAvailabilityStore(directory);
    expect(restarted.read()).toEqual(reservedNext);
    const moved = restarted.write(reservedNext, {
      ...reservedNext,
      selected: select(reservedNext, 'B', 2),
    });
    expect(moved.pending).toEqual(nextIntent);
    expect(moved.committed).toEqual({ intent: first, requestHash: hash });
    expect(new ManagedCgAvailabilityStore(directory).read()).toEqual(moved);
    expect(fs.readdirSync(directory).sort()).toEqual(['4.json', '5.json']);
  });

  it('rejects a stale state and keeps a concurrent valid reservation', async () => {
    const { linkSync } = await vi.importActual<typeof fs>('node:fs');
    const store = new ManagedCgAvailabilityStore(directory);
    const other = new ManagedCgAvailabilityStore(directory);
    const initial = store.read();
    vi.mocked(fs.linkSync).mockImplementationOnce((temporary, target) => {
      other.write(initial, { ...initial, selected: select(initial, 'B', 1) });
      linkSync(temporary, target);
    });
    expect(() => store.write(initial, { ...initial, selected: select(initial, 'A', 1) })).toThrow(
      /changed/,
    );
    expect(store.read().selected?.selection.engineId).toBe('B');
    expect(() => store.write(initial, initial)).toThrow(/changed/);
  });

  it('cannot commit a stale revision even when the competing writer already pruned its slot', async () => {
    const { linkSync } = await vi.importActual<typeof fs>('node:fs');
    const store = new ManagedCgAvailabilityStore(directory);
    const other = new ManagedCgAvailabilityStore(directory);
    const initial = store.read();
    vi.mocked(fs.linkSync).mockImplementationOnce((temporary, target) => {
      let head = initial;
      for (const epoch of [1, 2, 3]) {
        head = other.write(head, { ...head, selected: select(head, 'B', epoch) });
      }
      expect(fs.existsSync(target)).toBe(false);
      linkSync(temporary, target);
    });
    expect(() => store.write(initial, { ...initial, selected: select(initial, 'A', 1) })).toThrow(
      /advanced/,
    );
    expect(store.read().selected?.selection).toMatchObject({ engineId: 'B', epoch: 3 });
  });

  it('rejects regressing sequence, rewriting a pending request, and storing credentials', () => {
    const store = new ManagedCgAvailabilityStore(directory);
    const initial = store.read();
    const selected = store.write(initial, { ...initial, selected: select(initial, 'A', 1) });
    const reserved = store.write(selected, {
      ...selected,
      lastSequence: 1,
      pending: intent(selected, 1),
    });
    expect(() =>
      store.write(reserved, { ...reserved, pending: intent(reserved, 2), lastSequence: 2 }),
    ).toThrow(/outstanding/);
    expect(() => store.write(reserved, { ...reserved, lastSequence: 0, pending: null })).toThrow(
      /regressed/,
    );
    const withCredential = { ...reserved, bearer: 'test-secret' };
    expect(() => store.write(reserved, withCredential)).toThrow();
    expect(store.read()).toEqual(reserved);
  });

  it('fails closed on a corrupted latest record while an older record is still present', () => {
    const store = new ManagedCgAvailabilityStore(directory);
    const older = store.read();
    store.write(older, { ...older, selected: select(older, 'A', 1) });
    fs.writeFileSync(path.join(directory, '1.json'), '{');
    expect(() => new ManagedCgAvailabilityStore(directory).read()).toThrow();
    expect(() => store.write(older, older)).toThrow();
  });
});
