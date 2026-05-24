import { describe, expect, it } from 'vitest';
import { formatElapsed } from '../src/renderer/features/lock/LockOverlay.js';

describe('formatElapsed — LockOverlay timer', () => {
  it('returns empty string when engagedAt is undefined', () => {
    expect(formatElapsed(undefined)).toBe('');
  });

  it('returns empty string for malformed ISO', () => {
    expect(formatElapsed('not-a-date')).toBe('');
  });

  it('formats sub-minute durations as m:ss', () => {
    const t = '2026-05-24T12:00:00.000Z';
    const now = Date.parse(t) + 42_000;
    expect(formatElapsed(t, now)).toBe('0:42');
  });

  it('formats multi-minute durations as m:ss', () => {
    const t = '2026-05-24T12:00:00.000Z';
    const now = Date.parse(t) + 312_000; // 5:12
    expect(formatElapsed(t, now)).toBe('5:12');
  });

  it('formats hour-plus durations as h:mm:ss', () => {
    const t = '2026-05-24T12:00:00.000Z';
    const now = Date.parse(t) + 3_723_000; // 1:02:03
    expect(formatElapsed(t, now)).toBe('1:02:03');
  });

  it('clamps a future engagedAt to 0:00 (no negative durations)', () => {
    const t = '2026-05-24T12:00:00.000Z';
    const now = Date.parse(t) - 10_000;
    expect(formatElapsed(t, now)).toBe('0:00');
  });
});
