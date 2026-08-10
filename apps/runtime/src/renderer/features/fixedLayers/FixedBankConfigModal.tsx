import { Fragment, useState } from 'react';
import {
  bankPosition,
  defaultLayerAlias,
  isLayerVisible,
  type FixedLayerBank,
  type FixedSlotState,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { fixedLayersReasonMessage } from '../../ui/fixedLayersReasonMessage.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
import { useStack } from '../../hooks/useStack.js';
import { useLink } from '../../hooks/useLink.js';

interface Props {
  /**
   * The declared bank, or NULL when the station has none.
   *
   * The null case exists because of a gap the review found: the empty state told
   * the operator to go and configure the candidate layers while withholding the
   * Configure control, so the one screen that named the task offered no way to
   * start it. Configure now always opens — and when there is no bank it explains
   * what the bridge needs and which parts only its config file can set.
   */
  bank: FixedLayerBank | null;
  /** The live per-slot state — occupancy + binding, for the remove affordance. */
  slots: FixedSlotState[];
  onClose: () => void;
}

const styles = {
  fixedFacts: { fontSize: '0.85rem', color: colors.textMuted },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  /**
   * The candidate-layer list.
   *
   * It SCROLLS and it is not height-capped here: the dialog itself is bounded to
   * 88vh and its body scrolls, so this grows to whatever the config declares. The
   * old `maxHeight: 40vh` was sized for the four layers this station happens to
   * declare and made a thirty-layer bank a keyhole — four is a config value, not
   * a design constraint.
   */
  /**
   * ONE grid for the WHOLE list, not a grid per row.
   *
   * Per-row grids were the bug: each row sized its own `auto` columns, so every alias
   * input started at a different x, and a row with a bound template had five children
   * in a four-column track and wrapped its Remove button onto a line of its own. The
   * fix is the same discipline `layerTable.ts` uses for the Layers table — declared
   * columns, one declaration, every row contributing exactly the same cells (an empty
   * span where a value is absent).
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
  /** Column headings for the grid, so each column says what it is exactly once. */
  aliasHead: {
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
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
  // `gap` sets the space between the box and its word — 0.3rem left them crowded once
  // the checkbox gained a real border and fill.
  tick: { display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.8rem' },
  bound: {
    fontSize: '0.8rem',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    // No `maxWidth`: the grid column owns the width now. A local cap here would
    // fight the declared track and reintroduce per-row sizing.
    minWidth: 0,
  },
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
  // Split rather than branched inside one component: the editor's state is all
  // derived from a bank that exists, and hooks cannot be conditional.
  if (bank === null) return <NoBankModal onClose={onClose} />;
  return <BankEditor bank={bank} slots={slots} onClose={onClose} />;
}

/**
 * There is no bank. Say what the bridge needs, in the bridge's own vocabulary,
 * and be explicit that this dialog cannot create one.
 *
 * The honesty matters more than the convenience: channel / start / count are
 * fixed at install (`resize-refused` / `renumber-refused` /
 * `channel-change-refused` are all validator refusals), so offering editable
 * fields here would be offering a form whose Apply can only ever be rejected.
 * What the operator needs instead is the file, the shape, and the restart.
 */
function NoBankModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Modal
      title="Candidate layers — not configured"
      onClose={onClose}
      footer={
        <ModalAction actionRole="primary" onClick={onClose}>
          Close
        </ModalAction>
      }
    >
      <div style={styles.needsConfig}>
        <span>
          This station has no candidate layers, so the Layers list has no rows and nothing can be
          loaded. The channel and the layer range are fixed at install and cannot be set from here —
          they live in the bridge&rsquo;s fixed-layers config file, and the bridge reads it once at
          startup.
        </span>
        <span>
          Create <code>bridge-fixed-layers.json</code> in the bridge&rsquo;s config directory (
          <code>~/.cg-runtime/</code> by default, or wherever <code>--fixed-layers-path</code>{' '}
          points) and restart the bridge:
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
          <strong>start</strong> is the first layer and <strong>count</strong> how many follow it.
          The range must not overlap the playout system&rsquo;s reserved layers or the dynamic
          ranges, and the bridge refuses to start if it does — naming both ranges, so a clash is
          quick to fix.
        </span>
        <span>
          Once the bridge restarts with a valid file, this dialog becomes where you show or hide
          individual rows and give them names.
        </span>
      </div>
    </Modal>
  );
}

function BankEditor({
  bank,
  slots,
  onClose,
}: {
  bank: FixedLayerBank;
  slots: FixedSlotState[];
  onClose: () => void;
}): JSX.Element {
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

  /**
   * The candidate layers, HIGHEST FIRST — the same order the Layers list uses.
   *
   * It used to ascend while the list descended, so the two disagreed about which
   * row was "first" and an operator matching one against the other had to read both
   * ends. Ordering is a correctness property here, not a preference.
   */
  const layers: number[] = [];
  for (let layer = bank.start + bank.count - 1; layer >= bank.start; layer--) layers.push(layer);

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
    // The row's name exactly as the Layers list shows it — same canonical default,
    // so a confirm dialog can never name a row differently from the row itself.
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
    <Modal
      title="Candidate layers — configuration"
      // WIDE: this dialog carries a per-layer table (tick, alias, bound
      // template, Remove), and at prose width every row wrapped into a stack.
      size="wide"
      onClose={onClose}
      /*
        §3 — THE REFUSAL GOES TO THE PRIMITIVE'S MESSAGE REGION, NOT INTO THE BODY.

        This is the defect, and it was not styling. The refusal — "That row is
        occupied — remove its template first…" — was appended to the BOTTOM of the
        scrolling candidate-layer list. With the list scrolled to the top and the
        offending row far down, the operator pressed Apply, nothing happened, and the
        explanation was below the fold. A refusal reported where the operator is not
        looking is a SILENT refusal, and this one guards an occupied layer.

        The message region is pinned beside the action row — the operator's eye is
        already there, because that is where he just clicked. Nothing about the
        message is shortened: it names the cause AND the remedy, which is what makes
        it worth showing at all.

        THE TREATMENT MOVED TOO. This dialog used to hand the region a styled NODE,
        and the amber box that node wore was its own local copy — the one the other
        dialogs went around, each inventing a red that measures 2.13:1 on this
        surface. It is now `Notice`'s `refusal` role: byte-identical in appearance
        (11.21:1) and spelled in exactly one place. What is passed here is DATA, and
        there is no seam left to style it through.
      */
      {...(refusal !== null
        ? {
            message: {
              role: 'refusal' as const,
              text: refusal.rule ?? 'Not accepted.',
              ...(refusal.detail !== undefined ? { detail: refusal.detail } : {}),
            },
          }
        : {})}
      footer={
        <>
          {/* CANCEL FIRST — leftmost in a right-aligned row, so Apply sits in the
              same corner as every other dialog's primary action. The `cancel` role
              resolves to `neutral` and never `ghost`: Cancel and Apply are peers and
              must read as the same KIND of control. */}
          <ModalAction actionRole="cancel" onClick={onClose}>
            Cancel
          </ModalAction>
          <ModalAction actionRole="primary" disabled={busy} onClick={apply}>
            Apply
          </ModalAction>
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
        Candidate layers, highest first — same order as the Layers list. Tick = row shown; the name
        is what the row displays.
        <div style={styles.aliasGrid}>
          {/* Column headings once, so no row has to label its own cells. */}
          <span style={styles.aliasHead}>Row</span>
          <span style={styles.aliasHead}>Show</span>
          <span style={styles.aliasHead}>Name</span>
          <span style={styles.aliasHead}>Template</span>
          <span />
          {layers.map((layer) => {
            const slot = slotFor(layer);
            const bound = slot?.binding ?? null;
            // The SAME canonical position the `#` column and the row's default name
            // use. Never recomputed locally — one number, one derivation.
            const position = bankPosition(bank, layer);
            // B-087 mask, same as the row: with the link down the frozen binding is a
            // claim the wire cannot back, and Remove… could not reach the bridge
            // anyway — neither is offered.
            const showBinding = !linkDown && bound !== null;
            return (
              // A FRAGMENT, not a wrapping div: the cells are direct children of the
              // one grid, which is what makes every column line up across rows.
              // EVERY row contributes all five cells — empty spans where a value is
              // absent — so a bound row can never push a later cell onto its own line.
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
                {/*
                  The name input shows the DEFAULT as a placeholder rather than
                  pre-filling it. Pre-filling would persist `Layer 3` as an explicit
                  alias the first time anything else on the dialog was applied, which
                  then stops tracking the bank if the layer's position ever changes —
                  and it would make "no name" unreachable without clearing text the
                  operator never typed. A placeholder says what the row WILL be called
                  while leaving the field genuinely empty.
                */}
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
      {/* The refusal is NOT rendered here any more — see the `message` prop above.
          Anything appended at this point is inside the scrolling body, which is
          exactly where the operator could not find it. */}
      {confirmDialog}
    </Modal>
  );
}
