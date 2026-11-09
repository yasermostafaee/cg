import type { Element, Scene } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';
import {
  galleryScene,
  gradient,
  image,
  layer,
  PALETTE,
  shape,
  text,
  tf,
} from './gallery-helpers.js';
import { weatherTypeField, weatherIconElements } from './weather-icons.js';

const FAM = 'asset-iran-weather-forecast-vazir';
const TITLE = 'پیش‌بینی آب و هوای پنج‌روزهٔ تهران';
const CARD_COMP = 'comp-weather-forecast-card';

const forecastHeaderReveal = (
  opacityDelay: number,
  poses: readonly { frame: number; y: number; linear?: boolean }[],
): NonNullable<Element['animation']> =>
  anim({
    opacity: track(
      kf(opacityDelay, 0),
      kf(opacityDelay + 12, 1, EASE.outExpo),
      kf(116, 1),
      kf(138, 0),
    ),
    'position.y': track(
      ...poses.map(({ frame, y, linear }, index) => {
        if (linear === true) return kfLinear(frame, y);
        if (index === poses.length - 1) return kf(frame, y, EASE.inCubic);
        return index < 2 ? kf(frame, y, EASE.outExpo) : kf(frame, y);
      }),
    ),
  });

const forecast = [
  { id: 'today', day: 'امروز', weatherType: 'آفتابی', high: 22, low: 12 },
  {
    id: 'tomorrow',
    day: 'فردا',
    weatherType: 'نیمه‌ابری',
    high: 20,
    low: 11,
  },
  { id: 'day-3', day: 'جمعه', weatherType: 'بارانی', high: 17, low: 9 },
  { id: 'day-4', day: 'شنبه', weatherType: 'ابری', high: 16, low: 8 },
  { id: 'day-5', day: 'یکشنبه', weatherType: 'برفی', high: 10, low: 1 },
];

const card: NonNullable<Scene['compositions']>[number] = {
  id: CARD_COMP,
  name: 'کارت پیش‌بینی روز',
  resolution: { width: 296, height: 460 },
  frameRange: { in: 0, out: 140 },
  playout: { mode: 'static' },
  editorBackdrop: 'transparent',
  layers: [
    layer('forecast-card-layer', 'روز', [
      shape(
        'forecast-card-bg',
        'کارت',
        tf(0, 0, 296, 460),
        gradient(160, '#2D54715B', '#123C55A3'),
        0,
        {
          radius: 28,
          stroke: { color: '#8BE7FF33', width: 0 },
          shadow: { offsetX: 0, offsetY: 0, blur: 0, color: '#00000000', inset: false },
        },
      ),
      shape(
        'forecast-card-top',
        'نوار روز',
        tf(14, 14, 268, 66),
        {
          kind: 'radial',
          center: { x: 0.5, y: 0.5 },
          radius: 135,
          stops: [
            { at: 0, color: '#075985E6' },
            { at: 1, color: '#0F766E00' },
          ],
        },
        1,
        {
          radius: 17,
          stroke: { color: '#CFFAFE3D', width: 0 },
        },
      ),
      text('forecast-day', 'روز', 'امروز', tf(24, 19, 248, 56), FAM, 30, 800, PALETTE.white, 2, {
        align: 'center',
      }),
      ...weatherIconElements('forecast-icon', 'weatherType', 58, 86, 180, 2),
      text(
        'forecast-condition',
        'وضعیت',
        'آفتابی',
        tf(24, 252, 248, 56),
        FAM,
        28,
        700,
        PALETTE.mist,
        2,
        {
          align: 'center',
        },
      ),
      text('forecast-high', 'بیشینه', '۲۲', tf(127, 320, 96, 80), FAM, 52, 800, '#F43358', 2, {
        align: 'end',
        direction: 'ltr',
      }),
      text(
        'forecast-high-degree',
        'درجهٔ بیشینه',
        '°',
        tf(225, 326, 24, 36),
        FAM,
        26,
        600,
        '#F43358',
        2,
        {
          align: 'start',
          direction: 'ltr',
        },
      ),
      text('forecast-low', 'کمینه', '۱۲', tf(0, 320, 96, 80), FAM, 52, 800, '#3C8DEA', 2, {
        align: 'end',
        direction: 'ltr',
      }),
      text(
        'forecast-low-degree',
        'درجهٔ کمینه',
        '°',
        tf(98, 326, 24, 36),
        FAM,
        26,
        600,
        '#3C8DEA',
        2,
        {
          align: 'start',
          direction: 'ltr',
        },
      ),
      text(
        'forecast-high-label',
        'برچسب بیشینه',
        'بیشینه',
        tf(151, 402, 96, 38),
        FAM,
        20,
        500,
        '#DDEBF2',
        2,
        { align: 'center' },
      ),
      text(
        'forecast-low-label',
        'برچسب کمینه',
        'کمینه',
        tf(24, 402, 96, 38),
        FAM,
        20,
        500,
        '#9FC6D7',
        2,
        { align: 'center' },
      ),
    ]),
  ],
  fields: [
    { id: 'day', label: 'روز', required: true, type: 'text', default: 'امروز', direction: 'rtl' },
    weatherTypeField(),
    {
      id: 'high',
      label: 'بیشینه',
      required: true,
      type: 'number',
      default: 22,
      min: -50,
      max: 60,
      unit: '°',
      digits: 'persian',
    },
    {
      id: 'low',
      label: 'کمینه',
      required: true,
      type: 'number',
      default: 12,
      min: -50,
      max: 60,
      unit: '°',
      digits: 'persian',
    },
  ],
  bindings: [
    { fieldId: 'day', target: { kind: 'text', elementId: 'forecast-day' } },
    { fieldId: 'weatherType', target: { kind: 'text', elementId: 'forecast-condition' } },
    { fieldId: 'high', target: { kind: 'text', elementId: 'forecast-high' } },
    { fieldId: 'low', target: { kind: 'text', elementId: 'forecast-low' } },
  ],
};

