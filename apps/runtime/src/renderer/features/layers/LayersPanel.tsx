import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import {
  CircleArrowOutDownRight,
  Maximize2,
  Minimize2,
  PanelRight,
  RotateCcw,
  Trash2,
  XSquare,
} from 'lucide-react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Tabs, type TabSpec } from '../../ui/Tabs.js';
import type { ShellLayout } from '../../hooks/useShellLayout.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { useStack } from '../../hooks/useStack.js';
import { useFixedBank, useFixedSlots } from '../../hooks/useFixedLayers.js';
import { usePlayoutLayers } from '../../hooks/usePlayoutLayers.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { isLayerVisible } from '@cg/shared-ipc';
import { isOnAir } from '../stack/onAir.js';
import {
  draftsVersion,
  isItemDirty,
  pruneDrafts,
  subscribeDrafts,
} from '../inspector/draftStore.js';
import { pruneFromFile, restoreFromFileAttachments } from '../inspector/fromFileStore.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { LayerRow } from './LayerRow.js';
import { PlayoutPanel } from './PlayoutPanel.js';
import { hasPlayoutOccupant } from './playoutOccupancy.js';
import { FixedBankConfigModal } from '../fixedLayers/FixedBankConfigModal.js';

interface Props {
  onSelectionChange: (itemId: string | null) => void;
  selectedId: string | null;
  onUpdate: (itemId: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
  /** R-028 part B — the operator's workspace geometry (see `useShellLayout`). */
  layout: ShellLayout;
  /** Narrow screens only: is the Inspector overlay showing? */
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

const styles = {
  panel: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    padding: '0.5rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: '1rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  headerActions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  list: { overflowY: 'auto' as const, minHeight: 0, flex: 1 },
  empty: { padding: '1rem', fontSize: '0.85rem', color: colors.textMuted },
} as const;

/**
 * R-028 (4.1) — THE operator surface: ONE list of declared layer rows, plus a
 * separate tab for the playout system's own layers.
 *
 * This replaces THREE panels — the Library, the Stack and the Fixed Layers
 * bank. That is the point of the change, not a side effect:
 *
 *   - there is no separate library panel, because a template is not a thing you
 *     park somewhere; Load on a row imports and loads in ONE action;
 *   - there is no stack, because nothing is ever appended to a list below. Every
 *     item lives on a declared row and nowhere else;
 *   - "Fixed" is gone from the name, because with one list the word distinguishes
 *     nothing. The section is just LAYERS.
 *
 * Rows are ordered DESCENDING by layer so the list mirrors on-air z-order — the
 * top row is the top graphic.
 */
export function LayersPanel({
  onSelectionChange,
  selectedId,
  onUpdate,
  layout,
  inspectorOpen,
  onToggleInspector,
}: Props): JSX.Element {
  const bank = useFixedBank();
  const slots = useFixedSlots();
  const playout = usePlayoutLayers();
  const items = useStack();
  const linkDown = useLink() === 'disconnected';
  const [activeTab, setActiveTab] = useState('layers');
  const [configOpen, setConfigOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  // Template identity for every bound row, joined once for the whole list.
  const templates = useTemplateIndex(items.map((i) => i.templateId));

  // Live draft chips (staged-but-unapplied edits), and the prune that keeps the
  // store from growing as items come and go — inherited from the stack panel.
  useSyncExternalStore(subscribeDrafts, draftsVersion);
  useEffect(() => {
    const ids = new Set(items.map((i) => i.itemId));
    pruneDrafts(ids);
    pruneFromFile(ids);
    // B-113 — restore file attachments a previous session persisted, in the SAME
    // pass that prunes. Both need exactly one thing — the set of item ids that
    // are really on the stack — and running them apart is how a restore lands a
    // moment before the prune that would have rejected it, flashing file names
    // onto rows that no longer exist. Idempotent: an already-attached field is
    // left alone, so re-running on every stack change costs nothing.
    void restoreFromFileAttachments(ids);
  }, [items]);

  const itemById = useMemo(() => {
    const map = new Map<string, StackItemState>();
    for (const item of items) map.set(item.itemId, item);
    return map;
  }, [items]);

  // R-028 (4.1) — DESCENDING layer order: the list mirrors on-air z-order.
  // Hidden rows are filtered here and NOWHERE else; part A's honesty override
  // keeps a bound or observably-occupied row visible even when unticked, so a
  // live graphic can never lose its only surface.
  const rows = useMemo(() => {
    if (bank === null) return [];
    return [...slots]
      .filter(
        (slot) =>
          isLayerVisible(bank, slot.layer) ||
          slot.binding !== null ||
          slot.observed.kind === 'producer',
      )
      .sort((a, b) => b.layer - a.layer);
  }, [bank, slots]);

  const onAirCount = items.filter(isOnAir).length;

  // "Get it off the screen" is not "throw it away". This clears air and KEEPS
  // the rows, so recovering is a re-take — not a re-import and re-typing every
  // field, which is what Remove-All costs. Confirm-gated all the same: it is
  // still an on-air action. (Wording carried over verbatim from the stack
  // header it replaces — the distinction it draws is the point.)
  const clearAll = useCallback(async (): Promise<void> => {
    const ok = await confirm({
      title: 'Clear all on-air items?',
      body: `All ${String(onAirCount)} on-air item(s) come off air. They stay on the stack, idle, and can be taken again.`,
      confirmLabel: 'Clear all',
      variant: 'caution-strong',
    });
    if (!ok) return;
    try {
      await window.cg.stack.clearAll();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Clear all failed.');
    }
  }, [confirm, onAirCount]);

  /**
   * C-012 — STOP All: every on-air graphic runs its OWN outro and stays
   * resident, so a later take resumes it.
   *
   * The graceful sibling of Clear-All, and it sits beside it deliberately: the
   * two are the only bulk ways off air and offering one without the other
   * would read as a missing option. The wording spells the difference out,
   * because this project's STOP and CLEAR are the opposite of the reference
   * product's and confusing them on thirty rows at once is expensive.
   */
  const stopAll = useCallback(async (): Promise<void> => {
    const ok = await confirm({
      title: 'Stop all on-air items?',
      body: `All ${String(onAirCount)} on-air item(s) run their own outro and come off air gracefully. They stay loaded and can be taken again.`,
      confirmLabel: 'Stop all',
      variant: 'caution',
    });
    if (!ok) return;
    try {
      await window.cg.stack.stopAll();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Stop all failed.');
    }
  }, [confirm, onAirCount]);

  /**
   * R-010 — Remove All empties every row. It is not merely a convenience: it is
   * the documented unblock path for a server reconfiguration (`connections.
   * set-config` refuses while anything is on air or unsettled, and names this as
   * the way out), so it must survive the panel merge.
   */
  const removeAll = useCallback(async (): Promise<void> => {
    const ok = await confirm({
      title: 'Remove all items?',
      body: `This clears anything on air and empties the stack — all ${String(items.length)} item(s).`,
      confirmLabel: 'Remove all',
    });
    if (!ok) return;
    try {
      await window.cg.stack.removeAll();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Remove all failed.');
    }
  }, [confirm, items.length]);

  const playoutOccupied = hasPlayoutOccupant(playout);
  const tabs: TabSpec[] = [
    { id: 'layers', label: 'LAYERS' },
    {
      id: 'playout',
      label: 'PLAYOUT',
      // The dot means "something IS on a playout layer" — never raised for an
      // unknown, which is the absence of a claim rather than a claim.
      ...(playoutOccupied && !linkDown
        ? { badge: { tone: 'warn' as const, label: 'Something is on a playout layer' } }
        : {}),
    },
  ];

  return (
    <section aria-label="Layers" style={styles.panel}>
      <header style={styles.header}>
        <span>LAYERS</span>
        <div style={styles.headerActions}>
          {/* The two bulk ways OFF AIR, in C-012 order: graceful first, hard
              second — so the softer option is the one nearest to hand. */}
          {onAirCount > 0 && (
            <Button
              variant="caution"
              disabled={linkDown}
              aria-label="Stop all on-air items"
              title="Every on-air graphic runs its own outro and stays loaded"
              onClick={() => void stopAll()}
            >
              <Icon icon={CircleArrowOutDownRight} />
              STOP ALL
            </Button>
          )}
          {onAirCount > 0 && (
            <Button
              variant="caution-strong"
              disabled={linkDown}
              aria-label="Clear all on-air items"
              title="Every on-air graphic is cut immediately, with no outro"
              onClick={() => void clearAll()}
            >
              <Icon icon={XSquare} />
              CLEAR ALL
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="danger"
              disabled={linkDown}
              aria-label="Remove all items"
              title="Clears anything on air and empties every row"
              onClick={() => void removeAll()}
            >
              <Icon icon={Trash2} />
              REMOVE ALL
            </Button>
          )}
          {bank !== null && (
            <Button variant="ghost" onClick={() => setConfigOpen(true)}>
              Configure
            </Button>
          )}
          {/* NARROW — the hamburger that brings the Inspector up as an overlay.
              Only on small screens: with two columns the Inspector is already
              there and a toggle would be a control that does nothing visible. */}
          {layout.narrow && (
            <Button
              variant="ghost"
              aria-label={inspectorOpen ? 'Hide the Inspector' : 'Show the Inspector'}
              aria-expanded={inspectorOpen}
              onClick={onToggleInspector}
            >
              <Icon icon={PanelRight} />
            </Button>
          )}
          {/* FULLSCREEN — either panel can take the whole shell. */}
          {!layout.narrow && (
            <Button
              variant="ghost"
              aria-label={
                layout.focus === 'layers' ? 'Exit fullscreen Layers' : 'Show Layers fullscreen'
              }
              aria-pressed={layout.focus === 'layers'}
              onClick={() => layout.setFocus(layout.focus === 'layers' ? 'none' : 'layers')}
            >
              <Icon icon={layout.focus === 'layers' ? Minimize2 : Maximize2} />
            </Button>
          )}
          {/* THE WAY BACK. Always reachable once anything is customised, so an
              operator who drags a panel somewhere useless at 2 a.m. is never
              stuck with it. */}
          {layout.customized && (
            <Button variant="ghost" aria-label="Reset the panel layout" onClick={layout.reset}>
              <Icon icon={RotateCcw} />
            </Button>
          )}
        </div>
      </header>
      <Tabs tabs={tabs} activeId={activeTab} onSelect={setActiveTab} ariaLabel="Layer surfaces">
        {activeTab === 'layers' ? (
          bank === null ? (
            <div style={styles.empty}>
              No layers are declared. Set the candidate layers in the bridge&rsquo;s configuration
              to start loading graphics.
            </div>
          ) : (
            <div style={styles.list}>
              {rows.map((slot) => {
                const item =
                  slot.binding !== null ? (itemById.get(slot.binding.itemId) ?? null) : null;
                const template = item !== null ? (templates.get(item.templateId) ?? null) : null;
                return (
                  <LayerRow
                    key={slot.layer}
                    slot={slot}
                    item={item}
                    template={template}
                    selected={item !== null && item.itemId === selectedId}
                    dirty={item !== null && isItemDirty(item.itemId, item.fields)}
                    onSelect={onSelectionChange}
                    onUpdate={onUpdate}
                  />
                );
              })}
            </div>
          )
        ) : (
          <PlayoutPanel layers={playout} />
        )}
      </Tabs>
      {configOpen && bank !== null && (
        <FixedBankConfigModal bank={bank} slots={slots} onClose={() => setConfigOpen(false)} />
      )}
      {confirmDialog}
    </section>
  );
}
