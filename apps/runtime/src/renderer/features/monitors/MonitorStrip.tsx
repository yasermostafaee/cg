import { backupChannelLineText, type PgmEngine } from '@cg/shared-ipc';
import { useShellLayoutContext } from '../../hooks/shellLayoutContext.js';
import { useBackupChannels } from '../../hooks/useBackupChannels.js';
import { useConnections } from '../../hooks/useConnections.js';
import { useChannelAir, useChannelBankState } from '../channels/useSelectedChannel.js';
import { useProgramReturn, useProgramReturnStatuses } from '../../hooks/useProgramReturn.js';
import { useProgramTopology } from '../../hooks/useProgramTopology.js';
import { usePgmAudio } from '../../hooks/usePgmAudio.js';
import { useStackSnapshot } from '../../hooks/useStack.js';
import { airTally, onChannel } from '../stack/onAir.js';
import { MonitorPanel, type ProgrammeMonitorTarget } from './MonitorPanel.js';
import { PreviewPanel } from './PreviewPanel.js';
import { useProgramMonitorPreferences } from './useProgramMonitorPreferences.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Columns3, Monitor, PanelRight } from 'lucide-react';

export type MonitorCompanionMode = 'monitor' | 'layer' | 'layer-inspector';

interface Props {
  companionMode: MonitorCompanionMode;
  hasSelectedLayer: boolean;
  canEditPreviewPosition?: boolean;
  onSelectPreviewItem?: (itemId: string) => void;
  onCompanionModeChange: (mode: MonitorCompanionMode) => void;
}

/**
 * The monitor strip: PREVIEW beside PROGRAM, in their final positions.
 *
 * ORDER IS PREVIEW-THEN-PROGRAM, left to right, which is the vision-mixer
 * convention every gallery already reads: what is NEXT on the left, what is ON
 * AIR on the right. Getting this backwards in a broadcast UI is not a cosmetic
 * complaint — an operator who reaches for the wrong box under time pressure is
 * looking at the wrong output.
 *
 * DELIBERATELY NOT RTL-FLIPPED. Persian/RTL is a core requirement of this
 * product and text throughout reverses, but PGM/PVW placement is a hardware
 * convention shared with the mixer, the multiviewer and the rack — those do not
 * flip, so neither does this. Recorded under "Decisions taken fast".
 *
 * When one of the two is taken FULLSCREEN the strip shows only that one. The
 * strip reads the focus itself rather than making the shell special-case a
 * monitor: the shell's job is "the workspace is fullscreen-ing something", and
 * which box that is belongs here.
 */
