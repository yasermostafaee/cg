import type { SourcePresenceView } from '@cg/shared-ipc';
import './source-presence-badges.css';
import type { PreviewEngine } from './usePreviewOrigins.js';

const SERVERS = ['A', 'B'] as const;
const AVAILABILITY_WORDS = {
  present: 'available',
  missing: 'unavailable',
  unknown: 'availability unknown',
} as const;

function forSource(presence: SourcePresenceView | null, sourceId: string | null | undefined) {
  return presence !== null && sourceId && presence.engines.includes('B')
    ? SERVERS.map((server) => {
        const state = presence.sources[sourceId]?.[server] ?? 'unknown';
        return { server, state, label: `Server ${server}: ${AVAILABILITY_WORDS[state]}` };
      })
    : null;
}

export function sourcePresenceDescription(
  presence: SourcePresenceView | null,
  sourceId: string | null | undefined,
  originDescription?: string,
): string | undefined {
  const servers = forSource(presence, sourceId);
  if (servers === null) return undefined;
  const availability = servers.map(({ label }) => label);
  if (originDescription !== undefined) availability.push(originDescription);
  return availability.join('. ');
}

export function SourcePresenceBadges({
  presence,
  sourceId,
  accessible = true,
  previewEngine,
  originDescription = previewEngine === undefined
    ? undefined
    : `Preview from server ${previewEngine}`,
}: {
  presence: SourcePresenceView | null;
  sourceId: string | null | undefined;
  accessible?: boolean;
  previewEngine?: PreviewEngine | undefined;
  originDescription?: string | undefined;
}): JSX.Element | null {
  const servers = forSource(presence, sourceId);
  if (servers === null) return null;
  const label = sourcePresenceDescription(presence, sourceId, originDescription);
  return (
    <span
      className="cg-source-presence"
      data-source-presence=""
      role={accessible ? 'img' : undefined}
      aria-label={accessible ? label : undefined}
      aria-hidden={accessible ? undefined : true}
      dir="ltr"
    >
      {servers.map(({ server, state, label: title }) => (
        <span
          key={server}
          data-source-presence-server={server}
          data-source-presence-state={state}
          data-source-preview-provider={previewEngine === server ? '' : undefined}
          title={
            previewEngine === server && originDescription !== undefined
              ? `${title}. ${originDescription}`
              : title
          }
        >
          {server}
        </span>
      ))}
    </span>
  );
}
