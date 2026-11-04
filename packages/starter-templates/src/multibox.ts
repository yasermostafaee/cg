import type { Composition, Element, LookGroups } from '@cg/shared-schema';
import { galleryScene, image, layer, tf } from './gallery-helpers.js';

const FAM = 'asset-multibox-vazir';
const LOOK_SIZE = { width: 1920, height: 1080 } as const;
interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Only real live plates belong to a preset: Arrange and input swaps never strand captions.
const layouts: readonly (readonly BoxRect[])[] = [
  [{ x: 0, y: 0, w: 1920, h: 1080 }],
  [
    { x: 16, y: 278, w: 934, h: 525 },
    { x: 970, y: 278, w: 934, h: 525 },
  ],
  [
    { x: 42, y: 18, w: 906, h: 510 },
    { x: 972, y: 18, w: 906, h: 510 },
    { x: 507, y: 552, w: 906, h: 510 },
  ],
  [
    { x: 42, y: 18, w: 906, h: 510 },
    { x: 972, y: 18, w: 906, h: 510 },
    { x: 42, y: 552, w: 906, h: 510 },
    { x: 972, y: 552, w: 906, h: 510 },
  ],
];

const lookCompositions: Composition[] = layouts.map((rects, index) => ({
  id: `comp-multibox-look-${index + 1}`,
  name: `پریست ${index + 1} قاب`,
  resolution: LOOK_SIZE,
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100, contentStart: 20 },
  playout: { mode: 'manual', holdSource: 'timed' },
  editorBackdrop: 'transparent',
  layers: [
    layer(
      `multibox-look-${index + 1}-layer`,
      'قاب‌ها',
      rects.map(
        (rect, seat): Element => ({
          id: `multibox-${index + 1}-source-${seat + 1}`,
          name: `قاب ${seat + 1}`,
          type: 'video-placeholder',
          transform: tf(rect.x, rect.y, rect.w, rect.h),
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 4,
          routeKey: seat === 0 ? 'host' : `guest-${seat}`,
          expectedAspect: 16 / 9,
          fitMode: 'cover',
        }),
      ),
    ),
  ],
  fields: [],
  bindings: [],
}));

const lookInstances: Element[] = lookCompositions.map((composition, index) => ({
  id: `multibox-look-${index + 1}-instance`,
  name: composition.name,
  type: 'composition',
  compositionId: composition.id,
  transform: tf(0, 0, LOOK_SIZE.width, LOOK_SIZE.height),
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 4,
}));

const lookGroups: LookGroups = [
  {
    id: 'multibox-presets',
    looks: lookInstances.map((instance, index) => ({
      id: `multibox-look-${index + 1}`,
      name: `${index + 1} قاب`,
      instanceId: instance.id,
      entered: { mode: 'cut' },
    })),
    defaultLookId: 'multibox-look-4',
  },
];

export const multiboxScene = galleryScene({
  id: 'multibox',
  name: 'میزگرد چندقابه',
  description:
    'چهار پریست واقعی: تک‌قاب تمام‌صفحه، دوقاب، سه‌قاب دو بالا و یکی پایین، و چهار قاب؛ بدون عنوان یا پلیت ثابتِ وابسته به ورودی.',
  templateType: 'fullscreen',
  direct: true,
  fontFamily: FAM,
  onAirId: 'comp-multibox-onair',
  onAirName: 'میزگرد چندقابه',
  onAirSize: LOOK_SIZE,
  onAirPosition: { x: 0, y: 0 },
  children: [
    image(
      'multibox-studio-bg',
      'پس‌زمینهٔ استودیو',
      'multibox-studio',
      tf(0, 0, 1920, 1080),
      0,
      'cover',
    ),
    ...lookInstances,
  ],
  fields: [],
  bindings: [],
  entryLookGroups: lookGroups,
  extraCompositions: lookCompositions,
});
