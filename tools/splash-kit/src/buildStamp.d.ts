import type { Plugin } from 'vite';

/** The identity of one build, computed once. See `buildStamp.mjs` for why that matters. */
export interface BuildStamp {
  readonly version: string;
  readonly sha: string;
  readonly builtAt: string;
}

export interface BuildStampResult {
  /** Register this in the app's `plugins` array. */
  readonly plugin: Plugin;
  /** Feed the app's `define` as `__CG_BUILD__: JSON.stringify(stamp)`. */
  readonly stamp: BuildStamp;
  /** What the splash's foot prints — `sha · YYYY-MM-DD`. */
  readonly stampText: string;
}

/**
 * @param appDir the app's own directory WITH A TRAILING SEPARATOR — normally
 *   `fileURLToPath(new URL('.', import.meta.url))` from that app's `vite.config.ts`.
 */
export function createBuildStamp(appDir: string): BuildStampResult;
