import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import type { Linter } from 'eslint';
import { BANK_SHAPE_OWNER_FILES, BANK_SHAPE_RULE_ID } from '../rules/bank-shape.js';
import { cgPlugin } from '../rules/cg-plugin.js';

/**
 * Base config inherited by every tier.
 *
 * Strict TypeScript, no `any`, type-only imports, no deep imports of @cg/*.
 * Non-type-aware — type-aware rules will join in M2 once packages have
 * tsconfigs the parser can resolve.
 *
 * `P-039` — the bank-shape guard (`cg/bank-shape`) rides the BASE tier, not a
 * bank-holding workspace's own config, because the restatements it exists to
 * catch turned up in four different workspaces (the mock, the renderer, the
 * schema, the bridge) and a guard scoped to the ones already known is worth
 * nothing to the fifth. The owner module is exempted by PATH in the block
 * after it; see `../rules/bank-shape.ts` for the shapes and their limits.
 *
 * `P-041` — the origin guard (`cg/no-hardcoded-origin`) is REGISTERED here (the one
 * `cg` plugin object, see `../rules/cg-plugin.ts`) but ENABLED by the renderer tier
 * only: a hardcoded loopback is a defect in a browser client and an ordinary bind
 * default in Node-tier code (the bridge logs `ws://127.0.0.1:5280` because that is
 * where it listens). Its owner module is exempted by PATH inside the RULE rather than
 * by a `files` block here: the block that enables it lives in the renderer tier, which
 * every app composes after `base`, so an `off` placed here would be re-enabled by it
 * (see `../rules/no-hardcoded-origin.ts`, which records the measured miss).
 */
export const base: Linter.Config[] = [
  eslint.configs.recommended,
  ...(tseslint.configs.recommended as Linter.Config[]),
  ...(tseslint.configs.stylistic as Linter.Config[]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cg/*/src/**', '@cg/*/dist/**'],
              message: 'No deep imports — use the package main entry or a declared subpath export.',
            },
          ],
        },
      ],
    },
  },
  {
    plugins: { cg: cgPlugin },
    rules: {
      [BANK_SHAPE_RULE_ID]: 'error',
    },
  },
  {
    // The module that OWNS the derivation is the one place the shape is allowed.
    files: [...BANK_SHAPE_OWNER_FILES],
    rules: {
      [BANK_SHAPE_RULE_ID]: 'off',
    },
  },
  {
    ignores: ['dist/**', 'build/**', 'out/**', 'coverage/**', '.turbo/**'],
  },
];
