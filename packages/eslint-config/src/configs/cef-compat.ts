import type { Linter } from 'eslint';
import { cefCompatSyntaxRestrictions } from '../rules/cef-compat.js';
import type { TierOptions } from './node.js';

/**
 * B-066 — CEF-compat rules as a standalone add-on, for packages whose code
 * is BUNDLED INTO broadcast output without being full Broadcast tier
 * themselves (e.g. `@cg/shared-schema`, which rides into the served bundle
 * via `@cg/template-runtime` but also runs in Node). Bans built-in methods
 * newer than CasparCG's CEF baseline (Chromium 71); the broadcast tier gets
 * the same restrictions built in. See `../rules/cef-compat.ts`.
 */
export function cefCompat(options: TierOptions = {}): Linter.Config {
  const config: Linter.Config = {
    rules: {
      'no-restricted-syntax': ['error', ...cefCompatSyntaxRestrictions()],
    },
  };
  if (options.files) config.files = options.files;
  return config;
}
