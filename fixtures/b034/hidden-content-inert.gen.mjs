// Regenerate the B-034 fixtures: `node fixtures/b034/hidden-content-inert.gen.mjs`
// (run from the repo root, after `pnpm --filter @cg/shared-schema --filter @cg/vcg-format build`).
//
// Emits TWO real, schema-validated templates the B-034 guard tests assert against (each as a
// `.scene.json` authoritative Scene + a packed `.vcg` openable in the Designer), NOT inline comps:
//
// 1. hidden-content-inert — HIDDEN LEAF content. A content-driven parent instances a child whose ONLY
//    content is a HIDDEN infinite ticker with a per-instance holdOverride FORCE-INCLUDE → inert (parent
//    resolves to timed); plus a timed comp with a hidden finite ticker (exporter preflight silent) and
//    a comp with a hidden sequence (canStepScene Next disabled).
//
// 2. hidden-ancestor-inert — HIDDEN ANCESTOR (the case the leaf fixture missed; the user's master.vcg
//    shape). A content-driven parent instances: (a) a HIDDEN instance whose child holds a VISIBLE
//    infinite sequence with NO holdOverride — its whole subtree must be inert; (b) a VISIBLE instance
//    with a finite ticker (repeat 1) that DRIVES the close; (c) a VISIBLE instance whose infinite
//    sequence is excluded via a per-instance holdOverride. The parent must SETTLE when (b) completes —
//    (a)'s visible infinite sequence must NOT keep it open.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pack } from '../../packages/vcg-format/dist/index.js';
import { SceneSchema } from '../../packages/shared-schema/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));

const tx = (x, y, w, h) => ({
  position: { x, y },
  size: { w, h },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
});
const font = (size) => ({
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal',
  size,
  lineHeight: 1.4,
  letterSpacing: 0,
});

const ticker = (id, name, repeat, visible, speed = 120) => ({
  id,
  name,
  type: 'ticker',
  visible,
  locked: false,
  opacity: 1,
  zIndex: 0,
  transform: tx(0, 980, 1200, 72),
  font: font(36),
  color: '#FFFFFF',
  direction: 'ltr',
  verticalAlign: 'middle',
  speed,
  repeat,
  cycleBoundary: 'seamless',
  gap: 48,
  separator: ' • ',
  items: [{ id: 'i1', text: 'Sample headline' }],
});

const sequence = (id, name, visible) => ({
  id,
  name,
  type: 'sequence',
  visible,
  locked: false,
  opacity: 1,
  zIndex: 0,
  transform: tx(0, 200, 720, 72),
  font: font(36),
  color: '#FFFFFF',
  align: 'start',
  verticalAlign: 'middle',
  direction: 'ltr',
  items: [
    { id: 'i1', text: 'Now: one' },
    { id: 'i2', text: 'Next: two' },
  ],
  defaultDwellMs: 5000,
  advance: 'auto',
  transitionIn: 'bottom',
  transitionOut: 'top',
  transitionTiming: 'simultaneous',
  transitionMs: 400,
  repeat: 'infinite',
});

const instance = (id, name, compositionId, holdOverrides, visible = true) => ({
  id,
  name,
  type: 'composition',
  compositionId,
  visible,
  locked: false,
  opacity: 1,
  zIndex: 0,
  transform: tx(0, 0, 1200, 120),
  ...(holdOverrides ? { holdOverrides } : {}),
});

const layer = (id, children) => ({
  id,
  name: 'main',
  visible: true,
  locked: false,
  blendMode: 'normal',
  children,
});

const comp = (id, children, playout, lifecycle) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  ...(lifecycle ? { lifecycle } : {}),
  ...(playout ? { playout } : {}),
  background: 'transparent',
  layers: [layer(`${id}-l`, children)],
});

