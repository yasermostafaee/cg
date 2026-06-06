export { base } from './configs/base.js';
export { library } from './configs/library.js';

// Tier rule blocks (single Linter.Config). Apps with mixed tiers compose
// these into one eslint.config.mjs scoped by `files`.
export { node, nodeConfig } from './configs/node.js';
export { renderer, rendererConfig } from './configs/renderer.js';
export { broadcast, broadcastConfig } from './configs/broadcast.js';

// JSX/TSX accessibility rules (warn-level). Apply on top of the renderer
// tier in apps that render React.
export { jsxA11y } from './configs/jsx-a11y.js';

export type { TierOptions } from './configs/node.js';
export type { JsxA11yOptions } from './configs/jsx-a11y.js';
