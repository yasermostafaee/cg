import type { Linter } from 'eslint';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import type { TierOptions } from './node.js';

export interface JsxA11yOptions extends TierOptions {
  /**
   * Globs excluded from a11y linting. Use for surfaces where standard JSX
   * a11y semantics don't apply: the canvas/Konva editor (pointer-driven
   * gizmos, not DOM controls) and generated template-output bundles.
   */
  ignores?: string[];
}

/**
 * Downgrade a rule entry to `warn` while preserving its options. Rules the
 * recommended preset deliberately turns `off` stay off.
 */
function toWarn(setting: Linter.RuleEntry): Linter.RuleEntry {
  if (Array.isArray(setting)) {
    const [severity, ...opts] = setting;
    if (severity === 'off' || severity === 0) return setting;
    return ['warn', ...opts];
  }
  if (setting === 'off' || setting === 0) return setting;
  return 'warn';
}

/**
 * Accessibility rules for JSX/TSX renderer code (eslint-plugin-jsx-a11y).
 *
 * The recommended ruleset, but every active rule downgraded to `warn` for a
 * soft rollout. Scope it to an app's JSX with `files`, and exclude the
 * canvas/Konva editor paths and template-output code with `ignores`.
 *
 * Compose after `base` + the tier config, e.g.:
 *   jsxA11y({ files: ['src/**\/*.tsx'], ignores: ['src/renderer/features/canvas/**'] })
 */
export function jsxA11y(options: JsxA11yOptions = {}): Linter.Config {
  const recommended = jsxA11yPlugin.flatConfigs.recommended;

  const rules: Partial<Linter.RulesRecord> = {};
  for (const [name, setting] of Object.entries(recommended.rules ?? {})) {
    if (setting !== undefined) rules[name] = toWarn(setting);
  }

  const config: Linter.Config = { rules };
  if (recommended.plugins) config.plugins = recommended.plugins;
  if (recommended.languageOptions) config.languageOptions = recommended.languageOptions;
  if (options.files) config.files = options.files;
  if (options.ignores) config.ignores = options.ignores;
  return config;
}
