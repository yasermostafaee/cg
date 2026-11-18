import { describe, expect, it, vi } from 'vitest';
import { sourcePresenceInputsOf } from '../src/source-presence.js';
import {
  reservePreviewSelector,
  sourceReadEngine,
  sourcePictureFallbackEngine,
  sourceReadTarget,
} from '../src/source-read-routing.js';

const scope = {
  channelCode: 'backup-two',
  host: '192.0.2.2',
  apiHost: '192.0.2.2',
  playlistChannel: 2,
};
const ndi = {
  id: 'replica-local-b',
  name: 'Shared name',
  producer: { kind: 'ndi', source: 'NDI B' },
  logicalMappings: [{ channelCode: scope.channelCode, logicalInputId: 'logical-ndi' }],
};

describe('read-only source preview routing', () => {
  it('requires positive alternate presence for picture fallback in either direction', () => {
    expect(sourcePictureFallbackEngine('B', 'present', 'present')).toBe('A');
    expect(sourcePictureFallbackEngine('A', 'present', 'present')).toBe('B');
    expect(sourcePictureFallbackEngine('B', 'unknown', 'present')).toBeNull();
    expect(sourcePictureFallbackEngine('B', 'missing', 'present')).toBeNull();
    expect(sourcePictureFallbackEngine('A', 'present', 'unknown')).toBeNull();
    expect(sourcePictureFallbackEngine('A', 'present', 'missing')).toBeNull();
  });
  it('uses B when the preferred A source is missing and keeps A when both are present', () => {
    expect(sourceReadEngine('A', 'missing', 'present')).toBe('B');
    expect(sourceReadEngine('A', 'present', 'present')).toBe('A');
    expect(sourceReadEngine('B', 'present', 'present')).toBe('B');
    expect(sourceReadEngine('B', 'present', 'missing')).toBe('A');
    expect(sourceReadEngine('A', 'unknown', 'present')).toBe('A');
    expect(sourceReadEngine(null, 'present', 'present')).toBeNull();
  });

  it('resolves the reserve input by channel-scoped D10 mapping to its own physical ID', () => {
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({ inputs: [ndi] }),
        scope,
        'logical-ndi',
        false,
      ),
    ).toEqual({ kind: 'live', inputId: ndi.id });
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({
          inputs: [
            { ...ndi, logicalMappings: [{ channelCode: 'other', logicalInputId: 'logical-ndi' }] },
          ],
        }),
        scope,
        'logical-ndi',
        false,
      ),
    ).toBeNull();
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({ inputs: [{ ...ndi, logicalMappings: undefined }] }),
        scope,
        'logical-ndi',
        false,
      ),
    ).toBeNull();
  });

  it('refuses ambiguous or remote B identities even when names agree', () => {
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({ inputs: [ndi, { ...ndi, id: 'another-local-b' }] }),
        scope,
        'logical-ndi',
        false,
      ),
    ).toBeNull();
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({ inputs: [{ ...ndi, casparHost: '192.0.2.99' }] }),
        scope,
        'logical-ndi',
        false,
      ),
    ).toBeNull();
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({ inputs: [{ ...ndi, available: false }] }),
        scope,
        'logical-ndi',
        false,
      ),
    ).toBeNull();
  });

  it('uses the reserve mapped Playlist physical pair only with a current D10 epoch', () => {
    const playlist = {
      id: 'playlist-b',
      name: 'Programme',
      available: true,
      producer: { kind: 'route', channel: 2, layer: 5 },
      playlistOf: { casparHost: '127.0.0.1', casparChannel: 2 },
    };
    const list = sourcePresenceInputsOf({ epoch: '42', inputs: [playlist] });
    expect(reservePreviewSelector(list, scope, 'playlist-a', true)).toEqual({
      kind: 'playlist',
      playlistOf: playlist.playlistOf,
    });
    expect(
      reservePreviewSelector(
        sourcePresenceInputsOf({ inputs: [playlist] }),
        scope,
        'playlist-a',
        true,
      ),
    ).toBeNull();
    expect(
      reservePreviewSelector(list, { ...scope, playlistChannel: 3 }, 'playlist-a', true),
    ).toBeNull();
  });

  it('tries an independently resolved B media target after A has no item, without forwarding A IDs', async () => {
    const resolve = vi.fn(async (engine: 'A' | 'B') =>
      engine === 'A' ? null : { engine, mediaId: 'replica-b', bearer: 'independent-b' },
    );
    expect(await sourceReadTarget('A', resolve)).toEqual({
      engine: 'B',
      mediaId: 'replica-b',
      bearer: 'independent-b',
    });
    expect(resolve.mock.calls).toEqual([['A'], ['B']]);
    resolve.mockClear();
    expect(await sourceReadTarget(null, resolve)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});
