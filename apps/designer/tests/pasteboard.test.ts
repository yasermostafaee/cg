import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import { pasteboardPad } from '../src/renderer/features/canvas/geometry.js';

/**
 * D-071 Phase B — the editor pasteboard. The `#buildHtml` `authoring` flag lifts the
 * `.cg-stage { overflow: hidden }` clip and insets the frame by `pad` within a dark
 * margin so off-frame shapes paint into the pasteboard — for the CANVAS iframe ONLY,
 * INDEPENDENT of D-087's `broadcast`. The broadcast modal + exports keep the native
 * clip (UNCHANGED). Off-frame selection/drag (a visual concern) is pinned by the E2E
 * `tests/e2e/pasteboard.spec.ts`.
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-d071b',
  name: 'pasteboard',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [],
  compositions: [],
} as unknown as Scene;

const CLIP_LIFT = 'overflow: visible !important';

describe('D-071 Phase B — pasteboard authoring document', () => {
  let preview: Preview;

  beforeAll(() => {
    urlGlobals.createObjectURL = () => 'blob:stub';
    urlGlobals.revokeObjectURL = () => undefined;
    preview = new Preview({ cgJs: 'export const noop = 1;', cgCss: '.cg-stage{}', fontsCss: '' });
  });

  it('authoring:true lifts the .cg-stage clip and widens the surface to the pasteboard', () => {
    const pad = pasteboardPad(SCENE.resolution);
    const { html } = preview.load(SCENE, false, true, pad);
    expect(html).toContain(CLIP_LIFT); // the clip is lifted so off-frame paints
    expect(html).toContain('width: 1920px !important'); // the frame keeps its size (top-left)
    expect(html).toContain('#161927'); // dark pasteboard margin
    // The layout viewport widens by the right/bottom pasteboard margin (frame + pad).
    expect(html).toContain(`width=${String(1920 + pad)},`);
  });

  it('authoring:false (the default) keeps the .cg-stage clip — no pasteboard', () => {
    const { html } = preview.load(SCENE);
    expect(html).not.toContain(CLIP_LIFT);
    expect(html).toContain('width=1920,'); // viewport unchanged
  });

  it('the broadcast modal (broadcast:true, authoring:false) keeps the clip — UNCHANGED', () => {
    const { html } = preview.load(SCENE, true, false, 0);
    expect(html).not.toContain(CLIP_LIFT);
  });
});

describe('pasteboardPad', () => {
  it('is a quarter of the frame’s longer edge', () => {
    expect(pasteboardPad({ width: 1920, height: 1080 })).toBe(480);
    expect(pasteboardPad({ width: 800, height: 1200 })).toBe(300);
  });
});
