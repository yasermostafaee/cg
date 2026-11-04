import { describe, expect, it } from 'vitest';
import { imageFolderSequenceScene } from '@cg/starter-templates';
import { rewriteStarterAssetRefs } from '../src/platform/starter-asset-refs.js';

describe('starter asset reference rewrite', () => {
  it('rewrites a starter sequence picture list and its bundled font', () => {
    const scene = structuredClone(imageFolderSequenceScene);
    rewriteStarterAssetRefs(
      scene,
      new Map([
        ['gallery-slide-1', 'project-image-1'],
        ['gallery-slide-2', 'project-image-2'],
        ['gallery-slide-3', 'project-image-3'],
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
    ).toEqual(['project-image-1', 'project-image-2', 'project-image-3']);
    expect(sequence.font.family).toBe('asset-project-font');
    expect(scene.fonts[0]?.family).toBe('asset-project-font');
  });
});
