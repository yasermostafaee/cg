import { useState } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { useStack } from '../../hooks/useStack.js';
import { colors } from '../../theme.js';
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
    padding: '0.75rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: '1rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
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

  const select = (itemId: string): void => {
    const next = itemId === selected ? null : itemId;
    setSelected(next);
    onSelectionChange(next);
  };

  return (
    <section style={styles.panel} aria-label="Stack">
      <header style={styles.header}>STACK</header>
      <div style={styles.list}>
        {items.length === 0 ? (
          <div style={styles.empty}>No items loaded. Use the library to add one.</div>
        ) : (
          items.map((item) => (
            <StackRow
              key={item.itemId}
              item={item}
              selected={item.itemId === selected}
              onSelect={select}
              onTake={(id) => void window.cg.stack.take({ itemId: id })}
              onUpdate={(id) => {
                const item = items.find((i) => i.itemId === id);
                if (item === undefined) return;
                void window.cg.stack.update({
                  itemId: id,
                  fields: item.fields,
                  mergeMode: 'merge',
                });
              }}
              onOut={(id) => void window.cg.stack.out({ itemId: id })}
              onRemove={(id) => void window.cg.stack.remove({ itemId: id })}
            />
          ))
        )}
      </div>
    </section>
  );
}

// Re-export the type so other features can refine selection logic.
export type { StackItemState };
