import { expect, it } from 'vitest';
import { broadcastSafeAreas } from '../src/index.js';

it.each([
  [1920, 1080, 1786, 1004, 1728, 972],
  [1280, 720, 1190, 670, 1152, 648],
])(
  'matches published SMPTE HD safe dimensions for %sx%s and centres both guides',
  (w, h, aw, ah, gw, gh) => {
    expect(broadcastSafeAreas(w, h)).toEqual([
      {
        kind: 'action',
        label: 'Action 93%',
        x: (w - aw) / 2,
        y: (h - ah) / 2,
        width: aw,
        height: ah,
      },
      {
        kind: 'graphics',
        label: 'Graphics 90%',
        x: (w - gw) / 2,
        y: (h - gh) / 2,
        width: gw,
        height: gh,
      },
    ]);
  },
);

it('keeps the same protected proportions for UHD without borrowing legacy 80% title margins', () => {
  const [action, graphics] = broadcastSafeAreas(3840, 2160);
  expect(action?.width).toBe(3571);
  expect(graphics).toMatchObject({ x: 192, y: 108, width: 3456, height: 1944 });
});

it.each([
  [0, 1080],
  [1920, -1],
  [NaN, 1080],
  [1920, Infinity],
])('rejects invalid active raster %sx%s', (w, h) => {
  expect(broadcastSafeAreas(w, h)).toEqual([]);
});
