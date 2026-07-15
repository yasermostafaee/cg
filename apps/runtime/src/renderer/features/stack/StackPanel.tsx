import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { useStack } from '../../hooks/useStack.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { useLink } from '../../hooks/useLink.js';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { useConfirm } from '../../ui/useDialog.js';
import { templateDisplayName } from '../library/templateName.js';
import { isOnAir } from './onAir.js';
import { applyDraft } from '../inspector/applyDraft.js';
import {
  draftsVersion,
  isItemDirty,
  pruneDrafts,
  subscribeDrafts,
} from '../inspector/draftStore.js';
import { StackRow } from './StackRow.js';

interface Props {
  onSelectionChange: (itemId: string | null) => void;
}

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    // Takes the height the centre column has left over, and clips: the row list inside is
    // what scrolls. Without `flex: 1` the panel sizes to its content, its inner list never
    // gets a height to scroll AGAINST, and a long stack pushes the whole page instead.
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
  },
  // The bulk actions sit together, right-aligned. The header is `space-between`, so leaving
  // them as loose siblings of the STACK title spread them apart — Clear-All stranded in the
  // middle of the header, Remove-All at the far edge, reading as two unrelated controls.
  // They are one family of "act on everything" actions and belong side by side.
  headerActions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  list: { overflowY: 'auto' as const, flex: 1 },
  empty: {
    padding: '2rem 1rem',
    textAlign: 'center' as const,
    color: colors.textMuted,
    fontSize: '0.9rem',
  },
} as const;

/**
 * Operator's stack — the spine of the runtime UI (Phase 6 §3). Each row
 * is a StackRow with intent buttons. Selecting a row updates the Inspector.
 *
 * The stack list is the truth from Main's Reconciler; we only render +
 * forward intents. No optimistic UI lives in the renderer — the Main
 * Reconciler handles the pending state.
 */
