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
const INK = '#123C4A';
const TIMER_INK = '#FFFFFF';
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
    tf(0, 0, 1400, 164),
    gradient(135, '#F8FDFFE8', '#C8E6EAD6'),
    0,
    {
      radius: 30,
      stroke: { color: '#FFFFFFF2', width: 2 },
      shadow: { offsetX: 0, offsetY: 14, blur: 34, color: '#0C35505C' },
    },
  ),
  shape(
    'countdown-glass-highlight',
    'بازتاب شیشه',
    tf(18, 10, 1364, 58),
    gradient(180, '#FFFFFFB8', '#FFFFFF12'),
    1,
    { radius: 24, opacity: 0.72 },
  ),
  shape(
    'countdown-top-accent',
    'خط روشن',
    tf(40, 12, 1090, 2),
    gradient(90, '#38BDF800', '#38BDF8D9'),
    2,
  ),
  shape(
    'countdown-badge',
    'نشان اوقات شرعی',
    tf(1160, 18, 220, 128),
    gradient(135, '#F5FFFFD9', '#B8DDE3B8'),
    1,
    {
      radius: 20,
      stroke: { color: '#FFFFFFE6', width: 1 },
      shadow: { offsetX: 0, offsetY: 8, blur: 20, color: '#134E5E29' },
    },
  ),
  text(
    'countdown-badge-label',
    'برچسب اوقات شرعی',
    'اوقات شرعی',
    tf(1174, 114, 192, 24),
    FAM,
    17,
    500,
    '#315C68',
    2,
    {
      align: 'center',
    },
  ),
  image(
    'countdown-azan-icon',
    'نشان مسجد و هلال',
    'countdown-azan-icon',
    tf(1182, 24, 176, 88),
    2,
    'contain',
  ),
  shape('countdown-clock-bg', 'قاب شمارش', tf(28, 22, 340, 120), solid('#155E75'), 1, {
    radius: 18,
    stroke: { color: '#FFFFFFD9', width: 1 },
    shadow: { offsetX: 0, offsetY: 8, blur: 20, color: '#082F4966' },
  }),
  text('countdown-title', 'عنوان', TITLE, tf(410, 34, 710, 64), FAM, 40, 800, INK, 2, {
    align: 'start',
  }),
  text(
    'countdown-normal',
    'برچسب شمارش',
    'زمان باقی‌مانده',
    tf(410, 104, 710, 30),
    FAM,
    21,
    500,
    '#496B73',
    2,
    {
      align: 'start',
    },
  ),
  {
    id: 'countdown-clock',
    name: 'شمارش معکوس',
    type: 'clock',
    transform: tf(46, 34, 304, 96),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    font: {
      family: FAM,
      weight: 800,
      style: 'normal',
      size: 64,
      lineHeight: 1.15,
      letterSpacing: 1,
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
          { elementId: 'countdown-clock-bg', property: 'fill', value: '#155E75' },
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
      tf(48, 38, 1072, 88),
      FAM,
      45,
      800,
      INK,
      3,
      {
        align: 'center',
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
