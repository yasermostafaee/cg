import type { Element } from '@cg/shared-schema';
import { galleryScene, gradient, reveal, shape, solid, text, tf } from './gallery-helpers.js';

const FAM = 'asset-countdown-steps-vazir';
const TITLE = 'تا اذان مغرب به افق تهران';
const ANNOUNCEMENT = 'اذان مغرب به افق تهران';
// A teaching deadline, not a calculated prayer time. The normal bound date/time field owns it.
const DEMO_TARGET = new Date(Date.now() + 7 * 60_000).toISOString();
const IVORY = '#EEF0EB';

const children: Element[] = [
  shape(
    'countdown-bg',
    'پلیت اذان',
    tf(0, 0, 1400, 164),
    gradient(135, '#111B2CF2', '#1F2C43F2'),
    0,
    {
      radius: 26,
      stroke: { color: '#A4B1C652', width: 1 },
      shadow: { offsetX: 0, offsetY: 12, blur: 30, color: '#00000066' },
    },
  ),
  shape(
    'countdown-top-accent',
    'خط روشن',
    tf(40, 12, 1090, 2),
    gradient(90, '#9D94B400', '#9D94B4'),
    1,
  ),
  shape(
    'countdown-badge',
    'نشان اوقات شرعی',
    tf(1160, 18, 220, 128),
    gradient(135, '#47516C', '#333F58'),
    1,
    {
      radius: 20,
      stroke: { color: '#B7ACD23D', width: 1 },
    },
  ),
  text(
    'countdown-badge-label',
    'برچسب اوقات شرعی',
    'اوقات شرعی',
    tf(1174, 33, 192, 32),
    FAM,
    21,
    500,
    '#D6D8E1',
    2,
    {
      align: 'center',
    },
  ),
  text(
    'countdown-badge-name',
    'نام نوبت اذان',
    'مغرب',
    tf(1174, 68, 192, 58),
    FAM,
    42,
    800,
    IVORY,
    2,
    {
      align: 'center',
    },
  ),
  shape('countdown-clock-bg', 'قاب شمارش', tf(28, 22, 340, 120), solid('#0A1321CC'), 1, {
    radius: 18,
    stroke: { color: '#8898AF38', width: 1 },
  }),
  text('countdown-title', 'عنوان', TITLE, tf(410, 34, 710, 64), FAM, 40, 800, IVORY, 2, {
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
    '#B8C3D3',
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
    color: IVORY,
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
        name: 'بیش از پنج دقیقه',
        transition: { kind: 'fade', ms: 300 },
        changes: [
          { elementId: 'countdown-clock', property: 'textColor', value: IVORY },
          { elementId: 'countdown-zero', property: 'visible', value: false },
        ],
      },
      steps: [
        {
          name: 'پنج دقیقه تا اذان',
          atMs: 300_000,
          transition: { kind: 'fade', ms: 350 },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: '#E0D8ED' },
            { elementId: 'countdown-zero', property: 'visible', value: false },
          ],
        },
        {
          name: 'یک دقیقه تا اذان',
          atMs: 60_000,
          transition: { kind: 'fade', ms: 350 },
          changes: [
            { elementId: 'countdown-clock', property: 'textColor', value: '#FFFFFF' },
            { elementId: 'countdown-clock-bg', property: 'fill', value: '#29354C' },
            { elementId: 'countdown-zero', property: 'visible', value: false },
          ],
        },
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
      IVORY,
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
