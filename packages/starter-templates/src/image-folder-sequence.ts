import type { Element } from '@cg/shared-schema';
import { galleryScene, gradient, PALETTE, reveal, shape, text, tf } from './gallery-helpers.js';

const FAM = 'asset-image-folder-sequence-vazir';
const TITLE = 'تلاوت تصویری قرآن کریم';

const children: Element[] = [
  shape(
    'folder-seq-frame',
    'قاب اصلی',
    tf(0, 0, 1920, 1080),
    gradient(145, '#020710', '#0B2239'),
    0,
    {
      stroke: { color: '#B88A3B66', width: 2 },
    },
  ),
  shape(
    'folder-seq-left-glow',
    'نور کناری',
    tf(0, 0, 390, 1080),
    gradient(90, '#071426', '#07142600'),
    1,
  ),
  shape(
    'folder-seq-right-glow',
    'نور کناری',
    tf(1530, 0, 390, 1080),
    gradient(90, '#07142600', '#071426'),
    1,
  ),
  {
    id: 'folder-image-sequence',
    name: 'تصاویر پوشه',
    type: 'sequence',
    transform: tf(80, 20, 1760, 1040),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    font: {
      family: FAM,
      weight: 600,
      style: 'normal',
      size: 28,
      lineHeight: 1.35,
      letterSpacing: 0,
    },
    color: PALETTE.white,
    align: 'center',
    verticalAlign: 'middle',
    direction: 'rtl',
    items: [
      {
        kind: 'image',
        id: 'image-1',
        assetId: 'gallery-slide-1',
        name: 'صفحه ۲۰ قرآن کریم',
        dwellMs: 8000,
      },
      {
        kind: 'image',
        id: 'image-2',
        assetId: 'gallery-slide-2',
        name: 'صفحه ۲۱ قرآن کریم',
        dwellMs: 8000,
      },
      {
        kind: 'image',
        id: 'image-3',
        assetId: 'gallery-slide-3',
        name: 'صفحه ۲۲ قرآن کریم',
        dwellMs: 8000,
      },
      {
        kind: 'image',
        id: 'image-4',
        assetId: 'gallery-slide-4',
        name: 'صفحه ۲۳ قرآن کریم',
        dwellMs: 8000,
      },
      {
        kind: 'image',
        id: 'image-5',
        assetId: 'gallery-slide-5',
        name: 'صفحه ۲۴ قرآن کریم',
        dwellMs: 8000,
      },
    ],
    imageFit: 'contain',
    defaultDwellMs: 8000,
    advance: 'manual',
    operatorSteps: true,
    transitionIn: 'fade-right',
    transitionOut: 'fade-left',
    transitionTiming: 'simultaneous',
    transitionMs: 650,
    repeat: 1,
    drivesHold: false,
  } as Element,
  shape(
    'folder-seq-title-bg',
    'پس‌زمینه عنوان',
    tf(1280, 950, 560, 82),
    gradient(90, '#8A5A12E6', '#0B2B46E6'),
    2,
    {
      radius: 20,
      stroke: { color: '#FDE68A55', width: 1 },
      animation: reveal(0),
    },
  ),
  text('folder-seq-title', 'عنوان', TITLE, tf(1310, 958, 500, 66), FAM, 28, 800, PALETTE.white, 3, {
    align: 'center',
    animation: reveal(4),
  }),
];

export const imageFolderSequenceScene = galleryScene({
  id: 'image-folder-sequence',
  name: 'توالی تصاویر پوشه',
  description:
    'پنج صفحهٔ واقعی و باکیفیت قرآن برای ورق‌زدن دستی اپراتور؛ برای جایگزینی، در Inspector گزینهٔ Add folder را بزنید.',
  templateType: 'fullscreen',
  direct: true,
  fontFamily: FAM,
  onAirId: 'comp-image-folder-sequence-onair',
  onAirName: 'توالی صفحات قرآن',
  onAirSize: { width: 1920, height: 1080 },
  onAirPosition: { x: 0, y: 0 },
  children,
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
  ],
  bindings: [{ fieldId: 'title', target: { kind: 'text', elementId: 'folder-seq-title' } }],
});
