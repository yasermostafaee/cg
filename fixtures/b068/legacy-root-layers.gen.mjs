// Regenerate the B-068 repro fixture: `node fixtures/b068/legacy-root-layers.gen.mjs`
// (run from the repo root, after `pnpm --filter @cg/shared-schema build`).
//
// A LEGACY scene: all content lives in top-level `scene.layers` with NO `compositions` —
// a shape the Zod schema still accepts, root `lifecycle`/`playout` included. Opening it in
// the Designer runs `ensureCompositions`, which migrates the root layers into one comp.
//
// B-068: that migration dropped the root `lifecycle`/`playout`, so `playoutOf` resolved the
// migrated comp to `static` — the whole [0,100] range played as ONE entrance (sweeping in the
// 60→90 fade-OUT), and the hold froze on the post-exit pose: opacity 0. The bar simply
// vanished a couple of seconds after its intro and never came back.
//
// Fixed, the comp keeps `lifecycle.outPoint: 60` + `playout: auto-out/3000ms`, so it plays
// IN (0→60), HOLDS visible at frame 60 for 3s, then plays its authored fade-OUT (60→90).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SceneSchema } from '../../packages/shared-schema/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));

const tx = (x, y, w, h) => ({
  position: { x, y },
  size: { w, h },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
});

const kf = (frame, value, easing) => ({ frame, value, easing });

/**
 * Entrance 0→20 (fade + slide up), hold 20→60, authored EXIT 60→90 (fade + slide down).
 * The exit lives entirely AFTER the out-point (frame 60) — that's what `static` wrongly
 * swept into the entrance.
 */
const fadeInHoldFadeOut = (restY, offY) => ({
  tracks: {
    opacity: {
      keyframes: [
        kf(0, 0, 'ease-out'),
        kf(20, 1, 'linear'),
        kf(60, 1, 'ease-in'),
        kf(90, 0, 'linear'),
      ],
    },
    'position.y': {
      keyframes: [
        kf(0, offY, 'ease-out'),
        kf(20, restY, 'linear'),
        kf(60, restY, 'ease-in'),
        kf(90, offY, 'linear'),
      ],
    },
  },
});

const shape = (id, name, x, y, w, h, color) => ({
  id,
  name,
  type: 'shape',
  visible: true,
  locked: false,
  opacity: 1,
  zIndex: 0,
  transform: tx(x, y, w, h),
  shape: 'rect',
  fill: { kind: 'solid', color },
  animation: fadeInHoldFadeOut(y, y + 120),
});

const scene = {
  schemaVersion: 1,
  id: 'legacy-root-layers',
  name: 'Legacy root-layers (B-068)',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 100 },
  activeRange: { in: 0, out: 100 },
  // The two fields `ensureCompositions` used to drop.
  lifecycle: { outPoint: 60 },
  playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 3000 },
  background: 'transparent',
  // LEGACY: content at the ROOT, and NO `compositions` key at all.
  layers: [
    {
      id: 'root-l',
      name: 'main',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        shape('bar', 'Lower-third bar', 360, 820, 1200, 140, '#0B5FFF'),
        shape('accent', 'Accent', 360, 820, 16, 140, '#FFC400'),
      ],
    },
  ],
  fields: [],
  bindings: [],
  fonts: [],
  metadata: { createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' },
};

const parsed = SceneSchema.parse(scene); // throws if not schema-valid
if (parsed.compositions !== undefined) throw new Error('expected a LEGACY scene: no compositions');
writeFileSync(join(here, 'legacy-root-layers.cg.json'), `${JSON.stringify(parsed, null, 2)}\n`);
console.log(
  `wrote legacy-root-layers.cg.json (compositions: ${parsed.compositions === undefined ? 'ABSENT (legacy)' : 'present'}, root layers: ${parsed.layers.length}, outPoint: ${parsed.lifecycle.outPoint}, playout: ${parsed.playout.mode})`,
);
