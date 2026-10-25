import { latinDigits } from '@cg/text-shaping';

export const MAX_UTC_OFFSET_MINUTES = 14 * 60;

/** Canonical authored/display form for D-134's fixed wall-clock offset. */
export function formatUtcOffset(totalMinutes: number): string {
  const safe = Math.max(-MAX_UTC_OFFSET_MINUTES, Math.min(MAX_UTC_OFFSET_MINUTES, totalMinutes));
  const sign = safe < 0 ? '-' : '+';
  const absolute = Math.abs(safe);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Parse a signed `±HH:MM` offset. Persian and Arabic-Indic input digits are accepted, while the
 * stored value remains a plain integer number of minutes. Undefined means the draft is invalid.
 */
export function parseUtcOffset(raw: string): number | undefined {
  const match = /^([+-])(\d{2}):([0-5]\d)$/.exec(latinDigits(raw).trim());
  if (match === null) return undefined;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || (hours === 14 && minutes !== 0)) return undefined;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}
