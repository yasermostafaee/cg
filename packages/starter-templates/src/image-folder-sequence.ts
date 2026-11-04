import type { Element } from '@cg/shared-schema';
import { galleryScene, gradient, PALETTE, reveal, shape, text, tf } from './gallery-helpers.js';

const FAM = 'asset-image-folder-sequence-vazir';
const TITLE = 'روایت تصویری ایران';

const children: Element[] = [
  shape(
    'folder-seq-frame',
    'قاب اصلی',
    tf(0, 0, 1640, 900),
    gradient(145, '#071426', '#123A5D'),
    0,
    {
      radius: 30,
      stroke: { color: '#2E668A', width: 2 },
      shadow: { offsetX: 0, offsetY: 20, blur: 52, color: '#00000080' },
    },
  ),
  {
    id: 'folder-image-sequence',
    name: 'تصاویر پوشه',
    type: 'sequence',
    transform: tf(34, 34, 1572, 740),
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
        name: '01-iran.svg',
        dwellMs: 4500,
      },
      {
        kind: 'image',
        id: 'image-2',
        assetId: 'gallery-slide-2',
        name: '02-city.svg',
        dwellMs: 4500,
      },
      {
        kind: 'image',
        id: 'image-3',
        assetId: 'gallery-slide-3',
        name: '03-nature.svg',
        dwellMs: 4500,
      },
    ],
    imageFit: 'cover',
    defaultDwellMs: 4500,
    advance: 'auto',
    operatorSteps: true,
    transitionIn: 'fade-right',
    transitionOut: 'fade-left',
    transitionTiming: 'simultaneous',
    transitionMs: 650,
    repeat: 'infinite',
    drivesHold: false,
  } as Element,
  shape(
    'folder-seq-title-bg',
    'پس‌زمینه عنوان',
    tf(34, 792, 1572, 78),
    gradient(90, '#075985', '#0F766E'),
    2,
    {
      radius: 18,
      animation: reveal(0),
    },
  ),
  text('folder-seq-title', 'عنوان', TITLE, tf(70, 800, 1500, 62), FAM, 38, 900, PALETTE.white, 3, {
    align: 'center',
    animation: reveal(4),
  }),
];

export const imageFolderSequenceScene = galleryScene({
  id: 'image-folder-sequence',
  name: 'توالی تصاویر پوشه',
  description:
    'نمونهٔ Sequence تصویری با سه فایل مرتب‌شده؛ برای جایگزینی، در Inspector گزینهٔ Add folder را بزنید.',
  templateType: 'fullscreen',
  fontFamily: FAM,
  onAirId: 'comp-image-folder-sequence-onair',
  onAirName: 'توالی تصاویر (روی آنتن)',
  onAirSize: { width: 1640, height: 900 },
  onAirPosition: { x: 140, y: 90 },
  children,
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
  ],
  bindings: [{ fieldId: 'title', target: { kind: 'text', elementId: 'folder-seq-title' } }],
});