const children: Element[] = [
  image(
    'forecast-photo-bg',
    'پس‌زمینهٔ جوی',
    'weather-atmosphere',
    tf(-80, -90, 1920, 1080),
    0,
    'cover',
    {
      animation: anim({
        opacity: track(kfLinear(130, 1), kfLinear(160, 0)),
      }),
    },
  ),
  shape(
    'forecast-bg',
    'پنل شیشه‌ای',
    tf(18, 18, 1724, 864),
    gradient(145, '#04111ED6', '#0B3150C2'),
    1,
    {
      radius: 34,
      opacity: 0.8,
      stroke: { color: '#67E8F955', width: 2 },
      shadow: { offsetX: 0, offsetY: 24, blur: 58, color: '#00000099' },
      animation: anim({
        opacity: track(kfLinear(130, 0.8), kfLinear(160, 0)),
      }),
    },
  ),
  shape(
    'forecast-title-ribbon',
    'نوار عنوان',
    tf(90, 42, 1570, 102),
    {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 433,
      stops: [
        { at: 0, color: '#1785BFD5' },
        { at: 1, color: '#0F766E00' },
      ],
    },
    2,
    {
      radius: 26,
      stroke: { color: '#CFFAFE44', width: 0 },
      animation: forecastHeaderReveal(0, [
        { frame: 0, y: 62 },
        { frame: 20, y: 42 },
        { frame: 100, y: 42 },
        { frame: 130, y: 58 },
      ]),
    },
  ),
  text('forecast-title', 'عنوان', TITLE, tf(270, 52, 1210, 80), FAM, 42, 900, PALETTE.white, 3, {
    align: 'center',
    animation: forecastHeaderReveal(4, [
      { frame: 4, y: 72 },
      { frame: 20, y: 52 },
      { frame: 100, y: 52 },
      { frame: 130, y: 68 },
    ]),
  }),
  {
    id: 'forecast-repeater',
    name: 'روزهای پیش‌بینی',
    type: 'repeater',
    compositionId: CARD_COMP,
    transform: tf(90, 236, 1580, 460),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    direction: 'row',
    flow: 'rtl',
    gap: 25,
    maxItems: 5,
    itemEntrance: 'fade-left',
    itemExit: 'fade-right',
    itemTransitionMs: 1000,
    itemStaggerMs: 200,
    items: forecast,
  } as Element,
  shape(
    'forecast-footer-bg',
    'نوار پایانی',
    tf(90, 772, 1580, 70),
    gradient(90, '#071A2DE6', '#123E5BD9'),
    2,
    {
      radius: 18,
      stroke: { color: '#67E8F933', width: 1 },
      animation: anim({
        opacity: track(kfLinear(105, 1), kfLinear(130, 0)),
      }),
    },
  ),
  text(
    'forecast-footer',
    'به‌روزرسانی',
    'آخرین به‌روزرسانی: امروز، ساعت ۱۸:۰۰',
    tf(120, 780, 1520, 54),
    FAM,
    23,
    500,
    PALETTE.mist,
    3,
    {
      align: 'center',
      animation: anim({
        opacity: track(kfLinear(105, 1), kfLinear(130, 0)),
      }),
    },
  ),
];

export const iranWeatherForecastScene = galleryScene({
  id: 'iran-weather-forecast',
  name: 'پیش‌بینی چندروزهٔ هوا',
  description:
    'پیش‌بینی امروز و چهار روز آینده در یک صفحه با Repeater افقی و ورودی‌های عددی محدودشده.',
  templateType: 'fullscreen',
  direct: true,
  lifecycle: { outPoint: 100 },
  entryPlayout: {
    mode: 'auto-out',
    holdSource: 'timed',
    holdBehavior: 'freeze',
    holdMs: 10_000,
  },
  fontFamily: FAM,
  onAirId: 'comp-iran-weather-forecast-onair',
  onAirName: 'پیش‌بینی هوا (روی آنتن)',
  onAirSize: { width: 1760, height: 900 },
  onAirPosition: { x: 80, y: 90 },
  children,
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
    {
      id: 'forecast',
      label: 'پیش‌بینی روزها',
      required: true,
      type: 'list',
      default: forecast,
      digits: 'persian',
      allowFileSource: true,
      fileSource: { inputMode: 'operator-choice', format: 'csv' },
      maxItems: 5,
    },
  ],
  bindings: [
    { fieldId: 'title', target: { kind: 'text', elementId: 'forecast-title' } },
    { fieldId: 'forecast', target: { kind: 'repeater-items', elementId: 'forecast-repeater' } },
  ],
  extraCompositions: [card],
});
