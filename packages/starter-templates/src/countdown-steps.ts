import type { Element } from '@cg/shared-schema';
import {
  galleryScene,
  gradient,
  image,
  PALETTE,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';

const FAM = 'asset-countdown-steps-vazir';
const TITLE = 'زمان باقی‌مانده تا آغاز برنامه';

const status = (id: string, value: string, color: string, visible: boolean): Element => ({
  ...text(id, value, value, tf(80, 470, 940, 72), FAM, 31, 800, color, 5, {
    align: 'center',
  }),
  visible,
});

const children: Element[] = [
  image(
    'countdown-precision-bg',
    'پس‌زمینهٔ زمان',
    'countdown-precision',
    tf(-410, -230, 1920, 1080),
    0,
    'cover',
  ),
  shape(
    'countdown-bg',
    'پنل مرکزی',
    tf(0, 0, 1100, 620),
    gradient(145, '#030A17D9', '#0B1730C7'),
    1,
    {
      radius: 38,
      stroke: { color: '#83D9FF4D', width: 2 },
      shadow: { offsetX: 0, offsetY: 24, blur: 64, color: '#000000A6' },
    },
  ),
  shape(
    'countdown-top-accent',
    'خط نور بالا',
    tf(174, 24, 752, 3),
    gradient(90, '#22D3EE00', '#A78BFA'),
    2,
    {
      radius: 2,
    },
  ),
  shape(
    'countdown-title-bg',
    'نوار عنوان',
    tf(120, 54, 860, 74),
    gradient(90, '#0E7490CC', '#6D28D9CC'),
    2,
    {
      radius: 22,
      stroke: { color: '#A5F3FC55', width: 1 },
      animation: reveal(0),
    },
  ),
  text('countdown-title', 'عنوان', TITLE, tf(150, 60, 800, 62), FAM, 33, 900, PALETTE.white, 4, {
    align: 'center',
    animation: reveal(4),
  }),
  shape(
    'countdown-clock-bg',
    'قاب شمارش',
    tf(126, 170, 848, 246),
    gradient(140, '#071528E6', '#102D4BE0'),
    2,
    {
      radius: 34,
      stroke: { color: '#67E8F980', width: 3 },
      shadow: { offsetX: 0, offsetY: 18, blur: 44, color: '#00000080' },
    },
  ),
  {
    id: 'countdown-clock',
    name: 'شمارش معکوس',
    type: 'clock',
    transform: tf(156, 186, 788, 208),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 5,
    font: {
      family: FAM,
      weight: 900,
      style: 'normal',
      size: 120,
      lineHeight: 1.15,
      letterSpacing: 2,
    },
    color: '#C4F1FF',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'HH:mm:ss',
    digits: 'persian',
    target: { kind: 'timeofday', time: '21:00' },
    drivesHold: true,
    afterZero: 'hold',
    steps: {
      before: {
        name: 'بیش از شصت دقیقه',
        transition: { kind: 'fade', ms: 350 },
        changes: [
          { elementId: 'countdown-clock', property: 'textColor', value: '#7DD3FC' },
          { elementId: 'countdown-clock-bg', property: 'fill', value: '#164768' },
          { elementId: 'countdown-normal', property: 'visible', value: true },
          { elementId: 'countdown-five', property: 'visible', value: false },
          { elementId: 'countdown-one', property: 'visible', value: false },
          { elementId: 'countdown-ten', property: 'visible', value: false },
          { elementId: 'countdown-zero', property: 'visible', value: false },
        ],
      },
      steps: [
        {
          name: 'شصت دقیقه باقی‌مانده',
          atMs: 3_600_000,
          transition: { kind: 'fade', ms: 350 },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: '#FDE68A' },
            { elementId: 'countdown-clock-bg', property: 'fill', value: '#854D0E' },
            { elementId: 'countdown-normal', property: 'visible', value: false },
            { elementId: 'countdown-five', property: 'visible', value: true },
            { elementId: 'countdown-one', property: 'visible', value: false },
            { elementId: 'countdown-ten', property: 'visible', value: false },
            { elementId: 'countdown-zero', property: 'visible', value: false },
          ],
        },
        {
          name: 'سی دقیقه باقی‌مانده',
          atMs: 1_800_000,
          transition: { kind: 'fade', ms: 300 },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: '#FDBA74' },
            { elementId: 'countdown-clock-bg', property: 'fill', value: '#9A3412' },
            { elementId: 'countdown-normal', property: 'visible', value: false },
            { elementId: 'countdown-five', property: 'visible', value: false },
            { elementId: 'countdown-one', property: 'visible', value: true },
            { elementId: 'countdown-ten', property: 'visible', value: false },
            { elementId: 'countdown-zero', property: 'visible', value: false },
          ],
        },
        {
          name: 'ده دقیقه پایانی',
          atMs: 600_000,
          transition: { kind: 'cut' },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: '#FCA5A5' },
            { elementId: 'countdown-clock', property: 'blink', value: true },
            { elementId: 'countdown-clock-bg', property: 'fill', value: '#991B1B' },
            { elementId: 'countdown-normal', property: 'visible', value: false },
            { elementId: 'countdown-five', property: 'visible', value: false },
            { elementId: 'countdown-one', property: 'visible', value: false },
            { elementId: 'countdown-ten', property: 'visible', value: true },
            { elementId: 'countdown-zero', property: 'visible', value: false },
          ],
        },
        {
          name: 'آغاز برنامه',
          atMs: 0,
          transition: { kind: 'fade', ms: 250 },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: '#FFFFFF' },
            { elementId: 'countdown-clock', property: 'blink', value: false },
            { elementId: 'countdown-clock-bg', property: 'fill', value: '#065F46' },
            { elementId: 'countdown-normal', property: 'visible', value: false },
            { elementId: 'countdown-five', property: 'visible', value: false },
            { elementId: 'countdown-one', property: 'visible', value: false },
            { elementId: 'countdown-ten', property: 'visible', value: false },
            { elementId: 'countdown-zero', property: 'visible', value: true },
          ],
        },
      ],
    },
  } as Element,
  status('countdown-normal', 'تا شروع برنامه همراه ما بمانید', '#BAE6FD', true),
  status('countdown-five', 'کمتر از یک ساعت تا آغاز پخش', '#FDE68A', false),
  status('countdown-one', 'سی دقیقه تا آغاز پخش', '#FDBA74', false),
  status('countdown-ten', 'ده دقیقه تا آغاز پخش', '#FCA5A5', false),
  status('countdown-zero', 'برنامه آغاز شد', '#6EE7B7', false),
  shape('countdown-status-bg', 'پس‌زمینه وضعیت', tf(120, 458, 860, 94), solid('#06132299'), 2, {
    radius: 24,
    stroke: { color: '#A78BFA33', width: 1 },
  }),
  shape(
    'countdown-bottom-rule',
    'خط پایین',
    tf(210, 568, 680, 3),
    gradient(90, '#22D3EE00', '#A78BFA'),
    3,
    {
      radius: 2,
    },
  ),
];

export const countdownStepsScene = galleryScene({
  id: 'countdown-steps',
  name: 'شمارش معکوس مرحله‌ای',
  description:
    'شمارش معکوس تا ساعت هدف با Steps واقعی برای تغییر رنگ، وضعیت و چشمک در آستانه‌های شصت، سی و ده دقیقه.',
  templateType: 'fullscreen',
  direct: true,
  fontFamily: FAM,
  onAirId: 'comp-countdown-steps-onair',
  onAirName: 'شمارش معکوس',
  onAirSize: { width: 1100, height: 620 },
  onAirPosition: { x: 410, y: 230 },
  children,
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
    {
      id: 'eventTime',
      label: 'ساعت آغاز',
      required: true,
      type: 'text',
      default: '21:00',
      pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
      direction: 'ltr',
      digits: 'latin',
    },
  ],
  bindings: [
    { fieldId: 'title', target: { kind: 'text', elementId: 'countdown-title' } },
    { fieldId: 'eventTime', target: { kind: 'clock-target', elementId: 'countdown-clock' } },
  ],
  entryPlayout: { mode: 'auto-out', holdSource: 'content-driven' },
  onAirPlayout: { mode: 'auto-out', holdSource: 'content-driven' },
});
