import { describe, expect, it } from 'vitest';
import { naturalCompare } from '../src/index.js';

const sorted = (names: string[]): string[] => [...names].sort(naturalCompare);

describe('D-163 — natural file-name order', () => {
  it('🔴 a digit run compares as a number: page2 before page10', () => {
    expect(sorted(['page10.png', 'page2.png', 'page1.png', 'page12.png', 'page3.png'])).toEqual([
      'page1.png',
      'page2.png',
      'page3.png',
      'page10.png',
      'page12.png',
    ]);
  });

  it('🔴 Persian and Arabic-Indic digits sort as numbers too', () => {
    expect(sorted(['صفحه۱۰.png', 'صفحه۲.png', 'صفحه۱.png'])).toEqual([
      'صفحه۱.png',
      'صفحه۲.png',
      'صفحه۱۰.png',
    ]);
    expect(sorted(['p٣.png', 'p10.png', 'p۲.png'])).toEqual(['p۲.png', 'p٣.png', 'p10.png']);
  });

  it('a number longer than a JS number is still ordered exactly', () => {
    expect(sorted(['a99999999999999999999', 'a100000000000000000000'])).toEqual([
      'a99999999999999999999',
      'a100000000000000000000',
    ]);
  });

  it('the order is total and machine-independent: case, leading zeros, ties', () => {
    expect(sorted(['B2', 'a10', 'A2', 'page01', 'page1'])).toEqual([
      'A2',
      'a10',
      'B2',
      'page1',
      'page01',
    ]);
    expect(naturalCompare('x', 'x')).toBe(0);
  });
});
