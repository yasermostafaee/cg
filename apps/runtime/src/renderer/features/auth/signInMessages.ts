import type { SignInFailure } from '../../../platform/playoutSession.js';

/**
 * 🔴 `R-066` — **WHAT THE SIGN-IN SAYS WHEN IT DID NOT WORK. Seven sentences, and no eighth.**
 *
 * ── WHY THE CONSOLE WRITES THEM AND NOT THE PLAYOUT ─────────────────────────
 *
 * The contract says so itself (§4.6): `error` is a stable snake_case CODE and `message` is
 * free text that is _"never shown verbatim on air surfaces — CG Control maps `error` to its
 * own sentence"_. A sentence written by another team, in another product's voice, rendered
 * unread onto a gallery console at 21:00 is exactly the surface text this repo refuses; and a
 * code shown raw is worse, because `no_cg_access` tells the one person who cannot fix it
 * nothing they can act on. The Playout's own answer is kept for the RECORD instead — the
 * bridge's log, `playoutSession.ts`'s `detail`.
 *
 * ── WHY THEY ARE IN ENGLISH ─────────────────────────────────────────────────
 *
 * 🔴 `DELTA-MULTI-CHANNEL-01-B` B3 — **ONE INTERFACE LANGUAGE.** `R-066` made these the console's
 * first Persian chrome; the owner, 2026-09-26, met "پلی‌اوت پاسخ نمی‌دهد." under a Password field
 * on an English first-run screen and ruled: the interface and every message of ours are English,
 * and Persian appears only in names that come from the Playout. So these are English, in the
 * house grammar (`design.md` §29: a message is attention, never red).
 *
 * ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
 *
 * No advice, no explanation of how sign-in works, no instruction to call anybody. Each line
 * states what happened, and where the operator has a remedy it names the remedy and stops.
 * The design system's rule for an operator surface: labels, values, state facts and refusal
 * sentences — nothing else.
 */
const MESSAGES: Readonly<Record<SignInFailure, string>> = {
  /** `401` — the pair did not match. The one an operator can fix by trying again. */
  invalid_credentials: 'The username or password is wrong.',
  /**
   * `403` — a real account with no CG grant. Named apart from a wrong password because the
   * remedies are opposite: retyping will never help, and the operator needs to know that
   * rather than trying five more times. (The ADR's `cg-noch` fixture is this case.)
   */
  no_cg_access: 'This account has no access to CG Control.',
  /** `423` — locked on the Playout side. */
  account_locked: 'This account is locked.',
  /** `429` — too many failed attempts. The remedy is time, so the sentence says time. */
  rate_limited: 'Too many failed attempts. Try again in a few minutes.',
  /**
   * 🔴 No HTTP answer at all — and it NAMES THE PLAYOUT, which is the whole point of keeping
   * it apart from the four above. "Wrong password" and "the Playout is not answering" send
   * the operator to two different places, and a flattened sentence sends half of them to the
   * wrong one. (`DELTA-MULTI-CHANNEL-01-B` B2: where a connection check is on screen, the check's
   * own line says this instead, under the address — never under a field.)
   */
  unreachable: 'The Playout does not answer.',
  /**
   * The refresh path's own `401`. It cannot normally reach the sign-in form — it is raised by
   * a background refresh — and it is mapped rather than left to the fallback so that a console
   * which does surface it says something true instead of "unknown".
   */
  invalid_refresh_token: 'This session is no longer valid. Sign in again.',
  /**
   * Anything else: a shape the contract does not define, a proxy page, a 500.
   *
   * ⚠ It says the sign-in did not happen and names NO mechanism. Naming the wrong mechanism
   * is worse than naming none, because a wrong name gets acted on — the `errorCodeMessage`
   * lesson, one surface over.
   */
  unexpected: 'The sign-in did not go through.',
};

/** The sentence for a failure code. Total by construction — the record is keyed by the union. */
export function signInMessage(code: SignInFailure): string {
  return MESSAGES[code];
}

/**
 * `DELTA-MULTI-CHANNEL-01-B` B2 — **ONLY A WRONG USERNAME OR PASSWORD MARKS A FIELD.** Every
 * other failure is about the account, the Playout or the attempt, and a red field would send the
 * operator to retype something that was never wrong.
 */
export function signInMarksField(code: SignInFailure): boolean {
  return code === 'invalid_credentials';
}
