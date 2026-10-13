/**
 * `GUARDS-18` §1 — the typed surface of `../src/control-bytes-decision.mjs` (plain zero-dep
 * ESM, no build). The wildcard specifier lets the tests import the .mjs by relative path
 * while `tsc` checks every call against this contract; if the module's API drifts, update
 * BOTH files in the same change. Mirrors the `never-stage-decision.d.ts` convention.
 */
declare module '*control-bytes-decision.mjs' {
  /** A finding: a forbidden control byte, or a BOM at offset 0. */
  export type Offence =
    | { kind: 'control'; offset: number; byte: number; line: number }
    | { kind: 'bom'; offset: number; line: number };

  /** Extensions read as BINARY and skipped, lower-cased, without the dot. */
  export const BINARY_EXTENSIONS: Set<string>;
  /** Explicit, named exemptions — path → the reason it is allowed. Empty by design. */
  export const EXEMPT_PATHS: Map<string, string>;
  /** The UTF-8 byte-order mark. */
  export const BOM: readonly number[];

  /** C0 except TAB / LF / CR, plus DEL. */
  export function isForbiddenByte(byte: number): boolean;
  /** Is this path read as text? Extension-only — never the content. */
  export function isTextPath(filePath: string, binaryExtensions?: Set<string>): boolean;
  /** The escape a source file should have used for this byte. */
  export function escapeFor(byte: number): string;
  /** 1-based line number of a byte offset, counting LF. */
  export function lineOfOffset(bytes: Uint8Array, offset: number): number;
  /** The FIRST finding in a file's bytes, or `null`. */
  export function findFirstOffence(bytes: Uint8Array): Offence | null;
  /** One finding as the line the gate prints. */
  export function describeOffence(filePath: string, offence: Offence): string;
}
