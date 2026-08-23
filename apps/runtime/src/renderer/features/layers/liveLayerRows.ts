import type { LiveLayerState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { plateAudioPill, type PlateAudioPill, type RowPlateAudio } from './plateAudio.js';

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
  /**
   * `add-multibox-audio` — **THIS PLATE'S AUDIO, or `null` when the console cannot honestly
   * say.**
   *
   * 🔴 **`null` IS NOT "silent", AND THE DIFFERENCE IS THE WHOLE REASON THIS IS NULLABLE.**
   * The volume comes from the STACK ITEM (`plateVolumes`), which is a different snapshot from
   * the ledger this row is built out of, and the two land independently. So there are two
   * states in which a strip would be inventing its answer, and both resolve to `null`:
   *
   *   - **BLIND** (see {@link LiveLayerBlindness}) — with the link down the ledger is stale,
   *     and before the stack has arrived there is no intent map to read. Printing SILENT for
   *     a plate that is in fact raised is the `B-094` honesty class exactly, on the one axis
   *     an operator cannot check by looking at a monitor.
   *   - **STRANDED** — no row on the stack owns this layer, so there is no item to carry an
   *     intent and no item-scoped verb that could change one. That row gets RELEASE, which is
   *     the only thing that can reach it.
   *
   * When it is present the surface may show the pill AND offer the controls; the two travel
   * together deliberately, so a console can never offer a fader over a state it was not
   * willing to state.
   */
  audio: {
    /** The recorded intent, or `undefined` when nobody has said. NEVER defaulted to `0`. */
    volume: number | undefined;
    /** §12.4 — seated, but the active look punches no hole in front of it. */
    held: boolean;
    /** How it reads. Derived HERE so every surface reading this row reads the same words. */
    pill: PlateAudioPill;
  } | null;
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
 * - `stack-delivery-pending` — 🔴 **the one a first cut of this file missed, and the one
 *   that matters most.** `useBridgeSnapshot`’s `ready` flag *“latches on the FIRST arrival
 *   and never clears”*, so after a reconnect it still reads `true` while the stack is `[]` —
 *   and a restarted bridge serves its FULL adopted ledger before the browser has
 *   re-delivered a single row (`B-092`). Read naively, **every seated layer would read
 *   STRANDED with RELEASE armed, in exactly the bridge-restart scenario `B-145` exists
 *   for.**
 *
 * ⭐ **AN EMPTY STACK IS NOT, BY ITSELF, BLINDNESS — owner decision, 2026-08-20.** The first
 * fix suppressed the alarm for EVERY empty stack, which traded a true positive for safety: an
 * operator who removed every row and stranded a producer got no warning. The owner asked for
 * the sharper distinction, and it turned out to be available rather than inferable. The
 * transport already tracks “a stack delivery is in flight” (`WebSocketRuntime`’s `#resyncing`,
 * set before the first await of a resync and cleared on every exit path); it simply never left
 * that class. It is now on the bridge contract as `link.resyncing()`, so:
 *
 * - empty **and delivery pending** → blind, no alarm, no control;
 * - empty **and settled** → that IS the answer, and a seated layer whose owner is absent from
 *   it is genuinely stranded. The alarm is restored for that case.
 *
 * 🔴 **This is an exposed FACT, not an inferred one, and the difference is the whole point.**
 * The rejected alternative was “retention says N rows, the bridge says 0” — a correlated
 * question, not this one, and it fails in both directions: a restore that THREW leaves
 * retention at N forever (false pending, alarm suppressed permanently), and a browser with
 * empty retention reconnecting to a restarted bridge reads “genuinely empty” while another
 * console is 200 ms from restoring exactly those rows. Arming a control that cuts a live guest
 * on a derived neighbour of the real fact is what `B-101` is about.
 *
 * ⚠ **THE RESIDUAL, stated rather than papered over.** This closes the SELF race completely.
 * It does not close the MULTI-BROWSER one: one bridge serves many browsers, and this browser
 * cannot know that another is about to restore the rows that would explain a layer. That is
 * genuinely undecidable from here and would need a bridge-side “every client has re-delivered”
 * fact, which does not exist. So a second console CAN still see a transient stranded verdict
 * during another console’s restore — the confirm dialog remains the last guard, and it names
 * the plate and producer for that reason.
 */
export type LiveLayerBlindness = 'link-down' | 'stack-not-arrived' | 'stack-delivery-pending';

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
  deliveryPending: boolean,
): LiveLayerBlindness | null {
  if (linkDown) return 'link-down';
  if (!stackReady) return 'stack-not-arrived';
  if (!stackHasRows && deliveryPending) return 'stack-delivery-pending';
  return null;
}

