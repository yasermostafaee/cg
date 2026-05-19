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
    name: 'node: forbids @cg/shared-ui',
    config: [...base, node()],
    code: "import { Button } from '@cg/shared-ui';\nconsole.warn(Button);\n",
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
  const results = await eslint.lintText(
    "import fs from 'fs';\nconsole.warn(fs);\n",
    { filePath: 'src/main/index.ts' },
  );
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

console.log(`\n${passed} passed, ${failed} failed`);
assert.equal(failed, 0, 'eslint-config smoke checks failed');
