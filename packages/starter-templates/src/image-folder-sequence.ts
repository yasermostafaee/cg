import type { Element } from '@cg/shared-schema';
import { anim, EASE, kf, track } from './anim.js';
import { galleryScene, PALETTE, tf } from './gallery-helpers.js';

const FAM = 'asset-image-folder-sequence-vazir';
const children: Element[] = [
  {
    id: 'folder-image-sequence',
    name: 'تصاویر عریض قرآن با ترجمه',
    type: 'sequence',
    transform: tf(0, 0, 1920, 1080),
    opacity: 1,
    // The folder-backed book is a direct full-screen Sequence, so it needs its own authored Outro.
    // Stop now fades the current page over the composition's 100→160 exit span instead of clearing
    // the Sequence immediately.
    animation: anim({
      opacity: track(kf(0, 1), kf(100, 1), kf(160, 0, EASE.inCubic)),
    }),
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
    items: ['جزء اول', 'سورهٔ فاتحه', 'فاتحه؛ آیهٔ ۱', 'فاتحه؛ آیهٔ ۲', 'فاتحه؛ آیهٔ ۳'].map(
      (name, index) => ({
        kind: 'image' as const,
        id: `image-${index + 1}`,
        assetId: `gallery-slide-${index + 1}`,
        name,
        dwellMs: 8000,
      }),
    ),
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
];

export const imageFolderSequenceScene = galleryScene({
  id: 'image-folder-sequence',
  name: 'نمایش تلاوت قرآن',
  description:
    'پنج تصویر عریض و تمام‌صفحهٔ قرآن با تذهیب و ترجمهٔ فارسی؛ اپراتور با Next و Previous ورق می‌زند. تعویض مجموعه از Add folder در Inspector.',
  templateType: 'fullscreen',
  direct: true,
  fontFamily: FAM,
  onAirId: 'comp-image-folder-sequence-onair',
  onAirName: 'توالی صفحات قرآن',
  onAirSize: { width: 1920, height: 1080 },
  onAirPosition: { x: 0, y: 0 },
  children,
  fields: [],
  bindings: [],
});
