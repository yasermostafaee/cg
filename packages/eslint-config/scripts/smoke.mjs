// Smoke check: programmatically lint code samples against each tier config
// and assert that the expected violations are reported. Run after `tsc -b`.
//
// Cases are kept tight on purpose — this is a guard against the config
// silently regressing, not a full test suite. Comprehensive tests live in
// each consuming package's CI.

import { ESLint } from 'eslint';
import assert from 'node:assert/strict';

import {
  base,
  library,
  node,
  renderer,
  broadcast,
  jsxA11y,
  BANK_SHAPE_RULE_ID,
  NO_HARDCODED_ORIGIN_RULE_ID,
  RAW_CONTROL_RULE_ID,
  rawControlRule,
} from '../dist/index.js';

/**
 * @typedef {Object} Case
 * @property {string} name
 * @property {import('eslint').Linter.Config[]} config
 * @property {string} code
 * @property {string} expectedRuleId
 */

/** @type {Case[]} */
const cases = [
  // base — applies to every tier
  {
    name: 'base: forbids `any`',
    config: base,
    code: 'const x: any = 1;\nconsole.warn(x);\n',
    expectedRuleId: '@typescript-eslint/no-explicit-any',
  },
  {
    name: 'base: forbids deep imports of @cg/*',
    config: base,
    code: "import { x } from '@cg/shared-schema/src/internal/foo';\nconsole.warn(x);\n",
    expectedRuleId: 'no-restricted-imports',
  },

  // renderer
  {
    name: 'renderer: forbids `fs`',
    config: [...base, renderer()],
    code: "import fs from 'fs';\nconsole.warn(fs);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'renderer: forbids `node:net`',
    config: [...base, renderer()],
    code: "import net from 'node:net';\nconsole.warn(net);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'renderer: forbids `electron`',
    config: [...base, renderer()],
    code: "import { app } from 'electron';\nconsole.warn(app);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'renderer: forbids @cg/caspar-client',
    config: [...base, renderer()],
    code: "import { CasparClient } from '@cg/caspar-client';\nconsole.warn(CasparClient);\n",
    expectedRuleId: 'no-restricted-imports',
  },

  // node
  {
    name: 'node: forbids @cg/ui',
    config: [...base, node()],
    code: "import { Button } from '@cg/ui';\nconsole.warn(Button);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'node: forbids react',
    config: [...base, node()],
    code: "import React from 'react';\nconsole.warn(React);\n",
    expectedRuleId: 'no-restricted-imports',
  },

  // broadcast
  {
    name: 'broadcast: forbids electron',
    config: [...base, broadcast()],
    code: "import { app } from 'electron';\nconsole.warn(app);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'broadcast: forbids node:fs',
    config: [...base, broadcast()],
    code: "import fs from 'node:fs';\nconsole.warn(fs);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'broadcast: forbids react',
    config: [...base, broadcast()],
    code: "import React from 'react';\nconsole.warn(React);\n",
    expectedRuleId: 'no-restricted-imports',
  },
  {
    name: 'broadcast: forbids @cg/caspar-client',
    config: [...base, broadcast()],
    code: "import { CasparClient } from '@cg/caspar-client';\nconsole.warn(CasparClient);\n",
    expectedRuleId: 'no-restricted-imports',
  },

  // library — must permit Node and React equally; only deep imports forbidden
  {
    name: 'library: forbids deep imports of @cg/*',
    config: library,
    code: "import { x } from '@cg/shared-schema/dist/private';\nconsole.warn(x);\n",
    expectedRuleId: 'no-restricted-imports',
  },
];

let failed = 0;
let passed = 0;

