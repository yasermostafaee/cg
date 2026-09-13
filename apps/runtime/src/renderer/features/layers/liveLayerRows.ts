import type { LiveLayerState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors, cssVars } from '../../theme.js';
import { shortId } from '../../ui/operatorNaming.js';
import {
  UNSEATED_PILL,
  plateAudioPill,
  type PlateAudioPill,
  type RowPlateAudio,
} from './plateAudio.js';

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
  /**
   * The coordinate as an operator reads it on a CasparCG channel: `1-10` — or `null` for a
   * DECLARED FRAME the bridge has not seated (see {@link declaredFrameRows}).
   *
   * 🔴 **NULLABLE SINCE `PLATES-AUDIO-11` §2, AND THE NULL IS LOAD-BEARING.** Every verb whose
   * scope is a set of LAYERS — the release confirm, its accessible name, the chip's
   * denominator — must exclude these rows, because there is no layer behind them. The
   * compiler finds those sites; a sentinel string like `—` would not have.
   */
  coordinate: string | null;
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
   * How the operator names the owning ROW, or `null` when the owner is not known —
   * whether because the stack cannot bear witness (see {@link LiveLayerBlindness}) or
   * because it genuinely does not carry that item. Only the SECOND is stranding, and
   * {@link releasable} is what distinguishes them.
   *
   * 🔴 **THE ROW, NOT THE COMPOSITION — `PLATES-AUDIO-11` §1.** This carried the TEMPLATE's
   * name and the cell read `Seated for comp1`. Nobody on a gallery floor knows `comp1`; the
   * row is «سه قاب» / `Bed 1`, which is what the reference's own `.plate-owner-link` renders
   * (measured on `07-live-plates.html`: `Bed 1`). Golden rule 11 — the operator's words in the
   * sentence, the internal name behind a `title`, which is {@link ownerDetail}.
   */
  ownerLabel: string | null;
  /**
   * The composition (template) name and any id the surface should keep on a `title` —
   * RELOCATED, never deleted (golden rule 11's own note). `null` when nothing is known.
   */
  ownerDetail: string | null;
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
   * `RUNTIME-REDESIGN-01` Phase 6 — is this the ORDINARY disposition (on screen, owned,
   * confirmed), whose sentence says nothing the row's other cells do not? `false` for every
   * other case — blind, stranded, adopted, held — whose sentence is an alarm or a caveat and
   * stays visible on the surface. Decided HERE with the words, not by a surface comparing
   * headlines.
   */
  plain: boolean;
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
 * `PLATES-AUDIO-11` §1 — **WHO OWNS THIS LAYER, IN TWO PARTS, because golden rule 11 needs
 * both and puts them in different places.**
 *
 * The ROW's name goes in the sentence the operator reads; the composition and the ids go on a
 * `title`. They travel together so a surface cannot render one without having the other to
 * hand — which is how the id ends up in the sentence.
 */
