import type { AnchorPoint, Element, Fill, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';

/**
 * «میان‌برنامهٔ خبر» — the marquee composite, modeled on a real Persian news
 * lower-strap: a two-deck full-bleed band. The RIGHT block (the RTL reading
 * edge) is a tall red ROTATING PANEL — a `sequence` element whose items are
 * three nested compositions, showing ONE at a time on a loop: the live
 * Tehran wall clock → the live Greenwich wall clock → the «@IRIBNEWS» brand
 * tag (owner decision 2026-07-12; sequence composition items are fresh
 * subtree roots, so the clocks inside them tick live). The left side
 * carries a bound program-title row above a content-driven RTL headline
 * crawl. `mode: 'manual'` — the strap stays on air, clocks ticking, panel
 * rotating, crawl rolling, until the operator's stop/out.
 *
 * NOTE — brand placeholder: IRIB is a real broadcaster; per the PRD this
 * starter deliberately uses ONLY the plain text "@IRIBNEWS" as a swappable
 * placeholder (a bound data key), never IRIB's actual logo or marks.
 *
 * Structure (D-119 two-comp model):
 *   comp-irib        1920×1080 — positioning context; EXPORTED for now
 *   comp-irib-strap  1920×190 — the graphic's own footprint (future on-air
 *                    target); owns the manual lifecycle
 *   comp-irib-t/g/b  360×134 — the rotating panel's three states (Tehran
 *                    clock / Greenwich clock / brand tag)
 */

const FPS = 50 as const;
const W = 1920;
const H = 1080;

/** Bundled Vazirmatn asset family (rewritten to asset-<id> on load). */
const FAM = 'asset-irib-vazir';

// ── Palette (shared broadcast-news family) ─────────────────────────────────
const NAVY_D = '#0A1733';
const NAVY_M = '#16305F';
const NAVY_UP = '#0B1B3F';
const NAVY_UP2 = '#123067';
const RED = '#D5192E';
const RED_D = '#8F0E1F';
const GOLD = '#E3B04B';
const WHITE = '#FFFFFF';

// ── Strap geometry — two decks left, one tall rotating panel right ────────
const STRAP_W = 1920;
const STRAP_H = 190; // 134 visible + slide room below
const DECK1_H = 58; // program row
const DECK2_H = 76; // crawl row
const BAND_H = DECK1_H + DECK2_H; // 134 — the panel spans both decks
const RIGHT_W = 360;
const LEFT_W = STRAP_W - RIGHT_W; // 1560
const STRAP_Y = 886; // strap bottom lands at 1020, same line as the ticker

// The family compass-star mark (26×26) beside the program title.
function starPoints(): AnchorPoint[] {
  const c = 13;
  const q = 7;
  return [
    { id: 'pt', x: c, y: 0, in: { x: 0, y: q }, out: { x: 0, y: q }, smooth: false },
    { id: 'pr', x: 2 * c, y: c, in: { x: -q, y: 0 }, out: { x: -q, y: 0 }, smooth: false },
    { id: 'pb', x: c, y: 2 * c, in: { x: 0, y: -q }, out: { x: 0, y: -q }, smooth: false },
    { id: 'pl', x: 0, y: c, in: { x: q, y: 0 }, out: { x: q, y: 0 }, smooth: false },
  ];
}

interface TfOpts {
  ax?: number;
  ay?: number;
}
function tf(x: number, y: number, w: number, h: number, o: TfOpts = {}): Transform {
  return {
    position: { x, y },
    size: { w, h },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: o.ax ?? 0.5, y: o.ay ?? 0.5 },
  };
}
const lin = (angle: number, a: string, b: string): Fill => ({
  kind: 'linear',
  angle,
  stops: [
    { at: 0, color: a },
    { at: 1, color: b },
  ],
});

const HEADLINES = [
  { id: 'n1', text: 'رئیس‌جمهور در نشست خبری: اولویت دولت مهار تورم است' },
  { id: 'n2', text: 'سامانهٔ بارشی جدید فردا وارد کشور می‌شود' },
  { id: 'n3', text: 'صعود تیم ملی فوتسال به فینال جام ملت‌های آسیا' },
  { id: 'n4', text: 'رونمایی از بزرگ‌ترین کتابخانهٔ دیجیتال کشور در تهران' },
];

