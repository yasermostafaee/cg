import type { Linter } from 'eslint';
import { base } from './base.js';

/**
 * Config for shared libraries with no tier restrictions beyond the base.
 *
 * Use for: @cg/shared-schema, @cg/shared-ipc, @cg/text-shaping, and any
 * package that runs in multiple tiers. Each library that *does* have tier
 * constraints (e.g. @cg/caspar-client → node, @cg/shared-ui → renderer)
 * should compose the appropriate tier config instead of this one.
 */
export const library: Linter.Config[] = [...base];
