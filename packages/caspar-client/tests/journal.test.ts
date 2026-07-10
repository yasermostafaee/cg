import { describe, expect, it } from 'vitest';
import { InMemoryJournal } from '../src/redundancy/journal.js';

describe('InMemoryJournal', () => {
  it('assigns monotonic seq numbers', () => {
    const j = new InMemoryJournal({ now: () => 1000 });
    expect(j.append('PLAY a', 'primary')).toBe(1);
    expect(j.append('PLAY b', 'both')).toBe(2);
    expect(j.lastSeq).toBe(2);
  });

  it('starts pending and resolves with outcome + code', () => {
    const j = new InMemoryJournal();
    const seq = j.append('PLAY a', 'primary');
    expect(j.all()[0]?.outcome).toBe('pending');
    j.resolve(seq, 'ok', 202);
    expect(j.all()[0]).toMatchObject({ outcome: 'ok', code: 202 });
  });

  it('resolve() on an unknown seq is a no-op', () => {
    const j = new InMemoryJournal();
    expect(() => j.resolve(999, 'ok')).not.toThrow();
  });

  it('since() returns only entries past the cursor', () => {
    const j = new InMemoryJournal();
    j.append('a', 'primary');
    j.append('b', 'primary');
    j.append('c', 'primary');
    expect(j.since(1).map((e) => e.line)).toEqual(['b', 'c']);
  });

  it('prune() drops entries older than the cutoff', () => {
    let now = 1000;
    const j = new InMemoryJournal({ now: () => now });
    j.append('old', 'primary');
    now = 5000;
    j.append('new', 'primary');
    j.prune(1000);
    expect(j.all().map((e) => e.line)).toEqual(['new']);
  });
});

describe('InMemoryJournal — B-046 self-bounding', () => {
  it('never holds more than maxEntries (oldest evicted first)', () => {
    const j = new InMemoryJournal({ now: () => 1000, maxEntries: 5 });
    for (let i = 1; i <= 20; i++) {
      const seq = j.append(`PLAY ${String(i)}`, 'both');
      j.resolve(seq, 'ok', 202);
    }
    expect(j.all()).toHaveLength(5);
    expect(j.all().map((e) => e.line)).toEqual([
      'PLAY 16',
      'PLAY 17',
      'PLAY 18',
      'PLAY 19',
      'PLAY 20',
    ]);
    // seq stays monotonic across evictions.
    expect(j.lastSeq).toBe(20);
  });

  it('drops RESOLVED entries older than retentionMs on append', () => {
    let now = 0;
    const j = new InMemoryJournal({ now: () => now, retentionMs: 10_000 });
    const oldSeq = j.append('PLAY old', 'both');
    j.resolve(oldSeq, 'ok', 202);
    now = 15_000; // past retention
    j.append('PLAY new', 'both');
    expect(j.all().map((e) => e.line)).toEqual(['PLAY new']);
  });

  it('retains entries younger than retentionMs — a briefly-lagged backup can still be replayed', () => {
    let now = 0;
    const j = new InMemoryJournal({ now: () => now, retentionMs: 300_000 });
    const seq = j.append('PLAY recent', 'both');
    j.resolve(seq, 'ok', 202);
    now = 30_000; // one full divergence window later — 10× inside retention
    j.append('PLAY current', 'both');
    expect(j.all().map((e) => e.line)).toEqual(['PLAY recent', 'PLAY current']);
  });

  it('pending (in-flight) entries survive the retention pass but not the hard cap', () => {
    let now = 0;
    const j = new InMemoryJournal({ now: () => now, retentionMs: 1_000, maxEntries: 3 });
    j.append('PLAY pending-old', 'both'); // never resolved
    now = 5_000;
    j.append('PLAY new', 'both');
    // Age pass spares the pending entry.
    expect(j.all().map((e) => e.line)).toEqual(['PLAY pending-old', 'PLAY new']);
    // The hard cap does not (memory bound is absolute).
    j.append('a', 'both');
    j.append('b', 'both');
    expect(j.all()).toHaveLength(3);
    expect(j.all()[0]?.line).toBe('PLAY new');
  });
});
