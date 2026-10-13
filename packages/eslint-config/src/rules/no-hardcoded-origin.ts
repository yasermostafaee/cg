import type { Rule } from 'eslint';

/**
 * `P-041` — THE ORIGIN GUARD: a client that spells its own server's address works on
 * exactly one machine.
 *
 * The Runtime SPA probed its bridge at a constant, `ws://127.0.0.1:5280`. That is correct
 * on the dev machine — where `localhost` and the LAN address are the same box — and wrong
 * on every other machine that opens the page, which then probes ITS OWN loopback and sits
 * DISCONNECTED with nothing wrong anywhere it can see. It survived because every check ran
 * where it could not fail. `apps/runtime/src/platform/bridgeUrl.ts` now derives the host
 * from the page's own origin, in ONE place; this rule is what stops a second spelling
 * coming back, the way `cg/bank-shape` (`P-039`) stops a second bank derivation.
 *
 * What it sees — a STRING the client builds, folded across template-literal quasis and `+`
 * concatenations (each non-literal piece stands in as `«expr»`), that contains:
 *
 *   - a scheme followed by a loopback / unspecified / IPv4-literal host
 *     (`ws://127.0.0.1`, `http://localhost`, `ws://[::1]`, `http://192.168.21.93`);
 *   - such a host followed by `:port` even without a scheme (`127.0.0.1:5280`);
 *   - a scheme followed by ANY host and one of this repo's own default ports
 *     (`ws://${host}:5280` — the host was derived, the port was not, and 5280 is the
 *     bridge's, so this is still an origin spelled by hand rather than asked for);
 *   - an import of `DEFAULT_BRIDGE_HOST` / `DEFAULT_BRIDGE_WS_URL` from `@cg/shared-ipc` —
 *     those are the bridge's BIND defaults, and a client that reads them as its own
 *     target is the constant this rule exists to refuse.
 *
 * ⚠ THE OWNER IS EXEMPT BY PATH, NOT BY COMMENT. `apps/runtime/src/platform/bridgeUrl.ts`
 * is where the derivation lives, so its fallback IS the one legitimate spelling. Unlike
 * `cg/bank-shape`, the exemption is enforced by the RULE (a suffix match on
 * {@link ORIGIN_OWNER_FILES}) rather than by a `files` block in `configs/base.ts`: this rule
 * is ENABLED by the renderer tier, which every app composes AFTER `base`, so a base-level
 * `off` for the owner file would be re-enabled by the very block that turns the rule on
 * (measured: the first smoke run fired inside the owner module for exactly that reason).
 * A copy pasted into a neighbouring file still fails — the smoke check proves it.
 * Anywhere else, a genuinely-safe exception disables the rule on the line with a comment
 * saying why.
 *
 * ⚠ WHAT THIS DOES NOT SEE, stated so nobody reads a green lint as a closed class:
 *   - a BARE host with no scheme and no port (`'127.0.0.1'`, `'localhost'`) — the same
 *     spelling is a legitimate CasparCG server default in the connection form, the seed
 *     and the mock, and without types the rule cannot tell a client origin from a
 *     server address; the `git grep` sweep stays responsible for those;
 *   - a bare port as a NUMBER (`5174`, `const PORT = 5280`) or a port in a variable —
 *     numbers are not origins until they meet a host, and the meeting may be elsewhere;
 *   - pieces assembled ACROSS statements (`const h = '127.0.0.1'` … `` `ws://${h}` ``) —
 *     folding is per expression, and a variable stands in as `«expr»`;
 *   - a host read from configuration, JSON, `import.meta.env`, `localStorage` or a
 *     query string — a runtime value, invisible to syntax;
 *   - `new URL(...)` / `URL.hostname = …` / `WebSocket` construction from parts;
 *   - hostnames (`cg-dev.local`) and IPv6 literals other than `[::1]`;
 *   - anything outside the tier's `files` scope — tests, Playwright and Vite configs —
 *     which is exactly where `127.0.0.1` legitimately lives (a dead-port pin, a preview
 *     server bound to loopback on purpose);
 *   - Node-tier code, where the rule is deliberately NOT enabled: the bridge logs
 *     `ws://127.0.0.1:5280` because that is where it binds.
 *
 * A custom rule with its own id rather than more `no-restricted-syntax` entries, for the
 * reason `cg/bank-shape` records: flat config REPLACES a rule's options when a later block
 * re-declares it, and three configs in this repo re-declare `no-restricted-syntax`.
 */

/**
 * The one module allowed to spell a fallback origin: the module that derives the real one.
 * Matched as a path SUFFIX (forward slashes; the leading double-star and its slash dropped).
 */
export const ORIGIN_OWNER_FILES: readonly string[] = ['**/src/platform/bridgeUrl.ts'];

/** The rule id as consumers see it — one string, so a smoke case cannot misspell it. */
export const NO_HARDCODED_ORIGIN_RULE_ID = 'cg/no-hardcoded-origin';

/**
 * This repo's own default listening ports: Designer dev / preview, Runtime dev / preview,
 * and the bridge. A literal one beside a scheme is an origin spelled by hand.
 */
export const KNOWN_DEV_PORTS: readonly number[] = [4000, 5000, 5174, 7000, 5280];

