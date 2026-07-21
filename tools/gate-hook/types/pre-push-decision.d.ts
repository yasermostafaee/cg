/**
 * P-010 — the typed surface of `../src/pre-push-decision.mjs` (plain zero-dep ESM, no
 * build). The wildcard specifier lets the tests import the .mjs by relative path
 * while `tsc` checks every call against this contract; if the module's API drifts,
 * update BOTH files in the same change.
 */
declare module '*pre-push-decision.mjs' {
  export interface PrePushRef {
    localRef: string;
    localOid: string;
    remoteRef: string;
    remoteOid: string;
    isDeletion: boolean;
  }
  export function parsePrePushRef(line: string): PrePushRef | null;
  export function isDeletionOnlyPush(stdinText: string | null | undefined): boolean;
}
