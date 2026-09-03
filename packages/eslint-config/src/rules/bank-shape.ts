import type { Rule } from 'eslint';

/**
 * `P-039` — THE BANK-SHAPE GUARD: a range that is rebuilt by hand is a second derivation,
 * and every second derivation of the fixed-layer bank so far has been the OPERATOR half.
 *
 * `a7976e14` split the bank into two halves and put the union in ONE function
 * (`fixedBankSlots`). Nine sites then restated the range instead of calling it, each a
 * predicate in everything but name, each answering a narrower question than the code
 * around it believed it asked: four in the offline mock (`B-201`), the panel's row name
 * (`B-203`), the schema's default (`B-202`), and two in SHIPPED bridge code — the startup
 * volume recovery (`B-204`) and the fail-closed untick gate (`B-205`). None of them could
 * be found by grepping for the predicate's NAME, because a restatement never uses the name.
 *
 * What a grep CAN see is the SHAPE, and this rule is the shape written down once:
 *
 *   - `x.start + x.count` (either order, any receiver, either half) — the range arithmetic;
 *   - `start + count` on bare identifiers — the same arithmetic after a destructure;
 *   - `{ length: x.count }` / `new Array(x.count)` — the range as an array to fill;
 *   - a `for` loop bounded by `x.count` — the range as an index walk;
 *   - a template literal that is exactly `Layer ${…}` / `Bed ${…}`, or `'Layer ' + …` —
 *     the row NAME rebuilt instead of asked from `defaultLayerAlias`.
 *
 * ⚠ THE OWNER IS EXEMPT BY PATH, NOT BY COMMENT. `packages/shared-ipc/src/channels/
 * fixedLayers.ts` is where `fixedBankEnd`, `lowBankEnd`, `fixedBankSlots` and
 * `defaultLayerAlias` LIVE, so its arithmetic is the derivation rather than a copy of it.
 * That file is the ONLY place the shape is allowed, and the exemption is spelled as a
 * `files` pattern in the tier config (see `configs/base.ts`) so a copy pasted into a new
 * module cannot inherit it. Anywhere else, a genuinely-safe exception disables the rule
 * on the line with a comment saying why — the same escape `cef-compat` documents.
 *
 * ⚠ WHAT THIS DOES NOT SEE, stated so nobody reads a green lint as a closed class:
 *   - a literal bound (`layer <= 9`, `layer >= 70`) — three test suites use the default
 *     bed range as their own oracle, and an oracle that derived itself from the code under
 *     test would prove nothing; the `git grep` sweep stays responsible for literals;
 *   - a direct tick or alias read (`bank.visibility?.[k]`) instead of `isLayerVisible` /
 *     `layerAlias` — `visibility` and `aliases` are ordinary property names elsewhere
 *     (the designer's arrangements, the runtime's looks), and this config is not
 *     type-aware, so it cannot tell a bank's record from theirs;
 *   - a positional read of the union (`fixedBankSlots(bank).slice(0, bank.count)`) — the
 *     `.count` there is a length, not arithmetic, and the shape is too general to name.
 *
 * A custom rule with its own id rather than more `no-restricted-syntax` entries, on
 * purpose: flat config REPLACES a rule's options when a later block re-declares it, and
 * three configs in this repo re-declare `no-restricted-syntax` for their own reasons
 * (the CEF baseline, the design-system guards). A guard that a later `files` block can
 * silently drop for exactly the directory that contains `LayerRow.tsx` is not a guard.
 */

/** The one module allowed to spell the bank's arithmetic: the module that owns it. */
export const BANK_SHAPE_OWNER_FILES: readonly string[] = ['**/src/channels/fixedLayers.ts'];

const HELPERS =
  'Enumerate rows with `fixedBankSlots(bank)`, test membership with `isFixedBankLayer` / ' +
  '`isLowBankLayer`, take an end with `fixedBankEnd` / `lowBankEnd` — all from ' +
  '`@cg/shared-ipc`. A range rebuilt by hand is a second derivation, and every one found ' +
  'so far was the OPERATOR half only (B-201, B-204, B-205).';

/**
 * esquery selectors, keyed by message. Attribute paths (`left.property.name`) are
 * esquery's own dotted syntax; a regex value matches the attribute as a string.
 */
const SELECTORS: readonly { messageId: keyof typeof MESSAGES; selector: string }[] = [
  {
    messageId: 'range',
    selector:
      "BinaryExpression[operator='+'][left.type='MemberExpression'][left.property.name='start']" +
      "[right.type='MemberExpression'][right.property.name='count']",
  },
  {
    messageId: 'range',
    selector:
      "BinaryExpression[operator='+'][left.type='MemberExpression'][left.property.name='count']" +
      "[right.type='MemberExpression'][right.property.name='start']",
  },
  {
    messageId: 'range',
    selector:
      "BinaryExpression[operator='+'][left.type='Identifier'][left.name='start']" +
      "[right.type='Identifier'][right.name='count']",
  },
  {
    messageId: 'range',
    selector:
      "BinaryExpression[operator='+'][left.type='Identifier'][left.name='count']" +
      "[right.type='Identifier'][right.name='start']",
  },
  {
    messageId: 'length',
    selector:
      "Property[key.name='length'][value.type='MemberExpression'][value.property.name='count']",
  },
  {
    messageId: 'length',
    selector:
      "NewExpression[callee.name='Array'][arguments.0.type='MemberExpression']" +
      "[arguments.0.property.name='count']",
  },
  {
    messageId: 'forCount',
    selector:
      "ForStatement[test.type='BinaryExpression'][test.right.type='MemberExpression']" +
      "[test.right.property.name='count']",
  },
  {
    messageId: 'rowName',
    selector:
      'TemplateLiteral[quasis.length=2][quasis.0.value.raw=/^(Layer|Bed) $/][quasis.1.value.raw=/^$/]',
  },
  {
    messageId: 'rowName',
    selector: "BinaryExpression[operator='+'][left.type='Literal'][left.value=/^(Layer|Bed) $/]",
  },
];

const MESSAGES = {
  range: `The bank's range is rebuilt by hand (\`start + count\`). ${HELPERS}`,
  length:
    `\`{ length: bank.count }\` / \`new Array(bank.count)\` fills ONE half of the bank by hand. ` +
    HELPERS,
  forCount: `A loop bounded by \`.count\` walks ONE half of the bank by hand. ${HELPERS}`,
  rowName:
    "A row's display name is `defaultLayerAlias(bank, layer)` from `@cg/shared-ipc` — never a " +
    'hand-built `Layer ${n}` / `Bed ${n}`. B-203: the panel formatted its own and bed 9 read ' +
    '`Layer 1`, the name of operator row 89.',
} as const;

export const bankShapeRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'The fixed-layer bank has ONE enumeration (`fixedBankSlots`) and ONE row name ' +
        '(`defaultLayerAlias`); a range or a name rebuilt by hand is a second derivation.',
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    const listeners: Rule.RuleListener = {};
    for (const { messageId, selector } of SELECTORS) {
      listeners[selector] = (node: Rule.Node) => {
        context.report({ node, messageId });
      };
    }
    return listeners;
  },
};

// The plugin object lives in `./cg-plugin.ts` (ONE object for every `cg/*` rule — flat
// config refuses two different objects under the same plugin name), since `P-041`.

/** The rule id as consumers see it — one string, so a smoke case cannot misspell it. */
export const BANK_SHAPE_RULE_ID = 'cg/bank-shape';
