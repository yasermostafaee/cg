import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';

/**
 * B-091 (D-125 Phase 3b-1) — the preview's `lottie-assets` handler must not rebuild the
 * scene mid-playback.
 *
 * `applyScene()` calls `runtime.remove()` + `createRuntime()`. Running that while the
 * graphic is on air blanks and restarts it under the operator — exactly what the `update`
 * handler's `!playing` guard exists to prevent. D-125 Phase 1 shipped the handler without
 * that guard.
 *
 * The preview document is generated JS text (`#buildHtml`), which is what these tests pin
 * — the same contract style as `preview-blank-until-play.test.ts`. Rather than substring-
 * matching prose, each assertion below slices the ACTUAL `lottie-assets` / `play` branches
 * out of the generated source and asserts their structure, so reverting the guard fails.
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-b091',
  name: 'preview-lottie-guard',
  templateType: 'custom',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [],
  compositions: [],
};

/** The source of one `msg.action === '<name>'` branch, up to the next `else if`. */
function branchSource(html: string, action: string): string {
  const start = html.indexOf(`msg.action === '${action}'`);
  expect(start, `branch for '${action}' not found`).toBeGreaterThan(-1);
  const rest = html.slice(start);
  const end = rest.indexOf('} else if (');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('B-091 — the lottie-assets handler is guarded against a mid-playback rebuild', () => {
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

  it('the lottie-assets branch never calls applyScene without checking `playing` first', () => {
    const branch = branchSource(html, 'lottie-assets');
    // It still rebuilds — but only behind a playing check.
    expect(branch).toContain('applyScene(currentScene)');
    expect(branch).toContain('playing');
    // The load-bearing shape: the rebuild sits on the ELSE of `if (playing)`.
    expect(branch).toMatch(/if \(playing\)[\s\S]*else[\s\S]*applyScene\(currentScene\)/);
  });

  it('a message arriving mid-playback DEFERS rather than drops (the players still mount)', () => {
    const branch = branchSource(html, 'lottie-assets');
    // The map is recorded unconditionally…
    expect(branch).toContain('lottieAssets = msg.lottieAssets');
    // …and the rebuild is remembered for later, not discarded.
    expect(branch).toContain('pendingLottieRebuild = true');
  });

  it('the deferred rebuild is flushed before the next play, while nothing is on air', () => {
    const playBranch = branchSource(html, 'play');
    expect(playBranch).toContain('await flushPendingLottieRebuild()');
    // Flushed BEFORE the run starts, so the rebuild never touches a live graphic.
    const flushAt = playBranch.indexOf('flushPendingLottieRebuild');
    const playingAt = playBranch.indexOf('playing = true');
    expect(flushAt).toBeGreaterThan(-1);
    expect(playingAt).toBeGreaterThan(flushAt);
  });

  it('the flush clears its pending flag so a second play does not rebuild again', () => {
    const start = html.indexOf('async function flushPendingLottieRebuild()');
    expect(start).toBeGreaterThan(-1);
    const fn = html.slice(start, start + 400);
    expect(fn).toMatch(/if \(!pendingLottieRebuild\) return;/);
    expect(fn).toContain('pendingLottieRebuild = false');
  });

  it('the `update` handler keeps the !playing guard this mirrors', () => {
    // The precedent B-091 is measured against — if this ever regresses, the rationale
    // above is stale and the whole pattern needs revisiting.
    expect(branchSource(html, 'update')).toContain('if (runtime && !playing) runtime.tick');
  });
});
