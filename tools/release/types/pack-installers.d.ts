/**
 * `INSTALLER-DESIGN-01` (`P-063`) — the typed surface of `../src/pack-installers.mjs` (plain zero-dep
 * ESM, no build). Update both files together.
 */
declare module '*pack-installers.mjs' {
  export interface MainFile {
    readonly path: string;
    readonly bytes: number;
  }
  export interface PackItem {
    readonly product: 'bridge' | 'control' | 'designer';
    readonly engine: string;
    readonly out: string;
    readonly icon: string;
    readonly tile: string;
    readonly mainFiles: readonly MainFile[];
    readonly installBytes: number;
    readonly guide: string | null;
  }
  export function packPlan(options: {
    root?: string;
    version: string;
    outDir: string;
    guide?: string | null;
  }): PackItem[];
  export function packArgs(item: PackItem, options: { version: string; setupDir: string }): string[];
}
