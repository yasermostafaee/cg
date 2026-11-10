import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../src/auth-session.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { PlayoutProgrammeGain } from '../src/playout-programme-gain.js';
import { PlaylistGainService, playlistFrameUsage } from '../src/playlist-gain-service.js';

const primary = {
  origin: 'https://fixture.example',
  code: 'SIM',
  casparChannel: 3,
  bearer: 'fixture-operator',
  generation: 'primary',
};
const snapshot = (revision: number, gainDb: number, pending = false) =>
  ({
    ok: true,
    status: pending ? 202 : 200,
    state: {
      contractVersion: 1,
      channelCode: primary.code,
      gainDb,
      revision,
      target: { casparChannel: primary.casparChannel, layer: 26 },
      application: {
        desiredRevision: revision,
        appliedRevision: pending ? null : revision,
        state: pending ? 'pending' : 'applied',
      },
    },
  }) as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('R-110 programme gain service', () => {
  it('writes the verified revision exactly once with a token bound to the console and channel', async () => {
    const read = vi.spyOn(PlayoutProgrammeGain.prototype, 'get').mockResolvedValue(snapshot(4, 0));
    const write = vi
      .spyOn(PlayoutProgrammeGain.prototype, 'set')
      .mockResolvedValue(snapshot(5, -6, true));
    const service = new PlaylistGainService(
      () => ({ ok: true, target: primary }),
      () => 'used',
    );
    const owner = new AuthSession();
    const current = await service.get(owner, 3);
    if (!current.ok) throw new Error('the fixture read failed');
    const edit = { channel: 3, gainDb: -6, editToken: current.state.editToken };
    expect(await service.set(new AuthSession(), edit)).toMatchObject({
      ok: false,
      reason: 'conflict',
    });
    expect(await service.set(owner, { ...edit, channel: 4 })).toMatchObject({
      ok: false,
      reason: 'conflict',
    });
    expect(write).not.toHaveBeenCalled();
    expect(await service.set(owner, edit)).toMatchObject({
      ok: true,
      state: { gainDb: -6, application: 'pending', usage: 'used' },
    });
    expect(await service.set(owner, edit)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(read).toHaveBeenCalledTimes(1);
    expect(write.mock.calls).toEqual([[{ gainDb: -6, expectedRevision: 4 }]]);
  });

  it('rereads a revision conflict without replaying a write', async () => {
    const read = vi
      .spyOn(PlayoutProgrammeGain.prototype, 'get')
      .mockResolvedValueOnce(snapshot(4, 0))
      .mockResolvedValueOnce(snapshot(7, -3));
    const write = vi.spyOn(PlayoutProgrammeGain.prototype, 'set').mockResolvedValue({
      ok: false,
      status: 409,
      reason: 'conflict',
      currentRevision: 7,
      reconcile: true,
    });
    const service = new PlaylistGainService(
      () => ({ ok: true, target: primary }),
      () => 'unused',
    );
    const owner = new AuthSession();
    const current = await service.get(owner, 3);
    if (!current.ok) throw new Error('the fixture read failed');
    expect(
      await service.set(owner, { channel: 3, gainDb: -6, editToken: current.state.editToken }),
    ).toMatchObject({ ok: false, reason: 'conflict', current: { gainDb: -3, usage: 'unused' } });
    expect(read).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('blocks backup service credentials, refreshed credentials and stale failover epochs', async () => {
    vi.spyOn(PlayoutProgrammeGain.prototype, 'get').mockResolvedValue(snapshot(4, 0));
    const write = vi.spyOn(PlayoutProgrammeGain.prototype, 'set');
    let backup = false;
    let target = primary;
    const service = new PlaylistGainService(
      () => (backup ? { ok: false, reason: 'backup-sign-in' } : { ok: true, target }),
      () => 'unused',
    );
    const owner = new AuthSession();
    const current = await service.get(owner, 3);
    if (!current.ok) throw new Error('the fixture read failed');
    const edit = { channel: 3, gainDb: -6, editToken: current.state.editToken };
    backup = true;
    expect(await service.get(owner, 3)).toEqual({ ok: false, reason: 'backup-sign-in' });
    expect(await service.set(owner, edit)).toEqual({ ok: false, reason: 'backup-sign-in' });
    backup = false;
    target = { ...primary, generation: 'after-failback' };
    expect(await service.set(owner, edit)).toEqual({ ok: false, reason: 'owner-changed' });
    const next = await service.get(owner, 3);
    if (!next.ok) throw new Error('the fixture read failed');
    target = { ...target, bearer: 'refreshed-operator' };
    expect(await service.set(owner, { ...edit, editToken: next.state.editToken })).toEqual({
      ok: false,
      reason: 'owner-changed',
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('drops a stale response when the owner moves during the read', async () => {
    let generation = 'primary';
    vi.spyOn(PlayoutProgrammeGain.prototype, 'get').mockImplementation(async () => {
      await Promise.resolve();
      generation = 'after-failover';
      return snapshot(4, 0);
    });
    const service = new PlaylistGainService(
      () => ({ ok: true, target: { ...primary, generation } }),
      () => 'unused',
    );
    expect(await service.get(new AuthSession(), 3)).toEqual({ ok: false, reason: 'owner-changed' });
  });

  it('counts the playlist itself on any visible frame, excludes parked copies and reports unverified seats', () => {
    const catalog = {
      inputsEpoch: '11',
      sources: [
        {
          id: 'in-pl',
          name: 'Playlist',
          producer: { kind: 'route' as const, channel: 3, layer: 26 },
          playlistOf: 3,
        },
      ],
    };
    const box = { x: 0, y: 0, width: 1, height: 1 };
    const record: LiveLayerRecord = {
      slot: { channel: 2, layer: 60 },
      sourceId: 'plate-1',
      role: 'fill',
      producer: '"route://3-26"',
      fill: box,
      clip: box,
      intendedVolume: 0,
      audioLocked: true,
      origin: 'input',
      epoch: '11',
    };
    expect(playlistFrameUsage(catalog, [[record]], new Set(), 3)).toBe('used');
    expect(playlistFrameUsage(catalog, [[{ ...record, held: true }]], new Set(), 3)).toBe('unused');
    expect(playlistFrameUsage(catalog, [[record]], new Set(['2-60']), 3)).toBe('unknown');
    expect(playlistFrameUsage(catalog, [[{ ...record, epoch: '10' }]], new Set(), 3)).toBe(
      'unknown',
    );
    expect(playlistFrameUsage(catalog, [[{ ...record, revealOverlay: true }]], new Set(), 3)).toBe(
      'used',
    );
    expect(
      playlistFrameUsage(
        catalog,
        [[{ ...record, producer: '"route://4-26"', revealOverlay: true }]],
        new Set(),
        3,
      ),
    ).toBe('unused');
  });
});
