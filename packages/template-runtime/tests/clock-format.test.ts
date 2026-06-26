import { describe, expect, it } from 'vitest';
import { formatCountClock, formatWallClock } from '../src/clock-format.js';

// Wall expectations are built from LOCAL Date components so the suite is
// timezone-agnostic (half-hour offsets like Iran's +03:30 shift minutes too).
const at = (h: number, m: number, s: number): Date => new Date(2026, 5, 11, h, m, s);

describe('formatWallClock (D-027)', () => {
  it('formats 24-hour HH:mm:ss with zero padding', () => {
    expect(formatWallClock(at(13, 5, 9), 'HH:mm:ss', 'latin')).toBe('13:05:09');
    expect(formatWallClock(at(0, 0, 0), 'HH:mm:ss', 'latin')).toBe('00:00:00');
  });

  it('single tokens are unpadded', () => {
    expect(formatWallClock(at(13, 5, 9), 'H:m:s', 'latin')).toBe('13:5:9');
  });

  it('12-hour clock: hh wraps, 0 → 12, meridiem via A/a', () => {
    expect(formatWallClock(at(13, 5, 9), 'hh:mm A', 'latin')).toBe('01:05 PM');
    expect(formatWallClock(at(0, 30, 0), 'h:mm a', 'latin')).toBe('12:30 am');
    expect(formatWallClock(at(12, 0, 0), 'h A', 'latin')).toBe('12 PM');
  });

  it('non-token characters pass through literally (Persian label intact)', () => {
    expect(formatWallClock(at(8, 4, 2), 'ساعت HH:mm', 'latin')).toBe('ساعت 08:04');
  });

  it('longest-token-first: hh is not parsed as h+h', () => {
    expect(formatWallClock(at(13, 0, 0), 'hhh', 'latin')).toBe('011'); // hh + h
  });

  it('maps digits to Persian / Arabic-Indic LAST', () => {
    expect(formatWallClock(at(13, 5, 9), 'HH:mm:ss', 'persian')).toBe('۱۳:۰۵:۰۹');
    expect(formatWallClock(at(13, 5, 9), 'HH:mm:ss', 'arabic-indic')).toBe('١٣:٠٥:٠٩');
  });
});

describe('formatWallClock — time zone (D-084)', () => {
  // A fixed ABSOLUTE instant (noon UTC) so the zone offsets are deterministic.
  // June offsets: UTC+0, Tokyo +9 (no DST), New York EDT −4, London BST +1,
  // Tehran +03:30 (Iran dropped DST in 2022).
  const noonUtc = new Date('2026-06-11T12:00:00.000Z');

  it('renders the instant in the given IANA zone', () => {
    expect(formatWallClock(noonUtc, 'HH:mm:ss', 'latin', 'UTC')).toBe('12:00:00');
    expect(formatWallClock(noonUtc, 'HH:mm:ss', 'latin', 'Asia/Tokyo')).toBe('21:00:00');
    expect(formatWallClock(noonUtc, 'HH:mm:ss', 'latin', 'America/New_York')).toBe('08:00:00');
    expect(formatWallClock(noonUtc, 'HH:mm:ss', 'latin', 'Europe/London')).toBe('13:00:00');
    expect(formatWallClock(noonUtc, 'HH:mm:ss', 'latin', 'Asia/Tehran')).toBe('15:30:00');
  });

  it('applies the format string + digit mapping AFTER the zone shift', () => {
    // 21:00 Tokyo → 12-hour 9pm; Persian digits still map last.
    expect(formatWallClock(noonUtc, 'h:mm a', 'latin', 'Asia/Tokyo')).toBe('9:00 pm');
    expect(formatWallClock(noonUtc, 'hh:mm A', 'latin', 'America/New_York')).toBe('08:00 AM');
    expect(formatWallClock(noonUtc, 'HH:mm', 'persian', 'Asia/Tokyo')).toBe('۲۱:۰۰');
  });

  it('normalises a midnight hour (the hour12:false "24" quirk) to 00', () => {
    const midnightUtc = new Date('2026-06-11T00:00:00.000Z');
    expect(formatWallClock(midnightUtc, 'HH:mm:ss', 'latin', 'UTC')).toBe('00:00:00');
  });

  it('an unset (undefined or empty) zone uses local time — identical to the no-arg form', () => {
    const local = at(13, 5, 9);
    const noArg = formatWallClock(local, 'HH:mm:ss', 'latin');
    expect(formatWallClock(local, 'HH:mm:ss', 'latin', undefined)).toBe(noArg);
    expect(formatWallClock(local, 'HH:mm:ss', 'latin', '')).toBe(noArg);
    expect(noArg).toBe('13:05:09');
  });

  it('falls back to LOCAL time for an invalid IANA zone instead of throwing', () => {
    // A hand-edited / external scene can carry a bad zone (the schema does not validate
    // it); Intl.DateTimeFormat would throw RangeError — the formatter must degrade, not crash.
    const local = at(13, 5, 9);
    expect(() => formatWallClock(local, 'HH:mm:ss', 'latin', 'Not/AZone')).not.toThrow();
    expect(formatWallClock(local, 'HH:mm:ss', 'latin', 'Not/AZone')).toBe('13:05:09');
  });
});

describe('formatCountClock (D-027)', () => {
  it('formats a full H:M:S count', () => {
    expect(formatCountClock(3725, 'HH:mm:ss', 'latin')).toBe('01:02:05');
  });

  it('the LARGEST unit present absorbs the overflow (mm:ss → 90:00)', () => {
    expect(formatCountClock(90 * 60, 'mm:ss', 'latin')).toBe('90:00');
    expect(formatCountClock(90 * 60, 'm:ss', 'latin')).toBe('90:00');
  });

  it('seconds-only formats show total seconds', () => {
    expect(formatCountClock(90, 'ss', 'latin')).toBe('90');
    expect(formatCountClock(90, 's', 'latin')).toBe('90');
  });

  it('hours present but no minutes: seconds absorb the remainder', () => {
    expect(formatCountClock(3725, 'H|ss', 'latin')).toBe('1|125');
  });

  it("count modes treat hh/h as HH/H (no 12-hour wrap) and A/a as ''", () => {
    expect(formatCountClock(13 * 3600, 'hh:mm:ss', 'latin')).toBe('13:00:00');
    expect(formatCountClock(60, 'mm:ss A', 'latin')).toBe('01:00 ');
    expect(formatCountClock(60, 'a m', 'latin')).toBe(' 1');
  });

  it('non-token characters pass through literally', () => {
    expect(formatCountClock(65, 'باقی‌مانده m:ss', 'latin')).toBe('باقی‌مانده 1:05');
  });

  it('clamps negative input to zero', () => {
    expect(formatCountClock(-5, 'mm:ss', 'latin')).toBe('00:00');
  });

  it('maps digits to Persian / Arabic-Indic LAST', () => {
    expect(formatCountClock(125, 'mm:ss', 'persian')).toBe('۰۲:۰۵');
    expect(formatCountClock(125, 'mm:ss', 'arabic-indic')).toBe('٠٢:٠٥');
  });

  it('padded overflow values keep at least two digits but never truncate', () => {
    expect(formatCountClock(100 * 60, 'mm:ss', 'latin')).toBe('100:00');
  });
});
