import type { Element, Scene } from '@cg/shared-schema';
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

const FAM = 'asset-iran-premier-league-vazir';
const TITLE = 'جدول لیگ برتر ایران';
const ROW_COMP = 'comp-iran-premier-league-row';

const teams = [
  ['پرسپولیس تهران', 10, 6, 2, 2, 13, 20],
  ['سپاهان اصفهان', 10, 6, 2, 2, 11, 20],
  ['استقلال تهران', 10, 5, 5, 0, 9, 20],
  ['تراکتور تبریز', 10, 6, 2, 2, 7, 20],
  ['فولاد خوزستان', 10, 5, 4, 1, 5, 19],
  ['آلومینیوم اراک', 10, 3, 5, 2, 3, 14],
  ['خیبر خرم‌آباد', 10, 3, 5, 2, 2, 14],
  ['فجر سپاسی شیراز', 10, 3, 5, 2, -2, 14],
  ['گل‌گهر سیرجان', 10, 4, 1, 5, 1, 13],
  ['چادرملو اردکان', 10, 3, 4, 3, -4, 13],
  ['نساجی مازندران', 10, 2, 5, 3, -2, 11],
  ['ملوان بندر انزلی', 10, 3, 3, 4, -1, 10],
  ['پیکان تهران', 10, 2, 4, 4, -3, 10],
  ['استقلال خوزستان', 10, 2, 3, 5, -7, 9],
  ['ذوب‌آهن اصفهان', 10, 1, 5, 4, -4, 8],
  ['شمس‌آذر قزوین', 10, 1, 4, 5, -5, 7],
  ['صنعت نفت آبادان', 10, 1, 4, 5, -10, 7],
  ['مس شهر بابک', 10, 0, 5, 5, -13, 5],
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
  shape(
    'az-row-bg',
    'پس‌زمینه ردیف',
    tf(0, 0, 1660, 42),
    gradient(90, '#071B30F2', '#103755E8'),
    0,
    {
      radius: 9,
      stroke: { color: '#3A668333', width: 1 },
    },
  ),
  shape('az-row-accent-line', 'خط تأکید', tf(1589, 8, 3, 26), solid('#22D3EE'), 1, {
    radius: 2,
  }),
  shape('az-row-accent', 'نشان رتبه', tf(1602, 5, 46, 32), gradient(90, '#0891B2', '#2563EB'), 1, {
    radius: 8,
    shadow: { offsetX: 0, offsetY: 4, blur: 10, color: '#22D3EE30' },
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
  text('az-points', 'امتیاز', '۳۸', tf(38, 4, 242, 34), FAM, 25, 900, '#FFF3C4', 2, {
    align: 'center',
    direction: 'ltr',
    backgroundColor: '#8A5A1299',
    padding: { top: 2, right: 8, bottom: 2, left: 8 },
  }),
];

const rowComposition: NonNullable<Scene['compositions']>[number] = {
  id: ROW_COMP,
  name: 'ردیف جدول لیگ برتر',
  resolution: { width: 1660, height: 42 },
  frameRange: { in: 0, out: 140 },
  lifecycle: { outPoint: 100, contentStart: 20 },
  playout: { mode: 'manual', holdSource: 'timed' },
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
      default: 'پرسپولیس تهران',
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
  image(
    'az-stadium-bg',
    'پس‌زمینه ورزشگاه',
    'iran-premier-league-stadium',
    tf(-80, -60, 1920, 1080),
    0,
    'cover',
  ),
  shape('az-bg-scrim', 'لایه خوانایی', tf(-80, -60, 1920, 1080), solid('#020A16'), 1, {
    opacity: 0.34,
  }),
  shape('az-bg', 'پنل شیشه‌ای', tf(24, 20, 1712, 924), gradient(135, '#061322D9', '#0A2942C7'), 2, {
    radius: 28,
    stroke: { color: '#55C7E855', width: 2 },
    shadow: { offsetX: 0, offsetY: 20, blur: 54, color: '#00000099' },
  }),
  shape('az-kicker', 'نشان مسابقات', tf(1390, 42, 284, 58), gradient(90, '#0E7490', '#1D4ED8'), 3, {
    radius: 16,
    animation: reveal(0),
  }),
  text(
    'az-kicker-label',
    'نشان لیگ',
    'فوتبال ایران',
    tf(1410, 46, 244, 50),
    FAM,
    22,
    800,
    '#CFFAFE',
    4,
    {
      align: 'center',
      animation: reveal(2),
    },
  ),
  shape(
    'az-title-glow',
    'نوار عنوان',
    tf(58, 42, 1298, 58),
    gradient(90, '#B7791F', '#E2B24C'),
    3,
    {
      radius: 16,
      animation: reveal(0),
    },
  ),
  text('az-title', 'عنوان جدول', TITLE, tf(90, 44, 1230, 54), FAM, 35, 900, '#081526', 4, {
    align: 'start',
    animation: reveal(4),
  }),
  shape(
    'az-head-bg',
    'پس‌زمینه سرستون',
    tf(50, 120, 1660, 52),
    gradient(90, '#071A2DF2', '#123E5BEA'),
    3,
    {
      radius: 10,
      stroke: { color: '#67E8F933', width: 1 },
    },
  ),
  ...headerLabels.map(([label, x, width], index) =>
    text(
      `az-head-${index}`,
      `سرستون ${label}`,
      label,
      tf(x + 50, 120, width, 52),
      FAM,
      20,
      700,
      PALETTE.mist,
      4,
      { align: 'center' },
    ),
  ),
  {
    id: 'az-table-repeater',
    name: 'ردیف‌های جدول',
    type: 'repeater',
    compositionId: ROW_COMP,
    transform: tf(50, 180, 1660, 774),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 5,
    direction: 'column',
    flow: 'rtl',
    gap: 1,
    maxItems: 18,
    itemEntrance: 'fade-right',
    itemTransitionMs: 400,
    itemStaggerMs: 70,
    items: rows,
  } as Element,
];

export const iranPremierLeagueScene = galleryScene({
  id: 'iran-premier-league',
  name: 'جدول لیگ برتر ایران',
  description:
    'جدول تک‌صفحه‌ای ۱۸ تیم لیگ برتر با ورود مرحله‌ای ردیف‌ها، اعداد فارسی و ورودی ساختاریافتهٔ قابل اتصال به Excel در CG Control.',
  templateType: 'fullscreen',
  direct: true,
  fontFamily: FAM,
  onAirId: 'comp-iran-premier-league-onair',
  onAirName: 'جدول لیگ برتر',
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