const scene = {
  schemaVersion: 1,
  id: 'hidden-content-inert',
  name: 'Hidden content inert (B-034)',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  activeRange: { in: 0, out: 50 },
  lifecycle: { outPoint: 25 },
  // Content-driven parent: its only content is a nested instance whose own content is HIDDEN.
  playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 3000 },
  background: 'transparent',
  layers: [
    layer('root-l', [
      // Per-instance holdOverride FORCE-INCLUDE of the hidden child crawl — must be a no-op.
      instance('inst-hidden', 'Hidden-only', 'childHiddenOnly', { hiddenCrawl: true }),
    ]),
  ],
  compositions: [
    // Nested under the content-driven parent: ONLY a hidden infinite ticker (drivesHold default true).
    comp('childHiddenOnly', [ticker('hiddenCrawl', 'Hidden crawl', 'infinite', false)], {
      mode: 'manual',
    }),
    // Auxiliary TIMED-hold comp with a HIDDEN finite ticker — the exporter preflight must stay silent.
    comp(
      'timedFinite',
      [ticker('hiddenFinite', 'Hidden finite crawl', 2, false)],
      { mode: 'auto-out', holdMs: 2000 },
      { outPoint: 25 },
    ),
    // Auxiliary comp with ONLY a HIDDEN sequence — canStepScene (transport Next) must stay disabled.
    comp('seqOnly', [sequence('hiddenSeq', 'Hidden sequence', false)], { mode: 'manual' }),
  ],
  fields: [],
  bindings: [],
  fonts: [
    {
      family: 'Vazirmatn',
      weights: [400, 500, 700],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'fonts/Vazirmatn-Variable.woff2',
    },
  ],
  metadata: { createdAt: '2026-06-28T00:00:00.000Z', updatedAt: '2026-06-28T00:00:00.000Z' },
};

const fonts = [
  {
    family: 'Vazirmatn',
    weights: [400, 500, 700],
    styles: ['normal'],
    source: 'bundled',
    bundledPath: 'fonts/Vazirmatn-Variable.woff2',
  },
];

// 2. HIDDEN ANCESTOR — a hidden composition INSTANCE whose subtree holds VISIBLE content (the case the
// leaf fixture missed). The user's master.vcg shape.
const ancestorScene = {
  schemaVersion: 1,
  id: 'hidden-ancestor-inert',
  name: 'Hidden ancestor inert (B-034)',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  activeRange: { in: 0, out: 50 },
  lifecycle: { outPoint: 25 },
  // Content-driven; a generous holdMs is only a fallback — the VISIBLE finite ticker (b) should drive.
  playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 30000 },
  background: 'transparent',
  layers: [
    layer('root-l', [
      // (a) HIDDEN instance whose child holds a VISIBLE infinite sequence, NO holdOverride — its whole
      // subtree must be inert (it must NOT keep the parent open).
      instance('inst-hidden', 'Hidden lower-third', 'compVisibleSeq', undefined, false),
      // (b) VISIBLE instance with a finite ticker (repeat 1) — DRIVES the close.
      instance('inst-finite', 'Finite crawl', 'compFiniteTicker'),
      // (c) VISIBLE instance whose infinite sequence is EXCLUDED via a per-instance holdOverride.
      instance('inst-excluded', 'Excluded sequence', 'compExcludableSeq', { excludableSeq: false }),
    ]),
  ],
  compositions: [
    // (a)'s child: a VISIBLE infinite sequence (would never complete) — inert only because the INSTANCE
    // that references it is hidden.
    comp('compVisibleSeq', [sequence('innerSeq', 'Inner sequence', true)], { mode: 'manual' }),
    // (b)'s child: a VISIBLE finite ticker (repeat 1). A higher speed so its one pass completes quickly.
    comp('compFiniteTicker', [ticker('finiteCrawl', 'Finite crawl', 1, true, 600)], {
      mode: 'manual',
    }),
    // (c)'s child: a VISIBLE infinite sequence, excluded from THIS parent via the instance override.
    comp('compExcludableSeq', [sequence('excludableSeq', 'Excludable sequence', true)], {
      mode: 'manual',
    }),
  ],
  fields: [],
  bindings: [],
  fonts,
  metadata: { createdAt: '2026-06-28T00:00:00.000Z', updatedAt: '2026-06-28T00:00:00.000Z' },
};

async function writeFixture(baseName, sceneObj, id, name) {
  const parsed = SceneSchema.parse(sceneObj); // throws if not schema-valid
  writeFileSync(join(here, `${baseName}.scene.json`), `${JSON.stringify(parsed, null, 2)}\n`);
  const vcg = await pack({
    scene: parsed,
    manifestExtras: {
      id,
      name,
      authoring: {
        designerVersion: '0.0.0',
        createdAt: '2026-06-28T00:00:00.000Z',
        exportedAt: '2026-06-28T00:00:00.000Z',
      },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
      fontDeps: parsed.fonts,
      assetIndex: [],
    },
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
  });
  writeFileSync(join(here, `${baseName}.vcg`), vcg);
  console.log(
    `wrote ${baseName}.{scene.json,vcg} (compositions: ${parsed.compositions?.length ?? 0})`,
  );
}

await writeFixture(
  'hidden-content-inert',
  scene,
  'tpl-hidden-content-inert',
  'Hidden content inert (B-034)',
);
await writeFixture(
  'hidden-ancestor-inert',
  ancestorScene,
  'tpl-hidden-ancestor-inert',
  'Hidden ancestor inert (B-034)',
);