export interface LiveLayerOwner {
  /** The ROW, in the operator's words — `Bed 1`, «سه قاب». Never empty. */
  row: string;
  /** The composition name and any id, for a `title`. `null` when nothing else is known. */
  detail: string | null;
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
  owner: LiveLayerOwner | null,
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
      ownerDetail: null,
      releasable: false,
      needsAttention: false,
      tone: colors.textMuted,
      plain: false,
      // Blind: the ledger is stale or the intent map has not arrived. See `audio`'s note —
      // SILENT is a claim, and this branch is the one that must not make one.
      audio: null,
    };
  }
  const volume = volumeOf(layer.itemId, layer.sourceId);
  const audio = { volume, held: layer.held, pill: plateAudioPill(volume, layer.held) };
  if (owner === null) {
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
      ownerDetail: null,
      releasable: true,
      needsAttention: true,
      tone: colors.pending,
      plain: false,
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
        `Seated for ${owner.row} according to the bridge’s saved ledger, read back after a ` +
        `restart. Nothing has confirmed the layer is still lit${
          layer.held ? ', and the current look does not show it' : ''
        }. Taking the row again re-seats it and confirms it.`,
      ownerLabel: owner.row,
      ownerDetail: owner.detail,
      releasable: false,
      needsAttention: false,
      tone: colors.textMuted,
      plain: false,
    };
  }
  if (layer.held) {
    return {
      ...base,
      audio,
      headline: 'Held — not in the current look',
      detail:
        `Seated for ${owner.row}, muted and with no hole in front of it. It is kept rather ` +
        `than torn down so returning to a look that shows it needs no fresh producer.`,
      ownerLabel: owner.row,
      ownerDetail: owner.detail,
      releasable: false,
      needsAttention: false,
      /*
        🔴 `PLATES-AUDIO-11` §3 — AMBER, and the COLOUR block at the head of this file is
        annotated for it rather than rewritten. `held` still is not a fault; the owner's
        reversal is that it is the state most often MISREAD as one, so it is the state that
        must catch the eye. One token with the audio pill's `HELD_TONE`, so the Picture cell
        and the Audio cell of the same row cannot disagree about how loud `held` reads.
      */
      tone: cssVars['--r-caution-text'],
      plain: false,
    };
  }
  return {
    ...base,
    audio,
    headline: 'On screen',
    detail:
      `Seated for ${owner.row}. Repoint and off-air are that row's verbs; audio is on ` +
      `this row.`,
    ownerLabel: owner.row,
    ownerDetail: owner.detail,
    releasable: false,
    needsAttention: false,
    tone: colors.text,
    plain: true,
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
  ownerOf: (itemId: string) => LiveLayerOwner | null,
  blind: LiveLayerBlindness | null,
  volumeOf: (itemId: string, plateId: string) => number | undefined = () => undefined,
): LiveLayerRowView[] {
  return layers.map((l) => liveLayerRow(l, ownerOf(l.itemId), blind, volumeOf));
}

/**
 * 🔴 `PLATES-AUDIO-11` §2 — **THE FRAMES A ROW DECLARES THAT THE LEDGER HAS NOT SEATED.**
 *
 * ── THE ESTABLISH ANSWER, WHICH IS WHY THIS FUNCTION EXISTS ─────────────────
 *
 * The TAB and the audio MODAL ask two different questions, and until now only the modal asked
 * the one the operator needs:
 *
 *   - the TAB lists the bridge's LEDGER — one row per layer it has SEATED;
 *   - the MODAL lists the template's DECLARED plates ∪ the seated ones, so a frame with no
 *     producer still gets a fader (the arm-before-the-take affordance).
 *
 * Both are defensible for their own surface, and the reference splits them exactly the same
 * way (measured: `renderPlateRows` iterates `livePlateSeats`, `audioPlates` iterates
 * `templatePlateIds` and joins the seat). **It is still the defect**, because the recorded
 * constraint is that EVERY FRAME STAYS REACHABLE, HIDDEN ONES INCLUDED — and the union
 * pre-seat does not always make that true.
 *
 * ⚠ **THE EVIDENCE THAT IT DOES NOT, from this repo's own measurement.** `B-164`'s table —
 * one row, one template declaring three plates, three looks — reads `audio 1/2` on look 1 and
 * `audio 1/3` on look 2, and its denominator counted SEATS. Two seats on look 1, three on
 * look 2: the ledger GROWS as looks are entered. So on look 1 the tab could show two rows for
 * a three-frame row, and the third frame's audio was reachable only by opening the dialog.
 * That is the owner's screenshot, and it is a frame whose guest cannot be pulled down from the
 * surface that carries the faders.
 *
 * ── WHAT IS ADDED, AND WHAT DELIBERATELY IS NOT ────────────────────────────
 *
 * Only frames of an item that ALREADY OWNS A SEAT. The tab stays a view of rows that own
 * layers: a row that has never been taken puts nothing here, because its every frame is
 * unseated and the tab would become a second copy of the stack. A row that owns one seat is
 * already ON this surface, and its other frames are what the operator came here for.
 *
 * ⚠ A blind or stranded row contributes NOTHING. Blind means the console cannot say what is
 * seated, so it certainly cannot say what is missing; stranded means no item owns the layer,
 * so there is no declaration to read. Both already refuse to state audio, and inventing a
 * declared-frame row for them would be the claim they just declined to make.
 *
 * `declaredPlatesOf` is injected for {@link plateVolumeFor}'s reason: the template registry
 * lives with the caller.
 */
