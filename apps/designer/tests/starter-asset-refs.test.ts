import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageFolderSequenceScene, STARTER_TEMPLATES } from '@cg/starter-templates';
import { rewriteStarterAssetRefs } from '../src/platform/starter-asset-refs.js';

describe('starter asset reference rewrite', () => {
  it('ships one compact accelerated WebM for every gallery card', () => {
    for (const starter of STARTER_TEMPLATES) {
      expect(starter.motionPreview, `${starter.id} declares a motion preview`).toMatch(
        /^\/starters\/motion\/.+\.webm$/,
      );
      const relative = starter.motionPreview?.slice(1);
      if (relative === undefined) continue;
      const size = statSync(join(process.cwd(), 'public', relative)).size;
      expect(size, `${starter.id} motion preview is not empty`).toBeGreaterThan(5_000);
      expect(size, `${starter.id} motion preview stays lightweight`).toBeLessThan(100_000);
    }
  });

  it('rewrites a starter sequence picture list and its bundled font', () => {
    const scene = structuredClone(imageFolderSequenceScene);
    rewriteStarterAssetRefs(
      scene,
      new Map([
        ['gallery-slide-1', 'project-image-1'],
        ['gallery-slide-2', 'project-image-2'],
        ['gallery-slide-3', 'project-image-3'],
        ['gallery-slide-4', 'project-image-4'],
        ['gallery-slide-5', 'project-image-5'],
      ]),
      new Map([['asset-image-folder-sequence-vazir', 'asset-project-font']]),
    );

    const sequence = scene.compositions
      ?.flatMap((composition) => composition.layers)
      .flatMap((layer) => layer.children)
      .find((element) => element.type === 'sequence');
    expect(sequence?.type).toBe('sequence');
    if (sequence?.type !== 'sequence') return;
    expect(
      sequence.items.map((item) => (item.kind === 'image' ? item.assetId : undefined)),
    ).toEqual([
      'project-image-1',
      'project-image-2',
      'project-image-3',
      'project-image-4',
      'project-image-5',
    ]);
    expect(sequence.font.family).toBe('asset-project-font');
    expect(scene.fonts[0]?.family).toBe('asset-project-font');
  });
});
