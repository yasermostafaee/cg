/**
 * `P-025` — the commit-message BOM guard's PURE decision, separated from its CLI exactly as
 * `never-stage-decision.mjs` is from `never-stage-cli.mjs`.
 *
 * ── WHY A MECHANISM AND NOT A RULE ─────────────────────────────────────────
 *
 * `P-025` is the class where PowerShell hands back something other than what was typed, and
 * every instance of it is discovered DOWNSTREAM, after a decision has been made on the bad
 * value — *nothing errors at the moment the damage is done*. A byte-order mark on a commit
 * message is the smallest and most persistent member of that class: PowerShell 5.1's
 * `Out-File`/`Set-Content -Encoding utf8` and `>` all prepend `EF BB BF`, git stores the
 * message verbatim, and the subject then renders as `<U+FEFF>docs(runtime): …` — a zero-width
 * character sitting in front of the conventional-commit type, forever, in shared history.
 *
 * ⚠ **That mark is written `<U+FEFF>` here, and everywhere else in this module, ON PURPOSE.**
 * Golden rule 9's clause about NUL bytes generalises: a file that TALKS about an invisible
 * byte must not CONTAIN one. A literal `U+FEFF` in a comment is `no-irregular-whitespace` at
 * best and an invisible edit to the next reader at worst — and the lint rule caught exactly
 * that in this file's first draft, which is the reason this paragraph exists.
 *
 * It has bitten three times. Nothing in the repo parses commit subjects, so the cost of each
 * one is small; the cost of REMOVING one after the fact is not, because it means rewriting
 * pushed history. That asymmetry — cheap to prevent, expensive to undo — is exactly what a
 * hook is for, and it is why this refuses at `commit-msg` rather than reporting later.
 *
 * ⚠ **This guard is about the FIRST BYTES OF THE MESSAGE, and nothing else.** A BOM anywhere
 * later in the text is a different thing (a paste, a quoted file) and is not this defect; a
 * message that merely contains non-ASCII is fine and always was — this repo's commits carry
 * em-dashes and Persian by design.
 */

/** The three byte-order marks a shell can realistically prepend, longest first. */
const MARKS = [
  { bytes: [0xef, 0xbb, 0xbf], name: 'UTF-8' },
  { bytes: [0xff, 0xfe], name: 'UTF-16 LE' },
  { bytes: [0xfe, 0xff], name: 'UTF-16 BE' },
];

/**
 * Does `buffer` — the raw bytes of `.git/COMMIT_EDITMSG` — begin with a byte-order mark?
 *
 * Returns the mark's name, or `null`. Takes BYTES rather than a string on purpose: reading
 * the file as UTF-8 text first is what makes a BOM invisible (Node decodes it to a single
 * `U+FEFF`, and several string APIs then trim it away), which is the same disappearing act
 * that let three of these reach `dev`.
 */
export function bomIn(buffer) {
  for (const mark of MARKS) {
    if (mark.bytes.every((byte, i) => buffer[i] === byte)) return mark.name;
  }
  return null;
}

/**
 * The whole decision: `{ ok: true }`, or `{ ok: false, mark }` naming which BOM was found.
 *
 * Anything that is not a Buffer/Uint8Array passes — the CLI around this fails OPEN on a
 * message it cannot read, because a guard that blocks every commit when its own input is
 * unreadable is worse than the defect it guards.
 */
export function commitMsgVerdict(buffer) {
  if (buffer === null || buffer === undefined || typeof buffer.length !== 'number') {
    return { ok: true };
  }
  const mark = bomIn(buffer);
  return mark === null ? { ok: true } : { ok: false, mark };
}
