import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import type { Linter } from 'eslint';

/**
 * Base config inherited by every tier.
 *
 * Strict TypeScript, no `any`, type-only imports, no deep imports of @cg/*.
 * Non-type-aware — type-aware rules will join in M2 once packages have
 * tsconfigs the parser can resolve.
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
    ignores: ['dist/**', 'build/**', 'out/**', 'coverage/**', '.turbo/**'],
  },
];
