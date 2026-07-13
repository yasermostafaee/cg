import type { AnchorPoint, Element, Fill, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, track } from './anim.js';

/**
 * «زیرنویس معرفی» — a guest / expert name title (lower third) that SELF-CLOSES:
 * a two-tier plate flush against the right frame edge (the RTL reading edge),
 * a red brand square carrying the family compass-star mark, name + role on
 * bound data keys, and `auto-out` playout — enter, hold 6 s, play the authored
 * exit, settle. No operator stop needed.
 *
 * Structure (D-119 two-comp model):
 *   comp-title       1920×1080 — positioning context; EXPORTED for now
 *                    (entryCompositionId; runtime positioning later)
 *   comp-title-card  1000×190 — the graphic's own footprint (future on-air
 *                    target), owns the same auto-out lifecycle
 */

const FPS = 50 as const;
const W = 1920;
const H = 1080;

/** Bundled Vazirmatn asset family (rewritten to asset-<id> on load). */
const FAM = 'asset-title-vazir';

// ── Palette (shared broadcast-news family) ─────────────────────────────────
const NAVY_D = '#0A1733';
const NAVY_M = '#16305F';
const NAVY_DK = '#081226';
const NAVY_MID = '#0E2148';
const RED = '#D5192E';
const RED_D = '#8F0E1F';
const WHITE = '#FFFFFF';
const MUTED = '#A9BBDD';

// Bound-field copy. Each of these is BOTH the element's base text and the
// field's `default`, so the Designer shows real Persian (never a raw token) and
// an operator who sends no value gets the same string on air.
const NAME_DEFAULT = 'دکتر مریم احمدی';
const ROLE_DEFAULT = 'کارشناس اقتصاد انرژی';

// ── Footprint comp geometry — nested at (920, 812), flush right ───────────
const CARD_W = 1000;
const CARD_H = 190;
const CARD_X = 920;
const CARD_Y = 812;

