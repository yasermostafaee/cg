import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, Lock, Search, Trash2 } from 'lucide-react';
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
import { isOnAirStatus, type StackItemState } from '@cg/shared-schema';
import { STATION_SETUP_PX, colors } from '../../theme.js';
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
 * ── 🔴 `SETTINGS-MATCH-02` DEFECT 3 — THIS PANE HAD NEVER MET THE REFERENCE ──────────────
 *
 * Every other pane had been measured against `09-channel-settings.html` at least once. This
 * one had not: of the drawing's structure, exactly two pieces existed here — the words
 * `Graphics beds` and a remove action — and the rest of it (a filter bar, `Shown only`, a
 * `Row name` column, `Unassigned`, the `visibility locked` labels, the footnote) had no
 * counterpart at all. `design.md` 23.6 recorded it honestly as **row 137, NOT built**, and the
 * owner's third defect is that sentence read back to him on screen.
 *
 * What is built here now, in the reference's order: the head's `.layer-summary` tags and its
 * `<details>` (both supplied to `SetupSection`, which owns the head), a FILTER BAR, the
 * five-column table, the footnote, the `Graphics beds` head over the same table again, and an
 * empty state for a filter that matches nothing.
 *
 * ── 🔴 THREE THINGS THE DRAWING SAYS THAT THE BRIDGE DOES NOT, AND WHAT WAS DONE ─────────
 *
 * The prompt's own rule is that no refusal CONDITION may change, only where one is shown. So:
 *
 *  1. **`Show` is dead on an OCCUPIED row, and on nothing else.** The reference disables it on
 *     "occupied or unverified". Occupied is ours to know — a bound item IS `isFixedSlotBusy`,
 *     which is the first thing `#fixedSlotOccupancy` answers `occupied` on — so that switch is
 *     pre-disabled with the reason on its `title`. **UNVERIFIED IS NOT**, and that is
 *     deliberate: with no OSC every row reads `unknown`, so locking on it would kill all
 *     thirty switches on exactly the installs that have no OSC — the `B-087` shape, and the
 *     same mistake as the LOAD gate that "dimmed exactly when the rundown is built". The
 *     bridge still refuses `untick-unknown`, and that refusal still renders where it always
 *     did.
 *  2. …and it is dead only in the direction the bridge refuses. Hiding an occupied row is
 *     refused; SHOWING one never was. A row that is hidden AND occupied keeps a live switch.
 *  3. **The drawing's inline `role="alert"` region is NOT built.** A refusal belongs in the
 *     modal's pinned region (`AUDIT-CLOSE-01` delta A), which is where `report` puts it and
 *     where `modal-message-containment.spec.ts` holds it; a second home for an event is the
 *     defect that decision closed.
 *
 * ⚠ **`B-235` STAYS FILED.** A layer another system is using is still missing from this
 * panel — this pane lists the DECLARED bank and nothing else, exactly as it did. Nothing here
 * absorbs that, quietly or otherwise.
 *
 * ── THE TWO DIALOGS THIS USED TO BE (`FixedBankConfigModal`) ─────────────────
 *
 * It rendered TWO distinct dialogs: an EDITOR when a bank exists, and an EXPLAINER
 * (`Candidate layers — not configured`) when none does — prose naming the file the
 * bridge reads and the restart it needs, with nothing to apply. A section hosts both
 * without strain, and the explainer turns out to be the section's EMPTY STATE: same
 * words, same code block, no Close button because there is no dialog of its own to close.
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
  actions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' },
  waiting: { fontSize: '0.82rem', color: colors.textMuted },
} as const;

/** The name a row displays, and the maximum an operator may type into it. */
const ROW_NAME_MAX = 80;

export interface CandidateLayersSectionProps {
  report: (message: ModalMessage | null) => void;
  /** `STATION-CHROME-01` §2 — does this section hold an unapplied draft? Feeds the rail dot. */
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  /**
   * `SETTINGS-MATCH-02` — how MANY rows hold one, for the rail's count chip. A count rather
   * than a flag because the chip says a number; it is derived from the same two maps
   * `onDirtyChange` is, so the two cannot disagree.
   */
  onDirtyCountChange?: ((count: number) => void) | undefined;
  /** The dialog footer this section's Apply / Revert render into. `null` = render in the body. */
  footerSlot?: HTMLElement | null | undefined;
}

