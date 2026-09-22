#!/usr/bin/env node
/**
 * `pnpm dev:playout-auth`'s entry point — a shim whose only job is to fail LEGIBLY on a Node
 * that cannot run the script beside it.
 *
 * ⚠ `dev-playout.ts` imports the acceptance suite's fake Playout directly, which is what keeps
 * the owner's demo and the tests on ONE implementation. That costs a Node that strips types at
 * run time (v23+). The repo's `.nvmrc` pins **22**, where the import fails with a
 * `Unknown file extension ".ts"` that says nothing about what to do — so the version is checked
 * here, in a file every Node can parse, and the message names the remedy.
 *
 * It is a DEV convenience and is never on a CI path; the e2e that asserts the same behaviour
 * spawns `bin/caspar-bridge.mjs` and needs no type stripping.
 */
const major = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(major) || major < 23) {
  console.error(
    `[dev-playout] needs Node 23 or newer to run its TypeScript directly — this is Node ` +
      `${process.versions.node}. It imports the acceptance suite's fake Playout so the demo and ` +
      `the tests cannot drift, and type stripping is what makes that possible. Use a newer Node ` +
      `for this one command; nothing else in the repo needs it.`,
  );
  process.exit(1);
}

await import('./dev-playout.ts');
