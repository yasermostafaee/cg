import { Fragment, useState } from 'react';
import {
  bankPosition,
  defaultLayerAlias,
  fixedBankEnd,
  isLayerVisible,
  isLowBankLayer,
  lowBankEnd,
  type FixedLayerBank,
  type FixedSlotState,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { fixedLayersReasonMessage } from '../../ui/fixedLayersReasonMessage.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
import { useFixedBankState, useFixedSlotsState } from '../../hooks/useFixedLayers.js';
import { useStack } from '../../hooks/useStack.js';
import { useLink } from '../../hooks/useLink.js';

/**
 * R-021 stage 2b / R-028 — the candidate-layer bank's configuration: per-layer VISIBILITY
 * ticks + aliases, the bound template per row with a Remove… behind the row's own confirm
 * gate. A SECTION of Station setup since `STATION-SETUP-02`; the Layers panel's Configure
 * opens the dialog here.
 *
 * ── THE TWO DIALOGS THIS USED TO BE (`FixedBankConfigModal`) ─────────────────
 *
 * It rendered TWO distinct dialogs: an EDITOR when a bank exists, and an EXPLAINER
 * (`Candidate layers — not configured`) when none does — prose naming the file the
 * bridge reads and the restart it needs, with nothing to apply. A section hosts both
 * without strain, and the explainer turns out to be the section's EMPTY STATE: same
 * words, same code block, no Close button because there is no dialog of its own to close.
 * (`STATION-SETUP-02` predicted the explainer would be the awkward one. It was not; what
 * was awkward is below.)
 *
 * ── WHAT DID NOT SURVIVE THE MOVE UNCHANGED: THE APPLY ──────────────────────
 *
 * The old dialog's footer was Cancel / Apply, and an accepted Apply CLOSED it. Neither is
 * available to a section — the dialog's footer belongs to Servers — so the draft has its
 * own two controls in the body, `Apply candidate layers` and `Revert`, and an accepted
 * apply REPORTS a notice and stays open: the bridge republishes the bank, the editor
 * re-keys on it, and the ticks show what is in force.
 *
 * Deliberately NOT gated on air (the old dialog said so and it still holds): a tick or an
 * alias is a live change, and the bridge refuses per row — unticking an OCCUPIED or
 * UNKNOWN-occupancy layer fails closed — with both the mapped reason and its own message,
 * which reach the dialog's pinned region through `report`.
 *
 * R-028 scope: `channel`, `start` AND `count` are displayed READ-ONLY — the ceiling is
 * FIXED at install (`resize-refused`), and an editable field for a change that can only
 * be refused would invite a click that only rejects.
 */

const styles = {
  fixedFacts: { fontSize: '0.85rem', color: colors.textMuted },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  /**
   * ONE grid for the WHOLE list, not a grid per row — declared columns, one declaration,
   * every row contributing exactly the same cells (an empty span where a value is absent).
   */
  aliasGrid: {
    display: 'grid',
    gridTemplateColumns: '4.5rem 5.5rem minmax(8rem, 1fr) minmax(0, 11rem) auto',
    alignItems: 'center',
    columnGap: '0.6rem',
    rowGap: '0.45rem',
  },
  aliasLabel: {
    fontSize: '0.85rem',
    fontVariantNumeric: 'tabular-nums' as const,
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.35rem',
    whiteSpace: 'nowrap' as const,
  },
  /** The real CasparCG layer, quieter than the position — same ranking as the row. */
  aliasLayerHint: { fontSize: '0.72rem', color: colors.textMuted, whiteSpace: 'nowrap' as const },
  aliasHead: {
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
  },
  groupHead: {
    gridColumn: '1 / -1',
    marginTop: '0.55rem',
    paddingTop: '0.45rem',
    borderTop: `1px solid ${colors.border}`,
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  needsConfig: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
    fontSize: '0.85rem',
    lineHeight: 1.55,
  },
  code: {
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.5rem 0.6rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.72rem',
    color: colors.text,
    whiteSpace: 'pre' as const,
    overflowX: 'auto' as const,
  },
  tick: { display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.8rem' },
  bound: {
    fontSize: '0.8rem',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  actions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' },
  waiting: { fontSize: '0.82rem', color: colors.textMuted },
} as const;

export function CandidateLayersSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  const { bank, ready } = useFixedBankState();
  const { slots } = useFixedSlotsState();
  if (!ready) {
    return (
      <span style={styles.waiting} role="status">
        Waiting for the bridge to send the declared bank…
      </span>
    );
  }
  if (bank === null) return <NoBank />;
  // Re-keyed on the bank the bridge publishes, so an accepted apply — or another console's
  // change — replaces the draft with what is now in force rather than leaving stale edits.
  return <BankEditor key={bankKey(bank)} bank={bank} slots={slots} report={report} />;
}

function bankKey(bank: FixedLayerBank): string {
  return JSON.stringify(bank);
}

/**
 * There is no bank. Say what the bridge needs, in the bridge's own vocabulary, and be
 * explicit that this section cannot create one.
 */
function NoBank(): JSX.Element {
  return (
    <div style={styles.needsConfig} data-candidate-layers-unconfigured="">
      <span>
        This station has no candidate layers, so the Layers list has no rows and nothing can be
        loaded. The channel and the layer range are fixed at install and cannot be set from here —
        they live in the bridge&rsquo;s fixed-layers config file, and the bridge reads it once at
        startup.
      </span>
      <span>
        Create <code>bridge-fixed-layers.json</code> in the bridge&rsquo;s config directory (
        <code>~/.cg-runtime/</code> by default, or wherever <code>--fixed-layers-path</code> points)
        and restart the bridge:
      </span>
      <div style={styles.code}>
        {`{
  "channel": 1,
  "start": 70,
  "count": 4,
  "aliases": { "70": "logo", "71": "clock" }
}`}
      </div>
      <span>
        <strong>start</strong> is the first layer and <strong>count</strong> how many follow it. The
        range must not overlap the playout system&rsquo;s reserved layers or the dynamic ranges, and
        the bridge refuses to start if it does — naming both ranges, so a clash is quick to fix.
      </span>
      <span>
        Once the bridge restarts with a valid file, this section becomes where you show or hide
        individual rows and give them names.
      </span>
    </div>
  );
}

function BankEditor({
  bank,
  slots,
  report,
}: {
  bank: FixedLayerBank;
  slots: FixedSlotState[];
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  // ONE edit model across BOTH halves, keyed by layer. The split back into the two
  // sub-banks happens once, in `apply`, through `isLowBankLayer` — the same predicate the
  // bridge refuses on.
  const initialAliases = (): Record<string, string> => ({
    ...(bank.aliases ?? {}),
    ...(bank.low.aliases ?? {}),
  });
  const initialVisible = (): Record<string, boolean> => {
    const initial: Record<string, boolean> = {};
    for (let layer = bank.start; layer <= fixedBankEnd(bank); layer++) {
      initial[String(layer)] = isLayerVisible(bank, layer);
    }
    for (let layer = bank.low.start; layer <= lowBankEnd(bank); layer++) {
      initial[String(layer)] = isLayerVisible(bank, layer);
    }
    return initial;
  };
  const [aliases, setAliases] = useState<Record<string, string>>(initialAliases);
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisible);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const stack = useStack();
  const linkDown = useLink() === 'disconnected';

  /** The candidate layers, HIGHEST FIRST — the same order the Layers list uses. */
  const layers: number[] = [];
  for (let layer = fixedBankEnd(bank); layer >= bank.start; layer--) layers.push(layer);
  const bedLayers: number[] = [];
  for (let layer = lowBankEnd(bank); layer >= bank.low.start; layer--) bedLayers.push(layer);

  function revert(): void {
    setAliases(initialAliases());
    setVisible(initialVisible());
    report(null);
  }

  function apply(): void {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(aliases)) {
      const layer = Number(key);
      if (value.trim() !== '' && layer >= bank.start && layer <= fixedBankEnd(bank)) {
        cleaned[key] = value.trim();
      }
    }
    // Only UNTICKED layers are recorded — absent means visible (the canonical
    // `isLayerVisible` default). Keys are range-filtered like aliases.
    const hidden: Record<string, boolean> = {};
    for (const [key, isVisible] of Object.entries(visible)) {
      const layer = Number(key);
      if (!isVisible && layer >= bank.start && layer <= fixedBankEnd(bank)) {
        hidden[key] = false;
      }
    }
    const bedAliases: Record<string, string> = {};
    const bedHidden: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(aliases)) {
      if (isLowBankLayer(bank, Number(key)) && value.trim() !== '') bedAliases[key] = value.trim();
    }
    for (const [key, isVisible] of Object.entries(visible)) {
      if (isLowBankLayer(bank, Number(key)) && !isVisible) bedHidden[key] = false;
    }
    setBusy(true);
    window.cg.fixedLayers
      .setConfig({
        channel: bank.channel,
        start: bank.start,
        count: bank.count,
        ...(Object.keys(cleaned).length > 0 ? { aliases: cleaned } : {}),
        ...(Object.keys(hidden).length > 0 ? { visibility: hidden } : {}),
        low: {
          start: bank.low.start,
          count: bank.low.count,
          ...(Object.keys(bedAliases).length > 0 ? { aliases: bedAliases } : {}),
          ...(Object.keys(bedHidden).length > 0 ? { visibility: bedHidden } : {}),
        },
      })
      .then(
        (res) => {
          setBusy(false);
          if (res.ok) {
            // The bridge publishes `config-changed` + `state-changed` itself; the editor
            // re-keys on the published bank. Say it landed — there is no closing to say it.
            report({ role: 'notice', text: 'Candidate layers applied.' });
            return;
          }
          report({
            role: 'refusal',
            text: fixedLayersReasonMessage(res.reason) ?? 'Not accepted.',
            ...(res.message !== undefined ? { detail: res.message } : {}),
          });
        },
        (err: unknown) => {
          setBusy(false);
          report({
            role: 'refusal',
            text: err instanceof Error ? err.message : 'Request failed.',
          });
        },
      );
  }

  /**
   * R-028 (2.4) — remove the template from a row, from inside the config surface, behind
   * the row's own confirm gate. Removal implies clear (the bridge's `stack.remove` sends
   * the CLEAR), so the dialog states ON AIR explicitly when the stack says the item is.
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
    // FAIL CLOSED on the destructive dialog's wording: only a settled idle/loaded status
    // may claim the graphic is off air.
    const offAir = item !== undefined && (item.status === 'idle' || item.status === 'loaded');
    const onAir = item?.status === 'on-air' || item?.status === 'playing';
    const rowName = slot.alias ?? defaultLayerAlias(bank, slot.layer);
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
    <>
      {/* Read-only facts first: the validator refuses changing any of them mid-session. */}
      <div style={styles.fixedFacts}>
        Channel {String(bank.channel)} · layers {String(bank.start)}–{String(fixedBankEnd(bank))} (
        {String(bank.count)} candidate layers) — channel, start and count are fixed at install; edit
        the bridge&rsquo;s fixed-layers config and restart it to change them. Unticking hides a row
        from the panel only — the layer stays fenced from automatic allocation, and an occupied (or
        unverifiable) row cannot be unticked until its template is removed.
      </div>
      <div style={styles.field}>
        Candidate layers, highest first — same order as the Layers list. Tick = row shown; the name
        is what the row displays.
        <div style={styles.aliasGrid}>
          <span style={styles.aliasHead}>Row</span>
          <span style={styles.aliasHead}>Show</span>
          <span style={styles.aliasHead}>Name</span>
          <span style={styles.aliasHead}>Template</span>
          <span />
          {[
            ...layers.map((layer) => ({ head: null, layer })),
            { head: 'Graphics beds — composited BELOW the live plates', layer: -1 },
            ...bedLayers.map((layer) => ({ head: null, layer })),
          ].map(({ head, layer }) => {
            if (head !== null) {
              return (
                <span key="bed-head" style={styles.groupHead}>
                  {head}
                </span>
              );
            }
            const slot = slotFor(layer);
            const bound = slot?.binding ?? null;
            const position = bankPosition(bank, layer);
            // B-087 mask, same as the row: with the link down the frozen binding is a
            // claim the wire cannot back, and Remove… could not reach the bridge anyway.
            const showBinding = !linkDown && bound !== null;
            return (
              <Fragment key={layer}>
                <span style={styles.aliasLabel}>
                  <strong>{String(position)}</strong>
                  <span style={styles.aliasLayerHint}>· {String(layer)}</span>
                </span>
                <label style={styles.tick}>
                  <input
                    type="checkbox"
                    aria-label={`Show layer ${String(layer)}`}
                    checked={visible[String(layer)] ?? true}
                    onChange={(e) => {
                      setVisible({ ...visible, [String(layer)]: e.target.checked });
                    }}
                  />
                  Show
                </label>
                <input
                  className="cg-field"
                  type="text"
                  dir="auto"
                  aria-label={`Name for layer ${String(layer)} (row ${String(position)})`}
                  placeholder={defaultLayerAlias(bank, layer)}
                  value={aliases[String(layer)] ?? ''}
                  onChange={(e) => {
                    setAliases({ ...aliases, [String(layer)]: e.target.value });
                  }}
                />
                {showBinding && bound !== null ? (
                  <span
                    style={styles.bound}
                    dir="auto"
                    title={bound.templateId ?? bound.templateType}
                  >
                    {displayLabel({
                      name: bound.templateName,
                      sourceFileName: bound.sourceFileName,
                    }) ??
                      bound.templateId ??
                      bound.templateType}
                  </span>
                ) : (
                  <span />
                )}
                {showBinding ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (slot !== undefined) void removeTemplate(slot);
                    }}
                  >
                    Remove…
                  </Button>
                ) : (
                  <span />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      <div style={styles.actions}>
        <Button
          variant="neutral"
          aria-label="Revert candidate layer edits"
          title="Back to what the bridge holds; nothing is sent"
          onClick={revert}
        >
          Revert
        </Button>
        <Button
          variant="primary"
          aria-label="Apply candidate layers"
          title="Sends the ticks and names to the bridge"
          disabled={busy}
          onClick={apply}
        >
          Apply candidate layers
        </Button>
      </div>
      {confirmDialog}
    </>
  );
}
