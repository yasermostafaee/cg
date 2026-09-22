import type { SignInFailure } from '../../../platform/playoutSession.js';

/**
 * 🔴 `R-066` — **WHAT THE SIGN-IN SAYS WHEN IT DID NOT WORK. Five sentences, and no sixth.**
 *
 * ── WHY THE CONSOLE WRITES THEM AND NOT THE PLAYOUT ─────────────────────────
 *
 * The contract says so itself (§4.6): `error` is a stable snake_case CODE and `message` is
 * free text that is _"never shown verbatim on air surfaces — CG Control maps `error` to its
 * own sentence"_. A sentence written by another team, in another product's voice, rendered
 * unread onto a gallery console at 21:00 is exactly the surface text this repo refuses; and a
 * code shown raw is worse, because `no_cg_access` tells the one person who cannot fix it
 * nothing they can act on.
 *
 * ── WHY THEY ARE IN PERSIAN ─────────────────────────────────────────────────
 *
 * ⚠ This is the console's FIRST Persian chrome — every other surface is English and the
 * Persian in the tree is operator DATA (row names, template names) and comments quoting the
 * owner. It is deliberate and it is scoped to this surface: the sign-in is the one screen an
 * operator meets before they have done anything, in their own language, and `R-066` asks for
 * it in as many words. Nothing else in the console is touched.
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
  invalid_credentials: 'نام کاربری یا گذرواژه درست نیست.',
  /**
   * `403` — a real account with no CG grant. Named apart from a wrong password because the
   * remedies are opposite: retyping will never help, and the operator needs to know that
   * rather than trying five more times. (The ADR's `cg-noch` fixture is this case.)
   */
  no_cg_access: 'این حساب اجازهٔ دسترسی به CG Control را ندارد.',
  /** `423` — locked on the Playout side. */
  account_locked: 'این حساب قفل شده است.',
  /** `429` — too many failed attempts. The remedy is time, so the sentence says time. */
  rate_limited: 'تلاش‌های ناموفق زیاد بوده است؛ کمی بعد دوباره تلاش کنید.',
  /**
   * 🔴 No HTTP answer at all — and it NAMES THE PLAYOUT, which is the whole point of keeping
   * it apart from the four above. "Wrong password" and "the Playout is not answering" send
   * the operator to two different places, and a flattened sentence sends half of them to the
   * wrong one.
   */
  unreachable: 'پلی‌اوت پاسخ نمی‌دهد.',
  /**
   * The refresh path's own `401`. It cannot normally reach the sign-in form — it is raised by
   * a background refresh — and it is mapped rather than left to the fallback so that a console
   * which does surface it says something true instead of "unknown".
   */
  invalid_refresh_token: 'این نشست دیگر معتبر نیست؛ دوباره وارد شوید.',
  /**
   * Anything else: a shape the contract does not define, a proxy page, a 500.
   *
   * ⚠ It says the sign-in did not happen and names NO mechanism. Naming the wrong mechanism
   * is worse than naming none, because a wrong name gets acted on — the `errorCodeMessage`
   * lesson, one surface over.
   */
  unexpected: 'ورود انجام نشد.',
};

/** The sentence for a failure code. Total by construction — the record is keyed by the union. */
export function signInMessage(code: SignInFailure): string {
  return MESSAGES[code];
}
