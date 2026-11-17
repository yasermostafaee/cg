import {
  FIRST_ALLOCATABLE_LAYER,
  SourceProducerSchema,
  canonicalPlayoutEpoch,
  parsePlayoutInputs,
  type SourceProducer,
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

export interface BackupPlaylistRoute {
  readonly producer: Extract<SourceProducer, { kind: 'route' }>;
  readonly epoch: string;
}

export interface ConfirmedBackupPlaylistRoute extends BackupPlaylistRoute {
  /** The same B session, D10 epoch, qualified producer and destination mapping are still in force. */
  readonly current: () => boolean;
}

/** A route is resolved only from the reserve's own qualified, compatible Playlist row. */
export function resolveBackupPlaylistRoute(
  read: BackupPlaylistInputRead,
  scope: BackupPlaylistScope,
): BackupPlaylistRoute | string {
  if (read.kind !== 'list') {
    return read.kind === 'no-session'
      ? 'The backup engine has no signed-in session for its input list.'
      : 'The backup engine input list could not be read.';
  }
  const list = parsePlayoutInputs(read.body);
  if (list === null) return 'The backup engine answered with an invalid input list.';
  const epoch = canonicalPlayoutEpoch(list.epoch);
  if (epoch === undefined) return 'The backup engine input list has no core epoch.';

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
  return { producer: route, epoch };
}

/** Operator diagnostic shares exactly the same validation as the seating resolver. */
export function describeBackupPlaylistRoute(
  read: BackupPlaylistInputRead,
  scope: BackupPlaylistScope,
): string {
  const result = resolveBackupPlaylistRoute(read, scope);
  return typeof result === 'string'
    ? result
    : `The backup engine advertises local Playlist route ${String(result.producer.channel)}-${String(result.producer.layer)} ` +
        `for its channel ${String(scope.destinationChannel)}.`;
}
