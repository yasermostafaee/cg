import { useSyncExternalStore } from 'react';
import { Cable, Film } from 'lucide-react';
import type { SourceDefinition } from '@cg/shared-ipc';
import { Icon } from '../../ui/Icon.js';
import { directionOf } from '../../ui/OperatorNames.js';
import { Tag } from '../../ui/Tag.js';
import {
  currentSourceCatalog,
  seenMediaItem,
  sourcesVersion,
  subscribeSources,
} from './sourceStore.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.B — **ONE WAY TO NAME A BOUND SOURCE: its kind's icon, its NAME, and
 * `Unavailable` when the Playout stopped offering it.**
 *
 * Every surface that names a plate's source — the Look inputs, the on-air readouts, the name on the
 * PVW overlay, the swap dialog, the audit line and the picker's own field — renders it through here,
 * so an operator reads the same thing for the same source everywhere.
 *
 * ── WHAT IT NEVER SHOWS ─────────────────────────────────────────────────────────────────
 *
 * No id and no URL (golden rule 11, and §1.E: a stream's address can carry a password). The name is
 * whatever the Playout's operators called that cable, feed or clip; CG never invents, translates or
 * prefixes one. The kind is an ICON (an input, or a media item) — the words `NDI` or `Stream` are
 * Station setup's alone.
 *
 * The name is an INLINE `<bdi>` (the `MODAL-CHROME-10` finding): Persian names isolate their own
 * characters without deciding the box's alignment.
 */

/** `17:39`, or `1:02:05` past an hour — a clip's length as a playout list writes it. */
export function formatMediaDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${String(h)}:${two(m)}:${two(s)}` : `${String(m)}:${two(s)}`;
}

/** What a label needs to know about a source, from the catalogue or from a search this session. */
export interface LabelledSource {
  readonly name: string;
  readonly origin: 'input' | 'media' | undefined;
  readonly durationMs?: number | undefined;
  readonly unavailable: boolean;
  readonly reason?: string | undefined;
}

/** The ONE lookup behind a label: the catalogue in force, then the media seen in a search. */
export function labelledSource(sourceId: string | null | undefined): LabelledSource | null {
  if (sourceId === null || sourceId === undefined || sourceId === '') return null;
  const entry: SourceDefinition | undefined = currentSourceCatalog().sources.find(
    (s) => s.id === sourceId,
  );
  if (entry !== undefined) {
    return {
      name: entry.name,
      origin: entry.origin,
      durationMs: entry.media?.durationMs,
      unavailable: entry.status === 'unavailable',
      reason: entry.reason,
    };
  }
  const seen = seenMediaItem(sourceId);
  if (seen !== undefined) {
    return { name: seen.name, origin: 'media', durationMs: seen.durationMs, unavailable: false };
  }
  return null;
}

export function SourceLabel({
  sourceId,
  fallback = 'None',
  meta = true,
}: {
  /** The bound catalogue id. Empty or unknown renders {@link fallback} — never the id. */
  sourceId: string | null | undefined;
  /** What an empty or unknown binding reads as. */
  fallback?: string | undefined;
  /** A media item's length after its name. */
  meta?: boolean | undefined;
}): JSX.Element {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const source = labelledSource(sourceId);
  if (source === null) {
    return (
      <span className="cg-source-label" data-source-label="none">
        {fallback}
      </span>
    );
  }
  const media = source.origin === 'media';
  return (
    <span
      className="cg-source-label"
      data-source-label={source.origin ?? 'input'}
      {...(source.unavailable ? { 'data-source-unavailable': '' } : {})}
    >
      <Icon icon={media ? Film : Cable} size={14} />
      {/*
        `B-303` — the name in its OWN direction: a name with Persian in it reads right to left, as
        the Playout shows it, even when it starts with a Latin word (`NDI کانالِ ۱ (APASAI)`). This
        box sizes to its text, so its direction also puts a cut name's ellipsis at the name's END.
      */}
      <bdi className="cg-source-label__name" dir={directionOf(source.name)}>
        {source.name}
      </bdi>
      {media && meta && source.durationMs !== undefined && (
        <span className="cg-source-label__meta">{formatMediaDuration(source.durationMs)}</span>
      )}
      {source.unavailable && (
        <Tag className="cg-source-tag cg-source-tag--unavailable" title={source.reason}>
          Unavailable
        </Tag>
      )}
    </span>
  );
}
