#!/usr/bin/env node
/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A (D1) — **STAGE CG BRIDGE'S PAYLOAD** for its NSIS installer
 * (`tools/bridge-installer/cg-bridge.nsi`).
 *
 *   tools/bridge-installer/payload/cg-bridge.exe             the official `node.exe` — the one running
 *                                                            this script, i.e. the Node CI installed
 *                                                            from nodejs.org, renamed
 *   tools/bridge-installer/payload/shawl.exe                 Shawl 1.9.0, the service host (MIT), built
 *                                                            by CI from crates.io
 *   tools/bridge-installer/payload/bridge/caspar-bridge.mjs  the bridge, as one ESM file (`bundle.mjs`)
 *   tools/bridge-installer/payload/licenses/                 Node's and Shawl's licences
 *
 * The directory is gitignored and rebuilt from scratch on every run. Windows x64 only. Nothing here
 * is fetched at install time: the installer carries every byte it installs.
 *
 * Needs `pnpm build` first (the bridge's `dist/`).
 * Usage: `node tools/caspar-bridge/scripts/stage-bridge.mjs --shawl <path to shawl.exe>`
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleBridge } from './bundle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const payload = path.join(repo, 'tools', 'bridge-installer', 'payload');

const shawlArg = process.argv.indexOf('--shawl');
const shawl = shawlArg >= 0 ? process.argv[shawlArg + 1] : undefined;

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error(
    `[stage] CG Bridge is a Windows x64 service; this is ${process.platform}-${process.arch}.`,
  );
  process.exit(1);
}
if (shawl === undefined || !fs.existsSync(shawl)) {
  console.error(
    '[stage] --shawl <path to shawl.exe> is required (CI: `cargo install shawl --version 1.9.0 --locked`).',
  );
  process.exit(1);
}

fs.rmSync(payload, { recursive: true, force: true });
fs.mkdirSync(path.join(payload, 'licenses'), { recursive: true });

await bundleBridge(path.join(payload, 'bridge', 'caspar-bridge.mjs'));
fs.copyFileSync(process.execPath, path.join(payload, 'cg-bridge.exe'));
fs.copyFileSync(shawl, path.join(payload, 'shawl.exe'));

// Licences: Node's beside its exe (the nodejs.org zip ships it); Shawl's from the crate cargo built.
const nodeLicense = path.join(path.dirname(process.execPath), 'LICENSE');
if (fs.existsSync(nodeLicense)) {
  fs.copyFileSync(nodeLicense, path.join(payload, 'licenses', 'node-LICENSE.txt'));
} else {
  console.error(`[stage] ⚠ Node's LICENSE is not beside ${process.execPath}`);
}
const registry = path.join(os.homedir(), '.cargo', 'registry', 'src');
const shawlLicense = fs.existsSync(registry)
  ? fs
      .readdirSync(registry)
      .map((index) => path.join(registry, index, 'shawl-1.9.0', 'LICENSE'))
      .find((file) => fs.existsSync(file))
  : undefined;
if (shawlLicense !== undefined) {
  fs.copyFileSync(shawlLicense, path.join(payload, 'licenses', 'shawl-LICENSE.txt'));
} else {
  console.error("[stage] ⚠ Shawl 1.9.0's LICENSE was not found in the cargo registry");
}

for (const file of ['cg-bridge.exe', 'shawl.exe', path.join('bridge', 'caspar-bridge.mjs')]) {
  const size = fs.statSync(path.join(payload, file)).size;
  console.error(`[stage] ${file} (${String(Math.round(size / 1024))} KB)`);
}
console.error(`[stage] node ${process.version} -> ${path.relative(repo, payload)}`);
