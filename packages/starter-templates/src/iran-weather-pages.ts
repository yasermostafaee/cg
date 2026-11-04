import type { Element, Scene } from '@cg/shared-schema';
import {
  galleryScene,
  gradient,
  layer,
  PALETTE,
  reveal,
  shape,
  solid,
  text,
  tf,
} from './gallery-helpers.js';

const FAM = 'asset-iran-weather-pages-vazir';
const TITLE = 'دمای مراکز استان‌های ایران';
const CARD_COMP = 'comp-iran-weather-city-row';
const PAGE_COMP = 'comp-iran-weather-page';

const cities = [
  ['تهران', 18, 'صاف', '☀'],
  ['اراک', 14, 'کمی ابری', '☁'],
  ['اردبیل', 8, 'بارانی', '☂'],
  ['ارومیه', 10, 'نیمه‌ابری', '☁'],
  ['اصفهان', 17, 'صاف', '☀'],
  ['اهواز', 28, 'صاف', '☀'],
  ['ایلام', 16, 'بارانی', '☂'],
  ['بجنورد', 11, 'ابری', '☁'],
  ['بندرعباس', 30, 'شرجی', '≈'],
  ['بوشهر', 27, 'کمی ابری', '☁'],
  ['بیرجند', 15, 'صاف', '☀'],
  ['تبریز', 9, 'نیمه‌ابری', '☁'],
  ['خرم‌آباد', 16, 'بارانی', '☂'],
  ['رشت', 13, 'بارانی', '☂'],
  ['زاهدان', 20, 'صاف', '☀'],
  ['زنجان', 7, 'ابری', '☁'],
  ['ساری', 15, 'بارانی', '☂'],
  ['سمنان', 16, 'صاف', '☀'],
  ['سنندج', 10, 'ابری', '☁'],
  ['شهرکرد', 5, 'برفی', '❄'],
  ['شیراز', 19, 'صاف', '☀'],
  ['قزوین', 13, 'نیمه‌ابری', '☁'],
  ['قم', 18, 'صاف', '☀'],
  ['کرج', 16, 'کمی ابری', '☁'],
  ['کرمان', 18, 'صاف', '☀'],
  ['کرمانشاه', 13, 'بارانی', '☂'],
  ['گرگان', 14, 'بارانی', '☂'],
  ['مشهد', 12, 'ابری', '☁'],
  ['همدان', 7, 'برفی', '❄'],
  ['یاسوج', 11, 'بارانی', '☂'],
  ['یزد', 19, 'صاف', '☀'],
] as const;

const cityRows = cities.map(([city, temp, condition, icon], index) => ({
  id: `city-${index + 1}`,
  city,
  temp,
  condition,
  icon,
}));

const cityCard: NonNullable<Scene['compositions']>[number] = {
  id: CARD_COMP,
  name: 'ردیف آب‌وهوای شهر',
  resolution: { width: 1600, height: 72 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100 },
  playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'freeze' },
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
        'صاف',
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
      text(
        'weather-icon',
        'نماد آب‌وهوا',
        '☀',
        tf(1450, 5, 100, 62),
        'Segoe UI Symbol',
        42,
        400,
        '#FDE68A',
        2,
        {
          align: 'center',
          direction: 'ltr',
        },
      ),
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
    {
      id: 'condition',
      label: 'وضعیت',
      required: true,
      type: 'text',
      default: 'صاف',
      direction: 'rtl',
    },
    { id: 'icon', label: 'نماد', required: true, type: 'text', default: '☀', direction: 'ltr' },
  ],
  bindings: [
    { fieldId: 'city', target: { kind: 'text', elementId: 'weather-city' } },
    { fieldId: 'temp', target: { kind: 'text', elementId: 'weather-temp' } },
    { fieldId: 'condition', target: { kind: 'text', elementId: 'weather-condition' } },
    { fieldId: 'icon', target: { kind: 'text', elementId: 'weather-icon' } },
  ],
};

