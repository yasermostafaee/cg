import globals from 'globals';
import type { Linter } from 'eslint';
import { base } from './base.js';
import {
  ELECTRON_PACKAGE,
  MAIN_ONLY_PACKAGES,
  NODE_BUILTINS,
  REACT_PACKAGES,
  RENDERER_ONLY_PACKAGES,
} from '../rules/forbidden.js';
import type { TierOptions } from './node.js';

/**
 * Rules for the Broadcast tier: @cg/template-runtime and the runtime path of
 * @cg/lottie-bridge. This code ships *inside* exported .vcg index.html and
 * must be hermetic — no Node, no electron, no Main-tier services, no React,
 * no @cg/shared-ui. Only domain types and pure utilities.
 */
export function broadcast(options: TierOptions = {}): Linter.Config {
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
              message: 'Broadcast templates must be hermetic — no Node built-ins.',
            })),
            {
              name: ELECTRON_PACKAGE,
              message: 'Broadcast templates must be hermetic — no electron.',
            },
            ...MAIN_ONLY_PACKAGES.map((name) => ({
              name,
              message: `${name} is forbidden in broadcast templates.`,
            })),
            ...RENDERER_ONLY_PACKAGES.map((name) => ({
              name,
              message: `${name} is renderer-only; broadcast templates render via plain DOM.`,
            })),
            ...REACT_PACKAGES.map((name) => ({
              name,
              message: 'Broadcast templates render via plain DOM, not React.',
            })),
          ],
          patterns: [
            {
              group: ['@cg/*/src/**', '@cg/*/dist/**'],
              message: 'No deep imports — use the package main entry or a declared subpath export.',
            },
            {
              group: ['electron/**', 'react/**', 'react-dom/**'],
              message: 'Forbidden in broadcast templates (hermetic surface).',
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
 * Convenience: full Broadcast-tier config (base + tier rules) as a flat-config
 * array. Use for libraries that are 100% Broadcast-tier (e.g.
 * @cg/template-runtime).
 */
export const broadcastConfig: Linter.Config[] = [...base, broadcast()];
