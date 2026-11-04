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

const FAM = 'asset-azadegan-table-vazir';
const TITLE = 'جدول لیگ آزادگان ایران';
const ROW_COMP = 'comp-azadegan-row';

const teams = [
  ['فجر سپاسی شیراز', 18, 11, 5, 2, 15, 38],
  ['سایپا تهران', 18, 10, 5, 3, 12, 35],
  ['پیکان تهران', 18, 9, 6, 3, 10, 33],
  ['مس کرمان', 18, 9, 4, 5, 8, 31],
  ['نفت مسجدسلیمان', 18, 8, 6, 4, 7, 30],
  ['آریو اسلامشهر', 18, 7, 7, 4, 6, 28],
  ['صنعت نفت آبادان', 18, 7, 6, 5, 5, 27],
  ['داماش گیلان', 18, 6, 7, 5, 3, 25],
  ['شهرداری نوشهر', 18, 6, 6, 6, 1, 24],
  ['مس شهر بابک', 18, 5, 8, 5, 1, 23],
  ['پارس جنوبی جم', 18, 5, 7, 6, -1, 22],
  ['نیروی زمینی تهران', 18, 5, 6, 7, -3, 21],
  ['بعثت کرمانشاه', 18, 4, 7, 7, -5, 19],
  ['شهر راز شیراز', 18, 4, 6, 8, -7, 18],
  ['نفت و گاز گچساران', 18, 3, 7, 8, -8, 16],
  ['مس سونگون', 18, 3, 6, 9, -10, 15],
  ['پالایش نفت بندرعباس', 18, 2, 6, 10, -13, 12],
  ['سپیدرود رشت', 18, 2, 4, 12, -20, 10],
] as const;

const rows = teams.map(([team, played, wins, draws, losses, diff, points], index) => ({
  id: `team-${index + 1}`,
  rank: index + 1,
  team,
  played,
  wins,
  draws,
  losses,
  diff,
  points,
}));

function numberText(id: string, name: string, value: string, x: number, width: number): Element {
  return text(id, name, value, tf(x, 0, width, 42), FAM, 23, 700, PALETTE.white, 2, {
    align: 'center',
    direction: 'ltr',
  });
}

const rowChildren: Element[] = [
  shape('az-row-bg', 'پس‌زمینه ردیف', tf(0, 0, 1660, 42), solid('#0F2B47E6'), 0, {
    radius: 8,
    stroke: { color: '#2A4A67', width: 1 },
  }),
  shape('az-row-accent', 'نشان رتبه', tf(1602, 5, 46, 32), gradient(90, '#0EA5E9', '#2563EB'), 1, {
    radius: 8,
  }),
  numberText('az-rank', 'رتبه', '۱', 1602, 46),
  text(
    'az-team',
    'نام تیم',
    'فجر سپاسی شیراز',
    tf(1110, 0, 468, 42),
    FAM,
    24,
    700,
    PALETTE.white,
    2,
    {
      align: 'start',
    },
  ),
  numberText('az-played', 'بازی', '۱۸', 958, 115),
  numberText('az-wins', 'برد', '۱۱', 810, 115),
  numberText('az-draws', 'مساوی', '۵', 662, 115),
  numberText('az-losses', 'باخت', '۲', 514, 115),
  numberText('az-diff', 'تفاضل', '۱۵', 330, 150),
  text('az-points', 'امتیاز', '۳۸', tf(38, 4, 242, 34), FAM, 25, 900, '#FDE68A', 2, {
    align: 'center',
    direction: 'ltr',
    backgroundColor: '#8A4B0FCC',
    padding: { top: 2, right: 8, bottom: 2, left: 8 },
  }),
];

