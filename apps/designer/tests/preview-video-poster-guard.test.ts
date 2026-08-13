import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';

/**
 * D-128 — the canvas iframe must produce a video's at-rest poster through the ONE
 * shared robust routine (`src/shared/video-poster.ts`), never a bare cold seek.
 *
 * WHY (the canvas-blank field bug, proven 2026-07-25): the WebM alpha side-stream's
 * keyframes need not align with the main stream's, and a COLD seek
 * (preload='metadata', no data loaded) into a misaligned GOP is a TERMINAL Chromium
 * `PIPELINE_ERROR_DECODE` — while sequential playback (what the import modal
 * verifies) always decodes. The routine seeks on the eager-load path and falls back
 * to sequential 16x decode.
 *
 * The preview document is generated JS text (`#buildHtml`) with the routine injected
 * via `Function.prototype.toString()`, so these tests pin the generated source — the
 * same contract style as `preview-lottie-assets-guard.test.ts`. The ladder's
 * behavior itself is unit-tested in `video-poster-robust.test.ts`; the real-media
 * end-to-end lives in `tests/e2e/video-canvas-render.spec.ts`.
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-d128-poster',
  name: 'preview-video-poster-guard',
  templateType: 'custom',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [],
  compositions: [],
};

describe('D-128 — the canvas wires video posters through the shared robust routine', () => {
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

  it('injects the shared routine source into the document', () => {
    // The serialized function must land as a callable binding…
    expect(html).toMatch(/const attachRobustVideoPoster = (?:function|\()/);
    // …and carry BOTH rungs: the eager-load seek shape and the sequential
    // 16x recovery (the operation import verification proves).
    expect(html).toMatch(/preload\s*=\s*["']auto["']/);
    expect(html).toMatch(/playbackRate\s*=\s*16/);
    expect(html).toMatch(/\.load\(\)/);
  });

  it('the asset walk routes VIDEO through the routine, gated per NODE — never by a src comparison', () => {
    // The runtime's export-side walk (D-128 Phase 5) may set <video src> before
    // this walk runs (the canvas passes assetUrls for the ticker separator), so
    // gating the poster on `node.src !== url` silently skips arming it — the
    // blank-canvas regression the Phase-5 E2E caught. The gate must be the
    // explicit per-node marker.
    expect(html).toContain("node.getAttribute('data-cg-poster-armed') !== '1'");
    expect(html).toContain('wireVideoPoster(node, url);');
    // The pre-fix cold-seek helper is gone; reintroducing it would resurrect
    // the terminal-decode blank canvas on seek-fragile clips.
    expect(html).not.toContain('function seekVideoPoster');
  });

  it('a poster failure still surfaces to the parent console (honest surfacing)', () => {
    expect(html).toContain('[cg-preview] video failed to load its poster:');
    // …but a superseded run (asset URL replaced mid-flight) stays quiet.
    expect(html).toMatch(/outcome\.error !== ['"]superseded['"]/);
  });

  it('the routine restores playbackRate so a later real play is untouched', () => {
    // The recovery rung plays at 16x; the serialized source must set it back —
    // a pooled canvas <video> is reused by the VideoDriver on play().
    expect(html).toMatch(/playbackRate\s*=\s*1[^0-9]/);
  });
});

describe('D-135 §5 — the poster is SUBORDINATE to the tick: the playhead owns the frame', () => {
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

  it('the poster routine settling chains a re-tick, so the tick’s seek always lands LAST', () => {
    // One paint order, deterministic: load → (poster transient →) tick. Without this
    // chain the ASYNC poster seek lands after the build-time tick and the canvas rests
    // on a mid-clip poster — the exact disagreement-at-rest §9.5's consistency debt
    // recorded. The poster is a PRE-TICK transient (the Lottie's shipped semantics);
    // the settled frame is always the playhead's.
    // Anchored INSIDE the routine's settle callback (the 'update' handler carries the
    // same guarded line elsewhere — a bare toContain would pass vacuously).
    expect(html).toMatch(
      /function wireVideoPoster[\s\S]{0,2500}?if \(runtime && !playing\) runtime\.tick\(currentFrame\);/,
    );
  });

  it('the scene-apply re-ticks AFTER the asset walk, so a pooled/transplanted node is positioned', () => {
    // applyScene ticks before applyAssetUrls (fresh nodes), and again after it: the
    // transplant (reconcileVideos) swaps the freshly-positioned node for the pooled one,
    // whose currentTime predates the rebuild — the second tick re-positions it through
    // live(), so a phases edit shows its NEW mapping at the same playhead.
    // Anchored on applyEditingHide(), which only follows the applyScene call site — the
    // comment block between the walk and the re-tick is allowed to grow.
    expect(html).toMatch(
      /applyAssetUrls\(\);[\s\S]{0,900}?runtime\.tick\(currentFrame\);\s*\n\s*applyEditingHide\(\);/,
    );
  });
});
