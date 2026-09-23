/**
 * 🔴 `CHANNEL-AUTHORITY-01` — **WHICH CHANNELS THIS STATION WRITES TO, and what a request is told
 * when it names one it does not.**
 *
 * Three facts about a channel live in three places, and exactly one of them decides where the
 * bridge writes:
 *
 * | Fact                                  | Who says it                   | What it decides              |
 * | ------------------------------------- | ----------------------------- | ---------------------------- |
 * | the channel EXISTS and has a NAME     | the Playout's catalogue (D4)  | labels, and the join key     |
 * | a principal MAY OPERATE it            | the grant (`cg_channels`)     | authorisation (`C-038`)      |
 * | THIS STATION OPERATES it              | the declared bank             | what we write to — only this |
 *
 * ⚠ **A grant is not a declaration, and a catalogue row is not one either.** The test Playout's
 * real `cg-op2` grant names channel 1 — the Playout's own live programme output — beside channel
 * 2. The grant is TRUE: that person may operate channel 1, from the Playout. It says nothing about
 * whether THIS station does, and a bridge that read it that way would put a graphic on somebody
 * else's output with a permission gate's blessing.
 */

/**
 * 🔴 **WHAT A REQUEST IS TOLD WHEN IT NAMES A CHANNEL THIS STATION DOES NOT OPERATE.**
 *
 * The refusal behind it is the same fact the restore door skips a row for — `not-declared`,
 * whose own doctrine names this hazard: re-homing such a row "would have meant putting a graphic
 * on somebody else's output". One reason in two shapes: a SKIP where a restore carries many rows
 * and must keep the rest, a REFUSAL where a request carries one coordinate.
 *
 * ⚠ **Not `authzChannelRefusal`, and the difference is the remedy.** That one tells a
 * signed-in operator their GRANT does not cover a channel, and a person can change that. This one
 * is true for every principal and with auth OFF: no grant makes this station operate a channel it
 * does not declare. An operator granted channel 1 and refused here must not be sent to ask for
 * channel 1 — they already have it.
 *
 * ⭐ The remedy names the case that actually produces it. The console never offers a channel the
 * station does not declare, so a console that sends one is working from an old picture of the
 * station — a tab left open against a different bridge was the 2026-09-22 incident — and a reload
 * gives it the current one. It NAMES THE CHANNEL (golden rule 11's ⭐ clause), says nothing was
 * sent (`R-006`), and is built once here so the bridge and any surface quoting it cannot drift
 * (`R-017`). It must not open like a skew message: `bridgeErrorFrom` rewrites those.
 */
export function channelNotDeclaredRefusal(channel: number): string {
  return (
    `This station does not operate channel ${String(channel)}, so that command was refused — ` +
    `nothing was sent to CasparCG. Reload this console to see the channels it operates.`
  );
}