for (const c of cases) {
  const eslint = new ESLint({
    baseConfig: c.config,
    overrideConfigFile: true,
  });
  const results = await eslint.lintText(c.code, { filePath: 'fixture.ts' });
  const messages = results[0]?.messages ?? [];
  const violation = messages.find((m) => m.ruleId === c.expectedRuleId);

  if (violation) {
    console.log(`  PASS  ${c.name}`);
    passed += 1;
  } else {
    const got = messages.map((m) => `${m.ruleId}: ${m.message}`).join('\n        ');
    console.error(`  FAIL  ${c.name}`);
    console.error(`        expected ruleId: ${c.expectedRuleId}`);
    console.error(`        got:\n        ${got || '(no messages)'}\n`);
    failed += 1;
  }
}

// Sanity: an allowed import must NOT trigger a no-restricted-imports.
{
  const allowedCases = [
    {
      name: 'renderer: allows @cg/shared-schema',
      config: [...base, renderer()],
      code: "import { z } from '@cg/shared-schema';\nconsole.warn(z);\n",
    },
    {
      name: 'node: allows fs',
      config: [...base, node()],
      code: "import fs from 'fs';\nconsole.warn(fs);\n",
    },
    {
      name: 'broadcast: allows @cg/text-shaping',
      config: [...base, broadcast()],
      code: "import { detectDirection } from '@cg/text-shaping';\nconsole.warn(detectDirection);\n",
    },
  ];
  for (const c of allowedCases) {
    const eslint = new ESLint({
      baseConfig: c.config,
      overrideConfigFile: true,
    });
    const results = await eslint.lintText(c.code, { filePath: 'fixture.ts' });
    const messages = results[0]?.messages ?? [];
    const violation = messages.find((m) => m.ruleId === 'no-restricted-imports');
    if (!violation) {
      console.log(`  PASS  ${c.name}`);
      passed += 1;
    } else {
      console.error(`  FAIL  ${c.name}`);
      console.error(`        unexpected violation: ${violation.message}\n`);
      failed += 1;
    }
  }
}

// Files-scope sanity: when `files` is set, the tier rules only apply to
// matching paths. Lint a renderer-scoped block against a main-path file
// and confirm renderer's "fs forbidden" doesn't fire.
{
  const cfg = [...base, renderer({ files: ['src/renderer/**'] })];
  const eslint = new ESLint({
    baseConfig: cfg,
    overrideConfigFile: true,
  });
  const results = await eslint.lintText("import fs from 'fs';\nconsole.warn(fs);\n", {
    filePath: 'src/main/index.ts',
  });
  const messages = results[0]?.messages ?? [];
  const violation = messages.find((m) => m.ruleId === 'no-restricted-imports');
  if (!violation) {
    console.log('  PASS  renderer({files}) does not apply outside scope');
    passed += 1;
  } else {
    console.error('  FAIL  renderer({files}) leaked into main scope');
    failed += 1;
  }
}

// jsx-a11y: fires at `warn` severity on bad JSX, and `ignores` excludes
// the canvas/Konva editor + template-output paths.
{
  const cfg = [
    ...base,
    renderer(),
    jsxA11y({ files: ['src/**/*.tsx'], ignores: ['src/renderer/features/canvas/**'] }),
  ];
  const eslint = new ESLint({ baseConfig: cfg, overrideConfigFile: true });
  const badJsx = 'export const X = () => <img src="a.png" />;\n';

  const linted = await eslint.lintText(badJsx, { filePath: 'src/renderer/Foo.tsx' });
  const altText = (linted[0]?.messages ?? []).find((m) => m.ruleId === 'jsx-a11y/alt-text');
  if (altText && altText.severity === 1) {
    console.log('  PASS  jsx-a11y: reports alt-text at warn');
    passed += 1;
  } else {
    console.error('  FAIL  jsx-a11y: expected alt-text at warn (severity 1)');
    console.error(
      `        got: ${altText ? `severity ${altText.severity}` : '(no alt-text message)'}`,
    );
    failed += 1;
  }

  const excluded = await eslint.lintText(badJsx, {
    filePath: 'src/renderer/features/canvas/Gizmo.tsx',
  });
  const leaked = (excluded[0]?.messages ?? []).find((m) => m.ruleId === 'jsx-a11y/alt-text');
  if (!leaked) {
    console.log('  PASS  jsx-a11y: ignores excludes canvas editor paths');
    passed += 1;
  } else {
    console.error('  FAIL  jsx-a11y: fired on an excluded canvas path');
    failed += 1;
  }
}

