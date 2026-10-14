import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';

/**
 * 🔴 `B-138` — the unresolved leg of the preview's asset walk covers a VIDEO too: the "missing
 * image" picture becomes its still frame (`poster`), and it is dropped once the file resolves.
 * The preview document is generated JS text, so this pins the generated source (the contract
 * style of `preview-video-pool-dead-node.test.ts`); what Chromium PAINTS is measured by the e2e
 * `video-missing-still.spec.ts` (golden rule 12 — a string is no evidence about pixels).
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-b138',
  name: 'preview-video-missing',
  templateType: 'custom',
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

describe('B-138 — a missing video gets the missing picture as its still frame', () => {
  let html: string;

  beforeAll(() => {
    urlGlobals.createObjectURL = () => 'blob:stub';
    urlGlobals.revokeObjectURL = () => undefined;
    html = new Preview({ cgJs: 'export const noop = 1;', cgCss: '.cg-stage{}', fontsCss: '' }).load(
      SCENE,
    ).html;
  });

  it('🔴 the unresolved leg is no longer image-only: a VIDEO gets the picture as its poster', () => {
    expect(html).toMatch(
      /\} else if \(node\.getAttribute\('data-cg-missing'\) !== '1'\) \{[\s\S]{0,600}?if \(tag === 'VIDEO'\) node\.poster = MISSING_IMG;\s*else node\.src = MISSING_IMG;\s*node\.setAttribute\('data-cg-missing', '1'\);/,
    );
    // The old image-only guard is gone.
    expect(html).not.toContain("} else if (tag === 'IMG' && node.getAttribute('data-cg-missing')");
  });

  it('a video that resolves later drops the missing picture', () => {
    expect(html).toMatch(
      /if \(tag === 'VIDEO' && node\.getAttribute\('data-cg-missing'\) === '1'\) \{\s*node\.removeAttribute\('poster'\);\s*\}\s*node\.removeAttribute\('data-cg-missing'\);/,
    );
  });
});
