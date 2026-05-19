export { base } from './configs/base.js';
export { library } from './configs/library.js';

// Tier rule blocks (single Linter.Config). Apps with mixed tiers compose
// these into one eslint.config.mjs scoped by `files`.
export { node, nodeConfig } from './configs/node.js';
export { renderer, rendererConfig } from './configs/renderer.js';
export { broadcast, broadcastConfig } from './configs/broadcast.js';

export type { TierOptions } from './configs/node.js';
