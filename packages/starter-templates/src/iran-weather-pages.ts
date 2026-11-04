import type { Element, Scene } from '@cg/shared-schema';
import { anim, kf, track } from './anim.js';
import {
  galleryScene,
  gradient,
  image,
  layer,
  PALETTE,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';
import { weatherTypeField, weatherIconElements } from './weather-icons.js';

const FAM = 'asset-iran-weather-pages-vazir';
const TITLE = 'دمای مراکز استان‌های ایران';
const CARD_COMP = 'comp-iran-weather-city-row';
const PAGE_COMP = 'comp-iran-weather-page';
const PAGE_DWELL_MS = 6500;
const OUT_POINT = 100;
const END_FRAME = 160;

const backdropFade = (opacity = 1): NonNullable<Element['animation']> =>
  anim({
    opacity: track(kf(0, 0), kf(16, opacity), kf(OUT_POINT, opacity), kf(END_FRAME, 0)),
  });

const cities = [
  ['اراک', 14, 'کمی ابری', 1],
  ['اردبیل', 8, 'بارانی', 2],
  ['ارومیه', 10, 'نیمه‌ابری', 1],
  ['اصفهان', 17, 'آفتابی', 0],
  ['اهواز', 28, 'آفتابی', 0],
  ['ایلام', 16, 'بارانی', 2],
  ['بجنورد', 11, 'ابری', 1],
  ['بندرعباس', 30, 'آفتابی', 0],
  ['بوشهر', 27, 'کمی ابری', 1],
  ['بیرجند', 15, 'آفتابی', 0],
  ['تبریز', 9, 'نیمه‌ابری', 1],
  ['تهران', 18, 'آفتابی', 0],
  ['خرم‌آباد', 16, 'بارانی', 2],
  ['رشت', 13, 'بارانی', 2],
  ['زاهدان', 20, 'آفتابی', 0],
  ['زنجان', 7, 'ابری', 1],
  ['ساری', 15, 'بارانی', 2],
  ['سمنان', 16, 'آفتابی', 0],
  ['سنندج', 10, 'ابری', 1],
  ['شهرکرد', 5, 'برفی', 3],
  ['شیراز', 19, 'آفتابی', 0],
  ['قزوین', 13, 'نیمه‌ابری', 1],
  ['قم', 18, 'آفتابی', 0],
  ['کرج', 16, 'کمی ابری', 1],
  ['کرمان', 18, 'آفتابی', 0],
  ['کرمانشاه', 13, 'بارانی', 2],
  ['گرگان', 14, 'بارانی', 2],
  ['مشهد', 12, 'ابری', 1],
  ['همدان', 7, 'برفی', 3],
  ['یاسوج', 11, 'بارانی', 2],
  ['یزد', 19, 'آفتابی', 0],
] as const;

const cityRows = cities.map(([city, temp, condition], index) => ({
  id: `city-${index + 1}`,
  city,
  temp,
  weatherType: condition === 'کمی ابری' ? 'نیمه‌ابری' : condition,
}));

const cityCard: NonNullable<Scene['compositions']>[number] = {
  id: CARD_COMP,
  name: 'ردیف آب‌وهوای شهر',
  resolution: { width: 1600, height: 72 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100, contentStart: 20 },
  playout: { mode: 'manual', holdSource: 'timed' },
  editorBackdrop: 'transparent',
  layers: [
    layer('weather-city-row-layer', 'شهر', [
      shape(
        'weather-row-bg',
        'کارت شهر',
        tf(0, 0, 1600, 72),
        gradient(90, '#0A2741E6', '#123D5CE6'),
        0,
        {
          radius: 14,
          stroke: { color: '#2C5B78', width: 1 },
        },
      ),
      shape('weather-temp-pill', 'پس‌زمینه دما', tf(42, 10, 205, 52), solid('#D97706'), 1, {
        radius: 12,
      }),
      {
        ...text('weather-temp', 'دما', '۱۸', tf(62, 8, 150, 56), FAM, 30, 900, PALETTE.white, 2, {
          align: 'center',
          direction: 'ltr',
        }),
        valueRules: {
          input: { kind: 'field', fieldId: 'temp' },
          rules: [
            {
              condition: { comparator: '>=', value: 25 },
              effect: { elementId: 'weather-temp-pill', property: 'fill', value: '#DC2626' },
            },
            {
              condition: { comparator: '>=', value: 25 },
              effect: { elementId: 'weather-temp', property: 'textColor', value: '#FFFFFF' },
            },
            {
              condition: { comparator: '<=', value: 5 },
              effect: { elementId: 'weather-temp-pill', property: 'fill', value: '#0369A1' },
            },
            {
              condition: { comparator: '<=', value: 5 },
              effect: { elementId: 'weather-temp', property: 'textColor', value: '#E0F2FE' },
            },
          ],
        },
      } as Element,
      text('weather-degree', 'درجه', '°', tf(194, 7, 34, 56), FAM, 27, 700, PALETTE.white, 3, {
        align: 'center',
        direction: 'ltr',
      }),
      text(
        'weather-condition',
        'وضعیت',
        'آفتابی',
        tf(292, 8, 410, 56),
        FAM,
        27,
        600,
        PALETTE.mist,
        2,
        {
          align: 'center',
        },
      ),
      text('weather-city', 'شهر', 'تهران', tf(735, 8, 680, 56), FAM, 31, 800, PALETTE.white, 2, {
        align: 'start',
      }),
      ...weatherIconElements('weather-icon', 'weatherType', 1452, 2, 68, 2),
    ]),
  ],
  fields: [
    { id: 'city', label: 'شهر', required: true, type: 'text', default: 'تهران', direction: 'rtl' },
    {
      id: 'temp',
      label: 'دما',
      required: true,
      type: 'number',
      default: 18,
      min: -40,
      max: 60,
      unit: '°',
      digits: 'persian',
    },
    weatherTypeField(),
  ],
  bindings: [
    { fieldId: 'city', target: { kind: 'text', elementId: 'weather-city' } },
    { fieldId: 'temp', target: { kind: 'text', elementId: 'weather-temp' } },
    { fieldId: 'weatherType', target: { kind: 'text', elementId: 'weather-condition' } },
  ],
};

const pageComposition: NonNullable<Scene['compositions']>[number] = {
  id: PAGE_COMP,
  name: 'صفحه شهرها',
  resolution: { width: 1680, height: 730 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100, contentStart: 20 },
  playout: { mode: 'manual', holdSource: 'timed' },
  editorBackdrop: 'transparent',
  layers: [
    layer('weather-page-layer', 'صفحه', [
      {
        id: 'weather-page-repeater',
        name: 'فهرست شهرها',
        type: 'repeater',
        compositionId: CARD_COMP,
        transform: tf(40, 36, 1600, 648),
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 2,
        direction: 'column',
        flow: 'rtl',
        gap: 9,
        maxItems: 8,
        itemEntrance: 'fade-right',
        itemExit: 'fade-left',
        itemTransitionMs: 400,
        itemStaggerMs: 90,
        items: cityRows.slice(0, 8),
      } as Element,
    ]),
  ],
  fields: [
    {
      id: 'cities',
      label: 'شهرها',
      required: true,
      type: 'list',
      default: cityRows.slice(0, 8),
      digits: 'persian',
      allowFileSource: true,
      fileSource: { inputMode: 'operator-choice', format: 'csv' },
      maxItems: 8,
    },
  ],
  bindings: [
    { fieldId: 'cities', target: { kind: 'repeater-items', elementId: 'weather-page-repeater' } },
  ],
};

const pages = Array.from({ length: 4 }, (_, index) => ({
  kind: 'composition' as const,
  id: `weather-page-${index + 1}`,
  compositionId: PAGE_COMP,
  dwellMs: PAGE_DWELL_MS,
  fieldValues: {
    cities: cityRows.slice(index * 8, index * 8 + 8),
  },
}));

const children: Element[] = [
  {
    ...image(
      'weather-pages-photo-bg',
      'پس‌زمینهٔ جوی',
      'weather-atmosphere',
      tf(-70, -60, 1920, 1080),
      0,
      'cover',
    ),
    animation: backdropFade(),
  },
  shape(
    'weather-pages-bg',
    'پنل شیشه‌ای',
    tf(18, 18, 1744, 924),
    gradient(140, '#03101ED9', '#0B3150C7'),
    1,
    {
      radius: 34,
      opacity: 0.78,
      animation: backdropFade(0.78),
      stroke: { color: '#67E8F955', width: 2 },
      shadow: { offsetX: 0, offsetY: 24, blur: 60, color: '#00000099' },
    },
  ),
  shape(
    'weather-pages-ribbon',
    'نوار عنوان',
    tf(385, 34, 1355, 100),
    gradient(90, '#075985DD', '#0E7490DD'),
    2,
    {
      radius: 26,
      stroke: { color: '#CFFAFE44', width: 1 },
      animation: reveal(0, 34),
    },
  ),
  text(
    'weather-pages-title',
    'عنوان',
    TITLE,
    tf(430, 45, 1260, 76),
    FAM,
    43,
    900,
    PALETTE.white,
    3,
    {
      align: 'start',
      animation: reveal(4, 45),
    },
  ),
  shape(
    'weather-pages-mark',
    'نشان هواشناسی',
    tf(40, 34, 315, 100),
    gradient(135, '#D97706', '#FBBF24'),
    2,
    {
      radius: 26,
      shadow: { offsetX: 0, offsetY: 12, blur: 28, color: '#F59E0B30' },
      animation: reveal(2, 34),
    },
  ),
  text(
    'weather-pages-mark-text',
    'عنوان کوتاه',
    'هواشناسی',
    tf(65, 44, 265, 78),
    FAM,
    30,
    900,
    '#172033',
    3,
    {
      align: 'center',
      animation: reveal(6, 44),
    },
  ),
  {
    id: 'weather-pages-sequence',
    name: 'صفحات شهرها',
    type: 'sequence',
    transform: tf(50, 170, 1680, 730),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    font: {
      family: FAM,
      weight: 600,
      style: 'normal',
      size: 28,
      lineHeight: 1.35,
      letterSpacing: 0,
    },
    color: PALETTE.white,
    align: 'start',
    verticalAlign: 'middle',
    direction: 'rtl',
    items: pages,
    defaultDwellMs: PAGE_DWELL_MS,
    advance: 'auto',
    operatorSteps: true,
    transitionIn: 'fade-right',
    transitionOut: 'fade-left',
    transitionTiming: 'simultaneous',
    transitionMs: 600,
    repeat: 1,
    drivesHold: true,
  } as Element,
  shape('weather-pages-footer', 'نوار پایین', tf(50, 912, 1680, 2), solid('#38BDF8'), 2, {
    animation: backdropFade(),
  }),
];

export const iranWeatherPagesScene = galleryScene({
  id: 'iran-weather-pages',
  name: 'آب‌وهوای مراکز استان‌ها',
  description:
    'نمایش چندصفحه‌ای همهٔ مراکز استان‌ها به‌ترتیب الفبای فارسی، با Sequence صفحه‌ای و Repeater داخلی.',
  templateType: 'fullscreen',
  direct: true,
  entryOut: END_FRAME,
  outPoint: OUT_POINT,
  entryPlayout: { mode: 'auto-out', holdSource: 'content-driven' },
  fontFamily: FAM,
  onAirId: 'comp-iran-weather-pages-onair',
  onAirName: 'آب‌وهوای شهرها (روی آنتن)',
  onAirSize: { width: 1780, height: 960 },
  onAirPosition: { x: 70, y: 60 },
  children,
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
  ],
  bindings: [{ fieldId: 'title', target: { kind: 'text', elementId: 'weather-pages-title' } }],
  extraCompositions: [cityCard, pageComposition],
});
