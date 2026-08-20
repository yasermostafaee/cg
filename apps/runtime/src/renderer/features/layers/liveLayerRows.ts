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
 * here — its row carries the verbs. A live layer whose owner is provably GONE is
 * the one that gets a control, because nothing else in the product can reach it.
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
 * disagree — the operator removed the row while the bridge was down — and the
 * result is a producer lit on air belonging to a row that is not there. That is
 * `B-145`'s opening sentence: *"the layers stay lit and nothing in the product can
 * name them, clear them or re-adopt them."*
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
   * How the operator names the owning row, or `null` when the owner is not known —
   * whether because the stack cannot bear witness (see {@link LiveLayerBlindness}) or
   * because it genuinely does not carry that item. Only the SECOND is stranding, and
   * {@link releasable} is what distinguishes them.
   */
  ownerLabel: string | null;
  /** May a RELEASE control be offered? Provably stranded, and nothing else. */
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

/**
 * 🔴 **WHY THE OWNER VERDICT CAN BE UNKNOWABLE, AND WHY THAT IS ITS OWN STATE.**
 *
 * "Stranded" is decided by the ABSENCE of an item from the stack — and this renderer
 * has been burned three times by treating an absence that has not ARRIVED as an
 * absence that is TRUE (`useBridgeSnapshot`'s own note: the b2 density bug, PVW's
 * white page, and `pruneDrafts` deleting every staged edit on remount). Its rule is
 * explicit: *"any consumer that ACTS on the absence of an item must read the `ready`
 * form and do nothing while `ready` is false."*
 *
 * This surface acts on exactly that absence, and the act is **taking a live source
 * off air**. So blindness is a FIRST-CLASS state rather than a branch inside the
 * stranded one, and there are THREE ways to be blind rather than one:
 *
 * - `link-down` — the ledger is a frozen snapshot the wire can no longer back
 *   (`B-087`). Nothing about it is current.
 * - `stack-not-arrived` — the stack snapshot has not landed yet. The ledger and the
 *   stack are two INDEPENDENT snapshots that land separately, and the ledger can
 *   arrive first.
 * - `stack-empty` — 🔴 **the one a first cut of this file missed, and the one that
 *   matters most.** `useBridgeSnapshot`'s `ready` flag *"latches on the FIRST arrival
 *   and never clears"*, so after a reconnect it still reads `true` while the stack is
 *   `[]` — and a restarted bridge serves its FULL adopted ledger before the browser
 *   has re-delivered a single row (`B-092`). Read naively, **every seated layer would
 *   read STRANDED with RELEASE armed, in exactly the bridge-restart scenario `B-145`
 *   exists for.** An empty stack cannot tell "not delivered yet" from "genuinely
 *   nothing", so it is evidence of neither.
 *
 * ⚠ **The `stack-empty` rule costs one true positive, and that trade is deliberate.**
 * An operator who removes EVERY row and strands a producer gets no alarm here.
 * Failing to raise an alarm is recoverable — the producer is still reachable by
 * re-adding the row, and the orphan surfaces still exist — while arming a control
 * that cuts a live guest on a guess is not. Every other strand is still caught,
 * because a non-empty stack CAN bear witness that a particular `itemId` is not among
 * its rows.
 */
export type LiveLayerBlindness = 'link-down' | 'stack-not-arrived' | 'stack-empty';

/**
 * Can the owner verdict be trusted at all? **THE ONE PLACE THIS PRECEDENCE LIVES.**
 *
 * Callers pass the facts and never order them themselves, because a second caller
 * ordering them differently is how one surface comes to offer a control another
 * refuses. `link-down` outranks everything: with the link down the ledger itself is
 * stale, so the stack's state is beside the point.
 */
export function liveLayerBlindness(
  linkDown: boolean,
  stackReady: boolean,
  stackHasRows: boolean,
): LiveLayerBlindness | null {
  if (linkDown) return 'link-down';
  if (!stackReady) return 'stack-not-arrived';
  if (!stackHasRows) return 'stack-empty';
  return null;
}

const BLIND_DETAIL: Record<LiveLayerBlindness, string> = {
  'link-down':
    'Not connected to the bridge — this is the last ledger it sent, and whether the layer is ' +
    'still seated cannot be checked.',
  'stack-not-arrived':
    'The stack has not arrived yet, so which row owns this layer is not known. It fills in as ' +
    'soon as the console answers.',
  'stack-empty':
    'This console is carrying no rows, so which row owns this layer cannot be established — an ' +
    'empty stack cannot tell "not delivered yet" from "nothing here". It resolves as soon as the ' +
    'rows arrive.',
};

/** The coordinate as an operator reads it on a CasparCG channel: `1-10`. */
export function liveLayerCoordinate(layer: LiveLayerState): string {
  return `${String(layer.channel)}-${String(layer.layer)}`;
}

/**
 * How one seated live layer reads.
 *
 * `blind` masks everything and is checked FIRST, for the reason above: a stranded
 * verdict computed without a stack that can bear witness is a guess presented as an
 * alarm, and the control it unlocks cuts a live source. No blind state raises
 * attention — "I cannot tell" is not a claim that anything is wrong — and the surface
 * says WHICH blindness it is, so the console never implies it looked when it did not.
 */
