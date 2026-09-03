import type { ESLint } from 'eslint';
import { bankShapeRule } from './bank-shape.js';
import { noHardcodedOriginRule } from './no-hardcoded-origin.js';

/**
 * THE ONE `cg` PLUGIN OBJECT. Flat config refuses to register two different objects under
 * the same plugin name ("Cannot redefine plugin"), so every tier that mentions `cg/*`
 * registers THIS object — `base` for the rules every workspace gets, `renderer` for the
 * client-only guard — and the object is the same module-level instance in both.
 *
 * Rules: `cg/bank-shape` (`P-039`), `cg/no-hardcoded-origin` (`P-041`).
 */
export const cgPlugin: ESLint.Plugin = {
  meta: { name: '@cg/eslint-plugin', version: '0.0.0' },
  rules: {
    'bank-shape': bankShapeRule,
    'no-hardcoded-origin': noHardcodedOriginRule,
  },
};