export function CandidateLayersSection({
  report,
  onDirtyChange,
  onDirtyCountChange,
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
      onDirtyCountChange={onDirtyCountChange}
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

/**
 * `SETTINGS-MATCH-02` — the head's read-only SUMMARY, as the reference draws it: the three
 * facts this section cannot change, as tags under the description.
 *
 * Exported so `StationSetupDialog` can hand it to `SetupSection`, which owns the head. It
 * reads the SAME `useFixedBankState` the editor does rather than being passed a copy — one
 * read, so the tags and the table cannot name different ranges.
 */
export function CandidateLayersSummary(): JSX.Element | null {
  const { bank } = useFixedBankState();
  if (bank === null) return null;
  return (
    <div className="cg-setup-summary" data-layer-summary="">
      <span className="cg-setup-tag">Channel {String(bank.channel)}</span>
      <span className="cg-setup-tag">
        Layers {String(bank.start)}–{String(fixedBankEnd(bank))}
      </span>
      <span className="cg-setup-tag">
        <Icon icon={Lock} size={STATION_SETUP_PX.tagIcon} />
        Fixed bank
      </span>
    </div>
  );
}

/**
 * The rules an operator needs BEFORE touching a switch, folded away — the reference's
 * `.helper-details`.
 *
 * ⚠ These are the SAME facts the section used to state as a paragraph of running text above
 * the table (`Channel 1 · layers 70–71 (2 candidate layers) — channel, start and count are
 * fixed at install…`). Nothing is dropped: the coordinates moved to the summary tags, where
 * they are read at a glance, and the rules moved here, where they are read once.
 */
export function CandidateLayersHelper(): JSX.Element {
  return (
    <details className="cg-setup-details" data-layers-helper="">
      <summary>Visibility and layer safety</summary>
      <p>
        Hiding a row removes it from the Layers panel only — the layer stays fenced from automatic
        allocation, and nothing on it is touched. An occupied row cannot be hidden: remove its
        template first, which clears the layer. A row whose occupancy cannot be verified is refused
        too, by the bridge, because unknown is never treated as empty. The channel, the first layer
        and the count are fixed at install; edit the bridge&rsquo;s fixed-layers config and restart
        it to change them.
      </p>
    </details>
  );
}

/** Does this row match what the operator typed? Name, template and layer number all count. */
function matches(query: string, parts: readonly (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return parts.some((p) => (p ?? '').toLowerCase().includes(q));
}

interface LayerRow {
  readonly layer: number;
  readonly position: number;
  readonly slot: FixedSlotState | undefined;
  readonly name: string;
  readonly placeholder: string;
  readonly template: string | null;
  /** Our OWN record says a template is bound here — the `occupied` the bridge refuses on. */
  readonly occupied: boolean;
  readonly onAir: boolean;
  readonly visible: boolean;
  readonly dirty: boolean;
  readonly removeRefused: boolean;
  readonly boundItem: StackItemState | undefined;
}

function BankEditor({
  bank,
  slots,
  report,
  onDirtyChange,
  onDirtyCountChange,
  footerSlot,
}: {
  bank: FixedLayerBank;
  slots: FixedSlotState[];
  report: (message: ModalMessage | null) => void;
  onDirtyChange: ((dirty: boolean) => void) | undefined;
  onDirtyCountChange: ((count: number) => void) | undefined;
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
  /** `SETTINGS-MATCH-02` — the filter bar's two controls. Draft-local; nothing is persisted. */
  const [query, setQuery] = useState('');
  const [shownOnly, setShownOnly] = useState(false);

  /*
    `STATION-CHROME-01` §2 — WHETHER THIS SECTION HOLDS AN UNAPPLIED DRAFT, reported up so the
    rail can carry its mark. Computed from the SAME two maps `revert()` restores and `apply()`
    sends, so the mark cannot claim a change the buttons do not have; a separate `touched` flag
    would go stale the moment an edit was typed back to its original value.

    ⭐ `SETTINGS-MATCH-02` — and HOW MANY rows hold one, from the same comparison, because the
    rail's mark is a count chip now rather than a dot. One derivation, two readings of it.
  */
  const dirtyLayers = ((): ReadonlySet<string> => {
    const beforeAliases = initialAliases();
    const beforeVisible = initialVisible();
    const keys = new Set([
      ...Object.keys(beforeAliases),
      ...Object.keys(aliases),
      ...Object.keys(beforeVisible),
      ...Object.keys(visible),
    ]);
    const changed = new Set<string>();
    for (const key of keys) {
      if ((beforeAliases[key] ?? '') !== (aliases[key] ?? '')) changed.add(key);
      if ((beforeVisible[key] ?? true) !== (visible[key] ?? true)) changed.add(key);
    }
    return changed;
  })();
  /*
    ⚠ The COUNT, not the set, is what the effects depend on. A fresh `Set` every render would
    re-fire on every keystroke whether or not anything changed; a number cannot.
  */
  const dirtyCount = dirtyLayers.size;
  const dirty = dirtyCount > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onDirtyCountChange?.(dirtyCount);
  }, [dirtyCount, onDirtyCountChange]);
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
      // `SETTINGS-MATCH-02` §8 — raised from inside Station setup: that family's frame, and
      // its lighter scrim, so the row this is about stays visible behind the question.
      layer: 'sub',
      destructive: true,
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

  /** One row's whole state, worked out once — the table renders it and the filter reads it. */
  const rowFor = (layer: number): LayerRow => {
    const slot = slotFor(layer);
    const bound = slot?.binding ?? null;
    // B-087 mask, same as the row: with the link down the frozen binding is a claim the wire
    // cannot back, and remove could not reach the bridge anyway.
    const showBinding = !linkDown && bound !== null;
    const boundItem = bound === null ? undefined : stack.find((i) => i.itemId === bound.itemId);
    return {
      layer,
      position: bankPosition(bank, layer),
      slot,
      name: aliases[String(layer)] ?? '',
      placeholder: defaultLayerAlias(bank, layer),
      template:
        showBinding && bound !== null
          ? (displayLabel({ name: bound.templateName, sourceFileName: bound.sourceFileName }) ??
            bound.templateId ??
            bound.templateType)
          : null,
      /*
        🔴 OCCUPIED IS OUR OWN RECORD, never an inference from the wire. A bound item is the
        FIRST thing the bridge's `#fixedSlotOccupancy` answers `occupied` on (`isFixedSlotBusy`),
        so a row in this state is one the bridge will certainly refuse to hide — which is what
        licenses disabling the switch rather than letting the press bounce.
      */
      occupied: bound !== null,
      onAir: boundItem !== undefined && isOnAirStatus(boundItem),
      visible: visible[String(layer)] ?? true,
      dirty: dirtyLayers.has(String(layer)),
      removeRefused: boundItem !== undefined && removeIsRefused(boundItem),
      boundItem,
    };
  };

  const operatorRows = layers.map(rowFor);
  const bedRows = bedLayers.map(rowFor);
  const keep = (row: LayerRow): boolean =>
    (!shownOnly || row.visible) &&
    matches(query, [row.name, row.placeholder, row.template, String(row.layer)]);
  const shownOperator = operatorRows.filter(keep);
  const shownBeds = bedRows.filter(keep);
  const total = operatorRows.length + bedRows.length;
  const shown = shownOperator.length + shownBeds.length;

  const table = (rows: readonly LayerRow[], label: string): JSX.Element => (
    <section className="cg-card" aria-label={label}>
      <div className="cg-table-scroll">
        <table className="cg-table cg-layer-table">
          <thead>
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">Show</th>
              <th scope="col">Row name</th>
              <th scope="col">Template</th>
              <th scope="col" className="cg-table__actions">
                <span className="cg-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.layer}
                data-candidate-layer={String(row.layer)}
                {...(row.dirty ? { 'data-row-dirty': '' } : {})}
              >
                {/* ⭐ `R-028` — THE REAL LAYER NUMBER IS THE CELL, not a hover: an operator may
                    need it to clear that layer by hand at the moment this console is NOT
                    helping (golden rule 11). The operator's own row number sits under it. */}
                <td>
                  <span className="cg-layer-id">{String(row.layer)}</span>
                  <span className="cg-layer-row-number">
                    {isLowBankLayer(bank, row.layer) ? 'Bed' : 'Row'} {String(row.position)}
                  </span>
                </td>
                <td>
                  {/*
                    🔴 A SWITCH, AND IT IS DEAD ONLY WHERE THE BRIDGE CERTAINLY REFUSES.
                    See the module note: OCCUPIED is ours to know and is pre-disabled with the
                    reason on the control; UNVERIFIED is the bridge's and stays live, because
                    an install with no OSC reads every row unknown.

                    ⚠ And only in the direction that is refused. Hiding an occupied row is
                    refused; showing one never was, so a hidden occupied row keeps a live
                    switch.
                  */}
                  <span className="cg-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Show layer ${String(row.layer)}`}
                      checked={row.visible}
                      disabled={row.occupied && row.visible}
                      title={
                        row.occupied && row.visible
                          ? 'Remove the template before hiding this row'
                          : 'Show in the Layers panel'
                      }
                      onChange={(e) => {
                        setVisible({ ...visible, [String(row.layer)]: e.target.checked });
                      }}
                    />
                    <span className="cg-switch__track" aria-hidden="true" />
                  </span>
                </td>
                <td>
                  <input
                    className="cg-field"
                    type="text"
                    dir="auto"
                    maxLength={ROW_NAME_MAX}
                    aria-label={`Name for layer ${String(row.layer)} (row ${String(row.position)})`}
                    placeholder={row.placeholder}
                    value={row.name}
                    onChange={(e) => {
                      setAliases({ ...aliases, [String(row.layer)]: e.target.value });
                    }}
                  />
                </td>
                <td>
                  {row.template === null ? (
                    <span className="cg-layer-none">{row.occupied ? '' : 'Unassigned'}</span>
                  ) : (
                    <>
                      <bdi
                        className="cg-layer-template"
                        title={row.slot?.binding?.templateId ?? row.slot?.binding?.templateType}
                        dir="auto"
                      >
                        {row.template}
                      </bdi>
                      {/*
                        WHY THE SWITCH ON THIS ROW IS DEAD, said where the operator is looking
                        when he wonders. It is a statement about VISIBILITY and says so — it is
                        not a second claim about air, and the word `On air` here is the stack's
                        own status rather than a reading of the wire.
                      */}
                      <span className="cg-layer-locked" data-layer-locked="">
                        <Icon icon={Lock} size={STATION_SETUP_PX.occupiedIcon} />
                        {row.onAir ? 'On air' : 'Occupied'} · visibility locked
                      </span>
                    </>
                  )}
                </td>
                <td className="cg-table__actions">
                  {row.template !== null && (
                    /*
                      🔴 `B-238` / `R-017` — ON AIR IS A REFUSAL, NOT A QUESTION.

                      `removeIsRefused` is `B-228`'s ONE renderer-side spelling of this
                      decision, and it reads the bridge's PUBLISHED `removeExempt` rather
                      than recomputing the rule — which the renderer could not do anyway,
                      since the second exemption is bridge knowledge.
                    */
                    <Button
                      variant="quiet"
                      className="cg-list-remove"
                      aria-label={`Remove the template on ${row.name === '' ? row.placeholder : row.name}`}
                      disabled={row.removeRefused}
                      title={
                        row.removeRefused
                          ? REMOVE_ON_AIR_REASON
                          : 'Remove the template from this row — asks first, then clears the layer'
                      }
                      onClick={() => {
                        if (row.slot !== undefined) void removeTemplate(row.slot);
                      }}
                    >
                      <Icon icon={Trash2} size={15} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const emptyState = (
    <section className="cg-card" aria-label="No matching rows">
      <div className="cg-setup-empty-state" data-layers-empty="">
        <Icon icon={Search} size={STATION_SETUP_PX.emptyStateIcon} />
        <h3>No matching rows</h3>
        <p>Try another name, or turn off “Shown only”.</p>
      </div>
    </section>
  );

  return (
    <>
      {/*
        `SETTINGS-MATCH-02` — THE FILTER BAR. Thirty rows across two banks is a list an
        operator searches rather than scans, and the read-out at its end is what makes the
        filter honest: `4 of 29 rows` says plainly that twenty-five are hidden by what was
        typed, so an absent row is never mistaken for a row the station does not have.
      */}
      <div className="cg-setup-filter" data-layers-filter="">
        <div className="cg-setup-search">
          <Icon icon={Search} size={STATION_SETUP_PX.searchIcon} />
          <input
            className="cg-field"
            type="search"
            autoComplete="off"
            aria-label="Filter by name, template or layer"
            placeholder="Filter by name, template or layer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="cg-setup-check">
          <input
            type="checkbox"
            checked={shownOnly}
            onChange={(e) => setShownOnly(e.target.checked)}
          />
          Shown only
        </label>
        <span className="cg-setup-results" data-layers-results="" role="status">
          {String(shown)} of {String(total)} rows
        </span>
      </div>

      {shown === 0 ? (
        emptyState
      ) : (
        <>
          {shownOperator.length > 0 && table(shownOperator, 'Candidate rows')}
          {shownOperator.length > 0 && (
            <p className="cg-layer-footnote">
              <Icon icon={ArrowDown} size={STATION_SETUP_PX.footnoteIcon} />
              Highest layer first · rows from the active channel.
            </p>
          )}
          {shownBeds.length > 0 && (
            <div className="cg-setup-beds-head">
              <h3>Graphics beds</h3>
              <p>Composited below the live source layers.</p>
            </div>
          )}
          {shownBeds.length > 0 && table(shownBeds, 'Graphics bed rows')}
        </>
      )}
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
