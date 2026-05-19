import globals from 'globals';
import type { Linter } from 'eslint';
import { base } from './base.js';
import { REACT_PACKAGES, RENDERER_ONLY_PACKAGES } from '../rules/forbidden.js';

export interface TierOptions {
  /**
   * Optional file glob(s). When set, this config only applies to matching
   * files; otherwise applies globally. Apps with mixed tiers should always
   * scope (e.g. `node({ files: ['src/main/**', 'src/preload/**'] })`).
   */
  files?: string[];
}

/**
 * Rules for Main-tier code: Electron Main process and packages that run only
 * in Node (caspar-client, persistence, audit, telemetry, vcg-format).
 *
 * Forbids importing Renderer-only packages and React. Use together with
 * `base` — this returns only the tier-specific overrides.
 */
export function node(options: TierOptions = {}): Linter.Config {
  const config: Linter.Config = {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...RENDERER_ONLY_PACKAGES.map((name) => ({
              name,
              message: `${name} is a Renderer-tier package; Main-tier code must not import it.`,
            })),
            ...REACT_PACKAGES.map((name) => ({
              name,
              message: `Main-tier code must not import ${name}. React belongs in the Renderer.`,
            })),
          ],
          patterns: [
            {
              group: ['@cg/*/src/**', '@cg/*/dist/**'],
              message: 'No deep imports — use the package main entry or a declared subpath export.',
            },
            {
              group: ['react/**', 'react-dom/**'],
              message: 'Main-tier code must not import React.',
            },
          ],
        },
      ],
    },
  };
  if (options.files) config.files = options.files;
  return config;
}

/**
 * Convenience: full Main-tier config (base + tier rules) as a flat-config
 * array. Use for libraries that are 100% Main-tier (e.g. @cg/caspar-client).
 */
export const nodeConfig: Linter.Config[] = [...base, node()];