export function StackPanel({ onSelectionChange }: Props): JSX.Element {
  const items = useStack();
  // R-004 — a row names its template. `StackItemState` carries no label (and must not:
  // `templateId` stays the sole identity), so it is joined from the registry here, once for
  // the whole list, rather than fetched per row.
  const templates = useTemplateIndex(items.map((i) => i.templateId));
  const { confirm, confirmDialog } = useConfirm();
  const [selected, setSelected] = useState<string | null>(null);
  // B-085 consistency — the STACK is bridge-owned, so the bulk actions can no more reach
  // CasparCG while disconnected than the per-item PLAY/UPDATE/CLEAR/REMOVE can. Gate them on
  // the SAME link status so an enabled button never invites a click that only rejects.
  const link = useLink();
  const linkDown = link === 'disconnected';
  const offlineReason = linkDown
    ? 'Not connected — this command cannot reach CasparCG. Reconnect and reissue it.'
    : undefined;
  // Newest first. The item the operator just loaded is the one they are about to act on, so
  // it belongs at the top — not below everything they loaded an hour ago.
  //
  // RENDER-SIDE ONLY. The bridge publishes in insertion order (a Map), and that order is the
  // authority on when each item arrived: it is not touched here. Nothing changes on the wire,
  // and nothing changes about playout — each item carries its own layer, so the list's order
  // has never meant anything to CasparCG.
  const ordered = useMemo(() => [...items].reverse(), [items]);
  // The SAME predicate the row's Clear button is gated on, so "Clear All" is exactly "press
  // Clear on every row where Clear is enabled" — and the button is absent when there is
  // nothing on air to clear.
  const onAirCount = items.filter(isOnAir).length;
  // Re-render on draft changes so the row draft chip stays live.
  useSyncExternalStore(subscribeDrafts, draftsVersion);

  // Drop drafts for items no longer on the stack (removed / cleared).
  useEffect(() => {
    pruneDrafts(items.map((i) => i.itemId));
  }, [items]);

  const select = (itemId: string): void => {
    const next = itemId === selected ? null : itemId;
    setSelected(next);
    onSelectionChange(next);
  };

  return (
    <section style={styles.panel} aria-label="Stack">
      <header style={styles.header}>
        <span>STACK</span>
        {/* One right-aligned group. The colour pairing is the point: CLEAR ALL carries the
            same `caution` treatment as the row's own CLEAR, and REMOVE ALL the same `danger`
            as the row's REMOVE — so the "clear" family reads as one thing and the "remove"
            family as another, and the more destructive one (it drops the rows) is the red.
            Each button's confirm modal carries the same variant, so the colour the operator
            pressed is the colour that asks them to press again. */}
        <div style={styles.headerActions}>
          {onAirCount > 0 && (
            <Button
              variant="caution"
              aria-label="Clear all on-air items"
              disabled={linkDown}
              title={
                offlineReason ??
                'Send CLEAR to every on-air item — takes them off air and leaves them on the stack, idle'
              }
              onClick={() => {
                // "Get it off the screen" is not "throw it away". This clears air and KEEPS
                // the rows, so recovering is a re-take — not a re-import and re-typing every
                // field, which is what Remove-All costs. Confirm-gated all the same: it is
                // still an on-air action.
                void (async () => {
                  const ok = await confirm({
                    title: 'Clear all on-air items?',
                    body: `All ${String(onAirCount)} on-air item(s) come off air. They stay on the stack, idle, and can be taken again.`,
                    confirmLabel: 'Clear all',
                    variant: 'caution',
                  });
                  if (ok) await window.cg.stack.clearAll();
                })();
              }}
            >
              CLEAR ALL
            </Button>
          )}
          {items.length > 0 && (
            <Button
              // `danger`, matching the row's REMOVE. It was `caution` — the same amber as
              // Clear — which made the destructive action look like the reversible one.
              variant="danger"
              aria-label="Remove all items"
              disabled={linkDown}
              title={
                offlineReason ??
                'Out + remove every item — clears anything on air and empties the stack'
              }
              onClick={() => {
                // R-010 — the destructive on-air-clearing path (unblocks a server switch).
                // The stack visibly empties via the state publish.
                void (async () => {
                  const ok = await confirm({
                    title: 'Remove all items?',
                    body: `This clears anything on air and empties the stack — all ${String(items.length)} item(s).`,
                    confirmLabel: 'Remove all',
                  });
                  if (ok) await window.cg.stack.removeAll();
                })();
              }}
            >
              REMOVE ALL
            </Button>
          )}
        </div>
      </header>
      <div style={styles.list}>
        {items.length === 0 ? (
          <div style={styles.empty}>No items loaded. Use the library to add one.</div>
        ) : (
          ordered.map((item) => {
            const info = templates.get(item.templateId);
            return (
              <StackRow
                key={item.itemId}
                item={item}
                selected={item.itemId === selected}
                dirty={isItemDirty(item.itemId, item.fields)}
                templateLabel={info !== undefined ? templateDisplayName(info) : undefined}
                onSelect={select}
                // R-007 — the handlers return the bridge round-trip promise so each
                // AsyncButton tracks its OWN in-flight state (press → busy →
                // success/error), decoupled from the B-044 badge settlement.
                onPlay={(id) => window.cg.stack.take({ itemId: id })}
                onUpdate={(id) => {
                  // R-003 — apply the item's staged draft (the complete field-set)
                  // as one atomic stack.update; clears the draft on accepted.
                  const target = items.find((i) => i.itemId === id);
                  return target !== undefined
                    ? applyDraft(target)
                    : Promise.resolve({ accepted: false });
                }}
                onOut={(id) => window.cg.stack.out({ itemId: id })}
                onRemove={(id) => window.cg.stack.remove({ itemId: id })}
              />
            );
          })
        )}
      </div>
      {confirmDialog}
    </section>
  );
}

// Re-export the type so other features can refine selection logic.
export type { StackItemState };
