import { latinDigits } from './digits.js';

/**
 * `D-163` / `R-100` — **NATURAL ORDER for file names**: a run of digits compares as a NUMBER, in any
 * of the three digit sets, so `page2` sorts before `page10` and `صفحه۲` before `صفحه۱۰`.
 *
 * Shared by the Designer (`Add pictures…`) and CG Control (`Load pictures…`): the two surfaces must
 * put the same folder in the same order, so neither spells its own.
 *
 * - Digits in Persian (`۰-۹`) or Arabic-Indic (`٠-٩`) read as Latin first, so `page۲` and `page2`
 *   compare equal as numbers.
 * - A number compares by value without converting it (leading zeros stripped, then length, then
 *   digit by digit), so a run longer than a JS number is still ordered exactly.
 * - Text between numbers compares case-insensitively by code point, never by locale: the order is
 *   the same on every machine. A tie falls back to the raw names, so the order is total.
 */
export function naturalCompare(a: string, b: string): number {
  const ka = chunks(a);
  const kb = chunks(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i += 1) {
    const x = ka[i] ?? '';
    const y = kb[i] ?? '';
    const xNum = /^[0-9]/.test(x);
    const yNum = /^[0-9]/.test(y);
    let c: number;
    if (xNum && yNum) c = compareDigits(x, y);
    else if (xNum !== yNum)
      c = xNum ? -1 : 1; // a number before text at the same position
    else c = compareText(x.toLowerCase(), y.toLowerCase());
    if (c !== 0) return c;
  }
  if (ka.length !== kb.length) return ka.length - kb.length;
  return compareText(a, b);
}

/** Digit runs and the text between them, digits already Latin. */
function chunks(s: string): string[] {
  return latinDigits(s).match(/[0-9]+|[^0-9]+/g) ?? [];
}

function compareDigits(x: string, y: string): number {
  const a = x.replace(/^0+(?=[0-9])/, '');
  const b = y.replace(/^0+(?=[0-9])/, '');
  if (a.length !== b.length) return a.length - b.length;
  if (a !== b) return a < b ? -1 : 1;
  // Equal value: fewer leading zeros first (`page1` before `page01`), so the order stays total.
  return x.length - y.length;
}

function compareText(x: string, y: string): number {
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
