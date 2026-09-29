/**
 * `CLIENT-TEST-RELEASE-01` B4 — the typed surface of `../src/release-files.mjs` (plain zero-dep ESM,
 * no build). Update both files together.
 */
declare module '*release-files.mjs' {
  export interface InstallerNames {
    readonly built: string;
    readonly name: string;
  }
  export function releaseFiles(version: string): {
    readonly control: InstallerNames;
    readonly designer: InstallerNames;
    readonly guide: string;
    readonly sums: string;
  };
  export function expectedAssets(version: string): string[];
  export function sha256Sums(dir: string, names: readonly string[]): string;
  export function assembleRelease(options: {
    version: string;
    installersDir: string;
    guidePdf: string;
    outDir: string;
  }): string[];
}
