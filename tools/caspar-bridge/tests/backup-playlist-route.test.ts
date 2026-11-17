import { describe, expect, it } from 'vitest';
import {
  describeBackupPlaylistRoute,
  resolveBackupPlaylistRoute,
  type BackupPlaylistScope,
} from '../src/backup-playlist-route.js';

const scope: BackupPlaylistScope = {
  host: '192.0.2.22',
  apiHost: '192.0.2.22',
  playlistChannel: 2,
  destinationChannel: 4,
  destinationVideoMode: '1080i5000',
};

const primary = {
  id: 'pl-primary',
  name: 'A',
  casparHost: '192.0.2.21',
  available: true,
  playlistOf: { casparHost: '192.0.2.21', casparChannel: 1 },
  producer: { kind: 'route', channel: 1, layer: 5, videoMode: '1080i5000' },
  compatibleChannels: [{ casparHost: '192.0.2.21', casparChannel: 1 }],
};

const backup = {
  ...primary,
  id: 'pl-backup',
  name: 'B',
  casparHost: '127.0.0.1',
  playlistOf: { casparHost: '127.0.0.1', casparChannel: 2 },
  producer: { kind: 'route', channel: 2, layer: 7, videoMode: '1080i5000' },
  compatibleChannels: [{ casparHost: '127.0.0.1', casparChannel: 4 }],
};

const describeInputs = (inputs: readonly unknown[], epoch: string | undefined = '2') =>
  describeBackupPlaylistRoute({ kind: 'list', body: { inputs, epoch } }, scope);

describe('the reserve D10 clean Playlist diagnostic', () => {
  it('reports B’s local source and layer for the mapped destination, ignoring A’s row', () => {
    expect(describeInputs([primary, backup])).toBe(
      'The backup engine advertises local Playlist route 2-7 for its channel 4.',
    );
    expect(describeInputs([primary])).toContain('did not list');
    expect(
      resolveBackupPlaylistRoute(
        { kind: 'list', body: { inputs: [primary, backup], epoch: '2' } },
        scope,
      ),
    ).toEqual({
      epoch: '2',
      producer: backup.producer,
    });
  });

  it('requires B’s own session, a readable D10 epoch and a unique explicit row', () => {
    expect(describeBackupPlaylistRoute({ kind: 'no-session' }, scope)).toContain('no signed-in');
    expect(describeBackupPlaylistRoute({ kind: 'unreadable' }, scope)).toContain('not be read');
    expect(describeBackupPlaylistRoute({ kind: 'list', body: 'bad' }, scope)).toContain(
      'invalid input list',
    );
    expect(describeInputs([backup], '')).toContain('no core epoch');
    expect(describeInputs([{ ...backup, playlistOf: undefined }])).toContain('did not list');
    expect(describeInputs([backup, { ...backup, id: 'duplicate' }])).toContain('multiple');
  });

  it.each([
    ['pending-restart', 'pending restart'],
    ['not-running', 'not running'],
    ['unlicensed', 'outside its license'],
    ['unknown', 'did not report'],
  ])('reports unavailable reason %s without copying arbitrary D10 text', (reason, message) => {
    expect(describeInputs([{ ...backup, available: false, reason }])).toContain(message);
  });

  it('rejects another host, an unqualified route or a route into a CG-owned layer', () => {
    expect(describeInputs([{ ...backup, casparHost: primary.casparHost }])).toContain(
      'layer-qualified local',
    );
    expect(
      describeInputs([{ ...backup, producer: { ...backup.producer, layer: undefined } }]),
    ).toContain('layer-qualified local');
    expect(describeInputs([{ ...backup, producer: { ...backup.producer, layer: 60 } }])).toContain(
      'layer-qualified local',
    );
    expect(describeInputs([{ ...backup, producer: primary.producer }])).toContain(
      'layer-qualified local',
    );
  });

  it('requires compatibility with B’s actual destination and D4 mode', () => {
    expect(
      describeInputs([{ ...backup, compatibleChannels: primary.compatibleChannels }]),
    ).toContain('did not confirm');
    expect(
      describeBackupPlaylistRoute(
        { kind: 'list', body: { inputs: [backup], epoch: '2' } },
        { ...scope, destinationVideoMode: '720p2500' },
      ),
    ).toContain('did not confirm');
  });
});