export function MonitorStrip({
  companionMode,
  hasSelectedLayer,
  onCompanionModeChange,
  canEditPreviewPosition = false,
  onSelectPreviewItem,
}: Props): JSX.Element {
  const { focus } = useShellLayoutContext();
  /*
    🔴 `CONSOLE-MATCH-03` §1 — the two facts PGM's strip states, read HERE and passed down.

    `airTally` is the ONE air count on this console (`B-213`), and the channel comes from the
    declared bank the layer table reads. Both are lifted to the strip rather than looked up
    inside `MonitorPanel` so that the panel stays a presentation component and so there is
    exactly one place the two panes' channel can come from.
  */
  // `MULTI-CHANNEL-01` — the SELECTED channel: PROGRAM is the channel on screen.
  const { viewChannel } = useChannelBankState();
  // `UI-POLISH-01` G — the Playout's air facts for the channel PROGRAM shows (its head's colour).
  const air = useChannelAir(viewChannel);
  const { items } = useStackSnapshot();
  // `DESKTOP-APPS-01-D` j — PROGRAM's `N rows on air` counts this channel only.
  const onAirRows = airTally(onChannel(items, viewChannel)).onAir;
  const showPvw = focus !== 'pgm';
  const showPgm = focus !== 'pvw';
  /*
    🔴 `RELEASE-0113-01` / `R-104` — THIS channel's validated N → M backup line. It is also the
    identity of B's programme resource: if M or the backup host changes, the old viewer is replaced
    with a fresh ticket even though the authorized logical channel N did not change.
  */
  const backupState = useBackupChannels();
  const health = useConnections();
  const topology = useProgramTopology(showPgm ? viewChannel : null);
  const legacy = topology === null;
  const currentPrimary = legacy
    ? health?.currentPrimary === 'B'
      ? 'B'
      : 'A'
    : (topology?.active ?? null);
  const backupLine = ((): {
    text: string;
    title?: string;
    mapped: boolean;
    channel?: number;
  } | null => {
    const backup = backupState?.backup ?? null;
    if (backup === null) return null;
    const line = backup.channels.find((c) => c.channel === viewChannel);
    if (line === undefined) return null;
    return {
      text: backupChannelLineText(line, backup.backupHost),
      ...(line.reason !== undefined ? { title: line.reason } : {}),
      mapped: line.state === 'mapped',
      ...(line.state === 'mapped' && line.backupChannel !== undefined
        ? { channel: line.backupChannel }
        : {}),
    };
  })();
  const monitorPreferences = useProgramMonitorPreferences(currentPrimary);
  const targets: readonly ProgrammeMonitorTarget[] = legacy
    ? [
        { engine: 'A', physicalChannel: viewChannel },
        { engine: 'B', physicalChannel: backupLine?.channel ?? null },
      ]
    : (topology?.members ?? []).map((member) => ({
        ...member,
        active: member.engine === topology?.active,
      }));

  // Keep a saved explicit selection visible even when its physical return is unavailable.
  const selectedTarget =
    targets.length === 1 || monitorPreferences.display === 'both'
      ? undefined
      : (targets.find(({ engine }) => engine === monitorPreferences.display) ?? {
          engine: monitorPreferences.display,
          physicalChannel: null,
        });
  const visibleTargets = selectedTarget === undefined ? targets : [selectedTarget];
  const visible = new Set(visibleTargets.map(({ engine }) => engine));
  const statuses = useProgramReturnStatuses();
  const visibleTarget = (engine: PgmEngine) =>
    showPgm && visible.has(engine) ? targets.find((target) => target.engine === engine) : undefined;
  /*
    `C-016` — the programme return, lifted here beside the air count for the same reason. A
    PROGRAM pane that is not rendered asks for NOTHING: the channel is `null` while it is folded
    away, so no picture is requested and the bridge pulls nothing from the Playout for it.
  */
  const a = visibleTarget('A');
  const b = visibleTarget('B');
  const c = visibleTarget('C');
  const d = visibleTarget('D');
  const availableChannel = (target: ProgrammeMonitorTarget | undefined): number | null =>
    target?.physicalChannel != null ? viewChannel : null;
  const returns = {
    A: useProgramReturn(availableChannel(a), 'A', statuses, a?.resourceKey),
    B: useProgramReturn(
      availableChannel(b),
      'B',
      statuses,
      b?.resourceKey,
      legacy ? backupLine?.text : undefined,
    ),
    C: useProgramReturn(availableChannel(c), 'C', statuses, c?.resourceKey),
    D: useProgramReturn(availableChannel(d), 'D', statuses, d?.resourceKey),
  };
  const audioTarget = targets.find(({ engine }) => engine === monitorPreferences.audioEngine);
  const audioChannel = showPgm ? availableChannel(audioTarget) : null;
  const programSound = usePgmAudio(audioChannel, audioTarget?.engine, audioTarget?.resourceKey);
  const effectiveCompanionMode = hasSelectedLayer ? companionMode : 'monitor';
  const companionActions =
    focus === 'pgm' || focus === 'pvw' ? (
      <div role="group" aria-label="Maximized monitor layout" data-monitor-companion-controls="">
        {(
          [
            ['monitor', Monitor, 'Monitor only'],
            ['layer', PanelRight, 'Monitor and selected layer'],
            ['layer-inspector', Columns3, 'Monitor, selected layer and Inspector'],
          ] as const
        ).map(([mode, glyph, label]) => {
          const unavailable = mode !== 'monitor' && !hasSelectedLayer;
          return (
            <Button
              key={mode}
              variant="ghost"
              active={effectiveCompanionMode === mode}
              aria-label={label}
              aria-pressed={effectiveCompanionMode === mode}
              data-monitor-companion-mode={mode}
              disabled={unavailable}
              title={unavailable ? 'Restore the workspace and select a layer' : label}
              onClick={() => onCompanionModeChange(mode)}
            >
              <Icon icon={glyph} size={13} />
            </Button>
          );
        })}
      </div>
    ) : undefined;

  return (
    /*
      `minWidth: 0` IS LOad-BEARING, not defensive tidying.

      The rehearsal iframe is sized to the CHANNEL RASTER (1920px) on purpose —
      that is what makes the page inside compute its real on-air placement — and a
      CSS `transform: scale()` shrinks how it LOOKS without changing what it
      OCCUPIES. Without a floor of zero here the strip takes its width FROM that
      1920px child instead of from its column, and two things follow: PROGRAM is
      pushed off the right of the viewport, and `RehearsalStage` then measures its
      fit against the blown-out box and computes a scale of ~1 — so the rehearsal
      renders unscaled until some unrelated re-render happens to re-measure it
      against a settled box. One missing floor, both symptoms.
    */
    <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/*
        The copy says what each output IS, in the operator's terms, naming no
        internal item number — the visible surface is not where the roadmap gets
        tracked. The pointers live in `MonitorPanel`'s comment.

        The two panes are DIFFERENT ON PURPOSE. PREVIEW is a local browser render
        with no server involvement, so it has nothing to connect to and a "no
        signal" label would send an operator hunting for a link that is not part of
        the design. Only PROGRAM has a feed — the Playout's own return (C-016).
      */}
      {/*
        R-022 — PREVIEW is no longer a reserved empty box: it renders the
        rehearsal for EVERY row the operator has put into REHEARSE, composited. It
        gets its own component rather than props on `MonitorPanel`, because its
        behaviour (the rehearsing set, the retained pages, the channel raster, the
        operator's staged values) has nothing in common with PROGRAM's, which shows
        the Playout's return (C-016).

        It takes NO `selectedId`. It used to, to pick which single rehearsal to
        show; now it shows all of them, and the selection's remaining job — which
        row an edit applies to — belongs to the Inspector and never to this panel.
      */}
      {/* Keep the local rehearsal page mounted while fullscreen PGM hides this pane. */}
      <PreviewPanel
        hidden={!showPvw}
        companionActions={showPvw ? companionActions : undefined}
        canEditPosition={canEditPreviewPosition}
        onSelectItem={onSelectPreviewItem}
      />
      {showPgm && (
        <MonitorPanel
          id="pgm"
          title="PROGRAM (PGM)"
          word="PROGRAM"
          channel={viewChannel}
          onAirRows={onAirRows}
          returns={visibleTargets.map((target) => ({
            ...target,
            programReturn: returns[target.engine],
          }))}
          programSound={programSound}
          monitorPreferences={monitorPreferences}
          backupAvailable={legacy && audioTarget?.engine === 'B' && audioChannel !== null}
          topologyTargets={legacy ? undefined : targets}
          air={air}
          backupLine={legacy ? backupLine : null}
          companionActions={companionActions}
        />
      )}
    </div>
  );
}
