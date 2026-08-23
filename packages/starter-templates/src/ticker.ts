import type { Element, Fill, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, track } from './anim.js';

/**
 * «نوار اخبار» — a professional Persian news ticker done the content-driven
 * way, styled to the owner's notes: FULL-BLEED strap (no side margins), the
 * red «خبر فوری» plate flush against the navy bar (no gap), no gold
 * hairlines, no crawl side-padding, taller bar, and a live dot that keeps
 * blinking on air.
 *
 * Structure (D-119 two-comp model):
 *   comp-ticker        1920×1080 — positioning context; EXPORTED for now
 *                      (entryCompositionId; runtime positioning later)
 *   comp-ticker-strap  1920×136 — the graphic's own footprint (future
 *                      on-air target once operator positioning ships)
 *   comp-ticker-pulse  24×24 — the blinking dot; its OWN loop-cycle playout
 *                      keeps it blinking through the hold (keyframes freeze
 *                      during hold; a nested looping comp does not)
 *
 * Lifecycle (50 fps, on BOTH the full comp and the strap): IN 0–60 (plate
 * rises, bar wipes open from the right, crawl fades up at contentStart 55)
 * → HOLD at 60, `mode: 'manual'` = on air until the operator's stop/out →
 * OUT 60–110 in the strap (crawl fades, bar wipes shut, plate drops); the
 * full comp's outro runs to 122 so the root never settles before the
 * strap's exit finishes.
 */

const FPS = 50 as const;
const W = 1920;
const H = 1080;

/** Bundled Vazirmatn asset family (rewritten to asset-<id> on load). */
const FAM = 'asset-ticker-vazir';

// ── Palette (shared broadcast-news family) ─────────────────────────────────
const NAVY_D = '#0A1733';
const NAVY_M = '#16305F';
const RED = '#D5192E';
const RED_D = '#8F0E1F';
const WHITE = '#FFFFFF';

// ── Strap geometry — full-bleed, label plate flush right ──────────────────
const STRAP_W = 1920;
const STRAP_H = 136; // strap comp: bar + room for the slide-in from below
const BAR_H = 76;
const LABEL_W = 280;
const BAR_W = STRAP_W - LABEL_W; // 1640 — flush against the label plate
const STRAP_Y = 944; // strap origin in the full frame (bar bottom at 1020)

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
  { id: 'h1', text: 'رشد ۴۲ درصدی صادرات غیرنفتی در نیمهٔ نخست سال' },
  { id: 'h2', text: 'آغاز ثبت‌نام آزمون سراسری از هفتهٔ آینده' },
  { id: 'h3', text: 'افتتاح بزرگ‌ترین نیروگاه خورشیدی کشور در استان یزد' },
  { id: 'h4', text: 'تیم ملی والیبال ایران به نیمه‌نهایی آسیا صعود کرد' },
];

// Bound-field copy: BOTH the label element's base text and the `label` field's
// `default`, so the Designer shows real Persian (never a raw token) and an
// operator who sends no value gets the same string on air.
const LABEL_DEFAULT = 'خبر فوری';

// ── comp-ticker-pulse (24×24) — the ever-blinking live dot ────────────────
const pulseChildren: Element[] = [
  {
    id: 'pu-dot',
    name: 'dot',
    type: 'shape',
    transform: tf(4, 4, 16, 16),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'ellipse',
    fill: { kind: 'solid', color: WHITE },
    shadow: { offsetX: 0, offsetY: 0, blur: 10, color: '#FFFFFFB3' },
    animation: anim({
      opacity: track(kf(0, 1, EASE.inOut), kf(25, 0.3, EASE.inOut), kf(50, 1, EASE.inOut)),
    }),
  },
];

