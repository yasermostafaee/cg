/**
 * `P-025` — the typed surface of `../src/commit-msg-decision.mjs` (plain zero-dep ESM, no
 * build). The wildcard specifier lets the tests import the .mjs by relative path while `tsc`
 * checks every call against this contract; if the module's API drifts, update BOTH files in
 * the same change. Mirrors the `never-stage-decision.d.ts` convention.
 */
declare module '*commit-msg-decision.mjs' {
  /** Which byte-order mark `buffer` begins with, or `null`. */
  export function bomIn(buffer: Uint8Array): string | null;
  /** `{ ok: true }`, or `{ ok: false, mark }` naming the BOM found at the start. */
  export function commitMsgVerdict(
    buffer: Uint8Array | null | undefined,
  ): { ok: true } | { ok: false; mark: string };
}
