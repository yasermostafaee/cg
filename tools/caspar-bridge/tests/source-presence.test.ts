import { describe, expect, it, vi } from 'vitest';
import { mediaSourceId } from '@cg/shared-ipc';
import { BackupMediaLookup } from '../src/backup-media.js';
import { PlayoutSources, type PlayoutSourcesProvider } from '../src/playout-sources.js';
import { reserveInputPresence, sourcePresenceInputsOf } from '../src/source-presence.js';

const scope = {
  channelCode: 'backup-two',
  host: '192.0.2.2',
  apiHost: '192.0.2.2',
  playlistChannel: 2,
};
const first = 'a'.repeat(64);
const second = 'b'.repeat(64);
const remoteD11 = (fingerprint: string) => ({
  id: `replica-${fingerprint}`,
  name: 'synced clip',
  type: 'video',
  clip: 'E:/clips/example.mp4',
  fingerprint,
});

describe('engine-local source presence', () => {
  it('keeps a newer A media search ahead of an older bound read that completes later', async () => {
    const media = { ...remoteD11(first), id: 'same' };
    const fresh = { ...media, fingerprint: second, clip: 'D:/current.mp4' };
    let sendOld!: (answer: Awaited<ReturnType<PlayoutSourcesProvider['readMediaByIds']>>) => void;
    const oldRead = new Promise<Awaited<ReturnType<PlayoutSourcesProvider['readMediaByIds']>>>(
      (resolve) => {
        sendOld = resolve;
      },
    );
    const provider: PlayoutSourcesProvider = {
      readInputs: vi.fn<PlayoutSourcesProvider['readInputs']>(),
      readMediaByIds: vi
        .fn<PlayoutSourcesProvider['readMediaByIds']>()
        .mockResolvedValueOnce({ kind: 'ok', body: { items: [media] } })
        .mockReturnValueOnce(oldRead),
      searchMedia: vi
        .fn<PlayoutSourcesProvider['searchMedia']>()
        .mockResolvedValue({ kind: 'ok', body: { items: [fresh] } }),
    };
    const sources = new PlayoutSources({
      provider,
      signedIn: () => true,
      hostIsOurs: () => true,
      channelFor: () => 1,
    });
    const id = mediaSourceId(media.id);
    expect(await sources.ensureBound(id)).toEqual({ ok: true });
    const stale = sources.freshClipFor(id, media.clip);
    expect((await sources.searchMedia({ q: '' })).ok).toBe(true);
    sendOld({ kind: 'ok', body: { items: [] } });
    await stale;
    expect(sources.mediaForPresence(id)).toEqual({ state: 'present', fingerprint: second });
  });

  it('does not infer a missing source from an older list of engine-local IDs or malformed rows', () => {
    const listed = {
      id: 'replica-local',
      name: 'Same name',
      producer: { kind: 'ndi', source: 'Receiver (Input)' },
    };
    expect(
      reserveInputPresence(sourcePresenceInputsOf({ inputs: [listed] }), scope, 'source', false),
    ).toBe('unknown');
    expect(
      reserveInputPresence(sourcePresenceInputsOf({ inputs: [null] }), scope, 'source', false),
    ).toBe('unknown');
    expect(
      reserveInputPresence(sourcePresenceInputsOf({ inputs: [] }), scope, 'source', false),
    ).toBe('missing');
  });

  it('keeps ambiguous or wrong-channel D10 bindings from claiming a match', () => {
    const row = {
      id: 'replica-local',
      name: 'Same Name',
      producer: { kind: 'ndi', source: 'Receiver (Input)' },
      logicalMappings: [{ channelCode: scope.channelCode, logicalInputId: 'source' }],
    };
    const wrongChannel = {
      ...row,
      logicalMappings: [{ channelCode: 'other', logicalInputId: 'source' }],
    };
    expect(
      reserveInputPresence(
        sourcePresenceInputsOf({ inputs: [wrongChannel] }),
        scope,
        'source',
        false,
      ),
    ).toBe('missing');
    expect(
      reserveInputPresence(
        sourcePresenceInputsOf({ inputs: [row, { ...row, id: 'replica-other' }] }),
        scope,
        'source',
        false,
      ),
    ).toBe('unknown');
  });

  it('rechecks a disjoint batch after an overlapping wait without issuing duplicate reads', async () => {
    let releaseFirst!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      const key = new URL(String(request)).searchParams.get('fingerprint') ?? '';
      if (key === first) await held;
      return Response.json({ items: [remoteD11(key)], total: 1, nextCursor: null });
    });
    const lookup = new BackupMediaLookup({
      url: () => 'http://127.0.0.1/api/cg/media',
      bearer: () => 'test-bearer',
      fetchImpl,
    });
    const checkFirst = lookup.readPresence([first]);
    const sameFirst = lookup.readPresence([first]);
    const checkSecond = lookup.readPresence([second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    releaseFirst();
    expect((await checkFirst).get(first)).toBe('present');
    expect((await sameFirst).get(first)).toBe('present');
    expect((await checkSecond).get(second)).toBe('present');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(lookup.lookup(first)).toEqual({ kind: 'refused', reason: 'backup-unread' });
  });

  it('keeps unauthorized or truncated D11 reads unknown', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        Response.json({ items: [remoteD11(first)], total: 2, nextCursor: 'cursor' }),
      );
    let token = 'B-session';
    const lookup = new BackupMediaLookup({
      url: () => 'http://127.0.0.1/api/cg/media',
      bearer: () => token,
      fetchImpl,
    });
    expect((await lookup.readPresence([first, second])).get(second)).toBe('unknown');
    token = 'fresh-B-session';
    const read = await lookup.readPresence([first, second]);
    expect(read.get(first)).toBe('present');
    expect(read.get(second)).toBe('unknown');
  });
});
