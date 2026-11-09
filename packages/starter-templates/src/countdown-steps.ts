import type { Element } from '@cg/shared-schema';
import {
  galleryScene,
  gradient,
  image,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';

const FAM = 'asset-countdown-steps-vazir';
const TITLE = 'تا اذان مغرب به افق تهران';
const ANNOUNCEMENT = 'اذان مغرب به افق تهران';
// A teaching deadline, not a calculated prayer time. The normal bound date/time field owns it.
const DEMO_TARGET = new Date(Date.now() + 7 * 60_000).toISOString();
const INK = '#F7F5FF';
const TIMER_INK = '#FFFFFF';
const TIMER_BASE = '#303557';
// Ordinary, inspectable countdown Steps; each threshold colors the same editable timer plate.
const TIME_STAGES = [
  { minutes: 60, name: 'شصت دقیقه تا اذان', color: '#0F766E' },
  { minutes: 30, name: 'سی دقیقه تا اذان', color: '#245D9B' },
  { minutes: 10, name: 'ده دقیقه تا اذان', color: '#66529B' },
  { minutes: 5, name: 'پنج دقیقه تا اذان', color: '#9A5A18' },
  { minutes: 1, name: 'یک دقیقه تا اذان', color: '#A33E48' },
] as const;

const children: Element[] = [
  shape(
    'countdown-bg',
    'پلیت شیشه‌ای اذان',
    tf(374, 18, 1018, 128),
    gradient(106, '#111326F7', '#2C2C51EC'),
    0,
    {
      radius: 24,
      stroke: { color: '#C4CBFF40', width: 1 },
      shadow: { offsetX: 0, offsetY: 10, blur: 24, color: '#07081A7A' },
    },
  ),
  shape(
    'countdown-glass-highlight',
    'بازتاب شیشه',
    tf(375, 19, 1016, 126),
    gradient(126, '#AFB5FF0A', '#A59DFF2B'),
    1,
    { radius: 23 },
  ),
  shape(
    'countdown-top-accent',
    'نور محو نشان',
    tf(1274, 39, 87, 87),
    gradient(144, '#D8D5FF2D', '#D8D5FF00'),
    3,
    { radius: 20 },
  ),
  shape('countdown-badge-rule', 'نقطهٔ شناسنامه', tf(1240, 49, 6, 6), solid('#BEB7FF'), 3, {
    radius: 3,
  }),
  shape(
    'countdown-badge',
    'نشان اوقات شرعی',
    tf(1272, 37, 91, 91),
    gradient(138, '#7374B369', '#4D498433'),
    2,
    {
      radius: 21,
      stroke: { color: '#C4CBFF37', width: 1 },
      shadow: { offsetX: 0, offsetY: 6, blur: 14, color: '#09091A52' },
    },
  ),
  text(
    'countdown-badge-label',
    'برچسب اوقات شرعی',
    'اوقات شرعی',
    tf(1003, 38, 225, 26),
    FAM,
    19,
    600,
    '#D2CEFA',
    3,
    {
      align: 'start',
    },
  ),
  image(
    'countdown-azan-icon',
    'نشان محراب',
    'countdown-azan-icon',
    tf(1287, 52, 61, 61),
    4,
    'contain',
  ),
  shape('countdown-clock-bg', 'قاب شمارش', tf(8, 18, 350, 128), solid(TIMER_BASE), 2, {
    radius: 24,
    stroke: { color: '#E2E8FF52', width: 1 },
    shadow: { offsetX: 0, offsetY: 10, blur: 24, color: '#07081A7A' },
  }),
  text('countdown-title', 'عنوان', TITLE, tf(416, 64, 812, 61), FAM, 49, 700, INK, 3, {
    align: 'start',
  }),
  text(
    'countdown-normal',
    'برچسب شمارش',
    'زمان باقی‌مانده',
    tf(36, 35, 294, 26),
    FAM,
    19,
    600,
    '#F0F3FF',
    3,
    {
      align: 'center',
    },
  ),
  {
    id: 'countdown-clock',
    name: 'شمارش معکوس',
    type: 'clock',
    transform: tf(32, 62, 302, 68),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    font: {
      family: FAM,
      weight: 700,
      style: 'normal',
      size: 62,
      lineHeight: 1.05,
      letterSpacing: 2,
    },
    color: TIMER_INK,
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'HH:mm:ss',
    digits: 'persian',
    target: { kind: 'datetime', iso: DEMO_TARGET },
    drivesHold: false,
    afterZero: 'hide-digits',
    steps: {
      before: {
        name: 'بیش از یک ساعت',
        transition: { kind: 'fade', ms: 300 },
        changes: [
          { elementId: 'countdown-clock', property: 'textColor', value: TIMER_INK },
          { elementId: 'countdown-clock-bg', property: 'fill', value: TIMER_BASE },
          { elementId: 'countdown-zero', property: 'visible', value: false },
        ],
      },
      steps: [
        ...TIME_STAGES.map(({ minutes, name, color }) => ({
          name,
          atMs: minutes * 60_000,
          transition: { kind: 'fade', ms: 350 },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: TIMER_INK },
            { elementId: 'countdown-clock-bg', property: 'fill', value: color },
            { elementId: 'countdown-zero', property: 'visible', value: false },
          ],
        })),
        {
          name: 'اذان مغرب',
          atMs: 0,
          transition: { kind: 'fade', ms: 400 },
          changes: [
            { elementId: 'countdown-clock', property: 'visible', value: false },
            { elementId: 'countdown-clock-bg', property: 'visible', value: false },
            { elementId: 'countdown-title', property: 'visible', value: false },
            { elementId: 'countdown-normal', property: 'visible', value: false },
            { elementId: 'countdown-zero', property: 'visible', value: true },
          ],
        },
      ],
    },
  } as Element,
  {
    ...text(
      'countdown-zero',
      'اعلان اذان',
      ANNOUNCEMENT,
      tf(416, 64, 812, 61),
      FAM,
      49,
      700,
      INK,
      3,
      {
        align: 'start',
      },
    ),
    visible: false,
  } as Element,
];

