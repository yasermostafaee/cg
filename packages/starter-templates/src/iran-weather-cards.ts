import type { Element, Scene } from '@cg/shared-schema';
import { anim, kf, track } from './anim.js';
import {
  galleryScene,
  gradient,
  image,
  layer,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';
import { weatherTypeField, weatherIconElements } from './weather-icons.js';

const FAM = 'asset-iran-weather-cards-vazir';
const TITLE = 'دمای مراکز استان‌های ایران';
const CARD_COMP = 'comp-iran-weather-city-card';
const PAGE_COMP = 'comp-iran-weather-cards-page';
const PAGE_DWELL_MS = 6500;
const CITIES_PER_PAGE = 4;
const OUT_POINT = 100;
const END_FRAME = 160;
const WEATHER_PALETTE = {
  blue: '#2459A8',
  navy: '#102B50',
  white: '#F6F9FD',
  silver: '#CCD9EA',
  warm: '#9D554B',
} as const;

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
  name: 'کارت آب‌وهوای شهر',
  resolution: { width: 384, height: 600 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100, contentStart: 20 },
  playout: { mode: 'manual', holdSource: 'timed' },
  editorBackdrop: 'transparent',
  layers: [
    layer('weather-city-row-layer', 'شهر', [
      shape(
        'weather-row-bg',
        'کارت شهر',
        tf(0, 0, 384, 600),
        gradient(90, WEATHER_PALETTE.white, '#E4ECF5'),
        0,
        {
          radius: 8,
          stroke: { color: WEATHER_PALETTE.silver, width: 1 },
          shadow: { offsetX: 0, offsetY: 14, blur: 30, color: '#102B5040' },
        },
      ),
      image(
        'weather-card-atmosphere',
        'تصویر آسمان',
        'weather-broadcast-sky',
        tf(0, 80, 384, 274),
        1,
      ),
      shape(
        'weather-row-sky',
        'پوشش تصویر آسمان',
        tf(0, 80, 384, 274),
        gradient(180, '#2459A866', '#102B50C7'),
        1,
      ),
      shape(
        'weather-row-divider',
        'خط جداکننده',
        tf(32, 428, 320, 1),
        solid(WEATHER_PALETTE.silver),
        1,
      ),
      shape(
        'weather-temp-pill',
        'نشان رنگ دما',
        tf(32, 572, 320, 4),
        solid(WEATHER_PALETTE.blue),
        1,
      ),
      {
        ...text(
          'weather-temp',
          'دما',
          '۱۸',
          tf(54, 438, 180, 120),
          FAM,
          86,
          800,
          WEATHER_PALETTE.navy,
          2,
          { align: 'end', direction: 'ltr' },
        ),
        valueRules: {
          input: { kind: 'field', fieldId: 'temp' },
          rules: [
            {
              condition: { comparator: '>=', value: 25 },
              effect: {
                elementId: 'weather-temp-pill',
                property: 'fill',
                value: WEATHER_PALETTE.warm,
              },
            },
            {
              condition: { comparator: '>=', value: 25 },
              effect: {
                elementId: 'weather-temp',
                property: 'textColor',
                value: WEATHER_PALETTE.warm,
              },
            },
            {
              condition: { comparator: '<=', value: 5 },
              effect: {
                elementId: 'weather-temp-pill',
                property: 'fill',
                value: WEATHER_PALETTE.blue,
              },
            },
            {
              condition: { comparator: '<=', value: 5 },
              effect: {
                elementId: 'weather-temp',
                property: 'textColor',
                value: WEATHER_PALETTE.blue,
              },
            },
          ],
        },
      } as Element,
      text(
        'weather-degree',
        'درجه',
        '°',
        tf(237, 450, 40, 60),
        FAM,
        42,
        700,
        WEATHER_PALETTE.navy,
        3,
        { align: 'start', direction: 'ltr' },
      ),
      text(
        'weather-condition',
        'وضعیت',
        'آفتابی',
        tf(24, 366, 336, 62),
        FAM,
        30,
        600,
        WEATHER_PALETTE.navy,
        2,
        {
          align: 'center',
        },
      ),
      text(
        'weather-city',
        'شهر',
        'تهران',
        tf(20, 8, 344, 64),
        FAM,
        38,
        800,
        WEATHER_PALETTE.navy,
        2,
        { align: 'center' },
      ),
      ...weatherIconElements('weather-icon', 'weatherType', 77, 102, 230, 2),
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
        transform: tf(36, 62, 1608, 600),
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 2,
        direction: 'row',
        flow: 'rtl',
        gap: 24,
        maxItems: CITIES_PER_PAGE,
        itemEntrance: 'fade-right',
        itemExit: 'fade-left',
        itemTransitionMs: 400,
        itemStaggerMs: 90,
        items: cityRows.slice(0, CITIES_PER_PAGE),
      } as Element,
    ]),
  ],
  fields: [
    {
      id: 'cities',
      label: 'شهرها',
      required: true,
      type: 'list',
      default: cityRows.slice(0, CITIES_PER_PAGE),
      digits: 'persian',
      allowFileSource: true,
      fileSource: { inputMode: 'operator-choice', format: 'csv' },
      maxItems: CITIES_PER_PAGE,
    },
  ],
  bindings: [
    { fieldId: 'cities', target: { kind: 'repeater-items', elementId: 'weather-page-repeater' } },
  ],
};

