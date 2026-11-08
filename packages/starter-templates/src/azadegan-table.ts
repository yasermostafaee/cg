import type { Element, Scene } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';
import { galleryScene, gradient, image, layer, shape, solid, text, tf } from './gallery-helpers.js';

const FAM = 'asset-iran-premier-league-vazir';
const TITLE = 'جدول لیگ برتر ایران';
const ROW_COMP = 'comp-iran-premier-league-row';
const OUT_POINT = 110;
const END_FRAME = 200;
const IVORY = '#EEF0EB';

// The row driver completes its reverse cascade before this ordinary authored outro.
const backdropFade = (opacity = 1): NonNullable<Element['animation']> =>
  anim({
    opacity: track(kf(0, 0), kf(16, opacity), kf(OUT_POINT, opacity), kf(END_FRAME, 0)),
  });

// Preserve the owner's saved frame-84 title adjustments as ordinary editable keyframes.
const titleReveal = (
  delay: number,
  restingY: number,
  frame84Y: number,
): NonNullable<Element['animation']> =>
  anim({
    opacity: track(kf(delay, 0), kf(delay + 12, 1, EASE.outExpo), kf(116, 1), kf(138, 0)),
    'position.y': track(
      kf(delay, restingY + 20, EASE.outExpo),
      kf(delay + 16, restingY, EASE.outExpo),
      kfLinear(84, frame84Y),
      kf(116, restingY),
      kf(138, restingY + 16, EASE.inCubic),
    ),
  });

// Static teaching sample captured from the owner's Varzesh3 league page on 2026-11-04.
// Preserve its order, 18 displayed teams and Malavan's two-point deduction; never imply a live feed.
// See apps/designer/public/starters/assets/SOURCES.md for source and crest attribution.
const teams = [
  ['پرسپولیس', 11, 7, 2, 2, 14, 23, 'zwlji1u1'],
  ['سپاهان', 11, 7, 2, 2, 12, 23, '01150477'],
  ['فولاد', 11, 6, 4, 1, 6, 22, 'onhagqfn'],
  ['استقلال', 10, 5, 5, 0, 9, 20, 'owb2e51r'],
  ['تراکتور', 10, 6, 2, 2, 7, 20, '0bi4mf3k'],
  ['چادرملو اردکان', 11, 4, 4, 3, -3, 16, 'rl424jhr'],
  ['آلومینیوم اراک', 11, 3, 5, 3, 2, 14, 'mwsub33j'],
  ['خیبر خرم‌آباد', 11, 3, 5, 3, 1, 14, 'li0uxnme'],
  ['فجر سپاسی', 10, 3, 5, 2, -2, 14, '01630563'],
  ['گل‌گهر', 10, 4, 1, 5, 1, 13, '01437525'],
  ['پیکان', 11, 3, 4, 4, -1, 13, 'zodrzjds'],
  ['نساجی مازندران', 11, 2, 5, 4, -3, 11, '01323791'],
  ['ملوان', 11, 3, 3, 5, -2, 10, 'uz3ygqmp'],
  ['استقلال خوزستان', 11, 2, 4, 5, -7, 10, '01398462'],
  ['ذوب‌آهن', 11, 1, 6, 4, -4, 9, 'wkrls0s5'],
  ['شمس‌آذر قزوین', 10, 1, 4, 5, -5, 7, '0vd40qhy'],
  ['صنعت نفت آبادان', 10, 1, 4, 5, -10, 7, '01150464'],
  ['مس شهر بابک', 11, 0, 5, 6, -15, 5, 'gzueny5i'],
] as const;

export const LEAGUE_LOGOS = teams.map((team) => ({ name: team[0], code: team[7] }));

const rows = teams.map(([team, played, wins, draws, losses, diff, points, logo], index) => ({
  id: `team-${index + 1}`,
  team,
  logo: { assetId: `league-${logo}` },
  played,
  wins,
  draws,
  losses,
  diff,
  points,
}));

function numberText(id: string, name: string, value: string, x: number, width: number): Element {
  return text(id, name, value, tf(x, 0, width, 42), FAM, 23, 700, IVORY, 2, {
    align: 'center',
    direction: 'ltr',
  });
}

