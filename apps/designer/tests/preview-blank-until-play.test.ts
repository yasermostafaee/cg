import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';

/**
 * D-087 — the Preview modal opens loaded-but-unpainted (blank) until Play, while
 * the editor canvas keeps revealing the static authoring frame. Both surfaces
 * share `preview.ts`'s `#buildHtml`; the `broadcast` flag on `load()` is the seam.
 * This pins the generated document: a broadcast document omits the `cg-pending`
 * CSS override and sets `REVEAL_ON_LOAD = false`, so the runtime keeps its native
 * `cg-pending` (blank) state until `play()`; the default (authoring) document keeps
 * the override and reveals frame 0. Live blank↔paint behaviour is covered by the
 * E2E (`preview-blank-until-play.spec.ts`).
 */

// `preview.ts` mints Blob URLs in its constructor and in load(); the `node` test
// environment has Blob but not URL.createObjectURL. Stub the two URL helpers (no
// `any` — a narrow structural cast).
const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-d087',
  name: 'preview-blank',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [],
  compositions: [],
};

const AUTHORING_OVERRIDE = '.cg-pending { opacity: 1 !important; }';
const AUTHORING_STAGE_OVERRIDE = '.cg-pending .cg-stage { visibility: visible !important; }';

describe('Preview — D-087 blank until play (broadcast flag)', () => {
  let preview: Preview;

  beforeAll(() => {
    urlGlobals.createObjectURL = () => 'blob:stub';
    urlGlobals.revokeObjectURL = () => undefined;
    preview = new Preview({
      cgJs: 'export const noop = 1;',
      cgCss: '.cg-stage{}',
      fontsCss: '',
    });
  });

  it('authoring (default) reveals frame 0: keeps the cg-pending override + REVEAL_ON_LOAD=true', () => {
    const { html } = preview.load(SCENE);
    expect(html).toContain(AUTHORING_OVERRIDE);
    expect(html).toContain(AUTHORING_STAGE_OVERRIDE);
    expect(html).toContain('const REVEAL_ON_LOAD = true;');
  });

  it('broadcast preview stays blank: omits the cg-pending override + REVEAL_ON_LOAD=false', () => {
    const { html } = preview.load(SCENE, true);
    // The authoring lift is GONE — the stage obeys the runtime's native
    // `.cg-pending .cg-stage { visibility: hidden }` (in the baseline cgCss).
    expect(html).not.toContain(AUTHORING_OVERRIDE);
    expect(html).not.toContain(AUTHORING_STAGE_OVERRIDE);
    // …and applyScene does NOT clear cg-pending on load, so it survives until play().
    expect(html).toContain('const REVEAL_ON_LOAD = false;');
    // The omitted-override slot carries the D-087 marker comment.
    expect(html).toContain('D-087');
  });
});
