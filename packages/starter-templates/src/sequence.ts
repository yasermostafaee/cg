import type { AnchorPoint, Element, Fill, Scene, Transform } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';

/**
 * «توالی خبر» — the sequence-style counterpart of the news ticker: the same
 * full-bleed strap silhouette (navy bar + flush red label plate), but the
 * headlines ROTATE one at a time through a real `sequence` element instead
 * of crawling. Items are a `list` data key; the sequence is FINITE
 * (`repeat: 1`) so per D-116 the first item plays its transition-in, every
 * item advances on its dwell, the LAST item plays its transition-out — and
 * because the hold is `content-driven` + `auto-out`, the strap then exits
 * by itself. Sequence semantics, demonstrated end to end.
 *
 * Structure (D-119 two-comp model):
 *   comp-sequence    1920×1080 — positioning context; EXPORTED for now
 *   comp-seq-strap   1920×136 — the graphic's own footprint (future on-air
 *                    target); owns the content-driven auto-out lifecycle
 */

const FPS = 50 as const;
const W = 1920;
const H = 1080;

/** Bundled Vazirmatn asset family (rewritten to asset-<id> on load). */
const FAM = 'asset-sequence-vazir';

// ── Palette (shared broadcast-news family) ─────────────────────────────────
const NAVY_D = '#0A1733';
const NAVY_M = '#16305F';
const RED = '#D5192E';
const RED_D = '#8F0E1F';
const WHITE = '#FFFFFF';

// ── Strap geometry — identical silhouette to the ticker starter ────────────
const STRAP_W = 1920;
const STRAP_H = 136;
const BAR_H = 76;
const LABEL_W = 280;
const BAR_W = STRAP_W - LABEL_W; // 1640 — flush against the label plate
const STRAP_Y = 944;

// The family compass-star mark (28×28 local box) in the label plate.
function starPoints(): AnchorPoint[] {
  const c = 14;
  const q = 8;
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

const ITEMS = [
  { id: 's1', text: 'آغاز هفتهٔ فرهنگی اصفهان با آیین افتتاحیه در میدان نقش جهان' },
  { id: 's2', text: 'برداشت زعفران از مزارع خراسان جنوبی آغاز شد' },
  { id: 's3', text: 'نمایشگاه بین‌المللی صنایع دستی میزبان ۴۰۰ هنرمند داخلی و خارجی' },
  { id: 's4', text: 'پیش‌بینی بارش برف و باران در نوار شمالی کشور' },
];

// Bound-field copy: BOTH the label element's base text and the `label` field's
// `default`, so the Designer shows real Persian (never a raw token) and an
// operator who sends no value gets the same string on air.
const LABEL_DEFAULT = 'برگزیده';

// ── comp-seq-strap children (LOCAL coords, 1920×136) ───────────────────────
const strapChildren: Element[] = [
  // Navy bar — wipes open from the right.
  {
    id: 'sq-bar',
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
  // The rotating headline — a finite sequence element (one item on stage).
  {
    id: 'sq-rotator',
    name: 'rotator',
    type: 'sequence',
    transform: tf(0, 0, BAR_W - 28, BAR_H, { ax: 0, ay: 0 }),
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
    align: 'start',
    verticalAlign: 'middle',
    direction: 'rtl',
    items: ITEMS,
    defaultDwellMs: 4000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 450,
    repeat: 1,
    // Hard opacity gate (owner pattern 2026-07-12): 0 one frame BEFORE
    // content-start, 100 ON content-start (55), 100 ON the out-point (60),
    // 0 one frame AFTER it — no fades to fight the sequence's OWN item
    // transitions; the host snaps in with the content and snaps out with
    // the exit.
    animation: anim({
      opacity: track(kfLinear(54, 0), kfLinear(55, 1), kfLinear(60, 1), kfLinear(61, 0)),
    }),
  },
  // Red label plate — flush against the bar.
  {
    id: 'sq-plate',
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
  // Compass-star mark in the plate (the set's brand accent).
  {
    id: 'sq-star',
    name: 'star-mark',
    type: 'path',
    transform: tf(1652, 24, 28, 28),
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 3,
    points: starPoints(),
    closed: true,
    fill: { kind: 'solid', color: WHITE },
    animation: anim({
      rotation: track(kf(10, -90, EASE.outExpo), kf(34, 0, EASE.outExpo)),
      'scale.x': track(
        kf(10, 0, EASE.outBack),
        kf(30, 1, EASE.outBack),
        kf(80, 1, EASE.inCubic),
        kf(96, 0, EASE.inCubic),
      ),
      'scale.y': track(
        kf(10, 0, EASE.outBack),
        kf(30, 1, EASE.outBack),
        kf(80, 1, EASE.inCubic),
        kf(96, 0, EASE.inCubic),
      ),
      'position.y': track(
        kf(0, 82, EASE.outExpo),
        kf(22, 24, EASE.outExpo),
        kf(78, 24, EASE.inCubic),
        kf(106, 82, EASE.inCubic),
      ),
    }),
  },
  // Label text — carries the `label` data key (base text = its default).
  {
    id: 'sq-label',
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
 * Sequence strap, two-comp structure. Both comps are `auto-out` +
 * `content-driven`: the strap (a coordinator scope) self-settles when the
 * finite sequence completes and its exit finishes; the full comp awaits
 * that settle, then plays its own envelope outro. Fully self-closing.
 */
export const sequenceScene: Scene = {
  schemaVersion: 1,
  id: 'starter-sequence',
  name: 'توالی خبر',
  templateType: 'custom',
  resolution: { width: W, height: H },
  frameRate: FPS,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 122 },
  background: 'transparent',
  layers: [],
  compositions: [
    {
      id: 'comp-sequence',
      name: 'توالی خبر',
      resolution: { width: W, height: H },
      frameRange: { in: 0, out: 122 },
      lifecycle: { outPoint: 60 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      background: 'transparent',
      layers: [
        layer('L-full', 'Frame', [
          {
            id: 'sq-strap',
            name: 'توالی',
            type: 'composition',
            compositionId: 'comp-seq-strap',
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
      id: 'comp-seq-strap',
      name: 'توالی خبر (روی آنتن)',
      resolution: { width: STRAP_W, height: STRAP_H },
      frameRange: { in: 0, out: 110 },
      lifecycle: { outPoint: 60, contentStart: 55 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      background: 'transparent',
      layers: [layer('L-strap', 'Strap', strapChildren)],
    },
  ],
  entryCompositionId: 'comp-sequence',
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
      id: 'items',
      label: 'Items (خبرها)',
      required: true,
      type: 'list',
      default: ITEMS,
    },
  ],
  bindings: [
    { fieldId: 'label', target: { kind: 'text', elementId: 'sq-label' } },
    { fieldId: 'items', target: { kind: 'sequence-items', elementId: 'sq-rotator' } },
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
      'Sequence-style Persian news strap: headlines rotate one at a time through a finite sequence element (first item transitions in, each dwells, the last transitions out), then the strap closes itself via a content-driven auto-out hold. Items are an editable list data key.',
    tags: ['starter', 'sequence', 'persian', 'rtl', 'content-driven', 'onair:comp-seq-strap'],
  },
};
