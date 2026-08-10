// Composes @cg/eslint-config tiers across the app's directory structure.
// Requires `pnpm --filter @cg/eslint-config build` to have run first
// (turbo orchestrates this via the `lint` task's dependsOn).
//
// Browser SPA: the whole app (renderer UI + the in-process platform bridge)
// is Renderer-tier. Node-tier rules only apply to tests.
import { base, jsxA11y, node, renderer } from '@cg/eslint-config';

export default [
  ...base,
  renderer({ files: ['src/**/*.{ts,tsx,mts,cts}'] }),
  // Accessibility rules (warn-level) for the React UI. This app has no
  // canvas/Konva editor or template-output JSX, so nothing is excluded.
  jsxA11y({ files: ['src/**/*.tsx'] }),
  node({ files: ['tests/**/*.{ts,tsx}'] }),
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // React component tests (`*.dom.test.ts`) run in jsdom and legitimately
    // render the renderer's React primitives, so they import react/react-dom.
    // `tests/support/**` is their shared harness (e.g. driving the in-app modal,
    // which is portalled outside the panel's container) and needs the same.
    files: ['tests/**/*.dom.test.{ts,tsx}', 'tests/support/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Design-system guard, the same shape as the Designer's raw-<button> / raw-<select>
    // rule: name the ONE construct that bypasses a shared primitive, and refuse it at
    // the source rather than at review.
    //
    // A dialog's message — "why that did not happen" — belongs in `Modal`'s pinned
    // region, which sits OUTSIDE the scrolling body and immediately above the action
    // row. `DelimitersModal` rendered `<p role="alert">` as the last child of its
    // Modal instead: below the fold on a long list, in a red measuring 2.13:1 on the
    // dialog surface. It was on the primitive and went around this one contract.
    //
    // The COLOUR half of that hole is closed by the type system — `Modal`'s `message`
    // takes `{ role, text, detail }` with STRING fields, so there is no seam to pass a
    // style through and no way to spell a treatment at a call site. This rule closes
    // the PLACEMENT half, which types cannot see: an assertive announcement written
    // inside a `<Modal>` is a message that has been put somewhere the operator may
    // have to scroll to find.
    //
    // Scoped to a `<Modal>`'s subtree on purpose. The app's banners and toasts
    // (`CommandToast`, `ConnectionBanner`, `OrphanLayersBanner`, `RasterMismatchBanner`)
    // are legitimately `role="alert"` and are not in a dialog — a blanket ban would
    // need an ignore list, and an ignore list is how a rule drifts back into a
    // convention.
    files: ['src/renderer/**/*.tsx'],
    ignores: ['src/renderer/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXElement[openingElement.name.name="Modal"] JSXAttribute[name.name="role"][value.value="alert"]',
          message:
            "A dialog's message must go through <Modal>'s `message` prop (`{ role: 'refusal' | 'notice', text, detail? }`), which pins it outside the scrolling body and immediately above the action row. A message rendered into the body can be below the fold when the operator presses the button, which is a silent refusal.",
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
    // `*.timestamp-*.mjs` are transient Vite config-load artifacts.
    ignores: ['dist/**', '.vite/**', '*.tsbuildinfo', '*.timestamp-*.mjs'],
  },
];
