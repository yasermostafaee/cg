import {
  SourceNdiSenderNameSchema,
  SourceProducerSchema,
  type PlayoutInput,
  type SourceNdiTarget,
  type SourcePresence,
} from '@cg/shared-ipc';
import { hostIsOursFor } from './playout-catalogue.js';
import { ndiSettingForInput, type NdiInputSetting } from './ndi-input-settings.js';
import type { SourcePreviewSelector } from './playout-source-previews.js';
import {
  reserveInputPresence,
  reserveLiveInputIdentity,
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

/** Picture fallback requires a positively present alternate; unknown is never a join. */
export function sourcePictureFallbackEngine(
  preferred: PreviewEngine,
  primary: SourcePresence,
  backup: SourcePresence,
): PreviewEngine | null {
  const alternate = preferred === 'A' ? 'B' : 'A';
  return (alternate === 'A' ? primary : backup) === 'present' ? alternate : null;
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
    candidates = reserveLiveInputIdentity(list, scope, logicalId).matches.filter(
      (input) => input.available !== false,
    );
  }
  const [input, duplicate] = candidates;
  if (input === undefined || duplicate !== undefined) return null;
  return playlist && input.playlistOf !== undefined
    ? { kind: 'playlist', playlistOf: input.playlistOf }
    : { kind: 'live', inputId: input.id };
}

/** A holder route needs an exact join to the same node's settings for the original identity. */
export function sourceNdiTarget(
  sourceId: string,
  engine: PreviewEngine,
  inputs: readonly PlayoutInput[],
  settings: readonly NdiInputSetting[] = [],
): SourceNdiTarget {
  const [input, duplicate] = inputs;
  if (input === undefined || duplicate !== undefined) return { sourceId, kind: 'unknown' };
  const producer = SourceProducerSchema.safeParse(input.producer);
  if (!producer.success) return { sourceId, kind: 'unknown' };
  if (input.playlistOf !== undefined) return { sourceId, kind: 'other' };
  if (producer.data.kind === 'route') {
    const setting = ndiSettingForInput(settings, input.id);
    return setting.kind === 'ndi'
      ? { sourceId, engine, ...setting }
      : { sourceId, kind: setting.kind };
  }
  if (producer.data.kind !== 'ndi') return { sourceId, kind: 'other' };
  const sender = SourceNdiSenderNameSchema.safeParse(producer.data.source);
  return sender.success && !sender.data.includes('://')
    ? { sourceId, kind: 'ndi', senderName: sender.data, engine }
    : { sourceId, kind: 'unknown' };
}

export function needsNdiInputSettings(inputs: readonly PlayoutInput[]): boolean {
  const [input, duplicate] = inputs;
  if (input === undefined || duplicate !== undefined || input.playlistOf !== undefined)
    return false;
  const producer = SourceProducerSchema.safeParse(input.producer);
  return producer.success && producer.data.kind === 'route';
}

/** Try only independently resolved targets. A failed lookup never forwards its ID to the other node. */
export async function sourceReadTarget<T>(
  preferred: PreviewEngine | null,
  resolve: (engine: PreviewEngine) => Promise<T | null>,
): Promise<T | null> {
  if (preferred === null) return null;
  return (await resolve(preferred)) ?? resolve(preferred === 'A' ? 'B' : 'A');
}