export function liveLayerRow(
  layer: LiveLayerState,
  ownerLabel: string | null,
  blind: LiveLayerBlindness | null,
): LiveLayerRowView {
  const base = {
    coordinate: liveLayerCoordinate(layer),
    plate: layer.sourceId,
    producer: layer.producer,
    itemId: layer.itemId,
  };
  if (blind !== null) {
    return {
      ...base,
      headline: 'Unknown',
      detail: BLIND_DETAIL[blind],
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
        `layer and forgets the record.` +
        (layer.unverified
          ? ` This record was read back from the saved ledger after a restart and has not ` +
            `been confirmed, so the layer may already be empty.`
          : ''),
      ownerLabel: null,
      releasable: true,
      needsAttention: true,
      tone: colors.pending,
    };
  }
  if (layer.unverified) {
    /*
      🔴 NOT "On screen", and not "Held" either — both are PRESENT-TENSE claims about
      air, and this record is a file claim nothing has confirmed since the restart. The
      bridge adopts its persisted ledger with occupancy `unknown` (no session exists at
      boot, and dropping an unverifiable record would strand the very producer B-145
      protects), so after a restart EVERY row arrives in this state and CasparCG may
      well be black. Asserting the layer is lit would be the console lying about air on
      the surface built to stop it doing exactly that (B-086’s demotion rule).

      It is NOT coloured: an unconfirmed record is a gap in our knowledge, not something
      wrong, and this palette reserves colour for attention.
    */
    return {
      ...base,
      headline: 'Adopted — not confirmed',
      detail:
        `Seated for ${ownerLabel} according to the bridge’s saved ledger, read back after a ` +
        `restart. Nothing has confirmed the layer is still lit${
          layer.held ? ', and the current look does not show it' : ''
        }. Taking the row again re-seats it and confirms it.`,
      ownerLabel,
      releasable: false,
      needsAttention: false,
      tone: colors.textMuted,
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
 * stack.
 */
export function liveLayerRows(
  layers: readonly LiveLayerState[],
  labelFor: (itemId: string) => string | null,
  blind: LiveLayerBlindness | null,
): LiveLayerRowView[] {
  return layers.map((l) => liveLayerRow(l, labelFor(l.itemId), blind));
}

/**
 * 🔴 **WHAT AN EMPTY LIST MEANS — and why it may not just say "nothing is seated".**
 *
 * The per-row masking above rides on ROWS, and an empty ledger produces no rows to
 * carry it. So the ONE branch that speaks for the WHOLE list was the one branch that
 * guessed: a first cut printed *"The bridge has no live sources seated"* — a confident
 * negative claim about what is on air — with no readiness or link input at all.
 *
 * That is the `B-094` class exactly, and the surface next door already obeys it: the
 * LAYERS tab prints *"Layer states have not arrived yet"* rather than an empty list.
 * An operator whose bridge is down would otherwise be told, definitely, that no guest
 * is composited — while two faces are on air and the persisted ledger knows their
 * coordinates. That is the precise lie this whole tab exists to end.
 *
 * `ledgerReady` is the LEDGER snapshot's own arrival flag, not the stack's: a ledger
 * that has arrived and is empty is a real, reportable "nothing seated"; one that has
 * not arrived is not a fact about anything.
 */
export interface LiveLayerEmptyView {
  headline: string;
  detail: string;
  /** True only when the emptiness is a fact we actually have. */
  known: boolean;
}

export function liveLayerEmptyView(
  blind: LiveLayerBlindness | null,
  ledgerReady: boolean,
): LiveLayerEmptyView {
  if (blind === 'link-down') {
    return {
      headline: 'Not connected to the bridge.',
      detail:
        'Whether any live source is seated cannot be checked from here. This is not a report ' +
        'that nothing is on air.',
      known: false,
    };
  }
  if (!ledgerReady) {
    return {
      headline: 'The live-source list has not arrived yet.',
      detail: 'It fills in as soon as the bridge answers. This is not an empty list.',
      known: false,
    };
  }
  return {
    headline: 'The bridge has no live sources seated.',
    detail: 'Layers appear here when a row whose template declares Live Source plates goes on air.',
    known: true,
  };
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
 * 🔴 **EVERY layer a release would take down — because `stack.remove` is ITEM-scoped
 * while the ledger holds N layers per item.**
 *
 * `teardownLiveLayers(itemId)` loops over ALL of that item's records, sending `out`
 * and `mixerClear` for each. So pressing RELEASE on `1-10` also clears `1-11` when
 * both belong to the same stranded item. A confirm that named one coordinate while
 * cutting two would be the product lying about the scope of its most destructive
 * control, and the operator would take a second guest off air without being told.
 *
 * Every caller — the confirm, the accessible name and the toast — names the set this
 * returns, so the three cannot describe different scopes.
 */
export function releaseScopeOf(
  rows: readonly LiveLayerRowView[],
  itemId: string,
): LiveLayerRowView[] {
  return rows.filter((r) => r.itemId === itemId);
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