export const countdownStepsScene = galleryScene({
  id: 'countdown-steps',
  name: 'شمارش معکوس اذان',
  description:
    'زیرنویس اذان مغرب با زمان هدف نمونه و قابل ویرایش؛ در صفر، شمارش جای خود را به اعلان اذان می‌دهد و تا توقف دستی می‌ماند. زمان نمونه، ساعت شرعی محاسبه‌شده نیست.',
  templateType: 'lower-third',
  lifecycle: { outPoint: 100 },
  fontFamily: FAM,
  onAirId: 'comp-countdown-steps-onair',
  onAirName: 'اذان مغرب',
  onAirSize: { width: 1400, height: 164 },
  onAirPosition: { x: 260, y: 820 },
  children: children.map((element) => ({
    ...element,
    animation: reveal(0, element.transform.position.y),
  })),
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
    {
      id: 'eventTime',
      label: 'زمان اذان',
      required: true,
      type: 'text',
      default: DEMO_TARGET,
      direction: 'ltr',
      digits: 'latin',
    },
    {
      id: 'announcement',
      label: 'اعلان اذان',
      required: true,
      type: 'text',
      default: ANNOUNCEMENT,
      direction: 'rtl',
    },
  ],
  bindings: [
    { fieldId: 'title', target: { kind: 'text', elementId: 'countdown-title' } },
    { fieldId: 'eventTime', target: { kind: 'clock-target', elementId: 'countdown-clock' } },
    { fieldId: 'announcement', target: { kind: 'text', elementId: 'countdown-zero' } },
  ],
  entryPlayout: { mode: 'manual', holdSource: 'timed' },
  onAirPlayout: { mode: 'manual', holdSource: 'timed' },
});
