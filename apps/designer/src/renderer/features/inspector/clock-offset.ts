import { latinDigits } from '@cg/text-shaping';

export const MAX_UTC_OFFSET_MINUTES = 14 * 60;
export const UTC_OFFSET_MASK_PLACEHOLDER = '+HH:MM';

const DIGIT_POSITIONS = [1, 2, 4, 5] as const;

export interface UtcOffsetMaskEdit {
  readonly text: string;
  readonly caret: number;
  readonly refused?: string | undefined;
}

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

/**
 * D-134 owner correction — a fixed-width `±HH:MM` editing mask. The separators are owned by the
 * mask, a digit overwrites one slot, and anything that could produce a value outside `±14:00` is
 * refused before it reaches the input. `H` / `M` are draft slots only; they are never committed.
 */
export function editUtcOffsetMask(
  shown: string,
  key: string,
  selectionStart: number,
  selectionEnd: number = selectionStart,
): UtcOffsetMaskEdit {
  const text = maskShape(shown);
  const latin = latinDigits(key);
  const allSelected = selectionStart === 0 && selectionEnd >= text.length;

  if (latin === '+' || latin === '-') {
    const next = `${latin}${allSelected ? 'HH:MM' : text.slice(1)}`;
    return { text: next, caret: 1 };
  }

  if (key === 'Backspace' || key === 'Delete') {
    const positions = selectedDigitPositions(selectionStart, selectionEnd);
    const target =
      positions.length > 0
        ? positions
        : [digitPositionAt(selectionStart, key === 'Backspace' ? 'back' : 'forward')];
    const next = [...text];
    for (const at of target) if (at !== undefined) next[at] = at < 3 ? 'H' : 'M';
    const first = target.find((at) => at !== undefined);
    return {
      text: next.join(''),
      caret: first ?? selectionStart,
    };
  }

  if (!/^\d$/.test(latin)) return { text, caret: selectionStart };

  const reset = allSelected ? [...`${text[0] ?? '+'}HH:MM`] : [...text];
  const at = allSelected ? 1 : nextDigitPosition(selectionStart);
  if (at === undefined) return { text, caret: selectionStart };

  // Match the date/time mask's fast entry: typing 7 at the first hour slot means 07, and typing 8
  // at the first minute slot means 08. The second slot is still directly editable.
  if (at === 1 && Number(latin) > 1) {
    reset[1] = '0';
    reset[2] = latin;
    const next = reset.join('');
    return validateMaskEdit(text, next, 4);
  }
  if (at === 4 && Number(latin) > 5) {
    reset[4] = '0';
    reset[5] = latin;
    const next = reset.join('');
    return validateMaskEdit(text, next, 6);
  }

  // Beginning a segment starts it afresh, so typing `1` over `09` yields `1H`, not `19`.
  if (at === 1) reset[2] = 'H';
  if (at === 4) reset[5] = 'M';
  reset[at] = latin;
  const next = reset.join('');
  return validateMaskEdit(text, next, nextDigitPosition(at + 1) ?? 6);
}

function maskShape(raw: string): string {
  const latin = latinDigits(raw);
  return /^[+-][0-9H]{2}:[0-9M]{2}$/.test(latin) ? latin : UTC_OFFSET_MASK_PLACEHOLDER;
}

function validateMaskEdit(previous: string, next: string, caret: number): UtcOffsetMaskEdit {
  const hourText = next.slice(1, 3);
  const minuteText = next.slice(4, 6);
  const hours = /^\d{2}$/.test(hourText) ? Number(hourText) : undefined;
  const minutes = /^\d{2}$/.test(minuteText) ? Number(minuteText) : undefined;
  const invalid =
    (hours !== undefined && hours > 14) ||
    (minutes !== undefined && minutes > 59) ||
    (hours === 14 && minutes !== undefined && minutes !== 0);
  return invalid
    ? {
        text: previous,
        caret,
        refused: 'Offset must be between −14:00 and +14:00.',
      }
    : { text: next, caret };
}

function selectedDigitPositions(from: number, to: number): number[] {
  if (to <= from) return [];
  return DIGIT_POSITIONS.filter((at) => at >= from && at < to);
}

function nextDigitPosition(caret: number): (typeof DIGIT_POSITIONS)[number] | undefined {
  return DIGIT_POSITIONS.find((at) => at >= caret);
}

function digitPositionAt(
  caret: number,
  direction: 'back' | 'forward',
): (typeof DIGIT_POSITIONS)[number] | undefined {
  if (direction === 'forward') return nextDigitPosition(caret);
  return [...DIGIT_POSITIONS].reverse().find((at) => at < caret);
}
