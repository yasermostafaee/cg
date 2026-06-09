import type { Element, Fill, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';

/**
 * "خبر — Persian News Package" — a professional Persian (RTL) news package that
 * shows several on-air graphics at once, so it doubles as a demo of how much
 * the editor can do: a logo bug, a digital clock + date, a two-tier
 * lower-third, a topic/headline strap, a "آخرین اخبار" side panel, a live
 * badge, and a scrolling ticker with a red breaking tag — all over a
 * transparent stage (meant to key over live video).
 *
 * Built from nested compositions (comp-pulse reused as a radar "live" ping
 * inside the logo, the live badge and the ticker tag; comp-logo / comp-sidebar
 * / comp-lowerthird nested in the master). Persian text uses the bundled
 * Vazirmatn asset font; the operator-editable copy is bound to fields.
 *
 * Timeline (50 fps, 0–320): clock + logo in (0–24); live badge (8–26); topic
 * strap wipes (22–62); lower third wipes + name/role (16–74); side panel slides
 * in (40–90); ticker slides up + scrolls (30–end).
 */

const FPS = 50 as const;
const OUT = 320;
const W = 1920;
const H = 1080;

/** Bundled Vazirmatn asset family (rewritten to asset-<id> on load). */
const FAM = 'asset-news-vazir';

// ── Palette ──────────────────────────────────────────────────────────────
const BLUE_D = '#0B2350';
const BLUE_M = '#1A4C9E';
const BLUE_DK = '#071A3D';
const BLUE_MID = '#102C5E';
const RED = '#E11D2A';
const RED_D = '#A60E1A';
const GOLD = '#E8B23A';
const GOLD_HAIR = '#E8B23A55';
const WHITE = '#FFFFFF';
const MUTED = '#AEBEDC';
const LT = '#D4E2FF';

interface TfOpts {
  rot?: number;
  ax?: number;
  ay?: number;
  sx?: number;
  sy?: number;
}
function tf(x: number, y: number, w: number, h: number, o: TfOpts = {}): Transform {
  return {
    position: { x, y },
    size: { w, h },
    scale: { x: o.sx ?? 1, y: o.sy ?? 1 },
    rotation: o.rot ?? 0,
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
const sol = (c: string): Fill => ({ kind: 'solid', color: c });

type Anim = ReturnType<typeof anim>;

interface ShapeOpts {
  id: string;
  name: string;
  shape: 'rect' | 'rounded-rect' | 'ellipse';
  t: Transform;
  z: number;
  opacity?: number;
  fill?: Fill;
  stroke?: { width: number; color: string; dash?: number[] };
  corner?: number | [number, number, number, number];
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
  filter?: { blur?: number };
  animation?: Anim;
}
function shape(o: ShapeOpts): Element {
  return {
    id: o.id,
    name: o.name,
    type: 'shape',
    transform: o.t,
    opacity: o.opacity ?? 1,
    visible: true,
    locked: false,
    zIndex: o.z,
    shape: o.shape,
    ...(o.fill !== undefined ? { fill: o.fill } : {}),
    ...(o.stroke !== undefined ? { stroke: o.stroke } : {}),
    ...(o.corner !== undefined ? { cornerRadius: o.corner } : {}),
    ...(o.shadow !== undefined ? { shadow: o.shadow } : {}),
    ...(o.filter !== undefined ? { filter: o.filter } : {}),
    ...(o.animation !== undefined ? { animation: o.animation } : {}),
  } as Element;
}

interface TextOpts {
  id: string;
  name: string;
  t: Transform;
  z: number;
  text: string;
  size: number;
  weight: number;
  color: string;
  align?: 'start' | 'center' | 'end';
  ltr?: boolean;
  lh?: number;
  opacity?: number;
  wrap?: boolean;
  animation?: Anim;
}
function txt(o: TextOpts): Element {
  return {
    id: o.id,
    name: o.name,
    type: 'text',
    transform: o.t,
    opacity: o.opacity ?? 1,
    visible: true,
    locked: false,
    zIndex: o.z,
    text: o.text,
    font: {
      family: FAM,
      weight: o.weight,
      style: 'normal',
      size: o.size,
      lineHeight: o.lh ?? 1.25,
      letterSpacing: 0,
    },
    color: o.color,
    // RTL Persian: 'start' resolves to the RIGHT edge (right-aligned), which is
    // what we want for every plate/label here.
    align: o.align ?? 'start',
    direction: o.ltr === true ? 'ltr' : 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    ...(o.wrap !== undefined ? { wrap: o.wrap } : {}),
    ...(o.animation !== undefined ? { animation: o.animation } : {}),
  } as Element;
}

interface InstOpts {
  id: string;
  name: string;
  comp: string;
  t: Transform;
  z: number;
  opacity?: number;
  animation?: Anim;
}
function inst(o: InstOpts): Element {
  return {
    id: o.id,
    name: o.name,
    type: 'composition',
    compositionId: o.comp,
    transform: o.t,
    opacity: o.opacity ?? 1,
    visible: true,
    locked: false,
    zIndex: o.z,
    ...(o.animation !== undefined ? { animation: o.animation } : {}),
  } as Element;
}

const fadeIn = (a: number, b: number, to = 1): Anim =>
  anim({ opacity: track(kf(a, 0, EASE.outCubic), kf(b, to, EASE.outCubic)) });

// ── comp-pulse (44×44) — radar "live" ping, reused everywhere ──────────────
const pulse: Element[] = [
  shape({
    id: 'pl-dot',
    name: 'dot',
    shape: 'ellipse',
    t: tf(15, 15, 14, 14),
    z: 2,
    fill: sol(WHITE),
    shadow: { offsetX: 0, offsetY: 0, blur: 8, color: '#FFFFFFAA' },
    animation: anim({
      'scale.x': track(kf(0, 1, EASE.inOut), kf(40, 1.25, EASE.inOut), kf(90, 1, EASE.inOut)),
      'scale.y': track(kf(0, 1, EASE.inOut), kf(40, 1.25, EASE.inOut), kf(90, 1, EASE.inOut)),
    }),
  }),
  shape({
    id: 'pl-ring',
    name: 'ring',
    shape: 'ellipse',
    t: tf(8, 8, 28, 28),
    z: 1,
    stroke: { width: 2, color: WHITE },
    animation: anim({
      'scale.x': track(kfLinear(0, 0.4), kfLinear(70, 1.7), kfLinear(71, 0.4), kfLinear(140, 1.7)),
      'scale.y': track(kfLinear(0, 0.4), kfLinear(70, 1.7), kfLinear(71, 0.4), kfLinear(140, 1.7)),
      opacity: track(kf(0, 0.7, EASE.outCubic), kf(70, 0, EASE.outCubic), kf(71, 0.7), kf(140, 0)),
    }),
  }),
];

// ── comp-logo (300×92) — logo bug; NESTS comp-pulse ────────────────────────
const logo: Element[] = [
  shape({
    id: 'lg-plate',
    name: 'plate',
    shape: 'rounded-rect',
    t: tf(0, 0, 300, 92, { ax: 0, ay: 0 }),
    z: 0,
    corner: 16,
    fill: lin(105, BLUE_D, BLUE_M),
    stroke: { width: 1, color: GOLD_HAIR },
    shadow: { offsetX: 0, offsetY: 10, blur: 28, color: '#00000080' },
  }),
  {
    id: 'lg-emblem',
    name: 'emblem',
    type: 'image',
    transform: tf(16, 14, 64, 64, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    assetId: 'news-emblem',
    fit: 'contain',
    preserveAspect: true,
  } as Element,
  txt({
    id: 'lg-word',
    name: 'wordmark',
    t: tf(92, 18, 192, 36, { ax: 0, ay: 0 }),
    z: 2,
    text: 'شبکهٔ خبر',
    size: 30,
    weight: 800,
    color: WHITE,
  }),
  txt({
    id: 'lg-sub',
    name: 'sub',
    t: tf(92, 56, 192, 22, { ax: 0, ay: 0 }),
    z: 2,
    text: '۲۴ ساعته',
    size: 15,
    weight: 500,
    color: GOLD,
  }),
  inst({
    id: 'lg-pulse',
    name: 'live-ping',
    comp: 'comp-pulse',
    t: tf(262, 14, 26, 26, { ax: 0.5, ay: 0.5 }),
    z: 3,
  }),
];

// ── comp-sidebar (460×360) — "آخرین اخبار" latest-news panel ────────────────
const SIDE_ROWS = [
  'افتتاح خط جدید مترو در پایتخت',
  'رشد صادرات غیرنفتی در فصل بهار',
  'گشایش نمایشگاه بین‌المللی کتاب',
];
const sidebar: Element[] = [
  shape({
    id: 'sb-bg',
    name: 'panel',
    shape: 'rounded-rect',
    t: tf(0, 0, 460, 360, { ax: 0, ay: 0 }),
    z: 0,
    corner: 18,
    fill: lin(120, BLUE_D, BLUE_MID),
    stroke: { width: 1, color: GOLD_HAIR },
    shadow: { offsetX: 0, offsetY: 16, blur: 40, color: '#00000088' },
  }),
  shape({
    id: 'sb-head',
    name: 'header',
    shape: 'rounded-rect',
    t: tf(0, 0, 460, 56, { ax: 0, ay: 0 }),
    z: 1,
    corner: [18, 18, 0, 0],
    fill: lin(90, RED, RED_D),
  }),
  txt({
    id: 'sb-headtext',
    name: 'header-text',
    t: tf(24, 14, 412, 30, { ax: 0, ay: 0 }),
    z: 2,
    text: 'آخرین اخبار',
    size: 23,
    weight: 800,
    color: WHITE,
  }),
  ...SIDE_ROWS.flatMap((line, i): Element[] => {
    const y = 84 + i * 88;
    const inAt = 46 + i * 10;
    return [
      shape({
        id: `sb-dot${String(i)}`,
        name: `dot-${String(i)}`,
        shape: 'ellipse',
        t: tf(436, y + 8, 12, 12, { ax: 0.5, ay: 0.5 }),
        z: 3,
        fill: sol(GOLD),
        animation: fadeIn(inAt, inAt + 16),
      }),
      txt({
        id: `sb-row${String(i)}`,
        name: `row-${String(i)}`,
        t: tf(28, y, 392, 60, { ax: 0, ay: 0 }),
        z: 3,
        text: line,
        size: 21,
        weight: 600,
        color: LT,
        lh: 1.35,
        wrap: true,
        animation: anim({
          opacity: track(kf(inAt, 0, EASE.outCubic), kf(inAt + 18, 1, EASE.outCubic)),
          'position.x': track(kf(inAt, 50, EASE.outExpo), kf(inAt + 20, 28, EASE.outExpo)),
        }),
      }),
      ...(i < SIDE_ROWS.length - 1
        ? [
            shape({
              id: `sb-div${String(i)}`,
              name: `div-${String(i)}`,
              shape: 'rect',
              t: tf(28, y + 76, 404, 1, { ax: 0, ay: 0 }),
              z: 2,
              opacity: 0.4,
              fill: sol('#3B5A93'),
            }),
          ]
        : []),
    ];
  }),
];

// ── comp-lowerthird (1920×1080) — two-tier name / topic plate ───────────────
const lowerthird: Element[] = [
  shape({
    id: 'lt-accent',
    name: 'accent',
    shape: 'rounded-rect',
    t: tf(1808, 844, 14, 150, { ax: 1, ay: 1 }),
    z: 0,
    corner: 4,
    fill: sol(RED),
    animation: anim({ 'scale.y': track(kf(18, 0, EASE.outBack), kf(42, 1, EASE.outBack)) }),
  }),
  shape({
    id: 'lt-name-plate',
    name: 'name-plate',
    shape: 'rounded-rect',
    t: tf(300, 852, 1508, 74, { ax: 1, ay: 0.5 }),
    z: 1,
    corner: 10,
    fill: lin(105, BLUE_D, BLUE_M),
    stroke: { width: 1, color: GOLD_HAIR },
    shadow: { offsetX: 0, offsetY: 14, blur: 38, color: '#000000AA' },
    animation: anim({
      'scale.x': track(kf(20, 0, EASE.outExpo), kf(44, 1, EASE.outExpo)),
      opacity: track(kf(20, 0), kf(30, 1)),
    }),
  }),
  shape({
    id: 'lt-topic-plate',
    name: 'topic-plate',
    shape: 'rounded-rect',
    t: tf(360, 930, 1448, 46, { ax: 1, ay: 0.5 }),
    z: 1,
    corner: 8,
    fill: lin(105, BLUE_DK, BLUE_MID),
    animation: anim({ 'scale.x': track(kf(30, 0, EASE.outExpo), kf(54, 1, EASE.outExpo)) }),
  }),
  shape({
    id: 'lt-gold',
    name: 'gold-line',
    shape: 'rect',
    t: tf(360, 925, 1448, 2, { ax: 1, ay: 0.5 }),
    z: 2,
    fill: sol(GOLD),
    animation: anim({
      'scale.x': track(kf(34, 0, EASE.outExpo), kf(58, 1, EASE.outExpo)),
      opacity: track(kf(34, 0), kf(48, 0.8)),
    }),
  }),
];

// ── comp-master ────────────────────────────────────────────────────────────
const master: Element[] = [
  inst({
    id: 'm-sidebar',
    name: 'latest-news',
    comp: 'comp-sidebar',
    t: tf(64, 168, 460, 360, { ax: 0, ay: 0 }),
    z: 2,
    animation: anim({
      opacity: track(kf(40, 0, EASE.outCubic), kf(56, 1, EASE.outCubic)),
      'position.x': track(kf(40, -480, EASE.outExpo), kf(70, 64, EASE.outExpo)),
    }),
  }),
  inst({
    id: 'm-lt',
    name: 'lower-third',
    comp: 'comp-lowerthird',
    t: tf(0, 0, W, H, { ax: 0, ay: 0 }),
    z: 3,
    animation: fadeIn(16, 30),
  }),
  // Topic / headline strap.
  shape({
    id: 'm-hl-plate',
    name: 'headline-plate',
    shape: 'rounded-rect',
    t: tf(300, 786, 1508, 58, { ax: 1, ay: 0.5 }),
    z: 4,
    corner: 10,
    fill: lin(105, BLUE_M, BLUE_D),
    stroke: { width: 1, color: GOLD_HAIR },
    shadow: { offsetX: 0, offsetY: 12, blur: 30, color: '#00000088' },
    animation: anim({
      'scale.x': track(kf(24, 0, EASE.outExpo), kf(50, 1, EASE.outExpo)),
      opacity: track(kf(24, 0), kf(34, 1)),
    }),
  }),
  shape({
    id: 'm-hl-acc',
    name: 'headline-accent',
    shape: 'rounded-rect',
    t: tf(1808, 786, 14, 58, { ax: 1, ay: 0.5 }),
    z: 4,
    corner: 4,
    fill: sol(GOLD),
    animation: anim({ 'scale.y': track(kf(22, 0, EASE.outBack), kf(46, 1, EASE.outBack)) }),
  }),
  txt({
    id: 'm-headline',
    name: 'headline',
    t: tf(360, 794, 1410, 44, { ax: 0, ay: 0 }),
    z: 5,
    text: '{{headline}}',
    size: 31,
    weight: 700,
    color: WHITE,
    animation: anim({
      opacity: track(kf(42, 0), kf(62, 1)),
      'position.x': track(kf(42, 388, EASE.outExpo), kf(64, 360, EASE.outExpo)),
    }),
  }),
  // Lower-third operator text (over comp-lowerthird's plates).
  txt({
    id: 'm-name',
    name: 'name',
    t: tf(360, 860, 1404, 54, { ax: 0, ay: 0 }),
    z: 6,
    text: '{{name}}',
    size: 40,
    weight: 800,
    color: WHITE,
    animation: anim({
      opacity: track(kf(46, 0), kf(62, 1)),
      'position.x': track(kf(46, 392, EASE.outExpo), kf(66, 360, EASE.outExpo)),
    }),
  }),
  txt({
    id: 'm-role',
    name: 'role',
    t: tf(360, 936, 1404, 36, { ax: 0, ay: 0 }),
    z: 6,
    text: '{{role}}',
    size: 23,
    weight: 500,
    color: MUTED,
    animation: anim({
      opacity: track(kf(58, 0), kf(76, 1)),
      'position.x': track(kf(58, 388, EASE.outExpo), kf(78, 360, EASE.outExpo)),
    }),
  }),
  // Ticker (bottom) — bar, scrolling headline, breaking tag, live ping.
  shape({
    id: 'm-tk-bar',
    name: 'ticker-bar',
    shape: 'rect',
    t: tf(0, 992, W, 60, { ax: 0, ay: 0.5 }),
    z: 7,
    fill: lin(90, BLUE_DK, BLUE_MID),
    animation: anim({
      opacity: track(kf(30, 0), kf(42, 1)),
      'position.y': track(kf(30, 1066, EASE.outExpo), kf(54, 992, EASE.outExpo)),
    }),
  }),
  shape({
    id: 'm-tk-top',
    name: 'ticker-topline',
    shape: 'rect',
    t: tf(0, 989, W, 3, { ax: 0, ay: 0.5 }),
    z: 8,
    fill: sol(GOLD),
    animation: fadeIn(38, 52, 0.9),
  }),
  txt({
    id: 'm-ticker',
    name: 'ticker-text',
    t: tf(1520, 1004, 3600, 36, { ax: 0, ay: 0 }),
    z: 9,
    text: '{{ticker}}',
    size: 26,
    weight: 500,
    color: WHITE,
    align: 'start',
    wrap: false,
    // Persian news crawler: the line travels left → right (x increases),
    // entering off the left edge and sweeping toward the breaking tag.
    animation: anim({
      opacity: track(kf(48, 0), kf(58, 1)),
      'position.x': track(kfLinear(54, -5200), kfLinear(OUT, 1520)),
    }),
  }),
  shape({
    id: 'm-tk-tag',
    name: 'breaking-tag',
    shape: 'rect',
    t: tf(1540, 992, 380, 60, { ax: 0, ay: 0.5 }),
    z: 10,
    fill: lin(90, RED, RED_D),
    animation: anim({
      opacity: track(kf(30, 0), kf(42, 1)),
      'position.y': track(kf(30, 1066, EASE.outExpo), kf(54, 992, EASE.outExpo)),
    }),
  }),
  inst({
    id: 'm-tk-pulse',
    name: 'breaking-ping',
    comp: 'comp-pulse',
    t: tf(1556, 1006, 32, 32, { ax: 0.5, ay: 0.5 }),
    z: 11,
    animation: fadeIn(46, 58),
  }),
  txt({
    id: 'm-breaking',
    name: 'breaking',
    t: tf(1600, 994, 296, 56, { ax: 0, ay: 0 }),
    z: 12,
    text: '{{breaking}}',
    size: 28,
    weight: 800,
    color: WHITE,
    align: 'center',
    animation: fadeIn(46, 58),
  }),
  // Live badge (top-left).
  shape({
    id: 'm-live-pill',
    name: 'live-pill',
    shape: 'rounded-rect',
    t: tf(64, 56, 154, 46, { ax: 0, ay: 0 }),
    z: 13,
    corner: 23,
    fill: lin(90, RED, RED_D),
    shadow: { offsetX: 0, offsetY: 8, blur: 22, color: '#00000066' },
    animation: anim({
      opacity: track(kf(8, 0, EASE.outBack), kf(24, 1, EASE.outBack)),
      'scale.x': track(kf(8, 0.6, EASE.outBack), kf(26, 1, EASE.outBack)),
      'scale.y': track(kf(8, 0.6, EASE.outBack), kf(26, 1, EASE.outBack)),
    }),
  }),
  inst({
    id: 'm-live-pulse',
    name: 'live-ping',
    comp: 'comp-pulse',
    t: tf(76, 66, 26, 26, { ax: 0.5, ay: 0.5 }),
    z: 14,
    animation: fadeIn(12, 26),
  }),
  txt({
    id: 'm-live-text',
    name: 'live-text',
    t: tf(104, 64, 100, 30, { ax: 0, ay: 0 }),
    z: 14,
    text: 'زنده',
    size: 22,
    weight: 800,
    color: WHITE,
    align: 'center',
    animation: fadeIn(12, 26),
  }),
  // Digital clock + date (top-right, left of the logo).
  shape({
    id: 'm-clock-plate',
    name: 'clock-plate',
    shape: 'rounded-rect',
    t: tf(1300, 40, 260, 92, { ax: 0, ay: 0 }),
    z: 14,
    corner: 16,
    fill: lin(105, BLUE_D, BLUE_M),
    stroke: { width: 1, color: GOLD_HAIR },
    shadow: { offsetX: 0, offsetY: 10, blur: 28, color: '#00000080' },
    animation: anim({
      opacity: track(kf(6, 0, EASE.outCubic), kf(22, 1, EASE.outCubic)),
      'position.y': track(kf(6, 20, EASE.outExpo), kf(24, 40, EASE.outExpo)),
    }),
  }),
  txt({
    id: 'm-time',
    name: 'clock-time',
    t: tf(1300, 46, 260, 50, { ax: 0, ay: 0 }),
    z: 15,
    text: '{{time}}',
    size: 42,
    weight: 800,
    color: WHITE,
    align: 'center',
    animation: fadeIn(10, 24),
  }),
  txt({
    id: 'm-date',
    name: 'clock-date',
    t: tf(1300, 96, 260, 28, { ax: 0, ay: 0 }),
    z: 15,
    text: '{{date}}',
    size: 17,
    weight: 500,
    color: MUTED,
    align: 'center',
    animation: fadeIn(12, 26),
  }),
  inst({
    id: 'm-logo',
    name: 'logo',
    comp: 'comp-logo',
    t: tf(1576, 40, 300, 92, { ax: 0.5, ay: 0.5 }),
    z: 16,
    animation: anim({
      opacity: track(kf(0, 0, EASE.outCubic), kf(18, 1, EASE.outCubic)),
      'scale.x': track(kf(0, 0.7, EASE.outBack), kf(22, 1, EASE.outBack)),
      'scale.y': track(kf(0, 0.7, EASE.outBack), kf(22, 1, EASE.outBack)),
    }),
  }),
];

const layer = (id: string, name: string, children: Element[]): Scene['layers'][number] => ({
  id,
  name,
  visible: true,
  locked: false,
  blendMode: 'normal',
  children,
});
const range = { in: 0, out: OUT };
const comp = (id: string, name: string, w: number, h: number, children: Element[]) => ({
  id,
  name,
  resolution: { width: w, height: h },
  // D-026 — fps is project-level (`Scene.frameRate`); compositions no longer carry it.
  frameRange: range,
  background: 'transparent' as const,
  layers: [layer(`${id}-l`, name, children)],
});

/**
 * Persian news package. Composition-centric: the main `layers` are empty and
 * the Designer opens `compositions[0]` (the master) on load.
 */
export const newsPackageScene: Scene = {
  schemaVersion: 1,
  id: 'starter-news-package',
  name: 'پکیج خبری فارسی',
  templateType: 'custom',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: range,
  background: 'transparent',
  layers: [],
  compositions: [
    comp('comp-master', 'Master', W, H, master),
    comp('comp-pulse', 'Pulse', 44, 44, pulse),
    comp('comp-logo', 'Logo', 300, 92, logo),
    comp('comp-sidebar', 'Latest News', 460, 360, sidebar),
    comp('comp-lowerthird', 'Lower Third', W, H, lowerthird),
  ],
  fields: [
    {
      id: 'name',
      label: 'Name',
      required: true,
      type: 'text',
      direction: 'rtl',
      default: 'دکتر سارا محمدی',
    },
    {
      id: 'role',
      label: 'Role / topic',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: 'کارشناس اقتصادی · میز خبر',
    },
    {
      id: 'headline',
      label: 'Headline (تیتر)',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: 'نشست سران منطقه برای گسترش همکاری‌های اقتصادی آغاز شد',
    },
    {
      id: 'ticker',
      label: 'Ticker',
      required: false,
      type: 'text',
      direction: 'rtl',
      default:
        'نرخ تورم نقطه‌به‌نقطه در ماه گذشته کاهش یافت    •    بازارهای جهانی امروز با رشد همراه بودند    •    هواشناسی از بارش‌های پراکنده در شمال کشور خبر داد    •',
    },
    {
      id: 'breaking',
      label: 'Breaking tag',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: 'خبر فوری',
    },
    { id: 'time', label: 'Clock', required: false, type: 'text', default: '۲۱:۰۰' },
    {
      id: 'date',
      label: 'Date',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: 'شنبه ۱۵ خرداد ۱۴۰۴',
    },
  ],
  bindings: [
    { fieldId: 'name', target: { kind: 'text', elementId: 'm-name', placeholder: '{{name}}' } },
    { fieldId: 'role', target: { kind: 'text', elementId: 'm-role', placeholder: '{{role}}' } },
    {
      fieldId: 'headline',
      target: { kind: 'text', elementId: 'm-headline', placeholder: '{{headline}}' },
    },
    {
      fieldId: 'ticker',
      target: { kind: 'text', elementId: 'm-ticker', placeholder: '{{ticker}}' },
    },
    {
      fieldId: 'breaking',
      target: { kind: 'text', elementId: 'm-breaking', placeholder: '{{breaking}}' },
    },
    { fieldId: 'time', target: { kind: 'text', elementId: 'm-time', placeholder: '{{time}}' } },
    { fieldId: 'date', target: { kind: 'text', elementId: 'm-date', placeholder: '{{date}}' } },
  ],
  fonts: [
    {
      family: FAM,
      weights: [500, 600, 700, 800],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'Vazirmatn',
    },
  ],
  metadata: {
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    description:
      'Professional Persian (RTL) news package: logo bug, digital clock + date, two-tier lower third, headline strap, "آخرین اخبار" side panel, live badge, and a scrolling ticker with a breaking tag — built from nested compositions with a bundled Vazirmatn font.',
    tags: ['starter', 'news', 'persian', 'rtl', 'compositions'],
  },
};
