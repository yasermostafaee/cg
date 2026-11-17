import type { PlayoutInput, SourcePresence } from '@cg/shared-ipc';
import { hostIsOursFor } from './playout-catalogue.js';
import type { SourcePreviewSelector } from './playout-source-previews.js';
import {
  reserveInputPresence,
  type ReserveInputScope,
  type SourcePresenceInputs,
} from './source-presence.js';

export type PreviewEngine = 'A' | 'B';

/** A read fallback never changes the programme owner or the command sender. */
export function sourceReadEngine(
  preferred: PreviewEngine | null,
  primary: SourcePresence,
  backup: SourcePresence,
): PreviewEngine | null {
  if (preferred === null) return null;
  const other = preferred === 'A' ? 'B' : 'A';
  const states = { A: primary, B: backup };
  return states[preferred] === 'missing' && states[other] === 'present' ? other : preferred;
}

/** Resolve a reserve's own D10 identity. Names, producer URLs and A's physical IDs are not joins. */
export function reservePreviewSelector(
  list: SourcePresenceInputs | null,
  scope: ReserveInputScope | null,
  logicalId: string,
  playlist: boolean,
): SourcePreviewSelector | null {
  if (list === null || scope === null) return null;
  if (reserveInputPresence(list, scope, logicalId, playlist) !== 'present') return null;
  const isLocal = hostIsOursFor(scope.apiHost, () => [scope.host]);
  let candidates: readonly PlayoutInput[];
  if (playlist) {
    if (!list.hasEpoch || scope.playlistChannel === null) return null;
    candidates = list.inputs.filter(
      (input) =>
        input.available === true &&
        input.playlistOf?.casparChannel === scope.playlistChannel &&
        isLocal(input.playlistOf.casparHost),
    );
  } else {
    candidates = list.inputs.filter(
      (input) =>
        input.available !== false &&
        input.playlistOf === undefined &&
        (input.casparHost === undefined || isLocal(input.casparHost)) &&
        (input.logicalMappings === undefined
          ? input.id === logicalId && !input.id.startsWith('replica-')
          : input.logicalMappings.some(
              (mapping) =>
                mapping.channelCode === scope.channelCode && mapping.logicalInputId === logicalId,
            )),
    );
  }
  const [input, duplicate] = candidates;
  if (input === undefined || duplicate !== undefined) return null;
  return playlist && input.playlistOf !== undefined
    ? { kind: 'playlist', playlistOf: input.playlistOf }
    : { kind: 'live', inputId: input.id };
}

/** Try only independently resolved targets. A failed lookup never forwards its ID to the other node. */
export async function sourceReadTarget<T>(
  preferred: PreviewEngine | null,
  resolve: (engine: PreviewEngine) => Promise<T | null>,
): Promise<T | null> {
  if (preferred === null) return null;
  return (await resolve(preferred)) ?? resolve(preferred === 'A' ? 'B' : 'A');
}
