import { expect, it } from 'vitest';
import { vcgThumbnailFrame } from '../src/platform/vcgThumbnail.js';

const frameRange = { in: 0, out: 200 };
const activeRange = { in: 20, out: 180 };

it('takes an authored Hold start even when there is an earlier timeline midpoint', () => {
  expect(
    vcgThumbnailFrame({ frameRange, activeRange, lifecycle: { contentStart: 80, outPoint: 100 } }),
  ).toBe(80);
});

it('falls back to the midpoint of the active frames before an authored Outro', () => {
  expect(vcgThumbnailFrame({ frameRange, activeRange, lifecycle: { outPoint: 100 } })).toBe(59);
  expect(vcgThumbnailFrame({ frameRange, activeRange, lifecycle: { outPoint: 20 } })).toBe(20);
});

it('uses the whole active range when no Outro actually follows its marker', () => {
  expect(vcgThumbnailFrame({ frameRange, activeRange, lifecycle: { outPoint: 180 } })).toBe(100);
  expect(vcgThumbnailFrame({ frameRange: { in: 0, out: 151 } })).toBe(75);
});
