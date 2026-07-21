/**
 * P-010 — the PURE decision logic behind `.husky/pre-push`: does THIS push carry any
 * content for the gate to prove something about?
 *
 * git feeds a pre-push hook one line per ref on STDIN:
 *
 *     <local ref> <local oid> <remote ref> <remote oid>
 *
 * and for a DELETION it writes the literal local ref `(delete)` with an all-zero local
 * oid (git's own sample hook keys off exactly that zero oid). A deletion pushes no
 * commits, so running the gate on it proves nothing about the push — the gate inspects
 * the WORKING TREE, which a deletion never touches — while still consuming this host's
 * one exclusive gate slot for ~2 minutes.
 *
 * This narrows WHEN the gate runs. It never changes WHAT the gate checks, and it is
 * deliberately fail-closed: anything not recognized as an all-deletions push gates.
 * There is intentionally no env-var bypass and no `--no-verify` convenience wrapper —
 * while Actions billing is out, this hook is the only enforcement mechanism there is.
 *
 * Zero dependencies, plain ESM, NO build step — same contract as `gate-decision.mjs`:
 * the hook's CLI imports it by relative path, so it works on a fresh clone from
 * PowerShell, Git Bash, or WSL alike.
 */

/** A git object id: sha1 (40 hex) or sha256 (64 hex). */
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The all-zero oid git writes for the local side of a deletion. */
const ZERO_OID = /^(?:0{40}|0{64})$/;

/** The literal local ref git pairs with that zero oid (`remote.c: alloc_delete_ref`). */
const DELETE_REF = '(delete)';

/**
 * Parse ONE pre-push stdin line into a ref, or `null` if it is not a line this guard
 * recognizes with certainty.
 *
 * `null` means "unrecognized", NOT "not a deletion" — every caller must treat it as a
 * reason to gate. The two halves of a deletion (the `(delete)` ref and the zero oid)
 * must agree; a line carrying only one of them is a shape we do not understand, so it
 * gates rather than being guessed at.
 *
 * @param {string} line one raw stdin line
 * @returns {{ localRef: string, localOid: string, remoteRef: string, remoteOid: string,
 *             isDeletion: boolean } | null}
 */
export function parsePrePushRef(line) {
  const fields = String(line ?? '')
    .trim()
    .split(/\s+/)
    .filter((f) => f.length > 0);
  if (fields.length !== 4) return null;

  const [localRef, localOid, remoteRef, remoteOid] = fields;
  if (!OID.test(localOid) || !OID.test(remoteOid)) return null;
  if (!remoteRef.startsWith('refs/')) return null;

  const zeroed = ZERO_OID.test(localOid);
  const named = localRef === DELETE_REF;
  if (zeroed !== named) return null; // half a deletion — unrecognized, so gate.

  return { localRef, localOid, remoteRef, remoteOid, isDeletion: zeroed };
}

/**
 * Is EVERY ref in this push a deletion? Pure: stdin text in, boolean out — no git calls,
 * no filesystem, no environment.
 *
 * `true` only for a push whose every line parses AND is a deletion. Everything else is
 * `false` (= run the gate), including:
 *  - empty stdin — some invocations pass nothing, and unknown must mean "gate it";
 *  - a MIXED push (any real update alongside deletions) — that update carries content;
 *  - any malformed or unrecognized line.
 *
 * @param {string | null | undefined} stdinText the hook's entire stdin
 * @returns {boolean} true ⇒ safe to skip the gate
 */
export function isDeletionOnlyPush(stdinText) {
  const lines = String(stdinText ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return false;

  const refs = lines.map(parsePrePushRef);
  if (refs.some((ref) => ref === null)) return false;
  return refs.every((ref) => ref.isDeletion);
}
