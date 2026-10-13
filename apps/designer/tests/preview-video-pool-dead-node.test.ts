import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';

/**
 * `B-217` — THE VIDEO POOL NEVER RE-ADOPTS A DEAD NODE.
 *
 * The canvas iframe pools every live `<video>` across a scene rebuild and transplants it over
 * the freshly built one (`reconcileVideos`), so a drag never reloads the media. A node whose
 * media hit a TERMINAL error (`media.error !== null` — the seek-fragile decode class, a
 * revoked blob) is a corpse, and pooling it puts the corpse back on screen after EVERY
 * rebuild: nothing in the static canvas ever rebuilds it, because the driver's `recover()`
 * runs only while a driver is running, and the canvas never plays. That is the one shape in
 * this seam that survives `Ctrl+Z` and is cured only by a reload — the signature the owner
 * reported on 2026-08-30 — so the pool now drops a dead node at harvest and refuses one at
 * reconcile, letting the fresh node take over and get a normal src + poster.
 *
 * The preview document is generated JS text (`#buildHtml`), so this pins the generated
 * source — the contract style `preview-video-poster-guard.test.ts` established.
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-b217-pool',
  name: 'preview-video-pool-dead-node',
  templateType: 'custom',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [],
  compositions: [],
};

describe('B-217 — the canvas video pool drops a node with a terminal media error', () => {
  let html: string;

  beforeAll(() => {
    urlGlobals.createObjectURL = () => 'blob:stub';
    urlGlobals.revokeObjectURL = () => undefined;
    const preview = new Preview({
      cgJs: 'export const noop = 1;',
      cgCss: '.cg-stage{}',
      fontsCss: '',
    });
    html = preview.load(SCENE).html;
  });

  it('harvest skips (and forgets) a dead node, so it cannot be transplanted back', () => {
    // Anchored INSIDE harvestVideos: the guard must sit on the harvest loop, before the pool
    // write, and it must DELETE the stale entry rather than merely not overwrite it.
    expect(html).toMatch(
      /function harvestVideos\(\)[\s\S]{0,1200}?if \(nodes\[i\]\.error\) \{\s*delete videoPool\[id\];\s*continue;\s*\}[\s\S]{0,200}?videoPool\[id\] = nodes\[i\];/,
    );
  });

  it('reconcile refuses to transplant a dead pooled node — the fresh node wins and gets armed', () => {
    // The transplant branch carries the error check beside the asset-id check, so a pooled
    // corpse falls through to the `else` that adopts the fresh node.
    expect(html).toMatch(
      /function reconcileVideos\(\)[\s\S]{0,1200}?if \(pooled && pooled !== fresh && !pooled\.error && pooled\.dataset\.cgAssetId === assetId\)/,
    );
  });
});
