import type { SourcePresenceView } from '@cg/shared-ipc';
import './source-presence-badges.css';

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
): string | undefined {
  return forSource(presence, sourceId)
    ?.map(({ label }) => label)
    .join('. ');
}

export function SourcePresenceBadges({
  presence,
  sourceId,
  accessible = true,
}: {
  presence: SourcePresenceView | null;
  sourceId: string | null | undefined;
  accessible?: boolean;
}): JSX.Element | null {
  const servers = forSource(presence, sourceId);
  if (servers === null) return null;
  const label = servers.map(({ label: state }) => state).join('. ');
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
          title={title}
        >
          {server}
        </span>
      ))}
    </span>
  );
}
