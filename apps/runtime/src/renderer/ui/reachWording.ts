/**
 * WHY a CasparCG-bound verb is refused, in the words the operator reads — and
 * the THREE-VALUED answer those words come from.
 *
 * ── WHY REACHABILITY IS NOT A BOOLEAN ──────────────────────────────────────
 *
 * `useConnections()` answers `null` until the bridge has replied once: during
 * boot, and again after every reconnect until health arrives. A boolean has to
 * fold that window into one of its two values, and folding it into "unreachable"
 * is what the gate did — so for the first moment of every page load the console
 * told the operator *"CasparCG cannot be reached"*, which is a claim about the
 * playout machine that nothing had yet said anything about.
 *
 * THE DISABLING IS RIGHT AND IS UNCHANGED. Unknown still fails closed — a verb
 * enabled on no evidence reports an error at the moment air needs it, while one
 * briefly disabled costs a second of waiting (B-094's rule pointed at controls
 * rather than labels: silence is not evidence of a working link). What changes is
 * only what the tooltip SAYS while we are waiting, because "we have not been told
 * yet" and "we have been told it is down" are different facts and the operator
 * acts on them differently: one is waited out, the other sends somebody to a
 * machine.
 *
 * The third value is therefore a WORDING distinction, never a permission one.
 * Anything deciding whether a command may go asks `reachable`; anything deciding
 * what to TELL the operator asks the whole state.
 *
 * ── AND WHY THE STRINGS LIVE HERE ──────────────────────────────────────────
 *
 * `layerRowActions`, `LayersPanel`, the Inspector, the orphan banner and the
 * playout tab all refuse on the same two conditions, and three of them had
 * already grown their own copy of the sentence. This is `airStateWording`'s rule
 * one surface along: safety text that more than one surface must say identically
 * lives in one leaf module, because a drifted second copy is how two controls come
 * to name two different faults for one cause.
 *
 * React-free on purpose, so the pure verb-list module can import it.
 */

/**
 * The three answers to "can a command reach CasparCG right now?".
 *
 * `connecting` is NOT a fourth kind of down. It is the absence of an answer, and
 * it is transient by construction: it ends within one bridge round trip.
 */
export type CasparReach = 'reachable' | 'unreachable' | 'connecting';

/** The nearer hop is down. It wins: with no bridge, CasparCG is not even knowable. */
export const BRIDGE_DOWN_REASON = 'Bridge disconnected — commands are refused until it reconnects.';

/** The bridge answered, and it cannot reach the playout server. */
export const CASPAR_UNREACHABLE_REASON =
  'CasparCG cannot be reached — this command would not arrive. It returns as soon as the playout server is back.';

/**
 * Nothing has answered yet.
 *
 * It names no fault, because none is known. The previous wording named one that
 * might not exist — and an operator who reads "CasparCG cannot be reached" on a
 * healthy plant learns to disbelieve the message that matters.
 */
export const CASPAR_CONNECTING_REASON =
  'Connecting… the bridge has not yet said whether CasparCG can be reached, so this command is held. It returns as soon as it answers.';

/**
 * The tooltip for a verb that needs CasparCG, naming the RIGHT hop.
 *
 * `linkDown` wins over everything: telling the operator "CasparCG cannot be
 * reached" while the BRIDGE is the thing that is down sends them to the wrong
 * machine, and with the bridge down CasparCG's state is not knowable anyway.
 *
 * Returns `undefined` when the verb is not refused for a reachability reason at
 * all, so a caller can spread it and leave its own tooltip in place.
 */
export function casparRefusalReason(linkDown: boolean, reach: CasparReach): string | undefined {
  if (linkDown) return BRIDGE_DOWN_REASON;
  if (reach === 'unreachable') return CASPAR_UNREACHABLE_REASON;
  if (reach === 'connecting') return CASPAR_CONNECTING_REASON;
  return undefined;
}
