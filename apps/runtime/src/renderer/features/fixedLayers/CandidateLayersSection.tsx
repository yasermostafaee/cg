import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
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
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import { fixedLayersReasonMessage } from '../../ui/fixedLayersReasonMessage.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
// 🔴 `B-238` — R-017's two canonical pieces, consumed rather than re-spelled: the ONE
// renderer-side remove decision (which reads the bridge's published `removeExempt`), and the
// ONE refusal sentence, which `errorCodeMessage` already maps `REMOVE_ON_AIR_CODE` to.
import { removeIsRefused } from '../layers/removeGate.js';
import { REMOVE_ON_AIR_REASON } from '../layers/layerRowActions.js';
import { useFixedBankState, useFixedSlotsState } from '../../hooks/useFixedLayers.js';
import { useStack } from '../../hooks/useStack.js';
import { useLink } from '../../hooks/useLink.js';

/**
 * R-021 stage 2b / R-028 — the candidate-layer bank's configuration: per-layer VISIBILITY
 * ticks + aliases, the bound template per row with a Remove… behind the row's own confirm
 * gate. A SECTION of Station setup since `STATION-SETUP-02`, reached from the ONE settings
 * door and this rail — the Layers panel's `Configure` was the third door into this room and
 * `STATION-CHROME-02` §1 removed it. That panel's EMPTY STATE still deep-links here, because
 * a list with no declared bank cannot explain itself.
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
 * ── THE APPLY, AND WHERE IT ENDED UP ────────────────────────────────────────
 *
 * The old dialog's footer was Cancel / Apply, and an accepted Apply CLOSED it. When this
 * became a section of a one-scroll dialog neither was available — "the dialog's footer
 * belongs to Servers" — so `Apply layers` and `Revert` went into the body.
 *
 * ⭐ `STATION-CHROME-01` §2 GAVE THE FOOTER BACK. Each tab owns its own footer now, so the
 * two controls render straight INTO it through `footerSlot` (a portal, not a second copy).
 * An accepted apply still REPORTS a notice and stays open: the bridge republishes the bank,
 * the editor re-keys on it, and the ticks show what is in force.
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
  /** The real CasparCG layer, quieter than the position — same ranking as the row. */
  aliasLayerHint: { fontSize: '0.72rem', color: colors.textMuted, whiteSpace: 'nowrap' as const },
  showCol: { width: '4.5rem' },
  templateCol: { width: '30%' },
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
  tick: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  bound: {
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    minWidth: 0,
  },
  actions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' },
  waiting: { fontSize: '0.82rem', color: colors.textMuted },
} as const;

export interface CandidateLayersSectionProps {
  report: (message: ModalMessage | null) => void;
  /** `STATION-CHROME-01` §2 — does this section hold an unapplied draft? Feeds the rail dot. */
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  /** The dialog footer this section's Apply / Revert render into. `null` = render in the body. */
  footerSlot?: HTMLElement | null | undefined;
}

