import { describe, expect, it } from 'vitest';
import {
  formatOffset,
  formatTimeOfDay,
  fromGregorian,
  instantOfParts,
  isoOfInstant,
  isoOfParts,
  nowPlus,
  NOW_PLUS_SHORTCUTS,
  parsePastedDateTime,
  partsOfInstant,
  partsOfIso,
  readSegment,
  setSegment,
  stepSegment,
  writeSegment,
  type DateTimeParts,
} from '../src/index.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — the typed segments of a date and time: digits in
 * any of the three sets, Up / Down, paste, the `Now + …` shortcuts, and ONE stored ISO instant
 * whichever calendar it was typed in.
 */

const p = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): DateTimeParts => ({ year, month, day, hour, minute, second });

describe('a segment takes digits in any of the three sets', () => {
  it('reads Latin, Persian and Arabic-Indic alike', () => {
    expect(readSegment('21')).toBe(21);
    expect(readSegment('۲۱')).toBe(21);
    expect(readSegment('٢١')).toBe(21);
    expect(readSegment('۱۴۰۵')).toBe(1405);
    expect(readSegment('')).toBeNull();
    expect(readSegment('2a')).toBeNull();
  });

  it('writes a segment zero-padded, in the chosen set', () => {
    expect(writeSegment(7, 'month', 'latin')).toBe('07');
    expect(writeSegment(7, 'month', 'persian')).toBe('۰۷');
    expect(writeSegment(5, 'minute', 'arabic-indic')).toBe('٠٥');
    expect(writeSegment(1405, 'year', 'persian')).toBe('۱۴۰۵');
  });
});

describe('Up / Down and typing keep every segment inside its range', () => {
  it('24-hour: 23 + 1 wraps to 00; 00 − 1 wraps to 23', () => {
    expect(stepSegment(p(2026, 10, 15, 23), 'hour', 1, 'gregorian').hour).toBe(0);
    expect(stepSegment(p(2026, 10, 15, 0), 'hour', -1, 'gregorian').hour).toBe(23);
    expect(stepSegment(p(2026, 10, 15, 0, 0, 59), 'second', 1, 'gregorian').second).toBe(0);
  });

  it('the day wraps inside the month’s OWN length — Esfand 1404 has 29 days', () => {
    expect(stepSegment(p(1404, 12, 29), 'day', 1, 'solar-hijri').day).toBe(1);
    expect(stepSegment(p(1403, 12, 29), 'day', 1, 'solar-hijri').day).toBe(30);
  });

  it('a typed value is clamped, and changing the month pulls the day back inside it', () => {
    expect(setSegment(p(2026, 10, 15), 'hour', 27, 'gregorian').hour).toBe(23);
    expect(setSegment(p(1405, 6, 31), 'month', 7, 'solar-hijri')).toEqual(p(1405, 7, 30));
    expect(setSegment(p(1403, 12, 30), 'year', 1404, 'solar-hijri')).toEqual(p(1404, 12, 29));
  });
});

describe('ONE stored instant — ISO with this machine’s offset', () => {
  it('the same moment typed in three calendars stores the same ISO value', () => {
    const ms = new Date(2026, 9, 15, 21, 45, 0).getTime();
    const isos = (['gregorian', 'solar-hijri', 'lunar-hijri'] as const).map((system) =>
      isoOfParts(partsOfInstant(ms, system), system),
    );
    expect(new Set(isos).size).toBe(1);
    expect(Date.parse(isos[0] ?? '')).toBe(ms);
  });

  it('round-trips: segments → ISO → segments, in every calendar', () => {
    for (const system of ['gregorian', 'solar-hijri', 'lunar-hijri'] as const) {
      const parts = partsOfInstant(new Date(2027, 2, 20, 6, 7, 8).getTime(), system);
      const iso = isoOfParts(parts, system);
      expect(iso).not.toBeNull();
      expect(partsOfIso(iso ?? '', system)).toEqual(parts);
    }
  });

  it('the stored value is ISO 8601 with an offset, in Latin digits', () => {
    const iso = isoOfInstant(new Date(2026, 9, 15, 21, 45, 0).getTime());
    expect(iso).toMatch(/^2026-10-15T21:45:00[+-]\d{2}:\d{2}$/);
    expect(formatOffset(210)).toBe('+03:30');
    expect(formatOffset(-300)).toBe('-05:00');
    expect(formatOffset(0)).toBe('+00:00');
  });

  it('a date that does not exist stores nothing', () => {
    expect(instantOfParts(p(1404, 12, 30), 'solar-hijri')).toBeNull();
    expect(isoOfParts(p(2026, 2, 29), 'gregorian')).toBeNull();
  });

  it('a time of day has the schema’s two spellings', () => {
    expect(formatTimeOfDay(5, 4, 0, false)).toBe('05:04');
    expect(formatTimeOfDay(5, 4, 3, true)).toBe('05:04:03');
  });
});

describe('a paste fills the segments it names', () => {
  it('a full date and time in Persian digits, in the shown calendar', () => {
    expect(parsePastedDateTime('۱۴۰۵/۰۷/۲۳ ۲۱:۴۵', 'solar-hijri')).toEqual(
      p(1405, 7, 23, 21, 45, 0),
    );
  });

  it('a dashed date is ISO — Gregorian — whatever calendar is shown', () => {
    expect(parsePastedDateTime('2026-10-15', 'solar-hijri')).toEqual({
      year: 1405,
      month: 7,
      day: 23,
    });
  });

  it('a slashed date with a Gregorian year under a Hijri calendar is read as Gregorian', () => {
    expect(parsePastedDateTime('2026/10/15 08:00:30', 'solar-hijri')).toEqual(
      p(1405, 7, 23, 8, 0, 30),
    );
  });

  it('an ISO instant is read as the instant it is', () => {
    const ms = new Date(2026, 9, 15, 21, 45, 0).getTime();
    expect(parsePastedDateTime(isoOfInstant(ms), 'gregorian')).toEqual(
      partsOfInstant(ms, 'gregorian'),
    );
  });

  it('a time alone fills only the time segments', () => {
    expect(parsePastedDateTime('٢٠:٣٢', 'gregorian')).toEqual({ hour: 20, minute: 32, second: 0 });
  });

  it('anything else fills nothing', () => {
    expect(parsePastedDateTime('tomorrow', 'gregorian')).toBeNull();
    expect(parsePastedDateTime('1404/12/30', 'solar-hijri')).toBeNull();
    expect(parsePastedDateTime('25:00', 'gregorian')).toBeNull();
  });

  it('a Lunar Hijri paste is read in the Lunar calendar', () => {
    const today = fromGregorian({ year: 2026, month: 10, day: 15 }, 'lunar-hijri');
    const text = `${String(today.year)}/${String(today.month)}/${String(today.day)}`;
    expect(parsePastedDateTime(text, 'lunar-hijri')).toEqual(today);
  });
});

describe('the Now + … shortcuts', () => {
  it('are +1 min, +5 min and +1 h, and land on a whole second', () => {
    expect(NOW_PLUS_SHORTCUTS.map((s) => s.label)).toEqual(['+1 min', '+5 min', '+1 h']);
    expect(nowPlus(1_000_500, 60_000)).toBe(1_060_000);
    expect(nowPlus(0, 3_600_000)).toBe(3_600_000);
  });
});