const rowChildren: Element[] = [
  shape('az-row-bg', 'پس‌زمینه ردیف', tf(0, 0, 1660, 42), solid('#00000000'), 0, {
    radius: 9,
    stroke: { color: '#A9B5C61F', width: 1 },
  }),
  {
    ...numberText('az-rank', 'رتبه — شماره خودکار ردیف', '۱', 1602, 46),
    rowNumber: true,
    digits: 'persian',
  } as Element,
  image('az-team-logo', 'لوگوی تیم', 'league-zwlji1u1', tf(1540, 2, 38, 38), 2, 'contain'),
  text('az-team', 'نام تیم', 'پرسپولیس', tf(1110, 0, 410, 42), FAM, 24, 700, IVORY, 2, {
    align: 'start',
  }),
  numberText('az-played', 'بازی', '۱۸', 958, 115),
  numberText('az-wins', 'برد', '۱۱', 810, 115),
  numberText('az-draws', 'مساوی', '۵', 662, 115),
  numberText('az-losses', 'باخت', '۲', 514, 115),
  numberText('az-diff', 'تفاضل', '۱۵', 330, 150),
  text('az-points', 'امتیاز', '۲۳', tf(38, 4, 242, 34), FAM, 25, 900, IVORY, 2, {
    align: 'center',
    direction: 'ltr',
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
      id: 'team',
      label: 'نام تیم',
      required: true,
      type: 'text',
      default: 'پرسپولیس',
      direction: 'rtl',
      operatorEditable: false,
    },
    {
      id: 'logo',
      label: 'لوگوی تیم',
      required: false,
      type: 'image',
      defaultAssetId: 'league-zwlji1u1',
      accept: ['png', 'svg', 'webp'],
      assetOptions: LEAGUE_LOGOS.map(({ name, code }) => ({
        assetId: `league-${code}`,
        label: `${name}.png`,
        source: 'project' as const,
      })),
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
    { fieldId: 'team', target: { kind: 'text', elementId: 'az-team' } },
    { fieldId: 'logo', target: { kind: 'image', elementId: 'az-team-logo' } },
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
  {
    ...image(
      'az-stadium-bg',
      'پس‌زمینه ورزشگاه',
      'iran-premier-league-stadium',
      tf(-80, -60, 1920, 1080),
      0,
      'cover',
    ),
    animation: backdropFade(),
  },
  shape('az-bg-scrim', 'لایه خوانایی', tf(-80, -60, 1920, 1080), solid('#080F1B'), 1, {
    opacity: 0.64,
    animation: anim({
      opacity: track(kf(0, 0), kf(20, 0.64), kfLinear(OUT_POINT, 0), kf(END_FRAME, 0)),
    }),
  }),
  shape('az-bg', 'پنل شیشه‌ای', tf(24, 20, 1712, 956), gradient(135, '#111B2C37', '#172337E3'), 2, {
    radius: 28,
    stroke: { color: '#8D9BBF55', width: 2 },
    shadow: { offsetX: 0, offsetY: 20, blur: 54, color: '#00000099' },
    animation: backdropFade(),
  }),
  shape(
    'az-title-glow',
    'نوار عنوان',
    tf(50, 42, 1660, 56),
    {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 446,
      stops: [
        { at: 0, color: '#202EA0A1' },
        { at: 1, color: '#FFFFFF00' },
      ],
    },
    3,
    {
      radius: 16,
      animation: titleReveal(0, 42, 44),
    },
  ),
  text('az-title', 'عنوان جدول', TITLE, tf(584.75, 44, 550.5, 56), FAM, 27, 900, IVORY, 4, {
    align: 'center',
    animation: titleReveal(4, 44, 44),
  }),
  shape(
    'az-head-bg',
    'پس‌زمینه سرستون',
    tf(50, 120, 1660, 52),
    gradient(90, '#202C40F2', '#2C394EEA'),
    3,
    {
      radius: 10,
      stroke: { color: '#B6C1D433', width: 1 },
      animation: backdropFade(),
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
      '#C8CFDB',
      4,
      { align: 'center', animation: backdropFade() },
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
    itemEntrance: 'fade-top',
    itemExit: 'fade-top',
    itemExitOrder: 'reverse',
    itemTransitionMs: 200,
    itemExitTransitionMs: 50,
    itemStaggerMs: 30,
    alternatingRowFill: '#FFFFFF10',
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
  entryOut: END_FRAME,
  outPoint: OUT_POINT,
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
      label: 'ردیف‌های جدول',
      required: true,
      type: 'list',
      default: rows,
      digits: 'persian',
      allowFileSource: true,
      fileSource: {
        inputMode: 'operator-choice',
        format: 'csv',
        bridgePath: 'ردیف-های-جدول-rows.sample.xlsx',
        lockFile: true,
      },
    },
  ],
  bindings: [
    { fieldId: 'title', target: { kind: 'text', elementId: 'az-title' } },
    { fieldId: 'teams', target: { kind: 'repeater-items', elementId: 'az-table-repeater' } },
  ],
  extraCompositions: [rowComposition],
});
