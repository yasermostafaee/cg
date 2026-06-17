import type { Element, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';

/**
 * "Aurora Network" — the flagship showcase starter. A ~7-second (350-frame
 * @ 50 fps) broadcast title sequence assembled from FIVE compositions nested
 * inside one another, built to exercise nearly every Designer + runtime
 * capability in one project:
 *
 *   comp-ring        counter-spinning dashed rings + a glowing pulsing core
 *   comp-logobug     a gradient pill that NESTS comp-ring (corner bug)
 *   comp-lowerthird  a glass plate + accent wipe that also NESTS comp-ring
 *   comp-backdrop    drifting blurred "aurora" blobs, a wiping grid, particles
 *   comp-master      opens first; nests all four + the operator-editable text
 *
 * Nesting depth reaches 3 (master → logobug → ring) and comp-ring is reused
 * four times at different sizes, demonstrating resolution-independent
 * instances. Showcased features: linear + radial gradient fills, drop shadows,
 * dashed strokes, animated filter.blur (focus-in) and font.letterSpacing
 * (tracking reveal), colour / scale / rotation / opacity / position keyframes
 * with bézier easing, Persian/RTL text (Vazirmatn), and six bound fields.
 *
 * The model is important: nested-composition animation plays along the SAME
 * global timeline as the master, so every keyframe below is authored in one
 * 0–350 frame space. Each nested instance fades/scales in at its phase, which
 * also hides the always-spinning rings until that phase arrives.
 *
 * Global storyboard (frames @ 50 fps):
 *   0–45    backdrop fades + settles; grid wipes up; particles begin rising
 *   40–80   corner logo-bug pops in (scale/rotate), channel id slides in
 *   65–120  hero title focuses in (blur→0, tracking 0.24em→0), underline grows
 *   100–135 subtitle + Persian tagline rise
 *   150–205 lower third wipes open; name & role slide up
 *   205–350 hold with continuous ring spin, particle drift, aurora breathing
 */

const FPS = 50 as const;
const OUT = 350;
const W = 1920;
const H = 1080;

interface TfOpts {
  rot?: number;
  ax?: number;
  ay?: number;
  sx?: number;
  sy?: number;
}

/** Terse Transform builder. Anchor defaults to centre (matters for rotation/scale origin). */
function tf(x: number, y: number, w: number, h: number, o: TfOpts = {}): Transform {
  return {
    position: { x, y },
    size: { w, h },
    scale: { x: o.sx ?? 1, y: o.sy ?? 1 },
    rotation: o.rot ?? 0,
    anchor: { x: o.ax ?? 0.5, y: o.ay ?? 0.5 },
  };
}

// ── Palette ────────────────────────────────────────────────────────────────
const INK = '#070A14';
const CYAN = '#38BDF8';
const CYAN_LT = '#7DD3FC';
const VIOLET = '#8B5CF6';
const MAGENTA = '#E879F9';
const WHITE = '#FFFFFF';
const MUTED = '#9FB3D1';

// ── comp-ring (240×240) — atomic motion unit, reused everywhere ──────────────
const ringChildren: Element[] = [
  {
    id: 'r-glow',
    name: 'core-glow',
    type: 'shape',
    transform: tf(20, 20, 200, 200),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'ellipse',
    fill: {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 115,
      stops: [
        { at: 0, color: CYAN },
        { at: 1, color: '#38BDF800' },
      ],
    },
    filter: { blur: 14 },
    animation: anim({
      opacity: track(
        kf(0, 0.35, EASE.inOut),
        kf(90, 0.6, EASE.inOut),
        kf(180, 0.3, EASE.inOut),
        kf(270, 0.6, EASE.inOut),
        kf(350, 0.4, EASE.inOut),
      ),
      'scale.x': track(
        kf(0, 1, EASE.inOut),
        kf(120, 1.14, EASE.inOut),
        kf(240, 1, EASE.inOut),
        kf(350, 1.1, EASE.inOut),
      ),
      'scale.y': track(
        kf(0, 1, EASE.inOut),
        kf(120, 1.14, EASE.inOut),
        kf(240, 1, EASE.inOut),
        kf(350, 1.1, EASE.inOut),
      ),
    }),
  },
  {
    id: 'r-outer',
    name: 'ring-outer',
    type: 'shape',
    transform: tf(20, 20, 200, 200),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    shape: 'ellipse',
    stroke: { width: 6, color: CYAN_LT, dash: [10, 12] },
    animation: anim({ rotation: track(kfLinear(0, 0), kfLinear(OUT, 720)) }),
  },
  {
    id: 'r-inner',
    name: 'ring-inner',
    type: 'shape',
    transform: tf(56, 56, 128, 128),
    opacity: 0.9,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'ellipse',
    stroke: { width: 3, color: CYAN, dash: [3, 12] },
    animation: anim({ rotation: track(kfLinear(0, 0), kfLinear(OUT, -540)) }),
  },
  {
    id: 'r-dot',
    name: 'core-dot',
    type: 'shape',
    transform: tf(110, 110, 20, 20),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    shape: 'ellipse',
    fill: { kind: 'solid', color: MAGENTA },
    shadow: { offsetX: 0, offsetY: 0, blur: 18, color: '#E879F9CC' },
    animation: anim({
      'scale.x': track(
        kf(0, 1, EASE.inOut),
        kf(50, 1.6, EASE.inOut),
        kf(110, 1, EASE.inOut),
        kf(170, 1.6, EASE.inOut),
        kf(230, 1, EASE.inOut),
        kf(300, 1.6, EASE.inOut),
        kf(350, 1, EASE.inOut),
      ),
      'scale.y': track(
        kf(0, 1, EASE.inOut),
        kf(50, 1.6, EASE.inOut),
        kf(110, 1, EASE.inOut),
        kf(170, 1.6, EASE.inOut),
        kf(230, 1, EASE.inOut),
        kf(300, 1.6, EASE.inOut),
        kf(350, 1, EASE.inOut),
      ),
      opacity: track(
        kf(0, 1, EASE.inOut),
        kf(50, 0.65, EASE.inOut),
        kf(110, 1, EASE.inOut),
        kf(230, 0.65, EASE.inOut),
        kf(350, 1, EASE.inOut),
      ),
    }),
  },
];

// ── comp-logobug (540×150) — NESTS comp-ring ─────────────────────────────────
const logobugChildren: Element[] = [
  {
    id: 'lb-plate',
    name: 'bug-plate',
    type: 'shape',
    transform: tf(0, 0, 540, 150, { ax: 0, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rounded-rect',
    cornerRadius: 26,
    fill: {
      kind: 'linear',
      angle: 105,
      stops: [
        { at: 0, color: '#0B1224' },
        { at: 1, color: '#243B66' },
      ],
    },
    stroke: { width: 1, color: '#2A3454' },
    shadow: { offsetX: 0, offsetY: 18, blur: 44, color: '#00000099' },
  },
  {
    id: 'lb-edge',
    name: 'bug-edge',
    type: 'shape',
    transform: tf(0, 0, 8, 150, { ax: 0, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    shape: 'rect',
    fill: { kind: 'solid', color: CYAN },
  },
  {
    id: 'lb-ring',
    name: 'bug-ring',
    type: 'composition',
    compositionId: 'comp-ring',
    transform: tf(20, 15, 120, 120, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 2,
  },
  {
    id: 'lb-mark',
    name: 'emblem',
    type: 'image',
    transform: tf(48, 43, 64, 64),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    assetId: 'showcase-emblem',
    source: 'project',
    fit: 'contain',
    preserveAspect: true,
    animation: anim({
      'scale.x': track(
        kf(0, 0.9, EASE.inOut),
        kf(120, 1.06, EASE.inOut),
        kf(240, 0.96, EASE.inOut),
        kf(OUT, 1, EASE.inOut),
      ),
      'scale.y': track(
        kf(0, 0.9, EASE.inOut),
        kf(120, 1.06, EASE.inOut),
        kf(240, 0.96, EASE.inOut),
        kf(OUT, 1, EASE.inOut),
      ),
    }),
  },
  {
    id: 'lb-tag',
    name: 'bug-tag',
    type: 'text',
    transform: tf(168, 92, 240, 26, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    text: 'ON AIR · 24/7',
    font: {
      family: 'Inter',
      weight: 600,
      style: 'normal',
      size: 16,
      lineHeight: 1.2,
      letterSpacing: 0.2,
    },
    color: CYAN_LT,
    align: 'start',
    direction: 'ltr',
    fitMode: 'fixed',
    overflow: 'clip',
  },
];

// ── comp-lowerthird (1920×1080) — content near the lower third; NESTS comp-ring
const lowerthirdChildren: Element[] = [
  {
    id: 'lt-plate',
    name: 'glass-plate',
    type: 'shape',
    transform: tf(150, 812, 1000, 172, { ax: 0, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rounded-rect',
    cornerRadius: 20,
    fill: {
      kind: 'linear',
      angle: 105,
      stops: [
        { at: 0, color: '#0B1224' },
        { at: 1, color: '#1E2A47' },
      ],
    },
    shadow: { offsetX: 0, offsetY: 22, blur: 52, color: '#000000AA' },
    animation: anim({
      'scale.x': track(kf(150, 0, EASE.outExpo), kf(174, 1, EASE.outExpo)),
      opacity: track(kf(150, 0), kf(160, 1)),
    }),
  },
  {
    id: 'lt-accent',
    name: 'accent-bar',
    type: 'shape',
    transform: tf(150, 812, 8, 172, { ax: 0, ay: 1 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    shape: 'rect',
    fill: { kind: 'solid', color: CYAN },
    animation: anim({
      'scale.y': track(kf(158, 0, EASE.outBack), kf(180, 1, EASE.outBack)),
    }),
  },
  {
    id: 'lt-kicker',
    name: 'kicker-fa',
    type: 'text',
    transform: tf(186, 838, 760, 30, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 2,
    text: 'پخش زنده — شبکه آرورا',
    font: {
      family: 'asset-showcase-vazir',
      weight: 700,
      style: 'normal',
      size: 19,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    color: CYAN_LT,
    align: 'end',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    animation: anim({
      opacity: track(kf(162, 0), kf(180, 1)),
      'position.x': track(kf(162, 206, EASE.outExpo), kf(182, 186, EASE.outExpo)),
    }),
  },
  {
    id: 'lt-ring',
    name: 'lt-ring',
    type: 'composition',
    compositionId: 'comp-ring',
    transform: tf(1006, 858, 96, 96, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    animation: anim({
      opacity: track(kf(168, 0, EASE.outCubic), kf(190, 1, EASE.outCubic)),
      'scale.x': track(kf(168, 0.4, EASE.outBack), kf(192, 1, EASE.outBack)),
      'scale.y': track(kf(168, 0.4, EASE.outBack), kf(192, 1, EASE.outBack)),
    }),
  },
];

// ── comp-backdrop (1920×1080) — atmosphere ───────────────────────────────────
const gridX = [384, 768, 1152, 1536];
const gridEls: Element[] = gridX.map((gx, i) => ({
  id: `bd-grid${String(i)}`,
  name: `grid-${String(i)}`,
  type: 'shape',
  transform: tf(gx, 0, 2, 1080, { ax: 0.5, ay: 1 }),
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 3,
  shape: 'rect',
  fill: { kind: 'solid', color: '#16223E' },
  animation: anim({
    'scale.y': track(
      kf(0, 0, EASE.outCubic),
      kf(18 + i * 6, 0, EASE.outCubic),
      kf(52 + i * 6, 1, EASE.outExpo),
    ),
    opacity: track(kf(0, 0), kf(18 + i * 6, 0), kf(52 + i * 6, 0.55)),
  }),
}));

const PARTICLES: { x: number; y: number; s: number; c: string; d: number }[] = [
  { x: 300, y: 980, s: 9, c: CYAN_LT, d: 0 },
  { x: 560, y: 1030, s: 6, c: CYAN, d: 24 },
  { x: 900, y: 1000, s: 7, c: VIOLET, d: 48 },
  { x: 1180, y: 1040, s: 5, c: CYAN_LT, d: 12 },
  { x: 1440, y: 1010, s: 8, c: MAGENTA, d: 60 },
  { x: 1680, y: 1050, s: 6, c: CYAN, d: 36 },
];
const particleEls: Element[] = PARTICLES.map((p, i) => ({
  id: `bd-p${String(i)}`,
  name: `particle-${String(i)}`,
  type: 'shape',
  transform: tf(p.x, p.y, p.s, p.s),
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 5,
  shape: 'ellipse',
  fill: { kind: 'solid', color: p.c },
  filter: { blur: 1 },
  animation: anim({
    'position.y': track(kfLinear(0, p.y), kfLinear(OUT, p.y - 460 - p.d)),
    opacity: track(
      kf(0, 0, EASE.inOut),
      kf(36 + p.d, 0.85, EASE.inOut),
      kf(220, 0.45, EASE.inOut),
      kf(OUT, 0, EASE.inOut),
    ),
  }),
}));

const backdropChildren: Element[] = [
  {
    id: 'bd-base',
    name: 'base-vignette',
    type: 'shape',
    transform: tf(0, 0, W, H),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: {
      kind: 'radial',
      center: { x: 0.5, y: 0.42 },
      radius: 1180,
      stops: [
        { at: 0, color: '#0E1730' },
        { at: 0.6, color: '#0A1020' },
        { at: 1, color: INK },
      ],
    },
  },
  {
    id: 'bd-texture',
    name: 'film-texture',
    type: 'image',
    transform: tf(0, 0, W, H),
    opacity: 0.16,
    visible: true,
    locked: false,
    zIndex: 1,
    assetId: 'showcase-texture',
    source: 'project',
    fit: 'cover',
    preserveAspect: true,
    filter: { contrast: 112, brightness: 88 },
    animation: anim({
      'scale.x': track(kf(0, 1.12, EASE.inOut), kf(OUT, 1.04, EASE.inOut)),
      'scale.y': track(kf(0, 1.12, EASE.inOut), kf(OUT, 1.04, EASE.inOut)),
      opacity: track(
        kf(0, 0, EASE.outCubic),
        kf(55, 0.18, EASE.outCubic),
        kf(OUT, 0.12, EASE.inOut),
      ),
    }),
  },
  {
    id: 'bd-auroraA',
    name: 'aurora-a',
    type: 'shape',
    transform: tf(-260, -260, 1100, 1100),
    opacity: 0.55,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'ellipse',
    fill: {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 560,
      stops: [
        { at: 0, color: '#3B82F6' },
        { at: 1, color: '#3B82F600' },
      ],
    },
    filter: { blur: 70 },
    animation: anim({
      'position.x': track(
        kf(0, -360, EASE.inOut),
        kf(180, -180, EASE.inOut),
        kf(OUT, -300, EASE.inOut),
      ),
      'position.y': track(
        kf(0, -300, EASE.inOut),
        kf(180, -180, EASE.inOut),
        kf(OUT, -260, EASE.inOut),
      ),
      rotation: track(kfLinear(0, 0), kfLinear(OUT, 60)),
      opacity: track(
        kf(0, 0, EASE.outCubic),
        kf(45, 0.55, EASE.outCubic),
        kf(OUT, 0.4, EASE.inOut),
      ),
    }),
  },
  {
    id: 'bd-auroraB',
    name: 'aurora-b',
    type: 'shape',
    transform: tf(1080, 320, 1040, 1040),
    opacity: 0.45,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'ellipse',
    fill: {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 520,
      stops: [
        { at: 0, color: VIOLET },
        { at: 1, color: '#8B5CF600' },
      ],
    },
    filter: { blur: 80 },
    animation: anim({
      'position.x': track(
        kf(0, 1180, EASE.inOut),
        kf(200, 1000, EASE.inOut),
        kf(OUT, 1120, EASE.inOut),
      ),
      'position.y': track(
        kf(0, 380, EASE.inOut),
        kf(200, 300, EASE.inOut),
        kf(OUT, 360, EASE.inOut),
      ),
      rotation: track(kfLinear(0, 0), kfLinear(OUT, -50)),
      opacity: track(
        kf(0, 0, EASE.outCubic),
        kf(55, 0.45, EASE.outCubic),
        kf(OUT, 0.34, EASE.inOut),
      ),
    }),
  },
  ...gridEls,
  {
    id: 'bd-horizon',
    name: 'horizon',
    type: 'shape',
    transform: tf(0, 690, W, 2, { ax: 0, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    shape: 'rect',
    fill: { kind: 'solid', color: '#22D3EE' },
    animation: anim({
      'scale.x': track(kf(10, 0, EASE.outExpo), kf(60, 1, EASE.outExpo)),
      opacity: track(kf(10, 0), kf(60, 0.28)),
    }),
  },
  ...particleEls,
];

// ── comp-master (1920×1080) — opens first; nests all four + bound text ───────
const masterChildren: Element[] = [
  {
    id: 'm-backdrop',
    name: 'backdrop',
    type: 'composition',
    compositionId: 'comp-backdrop',
    transform: tf(0, 0, W, H),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    animation: anim({
      opacity: track(kf(0, 0, EASE.outCubic), kf(30, 1, EASE.outCubic)),
      'scale.x': track(kf(0, 1.06, EASE.outExpo), kf(60, 1, EASE.outExpo)),
      'scale.y': track(kf(0, 1.06, EASE.outExpo), kf(60, 1, EASE.outExpo)),
    }),
  },
  {
    id: 'm-haloring',
    name: 'halo-ring',
    type: 'composition',
    compositionId: 'comp-ring',
    transform: tf(660, 130, 600, 600, { ax: 0.5, ay: 0.5 }),
    opacity: 0.16,
    visible: true,
    locked: false,
    zIndex: 1,
    animation: anim({
      opacity: track(
        kf(60, 0, EASE.outCubic),
        kf(110, 0.16, EASE.outCubic),
        kf(OUT, 0.1, EASE.inOut),
      ),
      'scale.x': track(kf(60, 0.7, EASE.outExpo), kf(120, 1, EASE.outExpo)),
      'scale.y': track(kf(60, 0.7, EASE.outExpo), kf(120, 1, EASE.outExpo)),
    }),
  },
  // Corner framing brackets (top-left + bottom-right).
  {
    id: 'm-tl-h',
    name: 'bracket-tl-h',
    type: 'shape',
    transform: tf(96, 96, 150, 4, { ax: 0, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    shape: 'rect',
    fill: { kind: 'solid', color: '#2F4068' },
    animation: anim({ 'scale.x': track(kf(28, 0, EASE.outExpo), kf(56, 1, EASE.outExpo)) }),
  },
  {
    id: 'm-tl-v',
    name: 'bracket-tl-v',
    type: 'shape',
    transform: tf(96, 96, 4, 150, { ax: 0.5, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    shape: 'rect',
    fill: { kind: 'solid', color: '#2F4068' },
    animation: anim({ 'scale.y': track(kf(28, 0, EASE.outExpo), kf(56, 1, EASE.outExpo)) }),
  },
  {
    id: 'm-br-h',
    name: 'bracket-br-h',
    type: 'shape',
    transform: tf(1674, 980, 150, 4, { ax: 1, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    shape: 'rect',
    fill: { kind: 'solid', color: '#2F4068' },
    animation: anim({ 'scale.x': track(kf(34, 0, EASE.outExpo), kf(62, 1, EASE.outExpo)) }),
  },
  {
    id: 'm-br-v',
    name: 'bracket-br-v',
    type: 'shape',
    transform: tf(1820, 834, 4, 150, { ax: 0.5, ay: 1 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    shape: 'rect',
    fill: { kind: 'solid', color: '#2F4068' },
    animation: anim({ 'scale.y': track(kf(34, 0, EASE.outExpo), kf(62, 1, EASE.outExpo)) }),
  },
  // Hero title — blur focus-in + letter-spacing reveal. Bound to {{title}}.
  {
    id: 'm-title',
    name: 'hero-title',
    type: 'text',
    transform: tf(360, 408, 1200, 130, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 6,
    text: '{{title}}',
    font: {
      family: 'Inter',
      weight: 800,
      style: 'normal',
      size: 96,
      lineHeight: 1.05,
      letterSpacing: 0,
    },
    color: WHITE,
    align: 'center',
    direction: 'auto',
    fitMode: 'autosize',
    overflow: 'clip',
    textShadow: { offsetX: 0, offsetY: 12, blur: 40, color: '#00000088' },
    animation: anim({
      opacity: track(kf(66, 0, EASE.outCubic), kf(96, 1, EASE.outCubic)),
      'font.letterSpacing': track(kf(66, 0.24, EASE.outExpo), kf(120, 0, EASE.outExpo)),
      'filter.blur': track(kf(66, 16, EASE.outExpo), kf(118, 0, EASE.outExpo)),
      'position.y': track(kf(66, 430, EASE.outExpo), kf(118, 408, EASE.outExpo)),
    }),
  },
  // Accent underline — grows from centre. Colour bound to {{accent}}.
  {
    id: 'm-underline',
    name: 'title-underline',
    type: 'shape',
    transform: tf(835, 556, 250, 5, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 5,
    shape: 'rounded-rect',
    cornerRadius: 3,
    fill: { kind: 'solid', color: CYAN },
    shadow: { offsetX: 0, offsetY: 0, blur: 16, color: '#38BDF8AA' },
    animation: anim({
      'scale.x': track(kf(104, 0, EASE.outExpo), kf(126, 1, EASE.outExpo)),
      opacity: track(kf(104, 0), kf(118, 1)),
    }),
  },
  // Subtitle. Bound to {{subtitle}}.
  {
    id: 'm-subtitle',
    name: 'subtitle',
    type: 'text',
    transform: tf(360, 580, 1200, 48, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 6,
    text: '{{subtitle}}',
    font: {
      family: 'Inter',
      weight: 500,
      style: 'normal',
      size: 28,
      lineHeight: 1.3,
      letterSpacing: 0.28,
    },
    color: MUTED,
    align: 'center',
    direction: 'auto',
    fitMode: 'autosize',
    overflow: 'ellipsis',
    animation: anim({
      opacity: track(kf(100, 0), kf(128, 1)),
      'position.y': track(kf(100, 602, EASE.outExpo), kf(130, 580, EASE.outExpo)),
    }),
  },
  // Persian tagline (RTL / Vazirmatn). Bound to {{tagFa}}.
  {
    id: 'm-tagfa',
    name: 'tagline-fa',
    type: 'text',
    transform: tf(360, 636, 1200, 40, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 6,
    text: '{{tagFa}}',
    font: {
      family: 'asset-showcase-vazir',
      weight: 500,
      style: 'normal',
      size: 24,
      lineHeight: 1.5,
      letterSpacing: 0,
    },
    color: '#7E8DB5',
    align: 'center',
    direction: 'rtl',
    fitMode: 'autosize',
    overflow: 'ellipsis',
    animation: anim({
      opacity: track(kf(112, 0), kf(138, 0.95)),
      'position.y': track(kf(112, 656, EASE.outExpo), kf(140, 636, EASE.outExpo)),
    }),
  },
  // Lower-third pre-comp + its operator-editable text laid over it.
  {
    id: 'm-lowerthird',
    name: 'lower-third',
    type: 'composition',
    compositionId: 'comp-lowerthird',
    transform: tf(0, 0, W, H),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 7,
    animation: anim({
      opacity: track(kf(148, 0, EASE.outCubic), kf(164, 1, EASE.outCubic)),
    }),
  },
  {
    id: 'm-name',
    name: 'name-text',
    type: 'text',
    transform: tf(188, 858, 820, 64, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 8,
    text: '{{name}}',
    font: {
      family: 'Inter',
      weight: 800,
      style: 'normal',
      size: 52,
      lineHeight: 1.1,
      letterSpacing: -0.01,
    },
    color: WHITE,
    align: 'start',
    direction: 'auto',
    fitMode: 'autosize',
    overflow: 'ellipsis',
    animation: anim({
      opacity: track(kf(166, 0), kf(186, 1)),
      'position.y': track(kf(166, 880, EASE.outExpo), kf(188, 858, EASE.outExpo)),
    }),
  },
  {
    id: 'm-role',
    name: 'role-text',
    type: 'text',
    transform: tf(188, 922, 820, 36, { ax: 0, ay: 0 }),
    opacity: 0.92,
    visible: true,
    locked: false,
    zIndex: 8,
    text: '{{role}}',
    font: {
      family: 'Inter',
      weight: 500,
      style: 'normal',
      size: 26,
      lineHeight: 1.2,
      letterSpacing: 0.01,
    },
    color: MUTED,
    align: 'start',
    direction: 'auto',
    fitMode: 'autosize',
    overflow: 'ellipsis',
    animation: anim({
      opacity: track(kf(176, 0), kf(196, 0.92)),
      'position.y': track(kf(176, 942, EASE.outExpo), kf(198, 922, EASE.outExpo)),
    }),
  },
  // Corner logo-bug pre-comp + its channel id laid over it.
  {
    id: 'm-logobug',
    name: 'logo-bug',
    type: 'composition',
    compositionId: 'comp-logobug',
    transform: tf(1290, 64, 540, 150, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 9,
    animation: anim({
      opacity: track(kf(40, 0, EASE.outCubic), kf(64, 1, EASE.outCubic)),
      'scale.x': track(kf(40, 0.5, EASE.outBack), kf(74, 1, EASE.outBack)),
      'scale.y': track(kf(40, 0.5, EASE.outBack), kf(74, 1, EASE.outBack)),
      rotation: track(kf(40, -6, EASE.outBack), kf(74, 0, EASE.outBack)),
    }),
  },
  {
    id: 'm-channel',
    name: 'channel-id',
    type: 'text',
    transform: tf(1450, 110, 360, 48, { ax: 0, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 10,
    text: '{{channel}}',
    font: {
      family: 'Inter',
      weight: 800,
      style: 'normal',
      size: 32,
      lineHeight: 1.1,
      letterSpacing: 0.06,
    },
    color: WHITE,
    align: 'start',
    direction: 'auto',
    fitMode: 'autosize',
    overflow: 'ellipsis',
    animation: anim({
      opacity: track(kf(58, 0), kf(78, 1)),
      'position.x': track(kf(58, 1470, EASE.outExpo), kf(80, 1450, EASE.outExpo)),
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

const range = { in: 0, out: OUT };

/**
 * The flagship "Aurora Network" showcase. The main scene's own `layers` are
 * intentionally empty — the project is composition-centric, so the Designer
 * opens `compositions[0]` (the master) on load. All content lives in the five
 * compositions below.
 */
export const showcaseScene: Scene = {
  schemaVersion: 1,
  id: 'starter-showcase',
  name: 'Aurora Network — Showcase',
  templateType: 'fullscreen',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: range,
  background: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-master',
      name: 'Master',
      resolution: { width: W, height: H },
      frameRange: range,
      background: 'transparent',
      layers: [layer('ml', 'Scene', masterChildren)],
    },
    {
      id: 'comp-ring',
      name: 'Ring',
      resolution: { width: 240, height: 240 },
      frameRange: range,
      background: 'transparent',
      layers: [layer('rl', 'Ring', ringChildren)],
    },
    {
      id: 'comp-logobug',
      name: 'Logo Bug',
      resolution: { width: 540, height: 150 },
      frameRange: range,
      background: 'transparent',
      layers: [layer('lbl', 'Bug', logobugChildren)],
    },
    {
      id: 'comp-lowerthird',
      name: 'Lower Third',
      resolution: { width: W, height: H },
      frameRange: range,
      background: 'transparent',
      layers: [layer('ltl', 'Lower Third', lowerthirdChildren)],
    },
    {
      id: 'comp-backdrop',
      name: 'Backdrop',
      resolution: { width: W, height: H },
      frameRange: range,
      background: 'transparent',
      layers: [layer('bdl', 'Backdrop', backdropChildren)],
    },
  ],
  fields: [
    { id: 'title', label: 'Title', required: true, type: 'text', default: 'AURORA NETWORK' },
    {
      id: 'subtitle',
      label: 'Subtitle',
      required: false,
      type: 'text',
      default: 'THE EVENING BROADCAST',
    },
    {
      id: 'tagFa',
      label: 'Persian tagline',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: 'اخبار و تحلیل، هر شب ساعت نه',
    },
    { id: 'name', label: 'Name', required: true, type: 'text', default: 'Darya Rahimi' },
    {
      id: 'role',
      label: 'Title / role',
      required: false,
      type: 'text',
      default: 'Anchor · Aurora News Desk',
    },
    { id: 'channel', label: 'Channel id', required: false, type: 'text', default: 'AURORA' },
    { id: 'accent', label: 'Accent colour', required: false, type: 'color', default: CYAN },
  ],
  bindings: [
    { fieldId: 'title', target: { kind: 'text', elementId: 'm-title', placeholder: '{{title}}' } },
    {
      fieldId: 'subtitle',
      target: { kind: 'text', elementId: 'm-subtitle', placeholder: '{{subtitle}}' },
    },
    { fieldId: 'tagFa', target: { kind: 'text', elementId: 'm-tagfa', placeholder: '{{tagFa}}' } },
    { fieldId: 'name', target: { kind: 'text', elementId: 'm-name', placeholder: '{{name}}' } },
    { fieldId: 'role', target: { kind: 'text', elementId: 'm-role', placeholder: '{{role}}' } },
    {
      fieldId: 'channel',
      target: { kind: 'text', elementId: 'm-channel', placeholder: '{{channel}}' },
    },
    { fieldId: 'accent', target: { kind: 'color', elementId: 'm-underline', property: 'fill' } },
  ],
  fonts: [
    { family: 'Inter', weights: [500, 600, 800], styles: ['normal'], source: 'system' },
    // Shipped as a project asset (see the starter's `assets` manifest in
    // index.ts). The bridge mints a real assetId at load time and rewrites
    // `asset-showcase-vazir` → `asset-<id>` here and on the Persian text.
    {
      family: 'asset-showcase-vazir',
      weights: [500, 700],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'Vazirmatn',
    },
  ],
  metadata: {
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    description:
      'Flagship showcase: a 7-second title sequence built from five nested compositions (backdrop, logo-bug→ring, lower-third→ring, master) exercising gradients, filters, dashed strokes, RTL text, and bound fields.',
    tags: ['starter', 'showcase', 'compositions', 'nested', 'animated'],
  },
};
