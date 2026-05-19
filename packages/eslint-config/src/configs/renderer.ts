import globals from 'globals';
import type { Linter } from 'eslint';
import { base } from './base.js';
import { ELECTRON_PACKAGE, MAIN_ONLY_PACKAGES, NODE_BUILTINS } from '../rules/forbidden.js';
import type { TierOptions } from './node.js';

/**
 * Rules for Renderer-tier code: app renderer processes, @cg/shared-ui.
 *
 * Forbids Node built-ins, electron (must go through preload's contextBridge),
 * and Main-tier @cg/* packages. Use together with `base`.
 */
export function renderer(options: TierOptions = {}): Linter.Config {
  const config: Linter.Config = {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...NODE_BUILTINS.map((name) => ({
              name,
              message:
                'Renderer-tier code must not import Node built-ins. Route through the preload contextBridge.',
            })),
            {
              name: ELECTRON_PACKAGE,
              message:
                'Renderer-tier code must not import electron directly. Use the preload contextBridge.',
            },
            ...MAIN_ONLY_PACKAGES.map((name) => ({
              name,
              message: `${name} is a Main-tier package; Renderer-tier code must not import it.`,
            })),
          ],
          patterns: [
            {
              group: ['@cg/*/src/**', '@cg/*/dist/**'],
              message: 'No deep imports — use the package main entry or a declared subpath export.',
            },
            {
              group: ['electron/**'],
              message:
                'Renderer-tier code must not import electron. Use the preload contextBridge.',
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
 * Convenience: full Renderer-tier config (base + tier rules) as a flat-config
 * array. Use for libraries that are 100% Renderer-tier (e.g. @cg/shared-ui).
 */
export const rendererConfig: Linter.Config[] = [...base, renderer()];