export function CandidateLayersSection({
  report,
  onDirtyChange,
  footerSlot = null,
}: CandidateLayersSectionProps): JSX.Element {
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
  return (
    <BankEditor
      key={bankKey(bank)}
      bank={bank}
      slots={slots}
      report={report}
      onDirtyChange={onDirtyChange}
      footerSlot={footerSlot}
    />
  );
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
  onDirtyChange,
  footerSlot,
}: {
  bank: FixedLayerBank;
  slots: FixedSlotState[];
  report: (message: ModalMessage | null) => void;
  onDirtyChange: ((dirty: boolean) => void) | undefined;
  footerSlot: HTMLElement | null;
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

  /*
    `STATION-CHROME-01` §2 — WHETHER THIS SECTION HOLDS AN UNAPPLIED DRAFT, reported up so the
    rail can carry its sky dot. Computed from the SAME two maps `revert()` restores and
    `apply()` sends, so the dot cannot claim a change the buttons do not have; a separate
    `touched` flag would go stale the moment an edit was typed back to its original value.
  */
  const dirty =
    JSON.stringify(aliases) !== JSON.stringify(initialAliases()) ||
    JSON.stringify(visible) !== JSON.stringify(initialVisible());
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
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
  /** This section's own commit controls — rendered into the dialog's footer, see below. */
  const actions = (
    <>
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
        aria-label="Apply layers"
        title="Sends the ticks and names to the bridge"
        disabled={busy}
        onClick={apply}
      >
        Apply layers
      </Button>
    </>
  );

  /**
   * 🔴 `B-238` — REMOVE THE TEMPLATE ON A ROW, and the two things that were wrong with it.
   *
   * ── 1. IT ASKED WHERE `R-017` SAYS IT MUST REFUSE ───────────────────────────
   *
   * The row's confirm had an ON-AIR branch — _"This item is ON AIR. Removing it CLEARS layer
   * 88"_ with a `Remove and clear (ON AIR)` button. That is a confirmation asking an operator
   * to authorise damage under time pressure, which is exactly what `R-017` decided against:
   * _"A confirmation asks; a refusal declines. R-017 is the refusal."_ The layer row itself
   * has refused since R-017; this copy of the same act, one surface over, still asked.
   *
   * The branch is GONE rather than re-worded, because the control that reaches it is now
   * disabled — see `removeRefused` at the call site.
   *
   * ── 2. THE REFUSAL THAT ARRIVED ANYWAY REACHED NOBODY ───────────────────────
   *
   * `window.cg.stack.remove` **RESOLVES** a refusal — `{ accepted: false, errorCode: 'on-air' }`,
   * measured against the running mock — and this function discarded the result, reporting only
   * from a `catch` that the refusal path never enters. So the operator confirmed, nothing
   * happened, and nothing was said. A silent refusal is indistinguishable from a broken button,
   * and the next move is to press again or to stop trusting the surface.
   *
   * ⚠ The bridge composes a specific, layer-naming sentence for this — and it never arrives:
   * `StackRemoveChannel`'s response schema declares no `message`, so zod strips it at the route
   * (`B-241`). The schema is deliberately NOT widened here: `errorCodeMessage` has mapped this
   * code to `REMOVE_ON_AIR_REASON` all along, which is the canonical R-017 sentence, and the
   * row's own name is known locally. One sentence, from the one place, plus our own detail.
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
    // may claim the graphic is off air. An item the stack cannot show us at all is the
    // UNVERIFIABLE case, and it keeps its confirm — `removeIsRefused` needs an item to
    // judge, and "we cannot see it" is not "it is safe".
    const offAir = item !== undefined && (item.status === 'idle' || item.status === 'loaded');
    const rowName = slot.alias ?? defaultLayerAlias(bank, slot.layer);
    const confirmed = await confirm({
      title: `Remove “${name}” from ${rowName}?`,
      body: offAir
        ? `The item is removed from the row and layer ${String(slot.layer)} is cleared.`
        : `This item MAY BE ON AIR (its state cannot be verified right now). Removing it ` +
          `CLEARS layer ${String(slot.layer)} — anything live there leaves the output ` +
          `immediately, with no outro.`,
      confirmLabel: 'Remove template',
    });
    if (!confirmed) return;
    try {
      const res = await window.cg.stack.remove({ itemId });
      if (!res.accepted) {
        /*
          THE SEAM THAT WAS MISSING. Reported into THIS DIALOG's pinned region — the same
          place every other refusal in this section lands (`apply`, above) — and not to the
          global command toast, which is a transient surface outside the modal the operator
          is standing in.
        */
        report({
          role: 'refusal',
          text: errorCodeMessage(res.errorCode) ?? 'The bridge did not accept the removal.',
          // Golden rule 11: the ROW and the TEMPLATE in the operator's words. The itemId is
          // not in the sentence he reads under pressure.
          detail: `${rowName} · ${name}`,
        });
      }
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
      {/*
        `STATION-CHROME-02` §3 — A REAL TABLE, with the same column headers, row height,
        cell padding and hover as the delimiter and catalogue lists. It was a CSS grid whose
        header row was five styled `<span>`s: it looked like a table and announced nothing,
        so a screen reader read thirty-four unlabelled cells and the graphics-bed heading was
        a `grid-column: 1 / -1` span rather than a group.
      */}
      <section className="cg-card" aria-label="Candidate rows">
        <div className="cg-card__head">
          <span className="cg-card__title">Rows</span>
        </div>
        <div className="cg-card__body cg-card__body--table">
          <div className="cg-table-scroll">
            <table className="cg-table">
              <thead>
                <tr>
                  <th scope="col" className="cg-table__num">
                    Row
                  </th>
                  <th scope="col" style={styles.showCol}>
                    Show
                  </th>
                  <th scope="col">Name</th>
                  <th scope="col" style={styles.templateCol}>
                    Template
                  </th>
                  <th scope="col" className="cg-table__actions">
                    <span className="cg-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...layers.map((layer) => ({ head: null, layer })),
                  { head: 'Graphics beds — composited BELOW the live plates', layer: -1 },
                  ...bedLayers.map((layer) => ({ head: null, layer })),
                ].map(({ head, layer }) => {
                  if (head !== null) {
                    return (
                      <tr key="bed-head" className="cg-table__group">
                        <td colSpan={5}>{head}</td>
                      </tr>
                    );
                  }
                  const slot = slotFor(layer);
                  const bound = slot?.binding ?? null;
                  const position = bankPosition(bank, layer);
                  // B-087 mask, same as the row: with the link down the frozen binding is a
                  // claim the wire cannot back, and remove could not reach the bridge anyway.
                  const showBinding = !linkDown && bound !== null;
                  const rowName = slot?.alias ?? defaultLayerAlias(bank, layer);
                  /*
                    🔴 `B-238` — the PUBLISHED answer, read once per row (see the control).
                    An item the stack cannot show us is NOT refused here: "we cannot see it"
                    is not "it is on air", and that case keeps the confirm that says so
                    (`removeTemplate`), plus the bridge's own refusal — which now renders.
                  */
                  const boundItem =
                    bound === null ? undefined : stack.find((i) => i.itemId === bound.itemId);
                  const removeRefused = boundItem !== undefined && removeIsRefused(boundItem);
                  return (
                    <tr key={layer} data-candidate-layer={String(layer)}>
                      {/* ⭐ `R-028` — THE REAL LAYER NUMBER STAYS VISIBLE beside the row's
                          position, because an operator may need it to clear that layer by
                          hand, at the moment this console is NOT helping (golden rule 11). */}
                      <td className="cg-table__num">
                        <strong>{String(position)}</strong>
                        <span style={styles.aliasLayerHint}> · {String(layer)}</span>
                      </td>
                      <td>
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
                      </td>
                      <td>
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
                      </td>
                      <td>
                        {showBinding && bound !== null ? (
                          <bdi
                            style={styles.bound}
                            title={bound.templateId ?? bound.templateType}
                            dir="auto"
                          >
                            {displayLabel({
                              name: bound.templateName,
                              sourceFileName: bound.sourceFileName,
                            }) ??
                              bound.templateId ??
                              bound.templateType}
                          </bdi>
                        ) : null}
                      </td>
                      <td className="cg-table__actions">
                        {showBinding && (
                          /*
                            🔴 `B-238` / `R-017` — ON AIR IS A REFUSAL, NOT A QUESTION.

                            `removeIsRefused` is `B-228`'s ONE renderer-side spelling of this
                            decision, and it reads the bridge's PUBLISHED `removeExempt` rather
                            than recomputing the rule — which the renderer could not do anyway,
                            since the second exemption is bridge knowledge.

                            This section used to derive its own answer for the confirm's
                            wording: `item?.status === 'on-air' || item?.status === 'playing'`.
                            That is `isOnAirStatus` minus `updating`, `unconfirmed` and
                            `exiting`, and minus both exemptions — so it told the operator a
                            row was safe to destroy on three statuses where it was not, and
                            would have sat asking on rows the bridge would have accepted. The
                            B-228 shape, a third time, in the function that already held the
                            item it needed.
                          */
                          /*
                            🔴 `STATION-CHROME-02` §3 — WAS A RED `Remove…` BOX ON EVERY BOUND
                            ROW, and the mockup still draws one. §3 names it as part of the
                            defect, and a written decision beats the reference (the mockup's
                            own header says so).

                            The ellipsis said "this asks first" and the icon cannot, so the
                            `title` says it instead — and the CONFIRM GATE is the protection
                            either way, which is the same argument `controls.css` already
                            makes for the layer table's neutral row verbs.
                          */
                          <Button
                            variant="quiet"
                            className="cg-list-remove"
                            aria-label={`Remove the template on ${rowName}`}
                            disabled={removeRefused}
                            title={
                              removeRefused
                                ? REMOVE_ON_AIR_REASON
                                : 'Remove the template from this row — asks first, then clears the layer'
                            }
                            onClick={() => {
                              if (slot !== undefined) void removeTemplate(slot);
                            }}
                          >
                            <Icon icon={Trash2} size={15} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="cg-card__note">
          Highest first — the same order as the Layers list. Tick = row shown; the name is what the
          row displays.
        </p>
      </section>
      {/*
        `STATION-CHROME-01` §2 — THE ACTIONS GO IN THE DIALOG'S FOOTER when there is one to go
        in. This section's own note recorded that they sat in the body only because "the
        dialog's footer belongs to Servers"; with a tab per section that is no longer true, and
        each tab's footer carries its own commit. The portal means they are physically IN the
        footer rather than a second copy of themselves rendered there.

        `footerSlot === null` — no host, e.g. a unit test rendering this section on its own —
        falls back to the body, so the section is never left with no way to apply.
      */}
      {footerSlot === null ? (
        <div style={styles.actions}>{actions}</div>
      ) : (
        createPortal(actions, footerSlot)
      )}
      {confirmDialog}
    </>
  );
}
