import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';

/**
 * D-087 — the Preview modal opens loaded-but-unpainted (blank) until Play, while
 * the editor canvas keeps revealing the static authoring frame. Both surfaces
 * share `preview.ts`'s `#buildHtml`; the `broadcast` flag on `load()` is the seam.
 * This pins the generated document: a broadcast document omits the `cg-pending`
 * CSS override and sets `REVEAL_ON_LOAD = false`, so the runtime keeps its native
 * `cg-pending` (blank) state until `play()`. The authoring document reveals frame
 * 0 after preparing its current fields and Sequence page. Live behavior is covered by the
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
  editorBackdrop: 'transparent',
  layers: [],
  compositions: [],
  fonts: [],
  fields: [],
  bindings: [],
  metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
};

const AUTHORING_OVERRIDE = '.cg-pending { opacity: 1 !important; }';
const AUTHORING_STAGE_OVERRIDE = '.cg-pending .cg-stage { visibility: visible !important; }';
const REHEARSE_CLEAR_OVERRIDE = '.cg-rehearse-cleared .cg-stage { visibility: hidden !important; }';

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

  it('authoring reveals frame 0 after the selected page has been applied', () => {
    const { html } = preview.load(SCENE);
    expect(html).not.toContain(AUTHORING_OVERRIDE);
    expect(html).not.toContain(AUTHORING_STAGE_OVERRIDE);
    expect(html).toContain('const REVEAL_ON_LOAD = true;');
    const reveal = "if (REVEAL_ON_LOAD) document.body.classList.remove('cg-pending');";
    expect(html).toContain(reveal);
    const build = html.slice(html.indexOf('async function applyScene'), html.indexOf(reveal));
    expect(build).toContain('applyShownSequenceItem();');
    expect(html).toContain(REHEARSE_CLEAR_OVERRIDE);
    expect(html).toContain("msg.action === 'authoring-restore'");
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

  it('limits editable expired countdowns to the stopped main Canvas', () => {
    const canvas = preview.load(SCENE, false, true).html;
    const broadcast = preview.load(SCENE, true, false).html;
    expect(canvas).toContain('const PAINT_EDITOR_BACKDROP = true;');
    expect(broadcast).toContain('const PAINT_EDITOR_BACKDROP = false;');
    for (const html of [canvas, broadcast]) {
      expect(html).toContain('editCountdowns: PAINT_EDITOR_BACKDROP && !lifecycleActive');
      expect(html).toContain('if (restoreAuthoring && currentScene) void applyScene(currentScene)');
    }
  });
});
