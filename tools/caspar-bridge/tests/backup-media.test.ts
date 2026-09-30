import { afterEach, describe, expect, it } from 'vitest';
import { BackupMediaLookup, backupMediaUrl, FINGERPRINTS_PER_CALL } from '../src/backup-media.js';
import {
  fakeFingerprint,
  startFakePlayout,
  type FakeMediaItem,
  type FakePlayout,
} from './support/fake-playout.js';

/**
 * `PLAYOUT-FEATURES-01` A (`B-286`) — the backup lookup against a real fake Playout over HTTP: at most 100
 * fingerprints a request, an item counts only by its OWN fingerprint, a re-read picks up a copy the backup
 * gained, and `reset` forgets everything until the next read lands.
 */

let playouts: FakePlayout[] = [];
afterEach(async () => {
  for (const p of playouts) await p.stop();
  playouts = [];
});

const clip = (n: number): FakeMediaItem => ({
  id: `b-${String(n)}`,
  name: `Clip ${String(n)}`,
  clip: `E:/Backup/${String(n)}.mp4`,
  type: 'video',
  folder: 'Backup',
  updatedAt: '2026-09-30T08:00:00Z',
  fingerprint: fakeFingerprint(`m-${String(n)}`),
});

async function backup(items: readonly FakeMediaItem[]): Promise<FakePlayout> {
  const p = await startFakePlayout();
  playouts.push(p);
  p.setMedia(items);
  return p;
}

describe('BackupMediaLookup', () => {
  it('asks at most 100 fingerprints a request, and matches each by its OWN fingerprint, case-insensitively', async () => {
    const p = await backup([clip(1), clip(2)]);
    const lookup = new BackupMediaLookup({ url: () => p.mediaUrl, bearer: () => 'b' });
    const wanted = Array.from({ length: 150 }, (_, i) => fakeFingerprint(`m-${String(i + 1)}`));
    await lookup.track(wanted.map((f, i) => (i === 0 ? f.toUpperCase() : f)));
    const asked = p.mediaQueries.filter((q) => q.startsWith('fingerprint='));
    expect(asked).toHaveLength(2);
    for (const q of asked) {
      const count = decodeURIComponent(q.slice('fingerprint='.length)).split(',').length;
      expect(count).toBeLessThanOrEqual(FINGERPRINTS_PER_CALL);
    }
    expect(lookup.lookup(fakeFingerprint('m-1'))).toEqual({
      kind: 'copy',
      clip: 'E:/Backup/1.mp4',
    });
    expect(lookup.lookup(fakeFingerprint('m-2').toUpperCase())).toEqual({
      kind: 'copy',
      clip: 'E:/Backup/2.mp4',
    });
    expect(lookup.lookup(fakeFingerprint('m-3'))).toEqual({ kind: 'refused', reason: 'no-copy' });
    expect(lookup.lookup(undefined)).toEqual({ kind: 'refused', reason: 'no-fingerprint' });
  });

  it('a re-read picks up a copy the backup gained; `reset` forgets every answer until the next read', async () => {
    const p = await backup([clip(1)]);
    const lookup = new BackupMediaLookup({ url: () => p.mediaUrl, bearer: () => 'b' });
    await lookup.track([fakeFingerprint('m-1'), fakeFingerprint('m-2')]);
    expect(lookup.lookup(fakeFingerprint('m-2')).kind).toBe('refused');
    p.setMedia([clip(1), clip(2)]);
    await lookup.refreshAll();
    expect(lookup.lookup(fakeFingerprint('m-2'))).toEqual({
      kind: 'copy',
      clip: 'E:/Backup/2.mp4',
    });
    // The backup's address changed: nothing known about the old one holds — until it is read again.
    await p.goOffline();
    await lookup.reset();
    expect(lookup.lookup(fakeFingerprint('m-1'))).toEqual({
      kind: 'refused',
      reason: 'backup-unread',
    });
    await p.goOnline();
    await lookup.refreshAll();
    expect(lookup.lookup(fakeFingerprint('m-1')).kind).toBe('copy');
  });

  it('the backup Playout’s D11 is the configured Playout’s at server B’s host — none without a server B', () => {
    expect(backupMediaUrl('http://127.0.0.1:8080/api/cg/media', '192.0.2.12')).toBe(
      'http://192.0.2.12:8080/api/cg/media',
    );
    expect(backupMediaUrl('http://127.0.0.1:8080/api/cg/media', undefined)).toBeNull();
  });
});
