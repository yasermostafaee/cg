import type { Element } from '@cg/shared-schema';
import {
  galleryScene,
  gradient,
  PALETTE,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';

const FAM = 'asset-multibox-vazir';
const TITLE = 'میزگرد ویژهٔ فوتبال ایران';

const plate = (
  id: string,
  routeKey: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Element => ({
  id,
  name: routeKey,
  type: 'video-placeholder',
  transform: tf(x, y, w, h),
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 4,
  routeKey,
  expectedAspect: 16 / 9,
  fitMode: 'cover',
});

const box = (
  id: string,
  routeKey: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
): Element[] => [
  shape(`${id}-shadow`, `قاب ${label}`, tf(x - 8, y - 8, w + 16, h + 68), solid('#081A2B'), 1, {
    radius: 20,
    stroke: { color: accent, width: 3 },
    shadow: { offsetX: 0, offsetY: 14, blur: 34, color: '#00000080' },
  }),
  plate(id, routeKey, x, y, w, h),
  shape(
    `${id}-label-bg`,
    `نوار ${label}`,
    tf(x, y + h, w, 52),
    gradient(90, accent, '#0B2B46'),
    5,
    {
      radius: 12,
    },
  ),
  text(
    `${id}-label`,
    `عنوان ${label}`,
    label,
    tf(x + 14, y + h + 3, w - 28, 44),
    FAM,
    23,
    800,
    PALETTE.white,
    6,
    {
      align: 'center',
    },
  ),
];

const children: Element[] = [
  shape('multibox-bg', 'پس‌زمینه', tf(0, 0, 1760, 920), gradient(145, '#050D18', '#123A5D'), 0, {
    radius: 30,
    stroke: { color: '#2A5977', width: 2 },
    shadow: { offsetX: 0, offsetY: 20, blur: 52, color: '#00000080' },
  }),
  shape(
    'multibox-title-bg',
    'نوار عنوان',
    tf(50, 38, 1660, 88),
    gradient(90, '#7C3AED', '#1D4ED8'),
    1,
    {
      radius: 20,
      animation: reveal(0),
    },
  ),
  text(
    'multibox-title',
    'عنوان برنامه',
    TITLE,
    tf(90, 46, 1580, 70),
    FAM,
    40,
    900,
    PALETTE.white,
    3,
    {
      align: 'center',
      animation: reveal(4),
    },
  ),
  ...box('multibox-host', 'host', 'مجری ـ تهران', 80, 176, 760, 428, '#2563EB'),
  ...box('multibox-guest-1', 'guest-1', 'کارشناس ـ شیراز', 920, 176, 760, 428, '#0F766E'),
  ...box('multibox-guest-2', 'guest-2', 'خبرنگار ـ تبریز', 80, 684, 760, 135, '#B45309'),
  ...box('multibox-guest-3', 'guest-3', 'مهمان ـ اصفهان', 920, 684, 760, 135, '#BE123C'),
  shape('multibox-live-pill', 'نشان زنده', tf(762, 632, 236, 52), solid('#DC2626'), 7, {
    radius: 26,
  }),
  text(
    'multibox-live-text',
    'زنده',
    'پخش زنده',
    tf(774, 636, 212, 44),
    FAM,
    23,
    900,
    PALETTE.white,
    8,
    {
      align: 'center',
    },
  ),
];

export const multiboxScene = galleryScene({
  id: 'multibox',
  name: 'میزگرد چندقابه',
  description:
    'چهار Live Source مستقل برای مجری، دو مهمان و خبرنگار با قاب‌ها و شناسه‌های ورودی آمادهٔ نگاشت در CG Control.',
  templateType: 'fullscreen',
  fontFamily: FAM,
  onAirId: 'comp-multibox-onair',
  onAirName: 'میزگرد چندقابه (روی آنتن)',
  onAirSize: { width: 1760, height: 920 },
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
});
