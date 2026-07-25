import { useState } from 'react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { appShell } from '../../layout.js';
import { useFixedBank, useFixedSlots } from '../../hooks/useFixedLayers.js';
import { FixedBankConfigModal } from './FixedBankConfigModal.js';
import { FixedRow } from './FixedRow.js';

const styles = {
  panel: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
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
  // Scrolls INSIDE the bounded panel (the StackPanel pattern): content-sized up
  // to `appShell.fixedPanel`'s cap, then this list scrolls — never the page.
  list: { overflowY: 'auto' as const, minHeight: 0 },
} as const;

/**
 * R-021 stage 2b — the fixed operator bank: one PERMANENT row per declared
 * slot. With NO bank declared it renders NOTHING (idle-quiet — byte-identical
 * behaviour to today). Rows render from the per-slot STATE the bridge
 * publishes; the header's Configure opens the bank config modal (task 5.6).
 */
export function FixedLayersPanel(): JSX.Element | null {
  // Hooks above the idle-quiet early return — a hook cannot be called conditionally.
  const bank = useFixedBank();
  const slots = useFixedSlots();
  const [configOpen, setConfigOpen] = useState(false);

  if (bank === null) return null;

  return (
    <section aria-label="Fixed layers" style={{ ...appShell.fixedPanel, ...styles.panel }}>
      <header style={styles.header}>
        <span>FIXED LAYERS</span>
        <Button variant="ghost" onClick={() => setConfigOpen(true)}>
          Configure
        </Button>
      </header>
      <div style={styles.list}>
        {slots.map((slot) => (
          <FixedRow key={slot.layer} slot={slot} />
        ))}
      </div>
      {configOpen && <FixedBankConfigModal bank={bank} onClose={() => setConfigOpen(false)} />}
    </section>
  );
}
