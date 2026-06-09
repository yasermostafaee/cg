// Composes @cg/eslint-config tiers across the app's directory structure.
// Requires `pnpm --filter @cg/eslint-config build` to have run first
// (turbo orchestrates this via the `lint` task's dependsOn).
//
// Browser SPA: the whole app (renderer UI + the in-process platform bridge)
// is Renderer-tier. Node-tier rules only apply to build scripts + tests.
import { base, jsxA11y, node, renderer } from '@cg/eslint-config';

export default [
  ...base,
  renderer({ files: ['src/**/*.{ts,tsx,mts,cts}'] }),
  // Accessibility rules (warn-level) for the React UI. The canvas/Konva
  // editor is pointer/gizmo-driven rather than DOM-control-driven, and the
  // generated template-runtime bundle is build output — both are excluded.
  jsxA11y({
    files: ['src/**/*.tsx'],
    ignores: ['src/renderer/features/canvas/**', 'src/generated/**'],
  }),
  node({ files: ['scripts/**/*.{mjs,js}', 'tests/**/*.{ts,tsx}'] }),
  {
    files: ['scripts/**/*.{mjs,js}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Tests aren't shipped code; component/render tests legitimately import
      // `react` / `react-dom/client` to mount a component and assert its DOM.
      'no-restricted-imports': 'off',
    },
  },
  {
    // Design-system guard: every interactive button in the renderer must go
    // through the shared <Button> / <Control> (renderer/ui), which bake in the
    // hover / active / focus-visible / disabled states — so a new raw <button>
    // can't silently miss them. The ui/ components themselves are the one place a
    // native <button> is allowed.
    files: ['src/renderer/**/*.tsx'],
    ignores: ['src/renderer/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="button"]',
          message:
            'Use the shared <Button> / <Control> from renderer/ui instead of a raw <button> so the control inherits hover/active/focus-visible/disabled states. (variant="bare" keeps a bespoke look while still getting the states.)',
        },
      ],
    },
  },
  {
    // Config files run in Node but live outside the tier dirs above.
    files: ['*.config.{ts,mts,cts,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/**', '.vite/**', 'src/generated/**', '*.tsbuildinfo'],
  },
];
