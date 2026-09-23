#!/usr/bin/env node
/**
 * 🔴 `DESKTOP-APPS-01` — **THE BRIDGE AS ONE ESM FILE**, for CG Control's sidecar (ADR 0011).
 *
 * The installed app runs the official `node.exe` with this one file as its argument. A Node
 * Single Executable was the other route and was not taken: on the Node this repo pins (22), a
 * SEA's entry must be CommonJS, and the CLI's top-level `await` cannot be emitted as CommonJS —
 * esbuild refuses it outright ("Top-level await is currently not supported with the cjs output
 * format"). Plain `node.exe` + a bundle has no build-time magic and ships Node's own signed binary.
 *
 * WHAT A BUNDLE CHANGES, and why each is safe:
 *   - the entry imports `../dist/index.js`; esbuild inlines it, so `dist/` must be built first
 *     (turbo's `test` task depends on `build`, and CI builds before staging);
 *   - the bridge finds NO file through `import.meta.url` or `__dirname` — every path it reads or
 *     writes arrives as a flag (`--state-home`, `--console-dir`, the per-store paths);
 *   - `ws` is CommonJS and `require`s Node built-ins by name, which an ESM bundle has no
 *     `require` for — the banner below supplies one, and it resolves nothing but built-ins;
 *   - `ws`'s optional native addons (`bufferutil`, `utf-8-validate`) are not installed and are
 *     left external: `ws` requires them inside a `try` and falls back to its JS implementation.
 *
 * Usage: `node scripts/bundle.mjs <outfile>`
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The CLI a station runs — the bundle's single entry. */
export const BRIDGE_ENTRY = path.join(here, '..', 'bin', 'caspar-bridge.mjs');

/** Bundle the CLI and everything it imports into `outfile`. */
export async function bundleBridge(outfile) {
  await build({
    entryPoints: [BRIDGE_ENTRY],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['bufferutil', 'utf-8-validate'],
    banner: {
      js:
        "import { createRequire as __cgCreateRequire } from 'node:module';\n" +
        'const require = __cgCreateRequire(import.meta.url);',
    },
    legalComments: 'none',
    logLevel: 'warning',
  });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (out === undefined) {
    console.error('usage: node scripts/bundle.mjs <outfile>');
    process.exit(1);
  }
  await bundleBridge(path.resolve(out));
  console.error(`[bundle] ${path.resolve(out)}`);
}
