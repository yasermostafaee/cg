import {
  FIRST_ALLOCATABLE_LAYER,
  SourceProducerSchema,
  canonicalPlayoutEpoch,
  parsePlayoutInputs,
  type PlayoutInput,
  type SourcePresence,
} from '@cg/shared-ipc';
import { hostIsOursFor } from './playout-catalogue.js';

export interface SourcePresenceInputs {
  readonly inputs: readonly PlayoutInput[];
  readonly complete: boolean;
  readonly hasEpoch: boolean;
}

export interface ReserveInputScope {
  readonly channelCode: string;
  readonly host: string;
  readonly apiHost: string;
  readonly playlistChannel: number | null;
}

export function sourcePresenceInputsOf(body: unknown): SourcePresenceInputs | null {
  const list = parsePlayoutInputs(body);
  if (list === null) return null;
  const raw = body as { readonly inputs: readonly unknown[] };
  return {
    inputs: list.inputs,
    complete: raw.inputs.length === new Set(list.inputs.map(({ id }) => id)).size,
    hasEpoch: canonicalPlayoutEpoch(list.epoch) !== undefined,
  };
}

function listedPresence(input: PlayoutInput): SourcePresence {
  if (input.available === false) return 'missing';
  return SourceProducerSchema.safeParse(input.producer).success ? 'present' : 'unknown';
}

function playlistPresence(input: PlayoutInput, channel: number, hasEpoch: boolean): SourcePresence {
  if (input.available === false) return 'missing';
  const producer = SourceProducerSchema.safeParse(input.producer);
  if (!producer.success || producer.data.kind !== 'route') return 'unknown';
  return hasEpoch &&
    input.available === true &&
    producer.data.channel === channel &&
    producer.data.layer !== undefined &&
    producer.data.layer < FIRST_ALLOCATABLE_LAYER &&
    input.ownOutputOf === undefined
    ? 'present'
    : 'unknown';
}

export function primaryInputPresence(
  list: SourcePresenceInputs | null,
  inputId: string,
  playlistChannel: number | undefined,
): SourcePresence {
  if (list === null) return 'unknown';
  const matches = list.inputs.filter(({ id }) => inputId === id);
  const [input, duplicate] = matches;
  if (duplicate !== undefined) return 'unknown';
  if (input === undefined) return list.complete ? 'missing' : 'unknown';
  return playlistChannel === undefined
    ? listedPresence(input)
    : playlistPresence(input, playlistChannel, list.hasEpoch);
}

/** Pair by D10 logical ID or the reserve's mapped physical Playlist channel, never by name. */
export function reserveInputPresence(
  list: SourcePresenceInputs | null,
  scope: ReserveInputScope | null,
  logicalId: string,
  isPlaylist: boolean,
): SourcePresence {
  if (list === null || scope === null) return 'unknown';
  const isLocal = hostIsOursFor(scope.apiHost, () => [scope.host]);
  if (isPlaylist) {
    const channel = scope.playlistChannel;
    if (channel === null) return 'unknown';
    const [input, duplicate] = list.inputs.filter(
      ({ playlistOf }) => playlistOf?.casparChannel === channel && isLocal(playlistOf.casparHost),
    );
    if (duplicate !== undefined) return 'unknown';
    if (input === undefined) return list.complete ? 'missing' : 'unknown';
    return playlistPresence(input, channel, list.hasEpoch);
  }

  const candidates = list.inputs.filter(
    ({ playlistOf, casparHost }) =>
      playlistOf === undefined && (casparHost === undefined || isLocal(casparHost)),
  );
  const [input, duplicate] = candidates.filter(({ id, logicalMappings }) =>
    logicalMappings === undefined
      ? id === logicalId && !id.startsWith('replica-')
      : logicalMappings.some(
          (m) => m.channelCode === scope.channelCode && m.logicalInputId === logicalId,
        ),
  );
  if (duplicate !== undefined) return 'unknown';
  if (input !== undefined) return listedPresence(input);
  return list.complete && candidates.every(({ logicalMappings }) => logicalMappings !== undefined)
    ? 'missing'
    : 'unknown';
}
