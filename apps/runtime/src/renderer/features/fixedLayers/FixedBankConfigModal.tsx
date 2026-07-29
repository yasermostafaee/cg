import { useState } from 'react';
import { isLayerVisible, type FixedLayerBank, type FixedSlotState } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { fixedLayersReasonMessage } from '../../ui/fixedLayersReasonMessage.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
import { useStack } from '../../hooks/useStack.js';
import { useLink } from '../../hooks/useLink.js';

interface Props {
  bank: FixedLayerBank;
  /** The live per-slot state — occupancy + binding, for the remove affordance. */
  slots: FixedSlotState[];
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
  tick: { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' },
  bound: {
    fontSize: '0.8rem',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '10rem',
  },
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
 * R-021 stage 2b / R-028 — the bank config modal, opened from the fixed-layers
 * panel header.
 *
 * Deliberately its OWN modal, never a section of `ServerSettingsPanel`:
 * connections `set-config` is on-air BLOCKED and `fixedLayers.set-config`
 * deliberately is NOT (tick and alias changes are live), and co-locating them
 * would invite the operator to assume one rule governs both.
 *
 * R-028 scope: per-layer VISIBILITY ticks + aliases only. `channel`, `start`
 * AND `count` are displayed READ-ONLY — the ceiling is FIXED at install
 * (`resize-refused`), and an editable field for a change that can only be
 * refused would invite a click that only rejects. The validators stay
 * bridge-side (never re-implemented here): whatever is submitted, the bridge
 * adjudicates — unticking an OCCUPIED or UNKNOWN-occupancy layer refuses fail
 * closed — and a refusal surfaces BOTH the mapped reason sentence and the
 * bridge's own `message` (which names the layer / both ranges).
 *
 * R-028 (2.4) — an occupied row shows its bound template and a "Remove…"
 * affordance carrying the row's own confirm gate: removal implies clear, and
 * the dialog says so explicitly when the item is ON AIR. Removing the template
 * is what makes the row untickable.
 */
export function FixedBankConfigModal({ bank, slots, onClose }: Props): JSX.Element {
  const [aliases, setAliases] = useState<Record<string, string>>({ ...(bank.aliases ?? {}) });
  // Checkbox model: layer → VISIBLE. Absent key in the bank means visible.
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (let layer = bank.start; layer <= bank.start + bank.count - 1; layer++) {
      initial[String(layer)] = isLayerVisible(bank, layer);
    }
    return initial;
  });
  const [refusal, setRefusal] = useState<{ rule: string | null; detail?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const stack = useStack();
  const linkDown = useLink() === 'disconnected';

  const layers: number[] = [];
  for (let layer = bank.start; layer <= bank.start + bank.count - 1; layer++) layers.push(layer);

  function apply(): void {
    // Empty alias inputs mean "no alias" — dropped, never sent as ''.
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(aliases)) {
      const layer = Number(key);
      if (value.trim() !== '' && layer >= bank.start && layer <= bank.start + bank.count - 1) {
        cleaned[key] = value.trim();
      }
    }
    // Only UNTICKED layers are recorded — absent means visible (the canonical
    // `isLayerVisible` default), so a default-shaped bank stays minimal. Keys
    // are range-filtered like aliases: a stale key from a superseded bank
    // would earn a `visibility-out-of-bank` refusal the modal renders no
    // checkbox to fix.
    const hidden: Record<string, boolean> = {};
    for (const [key, isVisible] of Object.entries(visible)) {
      const layer = Number(key);
      if (!isVisible && layer >= bank.start && layer <= bank.start + bank.count - 1) {
        hidden[key] = false;
      }
    }
    setBusy(true);
    window.cg.fixedLayers
      .setConfig({
        channel: bank.channel,
        start: bank.start,
        count: bank.count,
        ...(Object.keys(cleaned).length > 0 ? { aliases: cleaned } : {}),
        ...(Object.keys(hidden).length > 0 ? { visibility: hidden } : {}),
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

  /**
   * R-028 (2.4) — remove the template from a row, from inside the config
   * surface, behind the row's own confirm gate. Removal implies clear (the
   * bridge's `stack.remove` sends the CLEAR), so the dialog states ON AIR
   * explicitly when the stack says the item is.
   */
  async function removeTemplate(slot: FixedSlotState): Promise<void> {
    if (slot.binding === null) return;
    const { itemId } = slot.binding;
    const name =
      displayLabel({
        name: slot.binding.templateName,
        sourceFileName: slot.binding.sourceFileName,
      }) ??
      slot.binding.templateId ??
      slot.binding.templateType;
    const item = stack.find((i) => i.itemId === itemId);
    // FAIL CLOSED on the destructive dialog's wording: only a settled
    // idle/loaded status may claim the graphic is off air. A missing item
    // (stale/loading snapshot) or any unsettled status — unconfirmed,
    // unverified, updating, exiting — reads as "may be on air": a dialog that
    // wrongly promised "not on air" for a live graphic is the exact lie the
    // ON AIR sentence exists to prevent.
    const offAir = item !== undefined && (item.status === 'idle' || item.status === 'loaded');
    const onAir = item?.status === 'on-air' || item?.status === 'playing';
    const rowName = slot.alias ?? `Layer ${String(slot.layer)}`;
    const confirmed = await confirm({
      title: `Remove “${name}” from ${rowName}?`,
      body: onAir
        ? `This item is ON AIR. Removing it CLEARS layer ${String(slot.layer)} — the graphic ` +
          `leaves the output immediately, with no outro.`
        : offAir
          ? `The item is removed from the row and layer ${String(slot.layer)} is cleared.`
          : `This item MAY BE ON AIR (its state cannot be verified right now). Removing it ` +
            `CLEARS layer ${String(slot.layer)} — anything live there leaves the output ` +
            `immediately, with no outro.`,
      confirmLabel: onAir ? 'Remove and clear (ON AIR)' : 'Remove template',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await window.cg.stack.remove({ itemId });
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Remove failed.');
    }
  }

  const slotFor = (layer: number): FixedSlotState | undefined =>
    slots.find((s) => s.layer === layer);

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
      {/* Read-only facts first: the validator refuses changing any of them mid-session. */}
      <div style={styles.fixedFacts}>
        Channel {String(bank.channel)} · layers {String(bank.start)}–
        {String(bank.start + bank.count - 1)} ({String(bank.count)} candidate layers) — channel,
        start and count are fixed at install; edit the bridge&rsquo;s fixed-layers config and
        restart it to change them. Unticking hides a row from the panel only — the layer stays
        fenced from automatic allocation, and an occupied (or unverifiable) row cannot be unticked
        until its template is removed.
      </div>
      <div style={styles.field}>
        Candidate layers (tick = row shown; alias = display name)
        <div style={styles.aliasList}>
          {layers.map((layer) => {
            const slot = slotFor(layer);
            const bound = slot?.binding ?? null;
            return (
              <div key={layer} style={styles.aliasRow}>
                <span style={styles.aliasLabel}>layer {String(layer)}</span>
                <label style={styles.tick}>
                  <input
                    type="checkbox"
                    aria-label={`Show layer ${String(layer)}`}
                    checked={visible[String(layer)] ?? true}
                    onChange={(e) => {
                      setVisible({ ...visible, [String(layer)]: e.target.checked });
                    }}
                  />
                  shown
                </label>
                <input
                  className="cg-field"
                  type="text"
                  aria-label={`Alias for layer ${String(layer)}`}
                  value={aliases[String(layer)] ?? ''}
                  onChange={(e) => {
                    setAliases({ ...aliases, [String(layer)]: e.target.value });
                  }}
                />
                {/* B-087 mask, same as the row: with the link down the frozen
                    binding is a claim the wire cannot back, and Remove… could
                    not reach the bridge anyway — neither is offered. */}
                {!linkDown && bound !== null && (
                  <>
                    <span style={styles.bound} title={bound.templateId ?? bound.templateType}>
                      {displayLabel({
                        name: bound.templateName,
                        sourceFileName: bound.sourceFileName,
                      }) ??
                        bound.templateId ??
                        bound.templateType}
                    </span>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (slot !== undefined) void removeTemplate(slot);
                      }}
                    >
                      Remove…
                    </Button>
                  </>
                )}
              </div>
            );
          })}
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
      {confirmDialog}
    </Modal>
  );
}
