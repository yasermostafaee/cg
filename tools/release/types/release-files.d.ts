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
    /** `CENTRAL-BRIDGE-01` — CG Bridge's own installer: its built name is its release name. */
    readonly bridge: InstallerNames;
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
  /** `P-060` — one asset of a release as uploaded. */
  export interface UploadedAsset {
    readonly name: string;
    /** SHA-256 (hex) of the file downloaded back from the release; `null` when it could not be. */
    readonly sha256: string | null;
    /** GitHub's own digest, `sha256:<hex>`, when the API reports one. */
    readonly digest: string | null;
  }
  export function sumsProblems(
    sumsText: string,
    assets: readonly UploadedAsset[],
    sumsName?: string,
  ): string[];
  export function verifyDownloaded(options: { dir: string; assetsJson?: string }): string[];
}
