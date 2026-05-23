import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate } from '../src/migrations/index.js';

describe('migrations', () => {
  it('CURRENT_SCHEMA_VERSION is 1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it('returns input unchanged when version matches current', () => {
    const input = { schemaVersion: 1, name: 'x' };
    expect(migrate(input)).toBe(input);
  });

  it('defaults to v1 when schemaVersion is absent', () => {
    const input = { name: 'x' };
    expect(migrate(input)).toBe(input);
  });

  it('throws when schemaVersion is greater than current', () => {
    expect(() => migrate({ schemaVersion: 99 })).toThrow(/newer/i);
  });

  it('throws when input is not an object', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate(42)).toThrow();
    expect(() => migrate('x')).toThrow();
  });

  it('throws when an intermediate migration is missing', () => {
    // schemaVersion 0 has no registered migration since CURRENT_SCHEMA_VERSION = 1
    // and there are no migrations registered yet.
    expect(() => migrate({ schemaVersion: 0 })).toThrow(/No migration registered/);
  });
});
