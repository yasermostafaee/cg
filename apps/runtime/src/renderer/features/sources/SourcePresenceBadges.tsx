import { useUiText } from '../../i18n/locale.js';
import type { PgmTopology, SourcePresenceView } from '@cg/shared-ipc';
import './source-presence-badges.css';
import type { PreviewEngine } from './usePreviewOrigins.js';

type ProgrammeEngine = NonNullable<PgmTopology['active']>;

const SERVERS = ['A', 'B'] as const;
const AVAILABILITY = {
  present: 'Server {server}: available',
  missing: 'Server {server}: unavailable',
  unknown: 'Server {server}: availability unknown',
} as const;

function forSource(
  presence: SourcePresenceView | null,
  sourceId: string | null | undefined,
  localize?: ReturnType<typeof useUiText>,
) {
  return presence !== null && sourceId && presence.engines.includes('B')
    ? SERVERS.map((server) => {
        const state = presence.sources[sourceId]?.[server] ?? 'unknown';
        const key = AVAILABILITY[state];
        return {
          server,
          state,
          label: localize?.(key, { server }) ?? key.replace('{server}', server),
        };
      })
    : null;
}

export function sourcePresenceDescription(
  presence: SourcePresenceView | null,
  sourceId: string | null | undefined,
  originDescription?: string,
  localize?: ReturnType<typeof useUiText>,
  activePgm?: ProgrammeEngine,
): string | undefined {
  const servers = forSource(presence, sourceId, localize);
  if (servers === null) return undefined;
  const availability = servers.map(({ label }) => label);
  if (originDescription !== undefined) availability.push(originDescription);
  if (activePgm !== undefined && localize !== undefined) {
    availability.push(localize('Active PGM server: {server}', { server: activePgm }));
  }
  return availability.join('. ');
}

export function SourcePresenceBadges({
  presence,
  sourceId,
  accessible = true,
  previewEngine,
  originDescription: suppliedOrigin,
  activePgm,
}: {
  presence: SourcePresenceView | null;
  sourceId: string | null | undefined;
  accessible?: boolean;
  previewEngine?: PreviewEngine | undefined;
  originDescription?: string | undefined;
  activePgm?: ProgrammeEngine | undefined;
}): JSX.Element | null {
  const localizeUi = useUiText();
  const originDescription =
    suppliedOrigin ??
    (previewEngine === undefined
      ? undefined
      : localizeUi('Preview from server {server}', { server: previewEngine }));
  const servers = forSource(presence, sourceId, localizeUi);
  if (servers === null) return null;
  const label = sourcePresenceDescription(
    presence,
    sourceId,
    originDescription,
    localizeUi,
    activePgm,
  );
  const programmeDescription =
    activePgm === undefined
      ? undefined
      : localizeUi('Active PGM server: {server}', { server: activePgm });
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
          title={[
            title,
            previewEngine === server ? originDescription : undefined,
            programmeDescription,
          ]
            .filter(Boolean)
            .join('. ')}
        >
          {server}
        </span>
      ))}
    </span>
  );
}
