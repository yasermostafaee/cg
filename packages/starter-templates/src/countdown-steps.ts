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

const FAM = 'asset-countdown-steps-vazir';
const TITLE = 'زمان باقی‌مانده تا آغاز برنامه';

const status = (id: string, value: string, color: string, visible: boolean): Element => ({
  ...text(id, value, value, tf(80, 470, 940, 72), FAM, 31, 800, color, 5, {
    align: 'center',
  }),
  visible,
});

const children: Element[] = [
  shape('countdown-bg', 'پس‌زمینه', tf(0, 0, 1100, 620), gradient(145, '#071426', '#123A5D'), 0, {
    radius: 34,
    stroke: { color: '#2A5977', width: 2 },
    shadow: { offsetX: 0, offsetY: 20, blur: 52, color: '#00000080' },
  }),
  shape(
    'countdown-title-bg',
    'نوار عنوان',
    tf(52, 44, 996, 88),
    gradient(90, '#0369A1', '#0F766E'),
    1,
    {
      radius: 20,
      animation: reveal(0),
    },
  ),
  text('countdown-title', 'عنوان', TITLE, tf(80, 52, 940, 70), FAM, 36, 900, PALETTE.white, 3, {
    align: 'center',
    animation: reveal(4),
  }),
  shape(
    'countdown-clock-bg',
    'قاب شمارش',
    tf(126, 176, 848, 250),
    gradient(140, '#0B2B46', '#164768'),
    1,
    {
      radius: 30,
      stroke: { color: '#3B82F6', width: 4 },
      shadow: { offsetX: 0, offsetY: 14, blur: 36, color: '#00000070' },
    },
  ),
  {
    id: 'countdown-clock',
    name: 'شمارش معکوس',
    type: 'clock',
    transform: tf(156, 192, 788, 216),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    font: {
      family: FAM,
      weight: 900,
      style: 'normal',
      size: 116,
      lineHeight: 1.15,
      letterSpacing: 2,
    },
    color: '#7DD3FC',
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
  shape('countdown-bottom-rule', 'خط پایین', tf(80, 568, 940, 3), solid('#38BDF8'), 2),
];

export const countdownStepsScene = galleryScene({
  id: 'countdown-steps',
  name: 'شمارش معکوس مرحله‌ای',
  description:
    'شمارش معکوس تا ساعت هدف با Steps واقعی برای تغییر رنگ، وضعیت و چشمک در آستانه‌های شصت، سی و ده دقیقه.',
  templateType: 'fullscreen',
  fontFamily: FAM,
  onAirId: 'comp-countdown-steps-onair',
  onAirName: 'شمارش معکوس (روی آنتن)',
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