const BLIND_DETAIL: Record<LiveLayerBlindness, string> = {
  'link-down':
    'Not connected to the bridge — this is the last ledger it sent, and whether the layer is ' +
    'still seated cannot be checked.',
  'stack-not-arrived':
    'The stack has not arrived yet, so which row owns this layer is not known. It fills in as ' +
    'soon as the console answers.',
  'stack-delivery-pending':
    'The console is still receiving its rows, so which row owns this layer is not established ' +
    'yet. It resolves as soon as the delivery finishes.',
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
  /**
   * `add-multibox-audio` — the plate's recorded intent, INJECTED for `labelFor`'s reason: the
   * intent lives on the STACK ITEM and this module must stay free of the stack join, so a
   * test can build a raised plate without building a stack.
   */
  volumeOf: (itemId: string, plateId: string) => number | undefined = () => undefined,
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
      // Blind: the ledger is stale or the intent map has not arrived. See `audio`'s note —
      // SILENT is a claim, and this branch is the one that must not make one.
      audio: null,
    };
  }
  const volume = volumeOf(layer.itemId, layer.sourceId);
  const audio = { volume, held: layer.held, pill: plateAudioPill(volume, layer.held) };
  if (ownerLabel === null) {
    return {
      ...base,
      // No item owns this layer, so no item-scoped verb can reach its audio and there is no
      // intent map to read. RELEASE is the only thing that reaches a stranded layer.
      audio: null,
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
      // The RECORD is unconfirmed; the INTENT is not. `plateVolumes` is live stack state, and
      // arming a plate's audio before re-taking the row is exactly what an operator wants to
      // do here — so the strip is offered even though the layer's own state is a file claim.
      audio,
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
      audio,
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
    audio,
    headline: 'On screen',
    detail:
      `Seated for ${ownerLabel}. Repoint and off-air are that row's verbs; audio is on ` +
      `the strip below.`,
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
 *
 * `volumeOf` is injected for the same reason and answers the plate's recorded audio intent.
 */
export function liveLayerRows(
  layers: readonly LiveLayerState[],
  labelFor: (itemId: string) => string | null,
  blind: LiveLayerBlindness | null,
  volumeOf: (itemId: string, plateId: string) => number | undefined = () => undefined,
): LiveLayerRowView[] {
  return layers.map((l) => liveLayerRow(l, labelFor(l.itemId), blind, volumeOf));
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
 * `add-multibox-audio` — **THE PLATES ONE ITEM OWNS, which is the set SOLO silences and the
 * set PANIC zeroes.**
 *
 * Read off the SAME rows the panel renders, for `releaseScopeOf`'s reason one axis over: a
 * SOLO computed from a different set than the one on screen would silence a box the operator
 * cannot see and leave one they can. Deduplicated because a fill+key pair puts the same
 * `sourceId` on two ledger records.
 *
 * ⚠ It answers with the SEATED plates, not the template's declared ones. A plate with no
 * producer cannot be audible, and the bridge's pre-seat is the UNION of every look — so a
 * HELD plate is here and correctly receives a recorded-only `0`.
 */
export function seatedPlatesOf(rows: readonly LiveLayerRowView[], itemId: string): string[] {
  return [...new Set(rows.filter((r) => r.itemId === itemId).map((r) => r.plate))];
}

/**
 * `B-164` — **the same plates, WITH the two facts audibility needs.**
 *
 * {@link seatedPlatesOf} answers "which plates does this item own" and is exactly right for
 * SOLO and PANIC, which address a SET. The layer row's audio chip needs more than the set: it
 * has to separate the plates the active look SHOWS from the ones §12.4 is HOLDING, and it has
 * to know each plate's recorded intent. Read off the SAME `LiveLayerRowView`s for the reason
 * that function already gives — a chip computed from a different set than the one on screen is
 * how the row and the strips below it come to disagree.
 *
 * ⚠ **A row whose `audio` is `null` is DROPPED, and that is deliberate.** `audio` is null in
 * exactly the branches that must not make a claim: BLIND (the ledger is stale or the stack has
 * not arrived, so `liveLayerRow` refuses to say SILENT) and STRANDED (no item owns the layer,
 * so no intent map reaches it). Counting those rows would put a number on the chip that the
 * neighbouring surface has just declined to state. An item with no claimable row therefore
 * summarises to `null` and shows no chip — "I cannot tell" is not a fraction.
 *
 * Deduplication is left to {@link audioSummary}, which is where the fill+key pair is already
 * reasoned about; doing it in both places would be two rules for one fact.
 */
export function rowPlateAudioOf(
  rows: readonly LiveLayerRowView[],
  itemId: string,
): RowPlateAudio[] {
  return rows
    .filter((r) => r.itemId === itemId && r.audio !== null)
    .map((r) => ({
      plateId: r.plate,
      volume: r.audio?.volume,
      held: r.audio?.held ?? false,
    }));
}

/**
 * `add-multibox-audio` — the plate-intent lookup `liveLayerRows` takes, built from the stack.
 *
 * The mirror of {@link ownerLabelFor}: the join lives with the caller that can see the stack,
 * and the row module stays free of it. `undefined` for an item the stack does not carry, and
 * `undefined` for a plate nobody has spoken about — the latter is a REAL third state and is
 * never collapsed to `0` here (see `plateAudio.ts`).
 */
export function plateVolumeFor(
  items: readonly StackItemState[],
): (itemId: string, plateId: string) => number | undefined {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  return (itemId, plateId) => byId.get(itemId)?.plateVolumes?.[plateId];
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