// Bound-field copy. Each of these is BOTH the element's base text and the
// field's `default`, so the Designer shows real Persian (never a raw token) and
// an operator who sends no value gets the same string on air.
const PROGRAM_DEFAULT = 'مشروح اخبار ساعت ۲۱';
const BRAND_DEFAULT = '@IRIBNEWS';

// ── Rotating-panel state comps (360×134, transparent over the red panel) ──
function clockStateChildren(prefix: string, label: string, timezone: string): Element[] {
  return [
    {
      id: `${prefix}-label`,
      name: 'label',
      type: 'text',
      transform: tf(0, 22, RIGHT_W, 24, { ax: 0, ay: 0 }),
      opacity: 0.9,
      visible: true,
      locked: false,
      zIndex: 0,
      text: label,
      font: {
        family: FAM,
        weight: 600,
        style: 'normal',
        size: 17,
        lineHeight: 1.3,
        letterSpacing: 0,
      },
      color: WHITE,
      align: 'center',
      direction: 'rtl',
      fitMode: 'fixed',
      overflow: 'clip',
    } as Element,
    {
      id: `${prefix}-clock`,
      name: 'clock',
      type: 'clock',
      transform: tf(0, 52, RIGHT_W, 60, { ax: 0, ay: 0 }),
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 1,
      font: {
        family: FAM,
        weight: 800,
        style: 'normal',
        size: 46,
        lineHeight: 1.2,
        letterSpacing: 0.02,
      },
      color: WHITE,
      textShadow: { offsetX: 0, offsetY: 2, blur: 8, color: '#00000059' },
      align: 'center',
      verticalAlign: 'middle',
      mode: 'wall',
      format: 'HH:mm',
      digits: 'persian',
      timezone,
      blinkColon: true,
    } as Element,
  ];
}

