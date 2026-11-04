import type { Composition, Element, LookGroups } from '@cg/shared-schema';
import {
  galleryScene,
  gradient,
  image,
  layer,
  PALETTE,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';

const FAM = 'asset-multibox-vazir';
const TITLE = 'میزگرد ویژهٔ فوتبال ایران';
const LOOK_SIZE = { width: 1760, height: 920 } as const;

interface Seat {
  id: string;
  routeKey: string;
  label: string;
  accent: string;
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const seats: readonly Seat[] = [
  { id: 'host', routeKey: 'host', label: 'مجری ـ تهران', accent: '#2563EB' },
  { id: 'guest-1', routeKey: 'guest-1', label: 'کارشناس ـ شیراز', accent: '#0F766E' },
  { id: 'guest-2', routeKey: 'guest-2', label: 'خبرنگار ـ تبریز', accent: '#B45309' },
  { id: 'guest-3', routeKey: 'guest-3', label: 'مهمان ـ اصفهان', accent: '#BE123C' },
];

function plate(seat: Seat, lookNumber: number, rect: BoxRect): Element {
  return {
    id: `multibox-${String(lookNumber)}-${seat.id}-plate`,
    name: `Live Source ${seat.label}`,
    type: 'video-placeholder',
    transform: tf(rect.x, rect.y, rect.w, rect.h),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    routeKey: seat.routeKey,
    expectedAspect: 16 / 9,
    fitMode: 'cover',
  };
}

/** Caption is deliberately below the punched video area, never on top of it. */
function box(seat: Seat, lookNumber: number, rect: BoxRect): Element[] {
  const prefix = `multibox-${String(lookNumber)}-${seat.id}`;
  return [
    shape(
      `${prefix}-frame`,
      `قاب ${seat.label}`,
      tf(rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 68),
      gradient(145, '#040B14F2', '#10283CEB'),
      1,
      {
        radius: 22,
        stroke: { color: seat.accent, width: 4 },
        shadow: { offsetX: 0, offsetY: 18, blur: 42, color: '#00000099' },
      },
    ),
    plate(seat, lookNumber, rect),
    shape(
      `${prefix}-label-bg`,
      `نوار ${seat.label}`,
      tf(rect.x, rect.y + rect.h, rect.w, 52),
      gradient(90, seat.accent, '#071826F2'),
      5,
      { radius: 12, stroke: { color: '#FFFFFF22', width: 1 } },
    ),
    text(
      `${prefix}-label`,
      `عنوان ${seat.label}`,
      seat.label,
      tf(rect.x + 14, rect.y + rect.h + 3, rect.w - 28, 44),
      FAM,
      23,
      800,
      PALETTE.white,
      6,
      { align: 'center' },
    ),
  ];
}

const layouts: readonly (readonly BoxRect[])[] = [
  [{ x: 200, y: 158, w: 1360, h: 650 }],
  [
    { x: 70, y: 238, w: 780, h: 438 },
    { x: 910, y: 238, w: 780, h: 438 },
  ],
  [
    { x: 50, y: 310, w: 520, h: 293 },
    { x: 620, y: 310, w: 520, h: 293 },
    { x: 1190, y: 310, w: 520, h: 293 },
  ],
  [
    { x: 80, y: 166, w: 760, h: 285 },
    { x: 920, y: 166, w: 760, h: 285 },
    { x: 80, y: 535, w: 760, h: 285 },
    { x: 920, y: 535, w: 760, h: 285 },
  ],
];

function lookComposition(lookNumber: number, rects: readonly BoxRect[]): Composition {
  const children = rects.flatMap((rect, index) => {
    const seat = seats[index];
    return seat === undefined ? [] : box(seat, lookNumber, rect);
  });
  return {
    id: `comp-multibox-look-${String(lookNumber)}`,
    name: `پریست ${String(lookNumber)} قاب`,
    resolution: LOOK_SIZE,
    frameRange: { in: 0, out: 140 },
    lifecycle: { outPoint: 100, contentStart: 20 },
    playout: { mode: 'manual', holdSource: 'timed' },
    editorBackdrop: 'transparent',
    layers: [layer(`multibox-look-${String(lookNumber)}-layer`, 'قاب‌ها', children)],
    fields: [],
    bindings: [],
  };
}

const lookCompositions = layouts.map((rects, index) => lookComposition(index + 1, rects));

const lookInstances: Element[] = lookCompositions.map((composition, index) => ({
  id: `multibox-look-${String(index + 1)}-instance`,
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
      id: `multibox-look-${String(index + 1)}`,
      name: `${String(index + 1)} قاب`,
      instanceId: instance.id,
      entered: { mode: 'cut' },
    })),
    defaultLookId: 'multibox-look-4',
  },
];

