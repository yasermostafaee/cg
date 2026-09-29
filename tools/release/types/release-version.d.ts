/**
 * `CLIENT-TEST-RELEASE-01` — the typed surface of `../src/release-version.mjs` (plain zero-dep ESM,
 * no build). The wildcard specifier lets the tests import the .mjs by relative path while `tsc`
 * checks every call against this contract; if the module's API drifts, update BOTH files together.
 */
declare module '*release-version.mjs' {
  export type VersionSourceKind = 'package-json' | 'tauri-conf' | 'cargo-toml' | 'cargo-lock';
  export interface VersionSource {
    readonly part: 'CG Control' | 'CG Designer' | 'the bridge';
    readonly file: string;
    readonly kind: VersionSourceKind;
    readonly crate?: string;
  }
  export const VERSION_SOURCES: readonly VersionSource[];
  export function isReleaseVersion(value: unknown): boolean;
  export function versionIn(text: string, source: VersionSource): string | null;
  export function readVersions(
    root: string,
  ): { readonly part: string; readonly file: string; readonly version: string | null }[];
  export function releaseVersion(root: string): string;
  export function tagRefusal(tag: string, version: string): string | null;
}