// P-039 — the bank-shape guard (`cg/bank-shape`). One case per SHAPE the rule names,
// each a real restatement found in the tree (B-201 … B-205) or a spelling the three-
// pattern grep sweep that found the last two could not see. Then the allowed forms —
// the canonical helpers, a template that merely STARTS with the word, plain
// `start + 1` arithmetic — and the owner-file exemption by path.
{
  const cfg = base;
  const eslint = new ESLint({ baseConfig: cfg, overrideConfigFile: true });
  const fires = [
    // B-201 / B-205 — `start + count - 1` as a loop bound.
    'for (let layer = next.start; layer <= next.start + next.count - 1; layer++) use(layer);',
    // B-204 — `< start + count`.
    'for (let layer = bank.start; layer < bank.start + bank.count; layer++) use(layer);',
    // The end computed into a variable first (the `bankEnd` restatement).
    'const end = bank.start + bank.count - 1; use(end);',
    // Either order.
    'const end = bank.count + bank.start; use(end);',
    // The bed half, restated (MockRuntime).
    'for (let l = bank.low.start; l <= bank.low.start + bank.low.count - 1; l++) use(l);',
    // After a destructure — no member access left to grep for.
    'const { start, count } = bank; use(start + count);',
    // The range as an array to fill (rehearse test, skew-harness) — invisible to the sweep.
    'const layers = Array.from({ length: bank.count }, (_, i) => bank.start + i); use(layers);',
    'const layers = new Array(bank.count); use(layers);',
    // The range as an index walk — invisible to the sweep.
    'for (let i = 0; i < bank.count; i++) use(bank.start + i);',
    // B-203 — the row name rebuilt.
    'const rowName = `Layer ${String(bankPosition)}`; use(rowName);',
    'const rowName = `Bed ${String(bankPosition)}`; use(rowName);',
    "const rowName = 'Layer ' + String(bankPosition); use(rowName);",
  ];
  for (const code of fires) {
    const results = await eslint.lintText(
      `declare const bank: any; declare function use(x: unknown): void;\n${code}\n`,
      {
        filePath: 'src/some-consumer.ts',
      },
    );
    const messages = results[0]?.messages ?? [];
    const violation = messages.find((m) => m.ruleId === BANK_SHAPE_RULE_ID);
    if (violation) {
      console.log(`  PASS  bank-shape fires: ${code}`);
      passed += 1;
    } else {
      console.error(`  FAIL  bank-shape did NOT fire: ${code}`);
      console.error(
        `        got: ${messages.map((m) => `${m.ruleId}: ${m.message}`).join(' | ') || '(no messages)'}`,
      );
      failed += 1;
    }
  }

  const allowed = [
    // The canonical enumeration and predicates.
    'for (const slot of fixedBankSlots(bank)) use(slot.layer);',
    'if (isFixedBankLayer(bank, channel, layer)) use(layer);',
    'for (let layer = bank.start; layer <= fixedBankEnd(bank); layer++) use(layer);',
    // A message that merely STARTS with the word is not a row name.
    'const msg = `Layer ${String(channel)}-${String(layer)} is declared both PINNED and FIXED`; use(msg);',
    'const msg = `Layer ${layerName} is cleared immediately`; use(msg);',
    // Ordinary arithmetic on a `start` that is not the bank's.
    'const next = band.start + 1; use(next);',
    'const total = items.length + bank.count; use(total);',
  ];
  for (const code of allowed) {
    const results = await eslint.lintText(
      `declare const bank: any; declare const band: any; declare const items: unknown[]; declare const channel: number; declare const layer: number; declare const layerName: string; declare function fixedBankSlots(b: unknown): { layer: number }[]; declare function isFixedBankLayer(b: unknown, c: number, l: number): boolean; declare function fixedBankEnd(b: unknown): number; declare function use(x: unknown): void;\n${code}\n`,
      { filePath: 'src/some-consumer.ts' },
    );
    const violation = (results[0]?.messages ?? []).find((m) => m.ruleId === BANK_SHAPE_RULE_ID);
    if (!violation) {
      console.log(`  PASS  bank-shape allows: ${code}`);
      passed += 1;
    } else {
      console.error(`  FAIL  bank-shape fired on an allowed form: ${code}`);
      console.error(`        ${violation.message}`);
      failed += 1;
    }
  }

  // The owner module is exempt BY PATH — and only that path.
  const ownerCode =
    'declare const bank: any; declare function use(x: unknown): void;\nuse(bank.start + bank.count - 1);\n';
  const owner = await eslint.lintText(ownerCode, { filePath: 'src/channels/fixedLayers.ts' });
  const ownerHit = (owner[0]?.messages ?? []).find((m) => m.ruleId === BANK_SHAPE_RULE_ID);
  if (!ownerHit) {
    console.log('  PASS  bank-shape exempts the owner module (src/channels/fixedLayers.ts)');
    passed += 1;
  } else {
    console.error('  FAIL  bank-shape fired inside the owner module');
    failed += 1;
  }
  const copy = await eslint.lintText(ownerCode, { filePath: 'src/channels/fixedLayersCopy.ts' });
  const copyHit = (copy[0]?.messages ?? []).find((m) => m.ruleId === BANK_SHAPE_RULE_ID);
  if (copyHit) {
    console.log('  PASS  bank-shape does not extend the exemption to a neighbouring file');
    passed += 1;
  } else {
    console.error('  FAIL  bank-shape exempted a file that is not the owner module');
    failed += 1;
  }
}

