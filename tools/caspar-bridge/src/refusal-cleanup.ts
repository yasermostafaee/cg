/**
 * 🔴 `FIELD-FIXES-01-A` — **THE RULE UNDER BOTH TAKE DECISIONS: A REFUSED `PLAY` NEVER CLEARS A
 * WORKING PICTURE.**
 *
 * ── WHAT CASPARCG DOES, READ FROM ITS SOURCE ────────────────────────────────────
 *
 * On a refused `PLAY` the server leaves the layer exactly as it was. `play_command` calls
 * `loadbg_command`, which BUILDS the producer before `stage->load` is reached; a `DECKLINK` device
 * that is absent or busy throws out of that build (`get_device`, `create_iterator`), so the layer
 * is never touched and the old producer keeps playing (2.5.0-stable `AMCPCommandsImpl.cpp`,
 * `frame_producer_registry.cpp`). Measured the other way round on the plant by `B-177`: a re-`PLAY`
 * refused over a live input left that input live.
 *
 * So every clean-up the bridge sends after a refusal is a decision of OURS — and before this module
 * three sites each made it differently. The take's rollback cleared every layer it had touched,
 * INCLUDING the layer whose `PLAY` had just been refused; on a re-take of a row already on air that
 * `CLEAR` was what took a working studio picture off air (`FIELD-FIXES-01` §0.5, replayed).
 *
 * ── THE ONE ANSWER ─────────────────────────────────────────────────────────────
 *
 * After a refused operation a layer is cleared ONLY IF this same operation put a producer on it,
 * and NEVER if a producer of ours was on it before the operation began. Three outcomes, read from
 * the reply rather than assumed:
 *
 *   - `landed`  — acknowledged: this operation put a producer on the layer. It may be cleared.
 *   - `refused` — the server ANSWERED 4xx: the layer is as it was, so there is nothing of this
 *                 operation's to clear and a `CLEAR` could only destroy something that was there.
 *   - `unknown` — no usable answer (a timeout, a dead socket, a 5xx raised mid-execution): a
 *                 producer MAY be there, unmasked. It may be cleared — but, like `landed`, never
 *                 on a layer that held one of ours before, whose picture may still be the old one.
 *
 * Every site that cleans up after a refusal — the take's rollback, the dropped preset, the
 * live/switch teardown of the failed plate, and the page a refused take added — asks
 * {@link mayClearAfterRefusal} and nothing else.
 */
export type SeatOutcome = 'landed' | 'refused' | 'unknown';

export interface RefusalSeat {
  /** What the reply said about THIS operation's producer on the layer. */
  readonly outcome: SeatOutcome;
  /** A producer of ours was on this layer before the operation began (the ledger said so). */
  readonly heldBefore: boolean;
}

/** May this layer be cleared now that the operation that touched it was refused? */
export function mayClearAfterRefusal(seat: RefusalSeat): boolean {
  if (seat.heldBefore) return false;
  return seat.outcome !== 'refused';
}

/**
 * The outcome one `#send` result describes. `amcp-4NN` is a reply that ARRIVED and refused
 * (`AMCPCommandQueue.cpp` answers `4NN <COMMAND> FAILED` before anything is changed); every other
 * failure — `amcp-timeout`, `amcp-send-failed`, `amcp-5NN` — leaves the layer's state unknown.
 */
export function outcomeOf(sent: {
  readonly ok: boolean;
  readonly errorCode?: string;
}): SeatOutcome {
  if (sent.ok) return 'landed';
  return /^amcp-4\d\d$/.test(sent.errorCode ?? '') ? 'refused' : 'unknown';
}
