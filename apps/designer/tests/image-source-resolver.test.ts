import { describe, expect, it } from 'vitest';
import type { AssetMeta } from '@cg/shared-ipc';
import {
  compositeImageSource,
  resolveImageAsset,
  type ImageAssetSource,
} from '@cg/single-file-export';

/**
 * D-040 — the two-source resolver. Each image resolves from its source-indicated
 * store first (shared library for a logo, project otherwise) and the other store
 * as a tolerant fallback. The two stores have disjoint uuid id-spaces.
 */

function meta(assetId: string): AssetMeta {
  return {
    assetId,
    kind: 'image',
    filename: `${assetId}.png`,
    sha256: 'a'.repeat(64),
    byteSize: 4,
    workingPath: `x/${assetId}.png`,
  };
}

/** An in-memory image source over `id → bytes`. */
function source(entries: Record<string, Uint8Array>): ImageAssetSource {
  return {
    get: (id) => Promise.resolve(id in entries ? meta(id) : null),
    bytes: (id) => Promise.resolve(entries[id] ?? null),
  };
}

const PROJECT = source({ 'proj-1': new Uint8Array([1]) });
const SHARED = source({ 'lib-1': new Uint8Array([2]) });

describe('compositeImageSource (D-040)', () => {
  it('resolves a shared logo from the shared library', async () => {
    const src = compositeImageSource('shared', SHARED, PROJECT);
    const resolved = await resolveImageAsset(src, 'lib-1');
    expect(resolved?.bytes).toEqual(new Uint8Array([2]));
  });

  it('resolves a project image from the project store', async () => {
    const src = compositeImageSource('project', SHARED, PROJECT);
    const resolved = await resolveImageAsset(src, 'proj-1');
    expect(resolved?.bytes).toEqual(new Uint8Array([1]));
  });

  it('falls back to the other store when the id lives there (disjoint id-spaces)', async () => {
    // A logo tagged source:'shared' whose id is actually a project id still resolves.
    const src = compositeImageSource('shared', SHARED, PROJECT);
    const resolved = await resolveImageAsset(src, 'proj-1');
    expect(resolved?.bytes).toEqual(new Uint8Array([1]));
  });

  it('returns null when the id is in neither store', async () => {
    const src = compositeImageSource('shared', SHARED, PROJECT);
    expect(await resolveImageAsset(src, 'ghost')).toBeNull();
  });

  it('degrades to project-only when no shared library is wired', async () => {
    const src = compositeImageSource('project', undefined, PROJECT);
    expect((await resolveImageAsset(src, 'proj-1'))?.bytes).toEqual(new Uint8Array([1]));
    expect(await resolveImageAsset(src, 'lib-1')).toBeNull();
  });
});
