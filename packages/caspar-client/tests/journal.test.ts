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
