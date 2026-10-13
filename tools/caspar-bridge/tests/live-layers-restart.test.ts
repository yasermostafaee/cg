import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  reconcileLiveLayers,
  type LiveLayerLedger,
  type LiveLayerOccupancy,
  type LiveLayerRecord,
} from '../src/live-layers.js';
import { loadPersistedLiveLayers, savePersistedLiveLayers } from '../src/live-layers-store.js';

/**
 * 🔴 **B-145 — the live-layer ledger must survive a bridge restart.**
 *
 * `#liveLayers` was process memory released on `stopItem` / `out` / `remove` and on no
 * other path, so a restart lost it while the CasparCG producers kept running: layers stayed
 * lit and nothing in the product could name them, clear them or re-adopt them.
 *
 * One test per acceptance line in `docs/prd/bugs-runtime.md` → `B-145`, plus the store's
 * two failure modes.
 */

const dirs: string[] = [];
function tmpFile(name = 'live-layers.json'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-live-layers-'));
  dirs.push(dir);
  return path.join(dir, name);
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
function record(layer: number, sourceId: string): LiveLayerRecord {
  return {
    slot: { channel: 1, layer },
    sourceId,
    role: 'fill',
    producer: `route://1-${String(layer + 1)}`,
    fill: rect,
    clip: rect,
    intendedVolume: 0,
  };
}
const seated = (): LiveLayerLedger =>
  new Map([
    ['item-a', [record(10, 'guest-1'), record(11, 'guest-2')]],
    ['item-b', [record(12, 'guest-3')]],
  ]);

const all = (verdict: LiveLayerOccupancy) => (): LiveLayerOccupancy => verdict;

describe('B-145 acceptance 1 — a restart with seated plates leaves them listed and controllable', () => {
  it('round-trips the ledger through the file, keeping every field the doors read', () => {
    const file = tmpFile();
    savePersistedLiveLayers(file, seated());

    // The "restart": nothing in memory, only the file.
    const reloaded = loadPersistedLiveLayers(file).ledger;
    expect(reloaded).not.toBeNull();

    const adoption = reconcileLiveLayers({ persisted: reloaded!, observe: all('occupied') });
    expect([...adoption.adopted.keys()]).toEqual(['item-a', 'item-b']);
    // The coordinates are what make a layer CONTROLLABLE — clear/repoint need the slot,
    // and the ownership doors need the sourceId to say whose it is.
    expect(adoption.adopted.get('item-a')?.map((r) => r.slot.layer)).toEqual([10, 11]);
    expect(adoption.adopted.get('item-a')?.map((r) => r.sourceId)).toEqual(['guest-1', 'guest-2']);
    // Geometry survives too: a re-emission of FILL/CLIP after a restart must not put the
    // fill somewhere its clip is not — the pair is why the record carries both.
    expect(adoption.adopted.get('item-b')?.[0]?.fill).toEqual(rect);
    expect(adoption.adopted.get('item-b')?.[0]?.clip).toEqual(rect);
    expect(adoption.adopted.get('item-b')?.[0]?.producer).toBe('route://1-13');
  });

  it('an absent file is the normal first boot, not an error', () => {
    expect(loadPersistedLiveLayers(tmpFile()).ledger).toBeNull();
    expect(loadPersistedLiveLayers(tmpFile()).problem).toBeUndefined();
  });
});

describe('LOOKS §12.4 — a HELD plate stays held across a restart', () => {
  it('🔴 `held` round-trips, because the un-hold path re-asserts the volume off it', () => {
    const file = tmpFile();
    /*
      A held producer is MUTED on the server. The reconcile re-asserts a plate's audio
      intent exactly when it un-holds one (`prior.held === true`), so a restart that
      forgot the flag would treat the plate as on-screen, never re-assert, and leave a
      guest silent behind a hole that looks perfectly normal — the audio half of the
      failure 6.9c names, arriving by way of a restart instead of a swap.
    */
    savePersistedLiveLayers(
      file,
      new Map([['item-a', [{ ...record(10, 'guest-1'), held: true }, record(11, 'guest-2')]]]),
    );

    const reloaded = loadPersistedLiveLayers(file).ledger;

    expect(reloaded?.get('item-a')?.[0]?.held).toBe(true);
    // Absent stays absent — a ledger written before looks existed describes what it
    // described then, which is "on screen".
    expect(reloaded?.get('item-a')?.[1]?.held).toBeUndefined();
  });
});

describe('B-145 acceptance 2 — the rebuilt ledger comes from ONE authority', () => {
  it('the reconciled result is the whole answer: nothing the file said survives being contradicted', () => {
    const persisted = seated();
    // The server has layer 10 and 12, and does NOT have 11.
    const observe = (slot: { layer: number }): LiveLayerOccupancy =>
      slot.layer === 11 ? 'empty' : 'occupied';

    const adoption = reconcileLiveLayers({ persisted, observe });

    // ONE authority: the adopted ledger — not the file, and not the file plus a note.
    expect(adoption.adopted.get('item-a')?.map((r) => r.slot.layer)).toEqual([10]);
    expect(adoption.adopted.get('item-b')?.map((r) => r.slot.layer)).toEqual([12]);
    // …and the input is left alone, so nothing downstream can read the stale claim by
    // reaching past the result.
    expect(persisted.get('item-a')).toHaveLength(2);
  });

  it('an item whose every layer the server contradicted owns nothing, and is dropped entirely', () => {
    const adoption = reconcileLiveLayers({
      persisted: new Map([['item-b', [record(12, 'guest-3')]]]),
      observe: all('empty'),
    });
    expect(adoption.adopted.size).toBe(0);
    expect(adoption.adopted.has('item-b')).toBe(false);
  });
});

describe('B-145 acceptance 3 — a producer that vanished server-side is NOT asserted as seated', () => {
  it('drops the record and REPORTS it, rather than silently correcting', () => {
    const adoption = reconcileLiveLayers({
      persisted: seated(),
      observe: (slot) => (slot.layer === 11 ? 'empty' : 'occupied'),
    });
    expect(adoption.dropped).toHaveLength(1);
    expect(adoption.dropped[0]?.itemId).toBe('item-a');
    expect(adoption.dropped[0]?.record.slot.layer).toBe(11);
    expect(adoption.dropped[0]?.reason).toBe('server-says-empty');
  });

  it('🔴 UNKNOWN adopts and is marked unverified — absence of knowledge is not knowledge of absence', () => {
    // The failure this guards is the inverse of the bug: dropping a record we simply could
    // not check would strand exactly the producer B-145 exists to stop stranding.
    const adoption = reconcileLiveLayers({ persisted: seated(), observe: all('unknown') });
    expect(adoption.dropped).toHaveLength(0);
    expect(adoption.unverified).toHaveLength(3);
    expect([...adoption.adopted.keys()]).toEqual(['item-a', 'item-b']);
  });

  it('only a POSITIVE observation of empty drops a record', () => {
    for (const verdict of ['occupied', 'unknown'] as const) {
      const adoption = reconcileLiveLayers({ persisted: seated(), observe: all(verdict) });
      expect(adoption.dropped, verdict).toHaveLength(0);
    }
  });
});

describe('B-145 — the store fails SOFT, unlike its hard-failing siblings', () => {
  it('an unusable file is reported and treated as absent, never thrown', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ not json', 'utf8');
    const loaded = loadPersistedLiveLayers(file);
    expect(loaded.ledger).toBeNull();
    expect(loaded.problem?.file).toBe(file);
    expect(loaded.problem?.reason).toMatch(/invalid JSON/);
  });

  it('a schema-invalid file is reported and treated as absent', () => {
    const file = tmpFile();
    fs.writeFileSync(file, JSON.stringify([['item-a', [{ slot: { channel: 1 } }]]]), 'utf8');
    const loaded = loadPersistedLiveLayers(file);
    expect(loaded.ledger).toBeNull();
    expect(loaded.problem).toBeDefined();
  });

  it('the write is atomic — a whole ledger or the previous one, never a torn file', () => {
    const file = tmpFile();
    savePersistedLiveLayers(file, seated());
    savePersistedLiveLayers(file, new Map([['item-c', [record(20, 'guest-9')]]]));
    // The temp file must not survive as debris that a later load could pick up.
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    expect([...loadPersistedLiveLayers(file).ledger!.keys()]).toEqual(['item-c']);
  });
});