/** The imports from `@cg/shared-ipc` that name the bridge's BIND default, not a client origin. */
export const BIND_DEFAULT_IMPORTS: readonly string[] = [
  'DEFAULT_BRIDGE_HOST',
  'DEFAULT_BRIDGE_WS_URL',
];

/** Stand-in for a non-literal piece of a folded string — guillemets, which no origin contains. */
const EXPR = '«expr»';

const HOST = String.raw`(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\d{1,3}(?:\.\d{1,3}){3})`;
const SCHEME = String.raw`\b(?:wss?|https?):\/\/`;
/** `ws://127.0.0.1`, `http://localhost`, `http://192.168.21.93` … (host not followed by more name). */
const SCHEME_HOST = new RegExp(`${SCHEME}${HOST}(?![\\w.-])`, 'i');
/** `127.0.0.1:5280`, `localhost:5174` — a host:port pair with or without a scheme. */
const HOST_PORT = new RegExp(String.raw`(?:^|[^\w.-])${HOST}:\d{1,5}(?!\d)`, 'i');
/** `ws://«expr»:5280` — any host, one of OUR default ports, spelled as a literal. */
const SCHEME_KNOWN_PORT = new RegExp(
  `${SCHEME}[^\\s/]*:(?:${KNOWN_DEV_PORTS.map(String).join('|')})(?!\\d)`,
  'i',
);

/**
 * The literal text a string-building expression produces, with every non-literal piece
 * replaced by the `«expr»` stand-in. `null` when the node is not a string-building
 * expression at all.
 */
export function foldStringExpression(node: Rule.Node): string | null {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? node.value : null;
    case 'TemplateLiteral': {
      let out = '';
      node.quasis.forEach((quasi, i) => {
        out += quasi.value.cooked ?? quasi.value.raw;
        if (i < node.expressions.length) out += EXPR;
      });
      return out;
    }
    case 'BinaryExpression': {
      if (node.operator !== '+') return null;
      const left = foldStringExpression(node.left as Rule.Node);
      const right = foldStringExpression(node.right as Rule.Node);
      if (left === null && right === null) return null;
      return (left ?? EXPR) + (right ?? EXPR);
    }
    default:
      return null;
  }
}

/** The offending fragment of a folded string, or `null` when it spells no origin. */
export function hardcodedOriginIn(text: string): string | null {
  for (const re of [SCHEME_HOST, HOST_PORT, SCHEME_KNOWN_PORT]) {
    const m = re.exec(text);
    if (m !== null) return m[0].trim();
  }
  return null;
}

/** Forward-slashed suffix match against {@link ORIGIN_OWNER_FILES}. */
export function isOriginOwnerModule(filename: string): boolean {
  const path = filename.replace(/\\/g, '/');
  return ORIGIN_OWNER_FILES.some((pattern) => path.endsWith(pattern.replace(/^\*\*\//, '/')));
}

const MESSAGES = {
  origin:
    'A client origin is spelled here by hand (`{{text}}`). The Runtime derives its bridge ' +
    'URL from the page’s own origin in ONE place — `resolveBridgeUrl()` / `bridgeUrlFor()` in ' +
    '`src/platform/bridgeUrl.ts` — so a page opened from a second machine follows that ' +
    'machine’s view of this one. A literal `localhost` / `127.0.0.1` / IPv4 / `:5174` works on ' +
    'exactly one box (P-041).',
  bindDefault:
    '`{{name}}` is the bridge’s BIND default, not a client origin: a page on a second machine ' +
    'that probes it reaches its own loopback. Import `DEFAULT_BRIDGE_PORT` and derive the host ' +
    'from the page (`src/platform/bridgeUrl.ts`, P-041).',
} as const;

/** True when `node` is a direct operand of a `+` chain — the chain's root reports, not the piece. */
function isOperandOfConcat(node: Rule.Node): boolean {
  const parent = node.parent as Rule.Node | undefined;
  return parent !== undefined && parent.type === 'BinaryExpression' && parent.operator === '+';
}

export const noHardcodedOriginRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A client origin (scheme + loopback/IPv4 host, host:port, or one of this repo’s own ' +
        'default ports beside a scheme) is derived from the page in ONE module, never spelled ' +
        'by hand.',
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    // The owner module IS the derivation; see the header for why this is in the rule.
    if (isOriginOwnerModule(context.filename)) return {};
    const check = (node: Rule.Node): void => {
      if (isOperandOfConcat(node)) return;
      const text = foldStringExpression(node);
      if (text === null) return;
      const hit = hardcodedOriginIn(text);
      if (hit !== null) context.report({ node, messageId: 'origin', data: { text: hit } });
    };
    return {
      Literal: check,
      TemplateLiteral: check,
      "BinaryExpression[operator='+']": check,
      "ImportDeclaration[source.value='@cg/shared-ipc'] ImportSpecifier"(node: Rule.Node) {
        if (node.type !== 'ImportSpecifier') return;
        const imported = node.imported;
        const name = imported.type === 'Identifier' ? imported.name : String(imported.value);
        if (BIND_DEFAULT_IMPORTS.includes(name)) {
          context.report({ node, messageId: 'bindDefault', data: { name } });
        }
      },
    };
  },
};