const pages = Array.from({ length: Math.ceil(cityRows.length / CITIES_PER_PAGE) }, (_, index) => ({
  kind: 'composition' as const,
  id: `weather-page-${index + 1}`,
  compositionId: PAGE_COMP,
  dwellMs: PAGE_DWELL_MS,
  fieldValues: {
    cities: cityRows.slice(index * CITIES_PER_PAGE, (index + 1) * CITIES_PER_PAGE),
  },
}));

const children: Element[] = [
  {
    ...image(
      'weather-pages-photo-bg',
      'پس‌زمینهٔ جوی',
      'weather-broadcast-sky',
      tf(-70, -60, 1920, 1080),
      0,
      'cover',
    ),
    animation: backdropFade(),
  },
  shape(
    'weather-pages-bg',
    'پوشش آبی',
    tf(18, 18, 1744, 924),
    gradient(140, '#102B5033', '#102B5080'),
    1,
    {
      radius: 10,
      animation: backdropFade(),
    },
  ),
  shape(
    'weather-pages-ribbon',
    'نوار عنوان',
    tf(385, 34, 1355, 100),
    gradient(90, WEATHER_PALETTE.blue, WEATHER_PALETTE.navy),
    2,
    {
      radius: 8,
      stroke: { color: '#CCD9EA55', width: 1 },
      animation: reveal(0, 34),
    },
  ),
  text(
    'weather-pages-title',
    'عنوان',
    TITLE,
    tf(430, 45, 1260, 76),
    FAM,
    44,
    800,
    WEATHER_PALETTE.white,
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
    solid(WEATHER_PALETTE.white),
    2,
    {
      radius: 8,
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
    WEATHER_PALETTE.navy,
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
    color: WEATHER_PALETTE.white,
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
  shape('weather-pages-footer', 'نوار پایین', tf(50, 912, 1680, 2), solid('#CCD9EA66'), 2, {
    animation: backdropFade(),
  }),
];

export const iranWeatherCardsScene = galleryScene({
  id: 'iran-weather-cards',
  name: 'آب‌وهوای شهرها — کارت‌های تصویری',
  description:
    'چهار کارت تصویری بزرگ در هر صفحه، با آیکون متحرک، دمای فعلی و نمایش الفبایی همهٔ مراکز استان‌ها.',
  templateType: 'fullscreen',
  direct: true,
  entryOut: END_FRAME,
  outPoint: OUT_POINT,
  entryPlayout: { mode: 'auto-out', holdSource: 'content-driven' },
  fontFamily: FAM,
  onAirId: 'comp-iran-weather-cards-onair',
  onAirName: 'کارت‌های تصویری شهرها (روی آنتن)',
  onAirSize: { width: 1780, height: 960 },
  onAirPosition: { x: 70, y: 60 },
  children,
  fields: [
    { id: 'title', label: 'عنوان', required: true, type: 'text', default: TITLE, direction: 'rtl' },
  ],
  bindings: [{ fieldId: 'title', target: { kind: 'text', elementId: 'weather-pages-title' } }],
  extraCompositions: [cityCard, pageComposition],
});
