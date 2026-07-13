import type { AnchorPoint, Element, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, kfPath, track } from './anim.js';

/**
 * «آرم شبکه» — a corner channel bug built around a D-110 pen-path mark.
 * A navy disc carries a white vector mark whose WHOLE SHAPE morphs on a
 * single `path` track: it enters as a spinning square (a 45°-rotated
 * diamond), rounds into a circle, then blooms into a four-point compass
 * star — the rest pose. A gold separator and the Persian wordmark slide in
 * beside it (wordmark to the LEFT of the mark, per RTL layout).
 *
 * Structure (D-119 two-comp model):
 *   comp-logo-bug      1920×1080 — positioning context; EXPORTED for now
 *                      (entryCompositionId; runtime positioning later).
 *                      `mode: 'manual'` — the bug stays on air until stop.
 *   comp-logo-mark     448×144 — the graphic's own footprint (future on-air
 *                      target). Owns the sting: loop-cycle + 8 s timed hold
 *                      + infinite repeats — IN (1.4 s) → rest 8 s → OUT
 *                      (1 s) → replay, ≈ every 10.4 s, independent of the
 *                      parent's hold. On operator stop the child plays its
 *                      out segment (the cascade forces the outro), and the
 *                      parent's longer outro (70→132) keeps the stage
 *                      visible until it finishes.
 */

const FPS = 50 as const;
const W = 1920;
const H = 1080;

/** Bundled Vazirmatn asset family (rewritten to asset-<id> on load). */
const FAM = 'asset-logo-bug-vazir';

// ── Palette (shared broadcast-news family) ─────────────────────────────────
const NAVY_D = '#0A1733';
const NAVY_M = '#1A3768';
const GOLD = '#E3B04B';
const GOLD_HAIR = '#E3B04B66';
const WHITE = '#FFFFFF';

// Bound-field copy. Each of these is BOTH the element's base text and the
// field's `default`, so the Designer shows real Persian (never a raw token) and
// an operator who sends no value gets the same string on air.
const CHANNEL_DEFAULT = 'شبکه جدید';
const TAG_DEFAULT = 'پخش زنده';

// ── Footprint comp geometry — nested at (1392, 40) in the full frame ──────
const MARK_W = 448;
const MARK_H = 144;
const MARK_X = 1392;
const MARK_Y = 40;

// ── The mark: one 4-anchor path, three poses on a single 'path' track ─────
// Local space 48×48, anchors on the box edges (curve extremes stay at the
// anchors in every pose, so the visual bbox is stable at (0,0)–(48,48)).
const R = 24; // half-extent
const K = 13.25; // circle handle length (0.5523 × R)