const children: Element[] = [
  image(
    'multibox-studio-bg',
    'پس‌زمینهٔ استودیو',
    'multibox-studio',
    tf(-80, -80, 1920, 1080),
    0,
    'cover',
  ),
  shape('multibox-bg', 'لایهٔ استودیو', tf(-80, -80, 1920, 1080), solid('#020812'), 1, {
    opacity: 0.22,
  }),
  shape(
    'multibox-cyan-rail',
    'خط آبی',
    tf(42, 32, 410, 4),
    gradient(90, '#22D3EE', '#22D3EE00'),
    2,
    {
      radius: 2,
    },
  ),
  shape(
    'multibox-red-rail',
    'خط قرمز',
    tf(1308, 32, 410, 4),
    gradient(90, '#EF444400', '#EF4444'),
    2,
    {
      radius: 2,
    },
  ),
  shape(
    'multibox-title-bg',
    'نوار عنوان',
    tf(470, 30, 820, 92),
    gradient(90, '#08233AD9', '#1B2949D9'),
    2,
    {
      radius: 24,
      stroke: { color: '#A5F3FC55', width: 1 },
      shadow: { offsetX: 0, offsetY: 10, blur: 28, color: '#00000073' },
      animation: reveal(0),
    },
  ),
  text(
    'multibox-title',
    'عنوان برنامه',
    TITLE,
    tf(510, 42, 740, 66),
    FAM,
    40,
    900,
    PALETTE.white,
    4,
    { align: 'center', animation: reveal(4) },
  ),
  text(
    'multibox-kicker',
    'نوع برنامه',
    'گفت‌وگوی زنده',
    tf(70, 48, 350, 56),
    FAM,
    22,
    700,
    '#A5F3FC',
    3,
    {
      align: 'start',
      animation: reveal(4),
    },
  ),
  text('multibox-live', 'نشان زنده', '●  زنده', tf(1340, 48, 350, 56), FAM, 22, 800, '#FCA5A5', 3, {
    align: 'end',
    animation: reveal(4),
  }),
  ...lookInstances,
];

export const multiboxScene = galleryScene({
  id: 'multibox',
  name: 'میزگرد چندقابه',
  description:
    'چهار پریست واقعی ۱ تا ۴ قاب با Live Sourceهای مستقل و عنوان‌هایی بیرون از ناحیهٔ تصویر؛ آمادهٔ سوییچ در CG Control.',
  templateType: 'fullscreen',
  direct: true,
  fontFamily: FAM,
  onAirId: 'comp-multibox-onair',
  onAirName: 'میزگرد چندقابه',
  onAirSize: LOOK_SIZE,
  onAirPosition: { x: 80, y: 80 },
  children,
  fields: [
    {
      id: 'title',
      label: 'عنوان برنامه',
      required: true,
      type: 'text',
      default: TITLE,
      direction: 'rtl',
    },
  ],
  bindings: [{ fieldId: 'title', target: { kind: 'text', elementId: 'multibox-title' } }],
  entryLookGroups: lookGroups,
  extraCompositions: lookCompositions,
});
