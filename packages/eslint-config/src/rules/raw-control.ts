import type { Rule } from 'eslint';

/**
 * 🔴 `TIMING-WIRE-22 · DELTA B · R2` — **THE RAW-CONTROL RATCHET.**
 *
 * `CLAUDE.md` → "Design system — interactive controls" says a new control reuses the shared
 * primitives with no local styling. Two constructs break it, and neither was caught by anything:
 *
 *   - a raw `<input>` outside `renderer/ui/` — it inherits no focus, disabled or digit
 *     handling, and the Runtime's is a Persian-keyboard console, so a raw box silently refuses
 *     the operator's own digits (`DELTA B3`, measured);
 *   - a `style` prop on a control primitive — the inline style is what made the Timing
 *     section's boxes disagree with POSITION's, and it is how a primitive stops being one.
 *
 * ── 🔴 WHY THIS IS A RATCHET AND NOT A BAN ──────────────────────────────────
 *
 * The Runtime renderer has **32 raw `<input>` sites across 14 files** today. A guard landed red
 * is a guard the next session turns off, and `DELTA B3` stopped rather than ship one. A ban that
 * cannot land protects nothing; a ratchet protects everything written from today.
 *
 * So the debt is FROZEN per file, as a COUNT, in the app's own config — and the rule refuses
 * movement in BOTH directions:
 *
 *   - **more than frozen** — new debt in a listed file. Red, naming the excess.
 *   - **a file with no entry** — new debt in a clean file. Red.
 *   - **FEWER than frozen** — the debt was paid and the number is now a lie. Red, asking for
 *     the number to be lowered. This is the half that makes it a ratchet rather than a
 *     ceiling: a stale allowance is a licence somebody can spend later without review.
 *
 * ⚠ **THE DOWNWARD CHECK IS WHY THERE IS NO SEPARATE PINNING TEST, and that is deliberate.**
 * A test reading the config would be a SECOND reader of the same list, living under a different
 * turbo `inputs` glob (`test` hashes `tests/**` and `vitest.config.*`; `lint` hashes
 * `eslint.config.*`). Two readers under two cache keys is exactly the silent-under-cache-hit
 * hole `CLAUDE.md` records three times (`85e3c27e`, `db32fd14`, `7dd8140d`). One reader, one
 * input glob, no drift.
 *
 * ⚠ **A CUSTOM RULE RATHER THAN MORE `no-restricted-syntax` ENTRIES**, for the reason
 * `bank-shape` states and for one more: flat config REPLACES a rule's options when a later
 * block re-declares it, and three configs here re-declare `no-restricted-syntax`. Counting is
 * also not expressible in a selector — the ratchet needs to see the whole file at once.
 *
 * ⚠ **WHAT THIS DOES NOT SEE**, so a green lint is never read as a closed class: a control
 * rendered through a local wrapper component; a `className` that restyles a primitive (the
 * legitimate route, and the one `.cg-timing-choice` uses); `style` on a raw HTML element (285
 * such sites, all legitimate); and `.ts` files, since the `files` glob is `.tsx` where JSX lives.
 */

/** The primitives whose appearance belongs to the design system, not to a call site. */
const PRIMITIVES = new Set(['Button', 'AsyncButton', 'NumericInput', 'Tag']);

const ADVICE =
  'Use `renderer/ui/NumericInput` (it carries R-020 digit normalisation and the ' +
  '`INSPECTOR-DELTA` disabled-gesture guard) or another `renderer/ui` primitive, and give it a ' +
  '`className` rather than a `style` prop — name your surface in an existing `controls.css` ' +
  'selector instead of copying a treatment.';

interface Options {
  /**
   * FROZEN DEBT: file path suffix → the number of offending sites that file is allowed to
   * keep. A suffix so the entry reads as a path and matches from any working directory.
   */
  readonly allow?: Record<string, number>;
}

/** The frozen entry whose suffix matches this file, if any. */
function allowanceFor(filename: string, allow: Record<string, number>): number {
  const normalised = filename.replace(/\\/g, '/');
  for (const [suffix, count] of Object.entries(allow)) {
    if (normalised.endsWith(suffix)) return count;
  }
  return 0;
}

export const rawControlRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A raw <input> outside renderer/ui, or a `style` prop on a control primitive. Existing ' +
        'sites are frozen per file as a count that may only shrink.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'object', additionalProperties: { type: 'number' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawInput: `A raw <input> here bypasses the shared primitive. ${ADVICE}`,
      styledPrimitive: `A \`style\` prop on <{{name}}> restyles a shared primitive at the call site. ${ADVICE}`,
      stale:
        'This file is frozen at {{allowed}} legacy site(s) and now has {{actual}}. The debt was ' +
        'paid — lower the number in `eslint.config.mjs` to {{actual}} (or remove the entry when ' +
        'it reaches 0). A frozen count that is higher than the truth is a licence to add one ' +
        'back without review.',
    },
  },
  create(context) {
    const allow = ((context.options[0] ?? {}) as Options).allow ?? {};
    const allowed = allowanceFor(context.filename, allow);
    /*
      Collected, not reported on sight: the ratchet is a statement about the FILE, so the
      decision cannot be made until the last node has been seen. `Program:exit` is the only
      point at which both counts are known.
    */
    const found: { node: Rule.Node; messageId: 'rawInput' | 'styledPrimitive'; name?: string }[] =
      [];

    /*
      Built as a `Rule.RuleListener` and assigned by key, the shape `bank-shape` uses — an
      object literal is inferred with its selector strings as literal keys and does not widen
      to the listener's index signature.
    */
    const listeners: Rule.RuleListener = {};

    listeners['JSXOpeningElement[name.name="input"]'] = (node: Rule.Node) => {
      found.push({ node, messageId: 'rawInput' });
    };

    // The `style` attribute of a control primitive. Matched on the ATTRIBUTE and then walked
    // up, rather than selected as a descendant: `JSXOpeningElement > JSXAttribute` would also
    // match a primitive nested inside another element's attribute expression.
    listeners['JSXAttribute[name.name="style"]'] = (node: Rule.Node) => {
      const parent = (node as unknown as { parent?: { type?: string; name?: unknown } }).parent;
      if (parent?.type !== 'JSXOpeningElement') return;
      const tag = parent.name as { type?: string; name?: unknown } | undefined;
      if (tag?.type !== 'JSXIdentifier' || typeof tag.name !== 'string') return;
      if (!PRIMITIVES.has(tag.name)) return;
      found.push({ node, messageId: 'styledPrimitive', name: tag.name });
    };

    // ⚠ `Program:exit` is a KNOWN visitor key, so its parameter is typed as the ESTree
    // `Program` rather than the generic `Rule.Node` the selector keys above take. Left to
    // inference, and cast only where it is reported on.
    listeners['Program:exit'] = (program) => {
      if (found.length > allowed) {
        /*
          Report only the EXCESS, and the LAST ones rather than the first: the sites a file
          already carried are at the top of it, so pointing at the newest addition is what puts
          the message where the edit was made.
        */
        for (const hit of found.slice(allowed)) {
          context.report({
            node: hit.node,
            messageId: hit.messageId,
            ...(hit.name !== undefined ? { data: { name: hit.name } } : {}),
          });
        }
        return;
      }
      if (found.length < allowed) {
        context.report({
          node: program as unknown as Rule.Node,
          messageId: 'stale',
          data: { allowed: String(allowed), actual: String(found.length) },
        });
      }
    };

    return listeners;
  },
};

/** The rule id as consumers see it — one string, so a config cannot misspell it. */
export const RAW_CONTROL_RULE_ID = 'cg/raw-control';