export function declaredFrameRows(
  rows: readonly LiveLayerRowView[],
  declaredPlatesOf: (itemId: string) => readonly string[],
  volumeOf: (itemId: string, plateId: string) => number | undefined = () => undefined,
): LiveLayerRowView[] {
  const extra: LiveLayerRowView[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    // Only a row the console can speak for, and only once per item.
    if (row.audio === null || row.ownerLabel === null || seen.has(row.itemId)) continue;
    seen.add(row.itemId);
    const seated = new Set(rows.filter((r) => r.itemId === row.itemId).map((r) => r.plate));
    for (const plateId of declaredPlatesOf(row.itemId)) {
      if (seated.has(plateId)) continue;
      seated.add(plateId);
      const volume = volumeOf(row.itemId, plateId);
      extra.push({
        coordinate: null,
        plate: plateId,
        // No producer: that IS the state. An empty string, never a word that looks like one.
        producer: '',
        itemId: row.itemId,
        headline: 'Not seated',
        detail:
          `This row's template declares this frame and the bridge holds no layer for it, so ` +
          `nothing is on air for it and nothing is sent by a change here. The volume is ` +
          `recorded now and applied when a look that uses this frame seats it.`,
        ownerLabel: row.ownerLabel,
        ownerDetail: row.ownerDetail,
        releasable: false,
        // Nothing is wrong: an unentered look's frame is the ordinary state of a live row.
        needsAttention: false,
        tone: colors.textMuted,
        // Its sentence says what no other cell on the row does, so it stays visible.
        plain: false,
        // `held: false` — a frame with no seat is not HELD; §12.4's hold is a property of a
        // producer that exists. `UNSEATED_PILL` is the word, through `plateAudioPill`'s
        // sibling rather than a fourth state (see `plateAudio.ts`).
        audio: { volume, held: false, pill: UNSEATED_PILL },
      });
    }
  }
  return extra;
}

/**
 * 🔴 **WHAT AN EMPTY LIST MEANS — and why it may not just say "nothing is seated".**
 *
 * ⚠ All three headlines below say LIVE PLATE, not "live source", since the owner's rename of
 * 2026-09-12. They are this tab's own account of itself and they sit under its heading; the
 * CATALOGUE keeps the other name, in Station setup. The uppercase sweep for `LIVE SOURCES`
 * walked straight past them because they are sentence case — golden rule 9's own warning about
 * a case-sensitive sweep, met on the next surface along.
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
        'Whether any live plate is seated cannot be checked from here. This is not a report ' +
        'that nothing is on air.',
      known: false,
    };
  }
  if (!ledgerReady) {
    return {
      headline: 'The live-plate list has not arrived yet.',
      detail: 'It fills in as soon as the bridge answers. This is not an empty list.',
      known: false,
    };
  }
  return {
    headline: 'The bridge has no live plates seated.',
    detail: 'Layers appear here when a row whose template declares live plates goes on air.',
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
): (LiveLayerRowView & { coordinate: string })[] {
  /*
    ⚠ `coordinate !== null` since `PLATES-AUDIO-11` §2 — a DECLARED FRAME is not a layer, so
    it is not in a release's scope and must not be named in the confirm. Without this the
    dialog would count a frame nothing is on and promise to clear it.
  */
  return rows.filter(
    (r): r is LiveLayerRowView & { coordinate: string } =>
      r.itemId === itemId && r.coordinate !== null,
  );
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
 * 🔴 **RENAMED FROM `seatedPlatesOf` BY `PLATES-AUDIO-11` §2, AND THE RENAME IS THE POINT.**
 *
 * It answered with the SEATED plates because the rows it reads were all seats. §2 added the
 * DECLARED frames the ledger has not seated ({@link declaredFrameRows}), so this same filter
 * now returns those too — silently, under a name that said otherwise. That is golden rule 6's
 * exact failure: a predicate whose NAME stopped describing what it tests.
 *
 * ⚠ **AND WIDENING IT IS CORRECT, not merely unavoidable.** This set is what SOLO addresses,
 * and SOLO's promise is *"this plate and NONE of its siblings, including the frames the
 * current look hides"*. A declared frame carrying a recorded gain is a sibling that can
 * become audible the moment a look seats it, so leaving it out would make the tab's SOLO
 * narrower than the dialog's — which already addresses declared ∪ seated. One set, two
 * surfaces. The bridge records an intent for an unseated plate and sends nothing, which is
 * the same configuration-verb door the dialog uses (golden rule 10).
 *
 * ⚠ Still NOT the fraction: audibility's denominator is {@link rowPlateAudioOf}, which stays
 * seated-only. `B-164` is about that number and nothing here changes it.
 */