// P-041 — the origin guard (`cg/no-hardcoded-origin`). Enabled by the RENDERER tier only.
// One case per shape the rule names — the first is the verbatim constant the Runtime used
// to probe — then the allowed forms (a namespace URL, a bare CasparCG-style host, a fully
// derived origin, the port-only import, operator text), the owner-file exemption by path,
// and the node tier NOT enabling it (the bridge legitimately logs its own bind).
{
  const clientCfg = [...base, renderer()];
  const client = new ESLint({ baseConfig: clientCfg, overrideConfigFile: true });
  const PRELUDE =
    'declare const host: string; declare const scheme: string; declare const port: number; declare function use(x: unknown): void;\n';
  const lint = async (eslint, code, filePath) => {
    const results = await eslint.lintText(PRELUDE + code + '\n', { filePath });
    return results[0]?.messages ?? [];
  };
  const hit = (messages) => messages.find((m) => m.ruleId === NO_HARDCODED_ORIGIN_RULE_ID);

  const fires = [
    // The verbatim constant (`DEFAULT_BRIDGE_WS_URL`'s value) the Runtime probed until P-041.
    "const u = 'ws://127.0.0.1:5280'; use(u);",
    // Derived host, literal bridge port — still an origin spelled by hand.
    'const u = `ws://${host}:5280`; use(u);',
    // A dev-server origin.
    "const u = 'http://localhost:5174/'; use(u);",
    // Concatenation, with the port in its own literal.
    "const u = 'http://' + host + ':4000'; use(u);",
    // A literal IPv4 — the plant pin's shape.
    "const u = 'http://192.168.21.93:7911/template/x'; use(u);",
    // host:port with no scheme.
    "const u = '127.0.0.1:5280'; use(u);",
    // The bracketed IPv6 loopback.
    "const u = 'ws://[::1]:5280'; use(u);",
    // Reading the bridge's BIND default as a client target — the import forms.
    "import { DEFAULT_BRIDGE_WS_URL } from '@cg/shared-ipc'; use(DEFAULT_BRIDGE_WS_URL);",
    "import { DEFAULT_BRIDGE_HOST } from '@cg/shared-ipc'; use(DEFAULT_BRIDGE_HOST);",
  ];
  for (const code of fires) {
    const messages = await lint(client, code, 'src/platform/some-client.ts');
    if (hit(messages)) {
      console.log(`  PASS  no-hardcoded-origin fires: ${code}`);
      passed += 1;
    } else {
      console.error(`  FAIL  no-hardcoded-origin did NOT fire: ${code}`);
      console.error(
        `        got: ${messages.map((m) => `${m.ruleId}: ${m.message}`).join(' | ') || '(no messages)'}`,
      );
      failed += 1;
    }
  }

  const allowed = [
    // A namespace URL is not an origin.
    "const ns = 'http://www.w3.org/2000/svg'; use(ns);",
    // A BARE host: the CasparCG server default's spelling — documented as unseen, on purpose.
    "const h = '127.0.0.1'; use(h);",
    // Operator text that mentions the address.
    "const msg = 'The control connection stays on 127.0.0.1.'; use(msg);",
    // A fully derived origin — the shape the owner module builds.
    'const u = `${scheme}://${host}:${String(port)}`; use(u);',
    // The port alone is the bridge's and may be imported anywhere.
    "import { DEFAULT_BRIDGE_PORT } from '@cg/shared-ipc'; use(DEFAULT_BRIDGE_PORT);",
    // A public example URL in a validation preset.
    "const example = 'https://irib.ir'; use(example);",
  ];
  for (const code of allowed) {
    const messages = await lint(client, code, 'src/platform/some-client.ts');
    const violation = hit(messages);
    if (!violation) {
      console.log(`  PASS  no-hardcoded-origin allows: ${code}`);
      passed += 1;
    } else {
      console.error(`  FAIL  no-hardcoded-origin fired on an allowed form: ${code}`);
      console.error(`        ${violation.message}`);
      failed += 1;
    }
  }

  // The owner module is exempt BY PATH — and only that path.
  const ownerCode = "const u = 'ws://127.0.0.1:5280'; use(u);";
  const owner = await lint(client, ownerCode, 'src/platform/bridgeUrl.ts');
  if (!hit(owner)) {
    console.log('  PASS  no-hardcoded-origin exempts the owner module (src/platform/bridgeUrl.ts)');
    passed += 1;
  } else {
    console.error('  FAIL  no-hardcoded-origin fired inside the owner module');
    failed += 1;
  }
  const copy = await lint(client, ownerCode, 'src/platform/bridgeUrlCopy.ts');
  if (hit(copy)) {
    console.log('  PASS  no-hardcoded-origin does not extend the exemption to a neighbouring file');
    passed += 1;
  } else {
    console.error('  FAIL  no-hardcoded-origin exempted a file that is not the owner module');
    failed += 1;
  }

  // The node tier does NOT enable it: the bridge logs the address it BINDS.
  const nodeCfg = new ESLint({ baseConfig: [...base, node()], overrideConfigFile: true });
  const nodeSide = await lint(nodeCfg, ownerCode, 'src/bridge.ts');
  if (!hit(nodeSide)) {
    console.log('  PASS  no-hardcoded-origin is not enabled by the node tier');
    passed += 1;
  } else {
    console.error('  FAIL  no-hardcoded-origin fired under the node tier');
    failed += 1;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
// `TIMING-WIRE-22 · DELTA B · R2` — the raw-control RATCHET (`cg/raw-control`).
//
// Three directions, because a ratchet that only counts UPWARDS is a ceiling: new debt in a
// clean file, new debt in a file that already has an allowance, and — the half that makes it
// a ratchet — an allowance that has grown STALE because the debt was paid. The third is what
// stops a frozen number becoming a licence somebody spends later without review.
//
// ⚠ The rule is exercised DIRECTLY here rather than through a tier, because it is enabled per
// APP (the frozen list is the app's own debt) and no tier turns it on. That is the same reason
// the origin guard has a "not enabled by the node tier" case: what a tier does NOT do is part
// of the contract too.
{
  const withRule = (allow) => [
    {
      files: ['**/*.tsx'],
      plugins: { cg: { rules: { 'raw-control': rawControlRule } } },
      languageOptions: {
        parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
      },
      rules: { 'cg/raw-control': ['error', { allow }] },
    },
  ];
  const lintAs = async (allow, code, filePath) => {
    const eslint = new ESLint({ baseConfig: withRule(allow), overrideConfigFile: true });
    const results = await eslint.lintText(code, { filePath });
    return (results[0]?.messages ?? []).filter((m) => m.ruleId === RAW_CONTROL_RULE_ID);
  };

  const ONE_INPUT = 'export const A = () => <div><input aria-label="a" /></div>;\n';
  const TWO_INPUTS =
    'export const A = () => <div><input aria-label="a" /><input aria-label="b" /></div>;\n';
  const STYLED = 'export const A = () => <Button style={{ color: "red" }}>x</Button>;\n';
  const CLEAN = 'export const A = () => <div className="cg-x"><NumericInput value="1" /></div>;\n';
  const FILE = 'src/renderer/features/x/Panel.tsx';

  /** @type {{name: string, allow: Record<string, number>, code: string, expect: 'fires'|'clean', messageId?: string}[]} */
  const ratchetCases = [
    { name: 'a raw <input> in an UNLISTED file fires', allow: {}, code: ONE_INPUT, expect: 'fires' },
    {
      name: 'a `style` prop on a control primitive fires',
      allow: {},
      code: STYLED,
      expect: 'fires',
    },
    {
      name: 'a frozen file at its exact count is CLEAN',
      allow: { [FILE]: 1 },
      code: ONE_INPUT,
      expect: 'clean',
    },
    {
      name: 'one MORE than the frozen count fires',
      allow: { [FILE]: 1 },
      code: TWO_INPUTS,
      expect: 'fires',
    },
    {
      name: 'FEWER than the frozen count fires — a stale allowance is a licence',
      allow: { [FILE]: 2 },
      code: ONE_INPUT,
      expect: 'fires',
    },
    {
      name: 'a file with no offending site and no entry is CLEAN',
      allow: {},
      code: CLEAN,
      expect: 'clean',
    },
    {
      name: 'an allowance does NOT extend to a neighbouring file',
      allow: { 'src/renderer/features/x/Other.tsx': 4 },
      code: ONE_INPUT,
      expect: 'fires',
    },
  ];

  for (const c of ratchetCases) {
    const found = await lintAs(c.allow, c.code, FILE);
    const fired = found.length > 0;
    if (fired === (c.expect === 'fires')) {
      console.log(`  PASS  raw-control: ${c.name}`);
      passed += 1;
    } else {
      console.error(`  FAIL  raw-control: ${c.name}`);
      console.error(
        `        got: ${found.map((m) => m.message).join(' | ') || '(no messages)'}`,
      );
      failed += 1;
    }
  }

  // The stale message must NAME both numbers — it is the only one that asks for an edit to
  // the config rather than to the code, so a vague version of it would not be actionable.
  const stale = await lintAs({ [FILE]: 3 }, ONE_INPUT, FILE);
  if (stale.some((m) => m.message.includes('frozen at 3') && m.message.includes('now has 1'))) {
    console.log('  PASS  raw-control: the stale message names the frozen count and the truth');
    passed += 1;
  } else {
    console.error('  FAIL  raw-control: the stale message does not name both numbers');
    console.error(`        got: ${stale.map((m) => m.message).join(' | ') || '(no messages)'}`);
    failed += 1;
  }

  // Only the EXCESS is reported, so the message lands on the edit that was just made rather
  // than on a line the file has carried for months.
  const excess = await lintAs({ [FILE]: 1 }, TWO_INPUTS, FILE);
  if (excess.length === 1) {
    console.log('  PASS  raw-control: reports only the EXCESS, not every site in the file');
    passed += 1;
  } else {
    console.error(
      `  FAIL  raw-control: reported ${String(excess.length)} site(s) where 1 was expected`,
    );
    failed += 1;
  }
}

assert.equal(failed, 0, 'eslint-config smoke checks failed');
