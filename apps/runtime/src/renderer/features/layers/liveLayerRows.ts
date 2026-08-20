import type { LiveLayerState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';

/**
 * `B-145` acceptance 1, display half (`tasks.md` 2.8) — **how one seated Live
 * Source layer reads, and whether it can be acted on.**
 *
 * React-free and in its own module for `stationLayerOccupancy`'s reason: this IS
 * the boundary. Whether a control appears at all is decided here, it must be
 * exhaustively unit-testable without a DOM, and whoever audits it later has to be
 * able to read it in one screen.
 *
 * ── THE RULE, IN ONE SENTENCE ───────────────────────────────────────────────
 *
 * A live layer whose owning ROW is still on the stack is shown and NOT acted on
 * here — its row carries the verbs. A live layer whose owner is GONE is the one
 * that gets a control, because nothing else in the product can reach it.
 *
 * ── WHY THAT IS THE RIGHT WAY ROUND, AND NOT AN INVERSION ───────────────────
 *
 * Every sanctioned verb for a seated layer is ITEM-scoped: `stack.swapLiveSource`
 * repoints it, `stack.setPlateVolume` sets its audio, `stack.out` / `stack.remove`
 * take it off air. `layers.clear` refuses a live-source coordinate BY NAME, having
 * explicitly weighed and REJECTED an exemption — *"an exemption would make Live
 * Source layers operator-CLEARABLE, inverting the protection"*. So offering a
 * per-layer clear here would be re-opening a door the bridge closed on purpose,
 * from a different surface. For a row that exists, the answer is the row.
 *
 * 🔴 **THE STRANDED CASE IS THE EXCEPTION, AND IT IS THE WHOLE POINT OF `B-145`.**
 * The ledger is keyed by `itemId` and adopted from disk at boot; the browser
 * re-delivers its own stack intent separately (`B-092`). Those two can legitimately
 * disagree — the operator cleared the stack while the bridge was down, or a second
 * console connects carrying a different retained stack — and the result is a
 * producer lit on air belonging to a row that is not there. That is `B-145`'s
 * opening sentence: *"the layers stay lit and nothing in the product can name them,
 * clear them or re-adopt them."*
 *
 * The control offered for it is NOT a new door either. `remove(itemId)` calls
 * `teardownLiveLayers(itemId)` **unconditionally on `slot`**, and its own comment
 * says why that matters: *"the ledger is keyed by itemId, so an item whose slot was
 * already released can still own live layers, and those are precisely the ones
 * nothing else would ever reach."* The handle already existed and already worked.
 * What was missing was a surface that knew the `itemId` to hand it.
 *
 * ── COLOUR ─────────────────────────────────────────────────────────────────
 *
 * Nothing here is coloured unless it needs ATTENTION, and only one state does.
 * `held` is a normal, chosen disposition (§12.4) and wears a WORD, not a hue.
 * GREEN is not used at all: it is the sacred ON AIR mark of the layer TABLE, and
 * an on-screen plate borrowing it would put a second, unrelated air claim on a
 * different surface. Amber is `pending`, whose documented meaning in this palette
 * is exactly ATTENTION — *"OCCUPIED, UNKNOWN, UNCONFIRMED"* — which is what a
 * stranded producer is.
 */
export interface LiveLayerRowView {
  /** The coordinate as an operator reads it on a CasparCG channel: `1-10`. */
  coordinate: string;
  /**
   * The SYMBOLIC plate id and the producer actually sent, carried on the VIEW rather
   * than read off the payload beside it.
   *
   * ⚠ Deliberate: the panel renders from rows ALONE. An earlier shape had it take the
   * payload array and the row array together and index them in step — two parallel
   * lists whose alignment was a rule someone had to keep, and the tab dot was computed
   * from its own pass. Everything the surface shows now comes from ONE evaluation of
   * {@link liveLayerRows}, so the dot cannot claim something no visible row says.
   */
  plate: string;
  producer: string;
  /** The ledger key — the handle every item-scoped verb takes. Always present. */
  itemId: string;
  /** What state this layer is in, in the operator's words. */
  headline: string;
  /** Why it is that, and what to do about it. */
  detail: string;
  /**
   * How the operator names the owning row, or `null` when the stack does not carry
   * that item — which is exactly the STRANDED test, and the only input that decides it.
   */
  ownerLabel: string | null;
  /** May a RELEASE control be offered? Stranded, on a live link, and nothing else. */
  releasable: boolean;
  /**
   * Does this row need the operator to go and look? Drives the tone AND the tab's
   * dot, from ONE evaluation — a dot that could disagree with the rows it summarises
   * would be worse than no dot.
   */
  needsAttention: boolean;
  /** Accent for the headline — never the only signal; the word always says it too. */
  tone: string;
}

/** The plate and producer, formatted once so the row and its tests agree. */
export function liveLayerCoordinate(layer: LiveLayerState): string {
  return `${String(layer.channel)}-${String(layer.layer)}`;
}

/**
 * How one seated live layer reads.
 *
 * `linkDown` masks everything, exactly as the layer rows and the station tab do:
 * with the SPA↔bridge link down this is a frozen snapshot the wire can no longer
 * back (`B-087`), so it reads unknown and offers nothing. That mask is deliberately
 * FIRST — a stranded verdict computed from a frozen ledger against a frozen stack
 * would be a guess presented as an alarm, and the control it unlocks sends a
 * `remove` that could not leave the browser anyway.
 */
export function liveLayerRow(
  layer: LiveLayerState,
  ownerLabel: string | null,
  linkDown: boolean,
): LiveLayerRowView {
  const base = {
    coordinate: liveLayerCoordinate(layer),
    plate: layer.sourceId,
    producer: layer.producer,
    itemId: layer.itemId,
  };
  if (linkDown) {
    return {
      ...base,
      headline: 'Unknown',
      detail:
        'Not connected to the bridge — this is the last ledger it sent, and whether the ' +
        'layer is still seated cannot be checked.',
      ownerLabel: null,
      releasable: false,
      needsAttention: false,
      tone: colors.textMuted,
    };
  }
  if (ownerLabel === null) {
    return {
      ...base,
      headline: 'Stranded — no row owns this',
      detail:
        `The bridge seated this layer for an item the stack no longer carries, so no row's ` +
        `verbs can reach it and its producer may still be on air. Releasing it clears the ` +
        `layer and forgets the record.`,
      ownerLabel: null,
      releasable: true,
      needsAttention: true,
      tone: colors.pending,
    };
  }
  if (layer.held) {
    return {
      ...base,
      headline: 'Held — not in the current look',
      detail:
        `Seated for ${ownerLabel}, muted and with no hole in front of it. It is kept rather ` +
        `than torn down so returning to a look that shows it needs no fresh producer.`,
      ownerLabel,
      releasable: false,
      needsAttention: false,
      tone: colors.text,
    };
  }
  return {
    ...base,
    headline: 'On screen',
    detail: `Seated for ${ownerLabel}. Repoint, audio and off-air are that row's verbs.`,
    ownerLabel,
    releasable: false,
    needsAttention: false,
    tone: colors.text,
  };
}

/**
 * Every seated live layer, resolved against the stack.
 *
 * `labelFor` returns how the operator names an item's row, or `null` when the stack
 * does not carry it — INJECTED rather than derived here so this module stays free of
 * the bank/binding join, and so a test can produce a stranded row without building a
 * stack. It is the only input that decides `stranded`.
 */
export function liveLayerRows(
  layers: readonly LiveLayerState[],
  labelFor: (itemId: string) => string | null,
  linkDown: boolean,
): LiveLayerRowView[] {
  return layers.map((l) => liveLayerRow(l, labelFor(l.itemId), linkDown));
}

/**
 * Is any seated layer stranded? Drives the tab's warning dot, so the operator learns
 * there is something to look at without opening the tab.
 *
 * Read from the SAME `liveLayerRows` the tab renders, never a second `.some()` over
 * the raw list: a dot derived independently is free to disagree with every row under
 * it, and this dot's claim — *a live producer is on air with no handle* — is the one
 * that must not be raised or withheld wrongly.
 */
export function hasStrandedLiveLayer(rows: readonly LiveLayerRowView[]): boolean {
  return rows.some((r) => r.needsAttention);
}

/**
 * How the operator names the row that owns an item — or `null` if the stack has no
 * such item, which is exactly the stranded test.
 *
 * The label is the TEMPLATE's name where one is known, because that is the text the
 * operator reads in the layer table's own template column. It falls back to the raw
 * `itemId` rather than to a friendly placeholder: an id is ugly but it is the handle,
 * and a row labelled "Unknown template" would be indistinguishable from the stranded
 * state this function exists to detect.
 */
export function ownerLabelFor(
  items: readonly StackItemState[],
  templateName: (templateId: string) => string | undefined,
): (itemId: string) => string | null {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  return (itemId) => {
    const item = byId.get(itemId);
    if (item === undefined) return null;
    return templateName(item.templateId) ?? itemId;
  };
}