const rowComposition: NonNullable<Scene['compositions']>[number] = {
  id: ROW_COMP,
  name: 'ردیف جدول آزادگان',
  resolution: { width: 1660, height: 42 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100 },
  playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'freeze' },
  editorBackdrop: 'transparent',
  layers: [layer('az-row-layer', 'ردیف', rowChildren)],
  fields: [
    {
      id: 'rank',
      label: 'رتبه',
      required: true,
      type: 'number',
      default: 1,
      min: 1,
      digits: 'persian',
    },
    {
      id: 'team',
      label: 'نام تیم',
      required: true,
      type: 'text',
      default: 'فجر سپاسی شیراز',
      direction: 'rtl',
    },
    {
      id: 'played',
      label: 'بازی',
      required: true,
      type: 'number',
      default: 18,
      min: 0,
      digits: 'persian',
    },
    {
      id: 'wins',
      label: 'برد',
      required: true,
      type: 'number',
      default: 11,
      min: 0,
      digits: 'persian',
    },
    {
      id: 'draws',
      label: 'مساوی',
      required: true,
      type: 'number',
      default: 5,
      min: 0,
      digits: 'persian',
    },
    {
      id: 'losses',
      label: 'باخت',
      required: true,
      type: 'number',
      default: 2,
      min: 0,
      digits: 'persian',
    },
    { id: 'diff', label: 'تفاضل', required: true, type: 'number', default: 15, digits: 'persian' },
    {
      id: 'points',
      label: 'امتیاز',
      required: true,
      type: 'number',
      default: 38,
      min: 0,
      digits: 'persian',
    },
  ],
  bindings: [
    { fieldId: 'rank', target: { kind: 'text', elementId: 'az-rank' } },
    { fieldId: 'team', target: { kind: 'text', elementId: 'az-team' } },
    { fieldId: 'played', target: { kind: 'text', elementId: 'az-played' } },
    { fieldId: 'wins', target: { kind: 'text', elementId: 'az-wins' } },
    { fieldId: 'draws', target: { kind: 'text', elementId: 'az-draws' } },
    { fieldId: 'losses', target: { kind: 'text', elementId: 'az-losses' } },
    { fieldId: 'diff', target: { kind: 'text', elementId: 'az-diff' } },
    { fieldId: 'points', target: { kind: 'text', elementId: 'az-points' } },
  ],
};

const headerLabels = [
  ['رتبه', 1602, 46],
  ['تیم', 1110, 468],
  ['بازی', 958, 115],
  ['برد', 810, 115],
  ['مساوی', 662, 115],
  ['باخت', 514, 115],
  ['تفاضل', 330, 150],
  ['امتیاز', 38, 242],
] as const;

const children: Element[] = [
  shape('az-bg', 'پس‌زمینه', tf(0, 0, 1760, 960), gradient(135, '#071426', '#123A5D'), 0, {
    radius: 28,
    stroke: { color: '#2A5778', width: 2 },
    shadow: { offsetX: 0, offsetY: 18, blur: 48, color: '#00000080' },
  }),
  shape(
    'az-title-glow',
    'نوار عنوان',
    tf(38, 34, 1684, 82),
    gradient(90, '#0E7490', '#1D4ED8'),
    1,
    {
      radius: 18,
      animation: reveal(0),
    },
  ),
  text('az-title', 'عنوان جدول', TITLE, tf(70, 38, 1620, 70), FAM, 39, 900, PALETTE.white, 2, {
    align: 'center',
    animation: reveal(4),
  }),
  shape('az-head-bg', 'پس‌زمینه سرستون', tf(50, 128, 1660, 46), solid('#071A2DBF'), 1, {
    radius: 10,
  }),
  ...headerLabels.map(([label, x, width], index) =>
    text(
      `az-head-${index}`,
      `سرستون ${label}`,
      label,
      tf(x + 50, 128, width, 46),
      FAM,
      20,
      700,
      PALETTE.mist,
      2,
      { align: 'center' },
    ),
  ),
  {
    id: 'az-table-repeater',
    name: 'ردیف‌های جدول',
    type: 'repeater',
    compositionId: ROW_COMP,
    transform: tf(50, 184, 1660, 774),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    direction: 'column',
    flow: 'rtl',
    gap: 1,
    maxItems: 18,
    items: rows,
  } as Element,
];

export const azadeganTableScene = galleryScene({
  id: 'azadegan-table',
  name: 'جدول لیگ آزادگان ایران',
  description:
    'جدول تک‌صفحه‌ای لیگ آزادگان با Repeater واقعی، اعداد فارسی و ورودی ساختاریافتهٔ قابل اتصال به CSV/XLSX در CG Control.',
  templateType: 'fullscreen',
  fontFamily: FAM,
  onAirId: 'comp-azadegan-table-onair',
  onAirName: 'جدول آزادگان (روی آنتن)',
  onAirSize: { width: 1760, height: 960 },
  onAirPosition: { x: 80, y: 60 },
  children,
  fields: [
    {
      id: 'title',
      label: 'عنوان جدول',
      required: true,
      type: 'text',
      default: TITLE,
      direction: 'rtl',
    },
    {
      id: 'teams',
      label: 'تیم‌ها',
      required: true,
      type: 'list',
      default: rows,
      digits: 'persian',
      allowFileSource: true,
      fileSource: { inputMode: 'operator-choice', format: 'csv' },
      maxItems: 18,
    },
  ],
  bindings: [
    { fieldId: 'title', target: { kind: 'text', elementId: 'az-title' } },
    { fieldId: 'teams', target: { kind: 'repeater-items', elementId: 'az-table-repeater' } },
  ],
  extraCompositions: [rowComposition],
});
