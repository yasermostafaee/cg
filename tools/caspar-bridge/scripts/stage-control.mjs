#!/usr/bin/env node
/**
 * 🔴 `DESKTOP-APPS-01` — **STAGE CG CONTROL'S PAYLOAD for `tauri build`** (ADR 0011).
 *
 * Writes the three things `apps/runtime/src-tauri/tauri.conf.json` bundles and nothing else:
 *
 *   payload/bridge/caspar-bridge.mjs   the bridge, as one ESM file (`bundle.mjs`)
 *   payload/console/                   the Runtime's built `dist`, served by the bridge on 5174
 *   starting-dist/                     the window's first page: the console's OWN splash,
 *                                      composed from that `dist` (`FIELD-FIXES-01` J)
 *   binaries/cg-bridge-<triple>.exe    the official `node.exe` — the one running this script,
 *                                      i.e. the Node CI installed from nodejs.org — which
 *                                      the installer names `cg-bridge.exe`
 *
 * All three directories are gitignored and rebuilt from scratch on every run. Windows only: the
 * sidecar is a Windows executable and the installer is NSIS.
 *
 * Needs `pnpm build` first (the bridge's `dist/` and the Runtime's `dist/`).
 * Usage: `node tools/caspar-bridge/scripts/stage-control.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeStartingPage,
  STARTING_SCRIPT,
  STARTING_STYLE,
} from '../../../apps/runtime/src-tauri/starting/compose.mjs';
import { bundleBridge } from './bundle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const tauriDir = path.join(repo, 'apps', 'runtime', 'src-tauri');
const payload = path.join(tauriDir, 'payload');
const binaries = path.join(tauriDir, 'binaries');
const startingSource = path.join(tauriDir, 'starting');
const starting = path.join(tauriDir, 'starting-dist');
const consoleDist = path.join(repo, 'apps', 'runtime', 'dist');
const TRIPLE = 'x86_64-pc-windows-msvc';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error(
    `[stage] CG Control's sidecar is a Windows x64 build; this is ${process.platform}-${process.arch}.`,
  );
  process.exit(1);
}
if (!fs.existsSync(path.join(consoleDist, 'index.html'))) {
  console.error(`[stage] no built console at ${consoleDist} — run \`pnpm build\` first.`);
  process.exit(1);
}

fs.rmSync(payload, { recursive: true, force: true });
fs.rmSync(binaries, { recursive: true, force: true });
fs.rmSync(starting, { recursive: true, force: true });

await bundleBridge(path.join(payload, 'bridge', 'caspar-bridge.mjs'));
fs.cpSync(consoleDist, path.join(payload, 'console'), { recursive: true });
// `FIELD-FIXES-01` J — one splash: the window's first page is the console's own, from this build.
fs.mkdirSync(starting, { recursive: true });
fs.writeFileSync(
  path.join(starting, 'index.html'),
  composeStartingPage(fs.readFileSync(path.join(consoleDist, 'index.html'), 'utf8')),
);
for (const file of [STARTING_SCRIPT, STARTING_STYLE]) {
  fs.copyFileSync(path.join(startingSource, file), path.join(starting, file));
}
fs.mkdirSync(binaries, { recursive: true });
const node = path.join(binaries, `cg-bridge-${TRIPLE}.exe`);
fs.copyFileSync(process.execPath, node);

console.error(`[stage] bridge  -> ${path.relative(repo, path.join(payload, 'bridge'))}`);
console.error(`[stage] console -> ${path.relative(repo, path.join(payload, 'console'))}`);
console.error(`[stage] starting page -> ${path.relative(repo, starting)}`);
console.error(`[stage] node ${process.version} -> ${path.relative(repo, node)}`);
