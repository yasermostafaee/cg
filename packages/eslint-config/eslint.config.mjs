// Dogfoods the library config from the built output.
// Requires `pnpm build` to have run first (turbo orchestrates this).
import { library } from './dist/index.js';
import globals from 'globals';

export default [
  ...library,
  {
    // Dev scripts run in Node and log freely.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