const brandStateChildren: Element[] = [
  {
    id: 'irb-brand',
    name: 'brand',
    type: 'text',
    transform: tf(10, 0, RIGHT_W - 20, BAND_H, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    text: BRAND_DEFAULT,
    font: {
      family: FAM,
      weight: 700,
      style: 'normal',
      size: 30,
      lineHeight: 1.3,
      letterSpacing: 0.06,
    },
    color: WHITE,
    align: 'center',
    verticalAlign: 'middle',
    direction: 'ltr',
    fitMode: 'fixed',
    overflow: 'clip',
    textShadow: { offsetX: 0, offsetY: 2, blur: 8, color: '#00000059' },
  } as Element,
];

// ── comp-irib-strap children (LOCAL coords, 1920×190) ──────────────────────
const strapChildren: Element[] = [
  // Lower deck, left — the crawl bar. Wipes open from the right.
  {
    id: 'ir-bar',
    name: 'crawl-bar',
    type: 'shape',
    transform: tf(0, DECK1_H, LEFT_W, DECK2_H, { ax: 1, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: lin(90, NAVY_D, NAVY_M),
    shadow: { offsetX: 0, offsetY: 10, blur: 26, color: '#00000073' },
    animation: anim({
      'scale.x': track(
        kf(8, 0, EASE.outExpo),
        kf(40, 1, EASE.outExpo),
        kf(74, 1, EASE.inCubic),
        kf(104, 0, EASE.inCubic),
      ),
      opacity: track(kf(8, 0), kf(20, 1), kf(94, 1), kf(106, 0)),
    }),
  },
  // The content-driven headline crawl.
  {
    id: 'ir-crawl',
    name: 'crawl',
    type: 'ticker',
    transform: tf(0, DECK1_H, LEFT_W, DECK2_H, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    font: {
      family: FAM,
      weight: 600,
      style: 'normal',
      size: 32,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: WHITE,
    textShadow: { offsetX: 0, offsetY: 2, blur: 6, color: '#00000059' },
    verticalAlign: 'middle',
    direction: 'rtl',
    speed: 120,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    gap: 72,
    separator: '◆',
    items: HEADLINES,
    animation: anim({
      opacity: track(kf(44, 0), kf(56, 1), kf(60, 1), kf(70, 0)),
    }),
  },
  // Upper deck, left — the program-title slab (rises from behind the crawl bar).
  {
    id: 'ir-upper',
    name: 'program-slab',
    type: 'shape',
    transform: tf(0, 0, LEFT_W, DECK1_H, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'rect',
    fill: lin(90, NAVY_UP, NAVY_UP2),
    animation: anim({
      'position.y': track(
        kf(18, DECK1_H, EASE.outExpo),
        kf(44, 0, EASE.outExpo),
        kf(66, 0, EASE.inCubic),
        kf(90, DECK1_H, EASE.inCubic),
      ),
      opacity: track(kf(18, 0), kf(30, 1), kf(78, 1), kf(90, 0)),
    }),
  },
  // Program title — carries the `program` data key (base text = its default).
  {
    id: 'ir-program',
    name: 'program-title',
    type: 'text',
    transform: tf(24, 8, 1480, 42, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    text: PROGRAM_DEFAULT,
    font: {
      family: FAM,
      weight: 700,
      style: 'normal',
      size: 27,
      lineHeight: 1.35,
      letterSpacing: 0,
    },
    color: WHITE,
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    animation: anim({
      opacity: track(kf(36, 0), kf(54, 1), kf(64, 1), kf(78, 0)),
      'position.x': track(kf(36, 44, EASE.outExpo), kf(56, 24, EASE.outExpo)),
    }),
  },
  // Gold star beside the program title (at the RTL reading edge of the slab).
  {
    id: 'ir-star',
    name: 'star-mark',
    type: 'path',
    transform: tf(1520, 16, 26, 26),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    points: starPoints(),
    closed: true,
    fill: { kind: 'solid', color: GOLD },
    animation: anim({
      rotation: track(kf(30, -90, EASE.outExpo), kf(52, 0, EASE.outExpo)),
      'scale.x': track(
        kf(30, 0, EASE.outBack),
        kf(48, 1, EASE.outBack),
        kf(66, 1, EASE.inCubic),
        kf(80, 0, EASE.inCubic),
      ),
      'scale.y': track(
        kf(30, 0, EASE.outBack),
        kf(48, 1, EASE.outBack),
        kf(66, 1, EASE.inCubic),
        kf(80, 0, EASE.inCubic),
      ),
    }),
  },
  // The tall red panel behind the rotating states — flush right, both decks.
  {
    id: 'ir-panel',
    name: 'panel',
    type: 'shape',
    transform: tf(LEFT_W, 0, RIGHT_W, BAND_H, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    shape: 'rect',
    fill: lin(105, RED, RED_D),
    shadow: { offsetX: 0, offsetY: 10, blur: 26, color: '#00000080' },
    animation: anim({
      'position.y': track(
        kf(0, 62, EASE.outExpo),
        kf(24, 0, EASE.outExpo),
        kf(80, 0, EASE.inCubic),
        kf(106, 62, EASE.inCubic),
      ),
      opacity: track(kf(0, 0), kf(14, 1), kf(94, 1), kf(106, 0)),
    }),
  },
  // The rotator — ONE state at a time: Tehran clock → Greenwich clock → brand.
  {
    id: 'ir-rotator',
    name: 'rotator',
    type: 'sequence',
    transform: tf(LEFT_W, 0, RIGHT_W, BAND_H, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 5,
    font: {
      family: FAM,
      weight: 700,
      style: 'normal',
      size: 30,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    color: WHITE,
    align: 'center',
    verticalAlign: 'middle',
    direction: 'rtl',
    items: [
      { kind: 'composition', id: 'st-tehran', compositionId: 'comp-irib-t' },
      { kind: 'composition', id: 'st-gmt', compositionId: 'comp-irib-g' },
      { kind: 'composition', id: 'st-brand', compositionId: 'comp-irib-b' },
    ],
    defaultDwellMs: 4000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
    // Hard opacity gate (owner pattern 2026-07-12, same as the sequence
    // strap): 0 one frame BEFORE content-start, 100 ON content-start (55),
    // 100 ON the out-point (60), 0 one frame AFTER it — no fades to fight
    // the rotator's OWN item transitions.
    animation: anim({
      opacity: track(kfLinear(54, 0), kfLinear(55, 1), kfLinear(60, 1), kfLinear(61, 0)),
    }),
  },
];

const layer = (id: string, name: string, children: Element[]): Scene['layers'][number] => ({
  id,
  name,
  visible: true,
  locked: false,
  blendMode: 'normal',
  children,
});

/**
 * IRIB-style news composite, two-comp structure. Manual hold on both comps:
 * the strap stays on air — panel rotating, clocks live, crawl rolling —
 * until the operator stops it; the full comp's outro (60→124) outlasts the
 * strap's exit (60→112).
 */
export const iribNewsScene: Scene = {
  schemaVersion: 1,
  id: 'starter-irib-news',
  name: 'میان‌برنامهٔ خبر',
  templateType: 'custom',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 124 },
  background: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-irib',
      name: 'میان‌برنامهٔ خبر',
      resolution: { width: W, height: H },
      frameRange: { in: 0, out: 124 },
      lifecycle: { outPoint: 60, contentStart: 55 },
      playout: { mode: 'manual' },
      background: 'transparent',
      layers: [
        layer('L-full', 'Frame', [
          {
            id: 'ir-strap',
            name: 'میان‌برنامه',
            type: 'composition',
            compositionId: 'comp-irib-strap',
            transform: tf(0, STRAP_Y, STRAP_W, STRAP_H, { ax: 0, ay: 0 }),
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            animation: anim({
              opacity: track(kf(0, 0), kf(6, 1), kf(114, 1), kf(124, 0)),
            }),
          } as Element,
        ]),
      ],
    },
    {
      id: 'comp-irib-strap',
      name: 'میان‌برنامه (روی آنتن)',
      resolution: { width: STRAP_W, height: STRAP_H },
      frameRange: { in: 0, out: 112 },
      lifecycle: { outPoint: 60, contentStart: 55 },
      playout: { mode: 'manual' },
      background: 'transparent',
      layers: [layer('L-strap', 'Strap', strapChildren)],
    },
    {
      id: 'comp-irib-t',
      name: 'پنل تهران',
      resolution: { width: RIGHT_W, height: BAND_H },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      layers: [layer('L-t', 'Tehran', clockStateChildren('irt', 'تهران', 'Asia/Tehran'))],
    },
    {
      id: 'comp-irib-g',
      name: 'پنل گرینویچ',
      resolution: { width: RIGHT_W, height: BAND_H },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      layers: [layer('L-g', 'Greenwich', clockStateChildren('irg', 'گرینویچ', 'UTC'))],
    },
    {
      id: 'comp-irib-b',
      name: 'پنل نشان',
      resolution: { width: RIGHT_W, height: BAND_H },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      layers: [layer('L-b', 'Brand', brandStateChildren)],
    },
  ],
  entryCompositionId: 'comp-irib',
  fields: [
    {
      id: 'program',
      label: 'Program (عنوان برنامه)',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: PROGRAM_DEFAULT,
    },
    {
      id: 'brand',
      label: 'Brand tag (نشان)',
      required: false,
      type: 'text',
      direction: 'ltr',
      default: BRAND_DEFAULT,
    },
    {
      id: 'headlines',
      label: 'Headlines (تیترها)',
      required: true,
      type: 'list',
      default: HEADLINES,
    },
  ],
  bindings: [
    { fieldId: 'program', target: { kind: 'text', elementId: 'ir-program' } },
    { fieldId: 'brand', target: { kind: 'text', elementId: 'irb-brand' } },
    { fieldId: 'headlines', target: { kind: 'ticker-items', elementId: 'ir-crawl' } },
  ],
  fonts: [
    {
      family: FAM,
      weights: [600, 700, 800],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'Vazirmatn',
    },
  ],
  metadata: {
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    description:
      'IRIB-style Persian news strap: full-bleed two-deck band whose red right panel is a SEQUENCE rotating one state at a time — live Tehran clock, live Greenwich clock, @IRIBNEWS brand tag — beside a bound program title and a content-driven RTL headline crawl. Stays on air until the operator stops it.',
    tags: ['starter', 'news', 'composite', 'persian', 'rtl', 'clocks', 'onair:comp-irib-strap'],
  },
};