const pageComposition: NonNullable<Scene['compositions']>[number] = {
  id: PAGE_COMP,
  name: 'صفحه شهرها',
  resolution: { width: 1680, height: 730 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100 },
  playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'freeze' },
  editorBackdrop: 'transparent',
  layers: [
    layer('weather-page-layer', 'صفحه', [
      text(
        'weather-page-title',
        'عنوان صفحه',
        'شمال و شمال‌غرب',
        tf(40, 0, 1600, 62),
        FAM,
        28,
        800,
        '#7DD3FC',
        2,
        {
          align: 'start',
        },
      ),
      {
        id: 'weather-page-repeater',
        name: 'فهرست شهرها',
        type: 'repeater',
        compositionId: CARD_COMP,
        transform: tf(40, 72, 1600, 648),
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 2,
        direction: 'column',
        flow: 'rtl',
        gap: 9,
        maxItems: 8,
        items: cityRows.slice(0, 8),
      } as Element,
    ]),
  ],
  fields: [
    {
      id: 'pageTitle',
      label: 'عنوان صفحه',
      required: true,
      type: 'text',
      default: 'شمال و شمال‌غرب',
      direction: 'rtl',
    },
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
    { fieldId: 'pageTitle', target: { kind: 'text', elementId: 'weather-page-title' } },
    { fieldId: 'cities', target: { kind: 'repeater-items', elementId: 'weather-page-repeater' } },
  ],
};

const pageNames = ['شمال و شمال‌غرب', 'غرب و جنوب‌غرب', 'مرکز و جنوب', 'شرق و شمال‌شرق'];
const pages = Array.from({ length: 4 }, (_, index) => ({
  kind: 'composition' as const,
  id: `weather-page-${index + 1}`,
  compositionId: PAGE_COMP,
  dwellMs: 6500,
  fieldValues: {
    pageTitle: pageNames[index] ?? `صفحه ${index + 1}`,
    cities: cityRows.slice(index * 8, index * 8 + 8),
  },
}));

const children: Element[] = [
  shape(
    'weather-pages-bg',
    'پس‌زمینه',
    tf(0, 0, 1780, 960),
    gradient(140, '#061322', '#123A5D'),
    0,
    {
      radius: 30,
      stroke: { color: '#2A5977', width: 2 },
      shadow: { offsetX: 0, offsetY: 20, blur: 52, color: '#00000080' },
    },
  ),
  shape(
    'weather-pages-ribbon',
    'نوار عنوان',
    tf(40, 34, 1700, 100),
    gradient(90, '#0369A1', '#0E7490'),
    1,
    {
      radius: 22,
      animation: reveal(0),
    },
  ),
  text(
    'weather-pages-title',
    'عنوان',
    TITLE,
    tf(80, 45, 1620, 76),
    FAM,
    43,
    900,
    PALETTE.white,
    2,
    {
      align: 'center',
      animation: reveal(4),
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
    zIndex: 3,
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
    pageDataFile: 'starter-data/iran-weather-pages.json',
    defaultDwellMs: 6500,
    advance: 'auto',
    operatorSteps: true,
    transitionIn: 'fade-right',
    transitionOut: 'fade-left',
    transitionTiming: 'simultaneous',
    transitionMs: 600,
    repeat: 'infinite',
    drivesHold: false,
  } as Element,
  shape('weather-pages-footer', 'نوار پایین', tf(50, 912, 1680, 2), solid('#38BDF8'), 1),
  text(
    'weather-pages-hint',
    'راهنما',
    'صفحه‌های بعدی به‌صورت خودکار نمایش داده می‌شوند',
    tf(60, 916, 1660, 32),
    FAM,
    18,
    500,
    PALETTE.muted,
    2,
    {
      align: 'center',
    },
  ),
];

export const iranWeatherPagesScene = galleryScene({
  id: 'iran-weather-pages',
  name: 'آب‌وهوای مراکز استان‌ها',
  description:
    'نمایش چندصفحه‌ای همهٔ مراکز استان‌ها با Sequence صفحه‌ای، Repeater داخلی و مسیر دادهٔ JSON قابل Reload.',
  templateType: 'fullscreen',
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