// ── comp-ticker-strap (1920×136) — the graphic itself, local coords ───────
const strapChildren: Element[] = [
  // Navy bar — full width up to the label plate, wipes open from the right.
  {
    id: 'tk-bar',
    name: 'bar',
    type: 'shape',
    transform: tf(0, 0, BAR_W, BAR_H, { ax: 1, ay: 0 }),
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
        kf(66, 1, EASE.inCubic),
        kf(96, 0, EASE.inCubic),
      ),
      opacity: track(kf(8, 0), kf(20, 1), kf(88, 1), kf(102, 0)),
    }),
  },
  // The content-driven crawl — full bar width, no side padding.
  {
    id: 'tk-crawl',
    name: 'crawl',
    type: 'ticker',
    transform: tf(0, 0, BAR_W, BAR_H, { ax: 0, ay: 0 }),
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
      opacity: track(kf(40, 0), kf(54, 1), kf(60, 1), kf(72, 0)),
    }),
  },
  // Red label plate — flush against the bar, pinned to the RTL reading edge.
  {
    id: 'tk-plate',
    name: 'label-plate',
    type: 'shape',
    transform: tf(BAR_W, 0, LABEL_W, BAR_H, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'rect',
    fill: lin(105, RED, RED_D),
    shadow: { offsetX: 0, offsetY: 10, blur: 26, color: '#00000080' },
    animation: anim({
      'position.y': track(
        kf(0, 58, EASE.outExpo),
        kf(22, 0, EASE.outExpo),
        kf(78, 0, EASE.inCubic),
        kf(106, 58, EASE.inCubic),
      ),
      opacity: track(kf(0, 0), kf(14, 1), kf(92, 1), kf(106, 0)),
    }),
  },
  // Blinking live dot — a nested loop-cycle comp so it blinks THROUGH the hold.
  {
    id: 'tk-pulse',
    name: 'live-dot',
    type: 'composition',
    compositionId: 'comp-ticker-pulse',
    transform: tf(BAR_W + 12, 26, 24, 24, { ax: 0.5, ay: 0.5 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    animation: anim({
      opacity: track(kf(14, 0), kf(30, 1), kf(80, 1), kf(94, 0)),
      'position.y': track(
        kf(0, 84, EASE.outExpo),
        kf(22, 26, EASE.outExpo),
        kf(78, 26, EASE.inCubic),
        kf(106, 84, EASE.inCubic),
      ),
    }),
  },
  // Label text — carries the `label` data key (base text = its default).
  {
    id: 'tk-label',
    name: 'label',
    type: 'text',
    transform: tf(BAR_W + 48, 15, LABEL_W - 64, 44, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    text: LABEL_DEFAULT,
    font: {
      family: FAM,
      weight: 800,
      style: 'normal',
      size: 30,
      lineHeight: 1.35,
      letterSpacing: 0,
    },
    color: WHITE,
    align: 'center',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    animation: anim({
      opacity: track(kf(16, 0), kf(30, 1), kf(84, 1), kf(96, 0)),
      'position.y': track(
        kf(0, 73, EASE.outExpo),
        kf(22, 15, EASE.outExpo),
        kf(78, 15, EASE.inCubic),
        kf(106, 73, EASE.inCubic),
      ),
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
 * Persian news ticker, two-comp structure. `comp-ticker` (full frame) is the
 * entry + export root FOR NOW; `comp-ticker-strap` is the graphic's own
 * footprint and the future on-air target once runtime operator positioning
 * ships (recorded in its name and the scene tags). Root fields/bindings
 * migrate into the strap comp on load (D-025).
 */
export const tickerScene: Scene = {
  schemaVersion: 1,
  id: 'starter-ticker',
  name: 'نوار اخبار',
  templateType: 'ticker',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 122 },
  editorBackdrop: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-ticker',
      name: 'نوار اخبار',
      resolution: { width: W, height: H },
      frameRange: { in: 0, out: 122 },
      lifecycle: { outPoint: 60, contentStart: 55 },
      playout: { mode: 'manual' },
      editorBackdrop: 'transparent',
      layers: [
        layer('L-full', 'Frame', [
          // The strap, positioned at its on-frame home. The envelope opacity
          // track keeps this scope animated so the root's outro runs in real
          // time (122 > the strap's 110 — the stage never hides mid-exit).
          {
            id: 'tk-strap',
            name: 'نوار',
            type: 'composition',
            compositionId: 'comp-ticker-strap',
            transform: tf(0, STRAP_Y, STRAP_W, STRAP_H, { ax: 0, ay: 0 }),
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            animation: anim({
              opacity: track(kf(0, 0), kf(6, 1), kf(112, 1), kf(122, 0)),
            }),
          } as Element,
        ]),
      ],
    },
    {
      id: 'comp-ticker-strap',
      name: 'نوار خبر (روی آنتن)',
      resolution: { width: STRAP_W, height: STRAP_H },
      frameRange: { in: 0, out: 110 },
      lifecycle: { outPoint: 60, contentStart: 55 },
      playout: { mode: 'manual' },
      editorBackdrop: 'transparent',
      layers: [layer('L-strap', 'Strap', strapChildren)],
    },
    {
      id: 'comp-ticker-pulse',
      name: 'چشمک',
      resolution: { width: 24, height: 24 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { outPoint: 50 },
      playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: 0, repeat: 'infinite' },
      editorBackdrop: 'transparent',
      layers: [layer('L-pulse', 'Pulse', pulseChildren)],
    },
  ],
  entryCompositionId: 'comp-ticker',
  fields: [
    {
      id: 'label',
      label: 'Label (برچسب)',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: LABEL_DEFAULT,
    },
    {
      id: 'headlines',
      label: 'Headlines (تیترها)',
      required: true,
      type: 'list',
      default: HEADLINES,
      // TEXT-FILE-OPT-01 — the textbook case for the authored file-source grant, and
      // the reason this starter is the one that carries it: a crawl IS long copy a
      // typist prepares elsewhere. `label` one field up is the complement — a short
      // label nobody loads from a file — so this starter shows an operator both
      // states in one Inspector without authoring anything.
      allowFileSource: true,
    },
  ],
  bindings: [
    { fieldId: 'label', target: { kind: 'text', elementId: 'tk-label' } },
    { fieldId: 'headlines', target: { kind: 'ticker-items', elementId: 'tk-crawl' } },
  ],
  fonts: [
    {
      family: FAM,
      weights: [600, 800],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'Vazirmatn',
    },
  ],
  metadata: {
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    description:
      'Persian news ticker: full-bleed strap, red «خبر فوری» plate flush against the navy bar, a content-driven RTL crawl (measured, never timed) that holds on air until the operator stops it, and a live dot that keeps blinking through the hold. Headlines are an editable list data key.',
    tags: ['starter', 'ticker', 'persian', 'rtl', 'content-driven', 'onair:comp-ticker-strap'],
  },
};
