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

// B-066 — the CasparCG CEF compatibility baseline + banned-built-ins list.
// One curated list feeds the broadcast tier's `no-restricted-syntax` rules,
// the `cefCompat` add-on (for packages bundled INTO broadcast output, e.g.
// @cg/shared-schema), and @cg/single-file-export's bundle-artifact scan.
export {
  CEF_BANNED_BUILTINS,
  CEF_CHROMIUM_BASELINE,
  cefCompatSyntaxRestrictions,
  type CefBannedBuiltin,
} from './rules/cef-compat.js';
export { cefCompat } from './configs/cef-compat.js';

// P-039 — the bank-shape guard. Registered by `base` under the `cg` namespace; exported
// so the smoke check can assert on the one rule id and so a consumer can widen the
// owner-file exemption deliberately rather than by copying the pattern.
export {
  BANK_SHAPE_OWNER_FILES,
  BANK_SHAPE_RULE_ID,
  bankShapePlugin,
  bankShapeRule,
} from './rules/bank-shape.js';

export type { TierOptions } from './configs/node.js';
export type { JsxA11yOptions } from './configs/jsx-a11y.js';
