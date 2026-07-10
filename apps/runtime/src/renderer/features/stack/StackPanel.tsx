import { useEffect, useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { useStack } from '../../hooks/useStack.js';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
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
  const [selected, setSelected] = useState<string | null>(null);
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
        {items.length > 0 && (
          <Button
            variant="caution"
            aria-label="Remove all items"
            title="Out + remove every item — clears anything on air and empties the stack"
            onClick={() => {
              // R-010 — the destructive on-air-clearing path (unblocks a
              // server switch). Native confirm follows the lock-PIN
              // precedent; the stack visibly empties via the state publish.
              if (
                window.confirm(
                  `Remove all ${String(items.length)} item(s)? This clears anything on air.`,
                )
              ) {
                void window.cg.stack.removeAll();
              }
            }}
          >
            REMOVE ALL
          </Button>
        )}
      </header>
      <div style={styles.list}>
        {items.length === 0 ? (
          <div style={styles.empty}>No items loaded. Use the library to add one.</div>
        ) : (
          items.map((item) => (
            <StackRow
              key={item.itemId}
              item={item}
              selected={item.itemId === selected}
              dirty={isItemDirty(item.itemId, item.fields)}
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
          ))
        )}
      </div>
    </section>
  );
}

// Re-export the type so other features can refine selection logic.
export type { StackItemState };
