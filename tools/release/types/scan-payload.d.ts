/**
 * `CLIENT-TEST-RELEASE-01` — the typed surface of `../src/scan-payload.mjs` (plain zero-dep ESM, no
 * build). Update both files together.
 */
declare module '*scan-payload.mjs' {
  export interface Finding {
    readonly kind:
      | 'private address'
      | 'test secret'
      | 'token'
      | 'dev-only code'
      | 'missing folder'
      | 'missing file';
    readonly value: string;
    readonly line: number;
  }
  export const TEXT_EXTENSIONS: ReadonlySet<string>;
  export const TEST_SECRETS: readonly string[];
  export const DEV_ONLY_MARKERS: readonly { readonly label: string; readonly re: RegExp }[];
  export function stringsOf(bytes: Uint8Array): string;
  export function isPrivateV4(a: number, b: number, c: number, d: number): boolean;
  export function findingsIn(text: string): Finding[];
  export function scanPayload(dirs: readonly string[]): {
    files: number;
    findings: (Finding & { readonly file: string })[];
  };
}
