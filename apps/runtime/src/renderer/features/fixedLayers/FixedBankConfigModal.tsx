import { useState } from 'react';
import type { FixedLayerBank } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal } from '../../ui/Modal.js';
import { fixedLayersReasonMessage } from '../../ui/fixedLayersReasonMessage.js';

interface Props {
  bank: FixedLayerBank;
  onClose: () => void;
}

const styles = {
  fixedFacts: { fontSize: '0.85rem', color: colors.textMuted },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  aliasList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    maxHeight: '40vh',
    overflowY: 'auto' as const,
  },
  aliasRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  aliasLabel: { minWidth: '4.5rem', fontSize: '0.85rem' },
  refusal: {
    border: '1px solid #B45309',
    background: 'rgba(180, 83, 9, 0.12)',
    borderRadius: '0.25rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    color: '#FCD34D',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  refusalDetail: { color: colors.textMuted, fontSize: '0.8rem' },
} as const;

/**
 * R-021 stage 2b (task 5.6) — the bank config modal, opened from the
 * fixed-layers panel header.
 *
 * Deliberately its OWN modal, never a section of `ServerSettingsPanel`:
 * connections `set-config` is on-air BLOCKED and `fixedLayers.set-config`
 * deliberately is NOT (design (e) — growth and alias changes are live), and
 * co-locating them would invite the operator to assume one rule governs both.
 *
 * Scope: `count` (safe change is grow-at-end) and `aliases` only. `channel`
 * and `start` are displayed READ-ONLY — the validator refuses changing them
 * mid-session, and an editable field for a change that can only be refused
 * would invite a click that only rejects. The validators stay bridge-side
 * (never re-implemented here): whatever is submitted, the bridge adjudicates,
 * and a refusal surfaces BOTH the mapped reason sentence and the bridge's own
 * `message` (which names the specifics — both ranges, or the occupied slots).
 */
export function FixedBankConfigModal({ bank, onClose }: Props): JSX.Element {
  const [count, setCount] = useState(bank.count);
  const [aliases, setAliases] = useState<Record<string, string>>({ ...(bank.aliases ?? {}) });
  const [refusal, setRefusal] = useState<{ rule: string | null; detail?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const clampedCount = Math.min(20, Math.max(1, count));
  const layers: number[] = [];
  for (let layer = bank.start; layer <= bank.start + clampedCount - 1; layer++) layers.push(layer);

  function apply(): void {
    // Empty alias inputs mean "no alias" — dropped, never sent as ''.
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(aliases)) {
      const layer = Number(key);
      if (value.trim() !== '' && layer >= bank.start && layer <= bank.start + clampedCount - 1) {
        cleaned[key] = value.trim();
      }
    }
    setBusy(true);
    window.cg.fixedLayers
      .setConfig({
        channel: bank.channel,
        start: bank.start,
        count: clampedCount,
        ...(Object.keys(cleaned).length > 0 ? { aliases: cleaned } : {}),
      })
      .then(
        (res) => {
          setBusy(false);
          if (res.ok) {
            // The bridge publishes `config-changed` + `state-changed` itself —
            // the panel re-renders from the push; nothing to re-pull here.
            onClose();
            return;
          }
          setRefusal({
            rule: fixedLayersReasonMessage(res.reason),
            ...(res.message !== undefined ? { detail: res.message } : {}),
          });
        },
        (err: unknown) => {
          setBusy(false);
          setRefusal({ rule: err instanceof Error ? err.message : 'Request failed.' });
        },
      );
  }

  return (
    <Modal
      title="Fixed layers — bank configuration"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      {/* Read-only facts first: the validator refuses changing either mid-session. */}
      <div style={styles.fixedFacts}>
        Channel {String(bank.channel)} · bank starts at layer {String(bank.start)} — both are fixed
        at install and cannot change mid-session.
      </div>
      <label style={styles.field}>
        Slot count (grows at the end; max layer 89)
        <input
          className="cg-field"
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <div style={styles.field}>
        Aliases (display names, per layer)
        <div style={styles.aliasList}>
          {layers.map((layer) => (
            <label key={layer} style={styles.aliasRow}>
              <span style={styles.aliasLabel}>layer {String(layer)}</span>
              <input
                className="cg-field"
                type="text"
                value={aliases[String(layer)] ?? ''}
                onChange={(e) => {
                  setAliases({ ...aliases, [String(layer)]: e.target.value });
                }}
              />
            </label>
          ))}
        </div>
      </div>
      {refusal !== null && (
        <div style={styles.refusal} role="alert">
          <span>{refusal.rule ?? 'Not accepted.'}</span>
          {refusal.detail !== undefined && (
            <span style={styles.refusalDetail}>{refusal.detail}</span>
          )}
        </div>
      )}
    </Modal>
  );
}