export function rowPlatesOf(rows: readonly LiveLayerRowView[], itemId: string): string[] {
  return [...new Set(rows.filter((r) => r.itemId === itemId).map((r) => r.plate))];
}

/**
 * `B-164` — **the same plates, WITH the two facts audibility needs.**
 *
 * {@link rowPlatesOf} answers "which plates does this item own" and is exactly right for
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
  return (
    rows
      /*
        ⚠ `coordinate !== null` since `PLATES-AUDIO-11` §2 — `RowPlateAudio` means A SEAT, and
        both its consumers depend on that. `B-164` is entirely about the row chip's
        denominator, and the audio dialog's `seatedPlates` prop is named for what it carries:
        letting a declared-but-unseated frame in here would put a plate with no producer into
        the fraction `B-164` had just finished narrowing.
      */
      .filter((r) => r.itemId === itemId && r.audio !== null && r.coordinate !== null)
      .map((r) => ({
        plateId: r.plate,
        volume: r.audio?.volume,
        held: r.audio?.held ?? false,
        ...(r.coordinate !== null && { coordinate: r.coordinate }),
      }))
  );
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
 * 🔴 **`PLATES-AUDIO-11` §1 — THE ROW, NOT THE COMPOSITION. THIS IS WHERE IT WAS WRONG.**
 *
 * The label used to be the TEMPLATE's name, so the Owner cell read `Seated for comp1` — a
 * COMPOSITION nobody on a gallery floor knows, in the sentence the operator reads under
 * pressure. That is golden rule 11's defect in its plainest form, and the reference does not
 * do it: its `.plate-owner-link` renders `Bed 1`, the ROW.
 *
 * ── WHERE THE ROW NAME COMES FROM, AND THE FALLBACK ORDER ──────────────────
 *
 * `rowName(itemId)` is injected, for {@link plateVolumeFor}'s reason — the bank and the
 * registry live with the caller. Its resolution is the app's ONE composition
 * (`ui/operatorNaming.ts`): the bank's configured ALIAS for the layer this item sits on, else
 * the bank's default (`Layer N` / `Bed N`), and `null` when there is no slot to name at all.
 *
 * ⚠ **AND WHEN THERE IS NO ROW NAME, THE ANSWER IS AN ID — NOT A WORD THAT READS LIKE A
 * NAME.** The order is: the row's name, else the composition's name, else {@link shortId} of
 * the item. `Unknown row` was considered and rejected twice over: it is indistinguishable
 * across two different unnamed rows, and it is indistinguishable from the STRANDED verdict
 * this function's `null` exists to carry. An id is ugly and it is a handle; a friendly
 * placeholder is neither.
 *
 * The composition goes to {@link LiveLayerRowView.ownerDetail}, which the surface puts on a
 * `title` — relocated, not deleted.
 */
export function ownerLabelFor(
  items: readonly StackItemState[],
  templateName: (templateId: string) => string | undefined,
  rowName: (itemId: string) => string | null = () => null,
): (itemId: string) => LiveLayerOwner | null {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  return (itemId) => {
    const item = byId.get(itemId);
    if (item === undefined) return null;
    const composition = templateName(item.templateId) ?? null;
    const row = rowName(itemId) ?? composition ?? shortId(itemId);
    // The composition is a SECOND statement when it is already the visible name — say it once.
    return { row, detail: composition === null || composition === row ? null : composition };
  };
}
