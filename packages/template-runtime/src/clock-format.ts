import { arabicIndicDigits, persianDigits } from '@cg/text-shaping';

/**
 * Clock format-string engine (D-027). Pure — no DOM, no timers — so every
 * rule is table-testable.
 *
 * Tokens: `HH H hh h mm m ss s A a`, matched longest-token-first; any
 * non-token character passes through literally. Double tokens zero-pad to at
 * least two digits; single tokens don't pad.
 *
 * Two faces:
 * - `formatWallClock(date, …)` — time of day. `HH`/`H` are 24-hour, `hh`/`h`
 *   12-hour (0 → 12), `A`/`a` the meridiem.
 * - `formatCountClock(totalSeconds, …)` — a count (stopwatch / countdown).
 *   The LARGEST unit present in the format absorbs the overflow: with no hour
 *   token, `mm` shows total minutes (`mm:ss` → `90:00` for 90 minutes); with
 *   no minute token either, `ss` shows total seconds. `hh`/`h` behave as
 *   `HH`/`H` (a count has no meridiem) and `A`/`a` render empty.
 *
 * Digit mapping (`persian` / `arabic-indic` via @cg/text-shaping) happens
 * LAST, after all arithmetic and padding on Latin digits.
 */

export type ClockDigits = 'latin' | 'persian' | 'arabic-indic';

type ClockToken = 'HH' | 'H' | 'hh' | 'h' | 'mm' | 'm' | 'ss' | 's' | 'A' | 'a';

/** Longest-token-first — `hh` must win over `h`, `mm` over `m`, … */
const TOKENS: readonly ClockToken[] = ['HH', 'hh', 'mm', 'ss', 'H', 'h', 'm', 's', 'A', 'a'];

type FormatPart = { kind: 'token'; token: ClockToken } | { kind: 'literal'; text: string };

function tokenize(format: string): FormatPart[] {
  const parts: FormatPart[] = [];
  let i = 0;
  outer: while (i < format.length) {
    for (const token of TOKENS) {
      if (format.startsWith(token, i)) {
        parts.push({ kind: 'token', token });
        i += token.length;
        continue outer;
      }
    }
    const last = parts[parts.length - 1];
    if (last && last.kind === 'literal') last.text += format[i];
    else parts.push({ kind: 'literal', text: format[i] ?? '' });
    i += 1;
  }
  return parts;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function mapDigits(s: string, digits: ClockDigits): string {
  if (digits === 'persian') return persianDigits(s);
  if (digits === 'arabic-indic') return arabicIndicDigits(s);
  return s;
}

/**
 * The wall-clock hour/minute/second to display. Without a `timezone` these are
 * the machine-local components of `date` (the prior behaviour). With one, they
 * are the same instant rendered in that IANA zone, extracted via
 * `Intl.DateTimeFormat` so the platform's tz database (DST, historical offsets)
 * is authoritative — never hand-rolled offset math. The `en-US` locale only
 * yields ASCII parts; the element's own digit mapping runs later, unchanged.
 */
function wallComponents(
  date: Date,
  timezone: string | undefined,
): { h24: number; minutes: number; seconds: number } {
  const local = (): { h24: number; minutes: number; seconds: number } => ({
    h24: date.getHours(),
    minutes: date.getMinutes(),
    seconds: date.getSeconds(),
  });
  if (timezone === undefined || timezone === '') return local();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const part = (type: string): number => {
      const found = parts.find((p) => p.type === type)?.value ?? '0';
      return Number.parseInt(found, 10) || 0;
    };
    // `hour12: false` can emit '24' for midnight in some engines — normalise to 0.
    return { h24: part('hour') % 24, minutes: part('minute'), seconds: part('second') };
  } catch {
    // An invalid IANA name (a hand-edited / externally-produced scene — the schema does
    // not validate the zone) makes `Intl.DateTimeFormat` throw a RangeError. Degrade to
    // local time rather than crash scene-build or the per-frame paint loop.
    return local();
  }
}

/**
 * Format a time of day. Components are the machine-local fields of `date`, or —
 * when `timezone` (an IANA name) is given — the same instant in that zone
 * (D-084). The format tokens, 12-hour/meridiem rules, and digit mapping apply
 * identically afterwards either way.
 */
export function formatWallClock(
  date: Date,
  format: string,
  digits: ClockDigits,
  timezone?: string,
): string {
  const { h24, minutes, seconds } = wallComponents(date, timezone);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const out = tokenize(format)
    .map((part) => {
      if (part.kind === 'literal') return part.text;
      switch (part.token) {
        case 'HH':
          return pad2(h24);
        case 'H':
          return String(h24);
        case 'hh':
          return pad2(h12);
        case 'h':
          return String(h12);
        case 'mm':
          return pad2(minutes);
        case 'm':
          return String(minutes);
        case 'ss':
          return pad2(seconds);
        case 's':
          return String(seconds);
        case 'A':
          return h24 < 12 ? 'AM' : 'PM';
        case 'a':
          return h24 < 12 ? 'am' : 'pm';
      }
    })
    .join('');
  return mapDigits(out, digits);
}

/**
 * Format a count (whole seconds, clamped at 0). The largest unit present in
 * the format absorbs the overflow; meridiem tokens render empty.
 */
export function formatCountClock(
  totalSeconds: number,
  format: string,
  digits: ClockDigits,
): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const parts = tokenize(format);
  const hasHours = parts.some(
    (p) =>
      p.kind === 'token' &&
      (p.token === 'HH' || p.token === 'H' || p.token === 'hh' || p.token === 'h'),
  );
  const hasMinutes = parts.some((p) => p.kind === 'token' && (p.token === 'mm' || p.token === 'm'));

  const hours = hasHours ? Math.floor(total / 3600) : 0;
  const minutes = hasMinutes ? Math.floor((total - hours * 3600) / 60) : 0;
  const seconds = total - hours * 3600 - minutes * 60;

  const out = parts
    .map((part) => {
      if (part.kind === 'literal') return part.text;
      switch (part.token) {
        // In count modes hh/h behave as HH/H — a count has no 12-hour wrap.
        case 'HH':
        case 'hh':
          return pad2(hours);
        case 'H':
        case 'h':
          return String(hours);
        case 'mm':
          return pad2(minutes);
        case 'm':
          return String(minutes);
        case 'ss':
          return pad2(seconds);
        case 's':
          return String(seconds);
        case 'A':
        case 'a':
          return '';
      }
    })
    .join('');
  return mapDigits(out, digits);
}