// The family compass-star mark (36×36 local box), same construction as the
// logo starter's rest pose: both handles of every anchor point at the center.
function starPoints(): AnchorPoint[] {
  const c = 18;
  const q = 10;
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

// ── comp-title-card children (LOCAL coords, 1000×190) ──────────────────────
const cardChildren: Element[] = [
  // Name plate — wipes open from the right (toward the reading edge).
  {
    id: 'tt-name-plate',
    name: 'name-plate',
    type: 'shape',
    transform: tf(0, 20, 924, 76, { ax: 1, ay: 0 }),
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
        kf(38, 1, EASE.outExpo),
        kf(76, 1, EASE.inCubic),
        kf(104, 0, EASE.inCubic),
      ),
      opacity: track(kf(8, 0), kf(18, 1), kf(92, 1), kf(106, 0)),
    }),
  },
  // Role plate — the darker second tier, flush under the first.
  {
    id: 'tt-role-plate',
    name: 'role-plate',
    type: 'shape',
    transform: tf(240, 96, 760, 46, { ax: 1, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    shape: 'rect',
    fill: lin(90, NAVY_DK, NAVY_MID),
    animation: anim({
      'scale.x': track(
        kf(18, 0, EASE.outExpo),
        kf(46, 1, EASE.outExpo),
        kf(70, 1, EASE.inCubic),
        kf(92, 0, EASE.inCubic),
      ),
      opacity: track(kf(18, 0), kf(30, 1), kf(82, 1), kf(94, 0)),
    }),
  },
  // Red brand square — flush at the right frame edge.
  {
    id: 'tt-brand',
    name: 'brand-square',
    type: 'shape',
    transform: tf(924, 20, 76, 76),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'rect',
    fill: lin(105, RED, RED_D),
    shadow: { offsetX: 0, offsetY: 10, blur: 26, color: '#00000080' },
    animation: anim({
      'scale.x': track(
        kf(0, 0.5, EASE.outBack),
        kf(22, 1, EASE.outBack),
        kf(90, 1, EASE.inCubic),
        kf(112, 0.5, EASE.inCubic),
      ),
      'scale.y': track(
        kf(0, 0.5, EASE.outBack),
        kf(22, 1, EASE.outBack),
        kf(90, 1, EASE.inCubic),
        kf(112, 0.5, EASE.inCubic),
      ),
      opacity: track(kf(0, 0), kf(12, 1), kf(98, 1), kf(112, 0)),
    }),
  },
  // The compass-star mark inside the red square.
  {
    id: 'tt-star',
    name: 'star-mark',
    type: 'path',
    transform: tf(944, 40, 36, 36),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    points: starPoints(),
    closed: true,
    fill: { kind: 'solid', color: WHITE },
    animation: anim({
      rotation: track(
        kf(10, -90, EASE.outExpo),
        kf(36, 0, EASE.outExpo),
        kf(84, 0, EASE.inCubic),
        kf(108, 90, EASE.inCubic),
      ),
      'scale.x': track(
        kf(10, 0, EASE.outBack),
        kf(32, 1, EASE.outBack),
        kf(84, 1, EASE.inCubic),
        kf(108, 0, EASE.inCubic),
      ),
      'scale.y': track(
        kf(10, 0, EASE.outBack),
        kf(32, 1, EASE.outBack),
        kf(84, 1, EASE.inCubic),
        kf(108, 0, EASE.inCubic),
      ),
    }),
  },
  // Name — carries the `name` data key (base text = its default).
  {
    id: 'tt-name',
    name: 'name',
    type: 'text',
    transform: tf(24, 32, 856, 52, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    text: NAME_DEFAULT,
    font: {
      family: FAM,
      weight: 800,
      style: 'normal',
      size: 38,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    color: WHITE,
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    textShadow: { offsetX: 0, offsetY: 2, blur: 6, color: '#00000059' },
    animation: anim({
      opacity: track(kf(26, 0), kf(44, 1), kf(68, 1), kf(84, 0)),
      'position.x': track(
        kf(26, 48, EASE.outExpo),
        kf(48, 24, EASE.outExpo),
        kf(68, 24, EASE.inCubic),
        kf(88, 48, EASE.inCubic),
      ),
    }),
  },
  // Role / subtitle — carries the `role` data key (base text = its default).
  {
    id: 'tt-role',
    name: 'role',
    type: 'text',
    transform: tf(264, 103, 712, 34, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    text: ROLE_DEFAULT,
    font: {
      family: FAM,
      weight: 500,
      style: 'normal',
      size: 24,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    color: MUTED,
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    animation: anim({
      opacity: track(kf(36, 0), kf(54, 1), kf(65, 1), kf(78, 0)),
      'position.y': track(kf(36, 111, EASE.outExpo), kf(56, 103, EASE.outExpo)),
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
 * Guest / expert name title, two-comp structure. Self-closing: both comps
 * run `auto-out` with a 6-second timed hold — the intros are the same
 * length, so the timers stay aligned, and the full comp's outro (65→128)
 * outlasts the card's exit (65→115).
 */
export const titleScene: Scene = {
  schemaVersion: 1,
  id: 'starter-title',
  name: 'زیرنویس معرفی',
  templateType: 'lower-third',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 128 },
  background: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-title',
      name: 'زیرنویس معرفی',
      resolution: { width: W, height: H },
      frameRange: { in: 0, out: 128 },
      lifecycle: { outPoint: 65 },
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 6000 },
      background: 'transparent',
      layers: [
        layer('L-full', 'Frame', [
          {
            id: 'tt-card',
            name: 'زیرنویس',
            type: 'composition',
            compositionId: 'comp-title-card',
            transform: tf(CARD_X, CARD_Y, CARD_W, CARD_H, { ax: 0, ay: 0 }),
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            animation: anim({
              opacity: track(kf(0, 0), kf(6, 1), kf(118, 1), kf(128, 0)),
            }),
          } as Element,
        ]),
      ],
    },
    {
      id: 'comp-title-card',
      name: 'زیرنویس (روی آنتن)',
      resolution: { width: CARD_W, height: CARD_H },
      frameRange: { in: 0, out: 115 },
      lifecycle: { outPoint: 65 },
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 6000 },
      background: 'transparent',
      layers: [layer('L-card', 'Card', cardChildren)],
    },
  ],
  entryCompositionId: 'comp-title',
  fields: [
    {
      id: 'name',
      label: 'Name (نام)',
      required: true,
      type: 'text',
      direction: 'rtl',
      default: NAME_DEFAULT,
    },
    {
      id: 'role',
      label: 'Role (سمت)',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: ROLE_DEFAULT,
    },
  ],
  bindings: [
    { fieldId: 'name', target: { kind: 'text', elementId: 'tt-name' } },
    { fieldId: 'role', target: { kind: 'text', elementId: 'tt-role' } },
  ],
  fonts: [
    {
      family: FAM,
      weights: [500, 800],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'Vazirmatn',
    },
  ],
  metadata: {
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    description:
      'Self-closing Persian guest title: two-tier plate flush right, red brand square with the compass-star mark, bound name/role data keys, auto-out playout — enters, holds 6 s, exits by itself.',
    tags: [
      'starter',
      'title',
      'lower-third',
      'persian',
      'rtl',
      'auto-out',
      'onair:comp-title-card',
    ],
  },
};
