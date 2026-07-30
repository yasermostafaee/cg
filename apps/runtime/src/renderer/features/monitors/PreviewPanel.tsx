import { useEffect, useState, useSyncExternalStore } from 'react';
import { SquareDashed } from 'lucide-react';
import { REFERENCE_RASTER, type Rehearsal } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { Panel } from '../../ui/Panel.js';
import { Icon } from '../../ui/Icon.js';
import { colors } from '../../theme.js';
import { useRehearse } from '../../hooks/useRehearse.js';
import { useStack } from '../../hooks/useStack.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useFixedBank } from '../../hooks/useFixedLayers.js';
import { buildApplyPayload, draftsVersion, subscribeDrafts } from '../inspector/draftStore.js';
import { RehearsalStage } from './RehearsalStage.js';

/**
 * PREVIEW — the PVW box.
 *
 * Empty until a row is put into REHEARSE (R-022), and then it renders that row's
 * graphic locally. It will never "connect" to anything: R-022 specifies PVW as a
 * LOCAL browser render, so a connection state is meaningless here and telling an
 * operator that PREVIEW is "not connected" would send them hunting for a link that
 * is not part of the design. What it waits for is a graphic to rehearse.
 *
 * WHICH rehearsal it shows, when more than one row is rehearsing: the SELECTED row
 * if that row is rehearsing, else the first. One box, several possible subjects, so
 * the rule has to be stated rather than left to array order — and "follow the
 * selection" is the rule the Inspector already trains the operator on. Falling back
 * to the first means entering rehearse always shows something, which is what the
 * operator just asked for.
 */

const styles = {
  screen: {
    flex: 1,
    minHeight: 0,
    background: '#000',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
    color: colors.offline,
    textAlign: 'center' as const,
    padding: '0.5rem',
    overflow: 'hidden',
  },
  label: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  detail: { fontSize: '0.68rem', color: colors.textMuted, maxWidth: '18rem', lineHeight: 1.35 },
} as const;

interface Props {
  /** The row the operator has selected, so the rehearsal can follow it. */
  selectedId: string | null;
}

/** The rehearsal PVW should show: the selected row's, else the first. */
export function rehearsalToShow(
  rehearsals: readonly Rehearsal[],
  selectedId: string | null,
): Rehearsal | null {
  if (rehearsals.length === 0) return null;
  if (selectedId !== null) {
    const selected = rehearsals.find((r) => r.itemId === selectedId);
    if (selected !== undefined) return selected;
  }
  return rehearsals[0] ?? null;
}

export function PreviewPanel({ selectedId }: Props): JSX.Element {
  const rehearsals = useRehearse();
  const items = useStack();
  const channelSettings = useChannelSettings();
  const bank = useFixedBank();
  const [html, setHtml] = useState<string | null>(null);

  // Re-read on every staged edit, so a value the operator has typed but not applied
  // is what the rehearsal shows. Rehearsing the APPLIED values would defeat the
  // point — the operator is here to see the edit before it reaches air.
  const draftVersion = useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);

  const rehearsal = rehearsalToShow(rehearsals, selectedId);
  const item: StackItemState | null =
    rehearsal === null ? null : (items.find((i) => i.itemId === rehearsal.itemId) ?? null);

  useEffect(() => {
    if (item === null) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    void window.cg.templates.html(item.templateId).then((page) => {
      if (!cancelled) setHtml(page);
    });
    return () => {
      cancelled = true;
    };
  }, [item?.templateId, item]);

  // R-030 — the CHANNEL's real raster, so the rehearsal places itself in the frame
  // that will actually air. Falls back to the reference raster before the settings
  // snapshot arrives, which is the same fallback the on-air page uses.
  const channel = rehearsal?.channel ?? bank?.channel ?? 1;
  const raster =
    channelSettings.settings.find((s) => s.channel === channel)?.raster ?? REFERENCE_RASTER;

  return (
    <Panel id="pvw" title="PREVIEW" style={{ flex: 1, minWidth: 0 }}>
      {item === null || rehearsal === null ? (
        <div
          style={styles.screen}
          role="img"
          aria-label="PREVIEW — Nothing to preview. Put a loaded row into REHEARSE to render it here."
        >
          <Icon icon={SquareDashed} size={22} />
          <span style={styles.label}>Nothing to preview</span>
          <span style={styles.detail}>
            Put a loaded row into REHEARSE and its graphic renders here, in this browser, with the
            field values you have typed. Nothing is sent to CasparCG.
          </span>
        </div>
      ) : (
        <RehearsalStage
          key={`${item.itemId}:${String(draftVersion)}`}
          html={html}
          raster={raster}
          // The operator's EFFECTIVE values: applied fields with any staged edits
          // layered on, through the same `buildApplyPayload` the Inspector's Apply
          // uses — so what is rehearsed is exactly what Apply would send.
          fields={buildApplyPayload(item.itemId, item.fields)}
          rowName={`Layer ${String(rehearsal.layer)}`}
        />
      )}
    </Panel>
  );
}
