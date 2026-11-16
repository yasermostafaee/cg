import {
  FIRST_ALLOCATABLE_LAYER,
  SourceProducerSchema,
  canonicalPlayoutEpoch,
  parsePlayoutInputs,
} from '@cg/shared-ipc';
import { hostIsOursFor } from './playout-catalogue.js';

export type BackupPlaylistInputRead =
  | { readonly kind: 'no-session' | 'unreadable' }
  | { readonly kind: 'list'; readonly body: unknown };

export interface BackupPlaylistScope {
  readonly host: string;
  readonly apiHost: string;
  readonly playlistChannel: number;
  readonly destinationChannel: number;
  readonly destinationVideoMode: string | undefined;
}

/** Diagnose whether the reserve advertises its own ready source for this mapped clean Playlist. */
export function describeBackupPlaylistRoute(
  read: BackupPlaylistInputRead,
  scope: BackupPlaylistScope,
): string {
  if (read.kind !== 'list') {
    return read.kind === 'no-session'
      ? 'The backup engine has no signed-in session for its input list.'
      : 'The backup engine input list could not be read.';
  }
  const list = parsePlayoutInputs(read.body);
  if (list === null) return 'The backup engine answered with an invalid input list.';
  if (canonicalPlayoutEpoch(list.epoch) === undefined)
    return 'The backup engine input list has no core epoch.';

  const isBackupHost = hostIsOursFor(scope.apiHost, () => [scope.host]);
  const matches = list.inputs.filter(
    ({ playlistOf }) =>
      playlistOf?.casparChannel === scope.playlistChannel && isBackupHost(playlistOf.casparHost),
  );
  const [row, duplicate] = matches;
  if (row === undefined) return 'The backup engine did not list this channel’s Playlist output.';
  if (duplicate !== undefined)
    return 'The backup engine listed multiple Playlist outputs for this channel.';
  if (row.available !== true) {
    switch (row.reason) {
      case 'pending-restart':
        return 'The backup engine reports that the Playlist channel is pending restart.';
      case 'not-running':
        return 'The backup engine reports that the Playlist channel is not running.';
      case 'unlicensed':
        return 'The backup engine reports that the Playlist channel is outside its license.';
      default:
        return 'The backup engine did not report the Playlist output as available.';
    }
  }

  const producer = SourceProducerSchema.safeParse(row.producer);
  const route = producer.success && producer.data.kind === 'route' ? producer.data : null;
  if (
    route === null ||
    route.channel !== scope.playlistChannel ||
    route.layer === undefined ||
    route.layer >= FIRST_ALLOCATABLE_LAYER ||
    row.ownOutputOf !== undefined ||
    row.casparHost === undefined ||
    !isBackupHost(row.casparHost)
  ) {
    return 'The backup engine did not advertise a layer-qualified local Playlist route.';
  }
  if (
    !row.compatibleChannels?.some(
      ({ casparHost, casparChannel }) =>
        casparChannel === scope.destinationChannel && isBackupHost(casparHost),
    ) ||
    typeof route.videoMode !== 'string' ||
    route.videoMode.toLowerCase() !== scope.destinationVideoMode?.toLowerCase()
  ) {
    return 'The backup engine did not confirm this route for the mapped destination and video mode.';
  }
  return (
    `The backup engine advertises local Playlist route ${String(route.channel)}-${String(route.layer)} ` +
    `for its channel ${String(scope.destinationChannel)}.`
  );
}
