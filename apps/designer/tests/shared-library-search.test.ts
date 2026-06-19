import { describe, expect, it } from 'vitest';
import type { AssetMeta } from '@cg/shared-ipc';
import { filterImagesByFilename } from '../src/renderer/features/sharedLibrary/SharedLibraryPanel.js';

/**
 * D-068 — the Shared Library filename filter (case-insensitive substring; an
 * empty query returns every image), mirroring the Project Assets search.
 */

function img(filename: string): AssetMeta {
  return {
    assetId: filename,
    kind: 'image',
    filename,
    sha256: 'a'.repeat(64),
    byteSize: 4,
    workingPath: `shared/images/${filename}`,
  };
}

const list = [img('Channel-Logo.png'), img('bug.svg'), img('lower-third.png')];

describe('filterImagesByFilename (D-068)', () => {
  it('returns the same list for an empty / whitespace query', () => {
    expect(filterImagesByFilename(list, '')).toBe(list);
    expect(filterImagesByFilename(list, '   ')).toBe(list);
  });

  it('filters by case-insensitive substring', () => {
    expect(filterImagesByFilename(list, 'logo').map((i) => i.filename)).toEqual([
      'Channel-Logo.png',
    ]);
    expect(filterImagesByFilename(list, 'PNG').map((i) => i.filename)).toEqual([
      'Channel-Logo.png',
      'lower-third.png',
    ]);
  });

  it('returns empty when nothing matches', () => {
    expect(filterImagesByFilename(list, 'zzz')).toEqual([]);
  });
});