type Pose = 'diamond' | 'circle' | 'star';
function markPose(pose: Pose, q = 13): AnchorPoint[] {
  const c = R; // center offset — anchors at (c,0) (2c,c) (c,2c) (0,c)
  if (pose === 'diamond') {
    return [
      { id: 'pt', x: c, y: 0, smooth: false },
      { id: 'pr', x: 2 * c, y: c, smooth: false },
      { id: 'pb', x: c, y: 2 * c, smooth: false },
      { id: 'pl', x: 0, y: c, smooth: false },
    ];
  }
  if (pose === 'circle') {
    return [
      { id: 'pt', x: c, y: 0, in: { x: -K, y: 0 }, out: { x: K, y: 0 }, smooth: true },
      { id: 'pr', x: 2 * c, y: c, in: { x: 0, y: -K }, out: { x: 0, y: K }, smooth: true },
      { id: 'pb', x: c, y: 2 * c, in: { x: K, y: 0 }, out: { x: -K, y: 0 }, smooth: true },
      { id: 'pl', x: 0, y: c, in: { x: 0, y: K }, out: { x: 0, y: -K }, smooth: true },
    ];
  }
  // Four-point compass star: both handles of every anchor point at the center.
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

// ── comp-logo-mark children (LOCAL coords, 448×144) ────────────────────────
const markChildren: Element[] = [
  // Navy disc — the badge ground.
  {
    id: 'lb-disc',
    name: 'disc',
    type: 'shape',
    transform: tf(336, 16, 96, 96),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'ellipse',
    fill: {
      kind: 'radial',
      center: { x: 0.5, y: 0.38 },
      radius: 62,
      stops: [
        { at: 0, color: NAVY_M },
        { at: 1, color: NAVY_D },
      ],
    },
    stroke: { width: 1.5, color: GOLD_HAIR },
    shadow: { offsetX: 0, offsetY: 8, blur: 24, color: '#00000080' },
    animation: anim({
      'scale.x': track(
        kf(0, 0.5, EASE.outBack),
        kf(22, 1, EASE.outBack),
        kf(94, 1, EASE.inCubic),
        kf(118, 0.55, EASE.inCubic),
      ),
      'scale.y': track(
        kf(0, 0.5, EASE.outBack),
        kf(22, 1, EASE.outBack),
        kf(94, 1, EASE.inCubic),
        kf(118, 0.55, EASE.inCubic),
      ),
      opacity: track(kf(0, 0), kf(12, 1), kf(100, 1), kf(118, 0)),
    }),
  },
  // The morphing pen-path mark: square (rotated diamond) → circle → star.
  {
    id: 'lb-mark',
    name: 'mark',
    type: 'path',
    transform: tf(360, 40, 48, 48),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    points: markPose('star'),
    closed: true,
    fill: { kind: 'solid', color: WHITE },
    animation: anim({
      path: track(
        kfPath(8, markPose('diamond'), EASE.outCubic),
        kfPath(30, markPose('circle'), EASE.inOut),
        kfPath(52, markPose('star', 16), EASE.outCubic),
        kfPath(66, markPose('star'), EASE.outCubic),
        // OUT: bloom back through the circle to the diamond.
        kfPath(74, markPose('star'), EASE.inCubic),
        kfPath(96, markPose('circle'), EASE.inCubic),
        kfPath(112, markPose('diamond'), EASE.inCubic),
      ),
      rotation: track(
        kf(8, -135, EASE.outExpo),
        kf(58, 0, EASE.outExpo),
        kf(74, 0, EASE.inCubic),
        kf(112, 135, EASE.inCubic),
      ),
      'scale.x': track(kf(8, 0.6, EASE.outBack), kf(34, 1, EASE.outBack)),
      'scale.y': track(kf(8, 0.6, EASE.outBack), kf(34, 1, EASE.outBack)),
      opacity: track(kf(8, 0), kf(20, 1), kf(100, 1), kf(114, 0)),
    }),
  },
  // Gold centre dot — pops once the star settles.
  {
    id: 'lb-dot',
    name: 'centre-dot',
    type: 'shape',
    transform: tf(379, 59, 10, 10),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 2,
    shape: 'ellipse',
    fill: { kind: 'solid', color: GOLD },
    animation: anim({
      'scale.x': track(
        kf(40, 0, EASE.outBack),
        kf(58, 1, EASE.outBack),
        kf(82, 1, EASE.inCubic),
        kf(94, 0, EASE.inCubic),
      ),
      'scale.y': track(
        kf(40, 0, EASE.outBack),
        kf(58, 1, EASE.outBack),
        kf(82, 1, EASE.inCubic),
        kf(94, 0, EASE.inCubic),
      ),
      opacity: track(kf(40, 0), kf(52, 1), kf(84, 1), kf(94, 0)),
    }),
  },
  // Gold separator between mark and wordmark.
  {
    id: 'lb-sep',
    name: 'separator',
    type: 'shape',
    transform: tf(314, 42, 3, 44),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    shape: 'rect',
    fill: { kind: 'solid', color: GOLD },
    animation: anim({
      'scale.y': track(
        kf(26, 0, EASE.outExpo),
        kf(44, 1, EASE.outExpo),
        kf(78, 1, EASE.inCubic),
        kf(92, 0, EASE.inCubic),
      ),
      opacity: track(kf(26, 0), kf(38, 1), kf(82, 1), kf(92, 0)),
    }),
  },
  // Wordmark — carries the `channel` data key (base text = its default); sits
  // LEFT of the mark (RTL layout).
  {
    id: 'lb-word',
    name: 'wordmark',
    type: 'text',
    transform: tf(28, 24, 274, 44, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    text: CHANNEL_DEFAULT,
    font: {
      family: FAM,
      weight: 800,
      style: 'normal',
      size: 32,
      lineHeight: 1.25,
      letterSpacing: 0,
    },
    color: WHITE,
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    textShadow: { offsetX: 0, offsetY: 2, blur: 8, color: '#00000066' },
    animation: anim({
      opacity: track(kf(32, 0), kf(52, 1), kf(74, 1), kf(92, 0)),
      'position.x': track(
        kf(32, 44, EASE.outExpo),
        kf(54, 28, EASE.outExpo),
        kf(74, 28, EASE.inCubic),
        kf(92, 44, EASE.inCubic),
      ),
    }),
  },
  // Sub-tag — carries the `tag` data key (base text = its default).
  {
    id: 'lb-tag',
    name: 'sub-tag',
    type: 'text',
    transform: tf(28, 72, 274, 26, { ax: 0, ay: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 4,
    text: TAG_DEFAULT,
    font: {
      family: FAM,
      weight: 500,
      style: 'normal',
      size: 15,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    color: GOLD,
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    animation: anim({
      opacity: track(kf(44, 0), kf(62, 0.95), kf(70, 0.95), kf(82, 0)),
      'position.y': track(kf(44, 80, EASE.outExpo), kf(64, 72, EASE.outExpo)),
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
 * Corner logo bug with a looping sting, two-comp structure. `comp-logo-bug`
 * (full frame, manual hold) is the entry + export root FOR NOW;
 * `comp-logo-mark` owns the loop-cycle sting and is the future on-air
 * target once runtime operator positioning ships (recorded in its name and
 * the scene tags).
 */
export const logoBugScene: Scene = {
  schemaVersion: 1,
  id: 'starter-logo-bug',
  name: 'آرم شبکه',
  templateType: 'logo-bug',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 132 },
  background: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-logo-bug',
      name: 'آرم شبکه',
      resolution: { width: W, height: H },
      frameRange: { in: 0, out: 132 },
      lifecycle: { outPoint: 70 },
      playout: { mode: 'manual' },
      background: 'transparent',
      layers: [
        layer('L-full', 'Frame', [
          // The bug at its on-frame home (top-right, action-safe). The
          // envelope opacity track keeps this scope animated so the root's
          // outro runs in real time (70→132 outlasts the mark's 70→120
          // stop-exit — the stage never hides mid-exit).
          {
            id: 'lb-inst',
            name: 'آرم',
            type: 'composition',
            compositionId: 'comp-logo-mark',
            transform: tf(MARK_X, MARK_Y, MARK_W, MARK_H, { ax: 0, ay: 0 }),
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            animation: anim({
              opacity: track(kf(0, 0), kf(6, 1), kf(120, 1), kf(132, 0)),
            }),
          } as Element,
        ]),
      ],
    },
    {
      id: 'comp-logo-mark',
      name: 'آرم (روی آنتن)',
      resolution: { width: MARK_W, height: MARK_H },
      frameRange: { in: 0, out: 120 },
      lifecycle: { outPoint: 70 },
      playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: 8000, repeat: 'infinite' },
      background: 'transparent',
      layers: [layer('L-mark', 'Mark', markChildren)],
    },
  ],
  entryCompositionId: 'comp-logo-bug',
  fields: [
    {
      id: 'channel',
      label: 'Channel (نام شبکه)',
      required: true,
      type: 'text',
      direction: 'rtl',
      default: CHANNEL_DEFAULT,
    },
    {
      id: 'tag',
      label: 'Tag (زیرنوشت)',
      required: false,
      type: 'text',
      direction: 'rtl',
      default: TAG_DEFAULT,
    },
  ],
  bindings: [
    { fieldId: 'channel', target: { kind: 'text', elementId: 'lb-word' } },
    { fieldId: 'tag', target: { kind: 'text', elementId: 'lb-tag' } },
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
      'Corner channel bug: a pen-path mark that morphs square → circle → compass star beside a Persian wordmark, re-playing its sting every ~10 seconds via loop-cycle playout on the nested footprint comp, until stopped.',
    tags: [
      'starter',
      'logo-bug',
      'persian',
      'rtl',
      'path-morph',
      'loop-cycle',
      'onair:comp-logo-mark',
    ],
  },
};
