// `eslint-plugin-jsx-a11y` ships no type declarations. Declare the minimal
// surface this package consumes: the flat-config presets exposed under
// `flatConfigs`. Kept intentionally narrow — extend if we start using more.
//
// This must stay an *ambient* module declaration (no top-level import), so the
// type references use inline `import()` syntax. The repo's
// `consistent-type-imports` rule is disabled for this dir in eslint.config.mjs.
declare module 'eslint-plugin-jsx-a11y' {
  interface JsxA11yFlatConfig {
    name?: string;
    languageOptions?: import('eslint').Linter.LanguageOptions;
    plugins?: Record<string, import('eslint').ESLint.Plugin>;
    rules?: Partial<import('eslint').Linter.RulesRecord>;
  }
  const plugin: {
    readonly flatConfigs: {
      readonly recommended: JsxA11yFlatConfig;
      readonly strict: JsxA11yFlatConfig;
    };
  };
  export default plugin;
}
