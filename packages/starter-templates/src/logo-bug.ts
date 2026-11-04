import type { Element, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, track } from './anim.js';

/**
 * «آرم شبکه» — a corner channel bug built around a replaceable APASAI logo
 * image. The image owns the authored transform animation, so an operator can
 * replace only the asset and keep the complete sting without rebuilding it.
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
const GOLD = '#E3B04B';
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
  // Replaceable logo image. Replacing the asset keeps this entire sting.
  {
    id: 'lb-mark',
    name: 'لوگو (قابل جایگزینی)',
    type: 'image',
    assetId: 'apasai-logo',
    source: 'project',
    fit: 'contain',
    preserveAspect: true,
    transform: tf(346, 26, 76, 76),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    animation: anim({
      rotation: track(
        kf(8, -18, EASE.outExpo),
        kf(58, 0, EASE.outExpo),
        kf(74, 0, EASE.inCubic),
        kf(112, 18, EASE.inCubic),
      ),
      'scale.x': track(kf(8, 0.35, EASE.outBack), kf(34, 1, EASE.outBack)),
      'scale.y': track(kf(8, 0.35, EASE.outBack), kf(34, 1, EASE.outBack)),
      opacity: track(kf(8, 0), kf(20, 1), kf(100, 1), kf(114, 0)),
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
  editorBackdrop: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-logo-bug',
      name: 'آرم شبکه',
      resolution: { width: W, height: H },
      frameRange: { in: 0, out: 132 },
      lifecycle: { outPoint: 70, contentStart: 5 },
      playout: { mode: 'manual' },
      editorBackdrop: 'transparent',
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
      lifecycle: { outPoint: 70, contentStart: 5 },
      playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: 8000, repeat: 'infinite' },
      editorBackdrop: 'transparent',
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
      'Corner channel bug with a replaceable APASAI image asset beside a Persian wordmark; the asset keeps the authored loop-cycle sting when replaced.',
    tags: [
      'starter',
      'logo-bug',
      'persian',
      'rtl',
      'replaceable-logo',
      'loop-cycle',
      'onair:comp-logo-mark',
    ],
  },
};
