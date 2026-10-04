/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — **THE THREE INSTALLERS, PACKED.** Each installer is CG Setup
 * (`tools/setup-ui`, the setup window) with that product's NSIS installer appended behind it as its
 * ENGINE — today's installer, built exactly as before and never changed. Run with `/S`, CG Setup hands
 * the command line to the engine and returns its exit code; run without, it shows the window and drives
 * the same engine silently.
 *
 * This script measures what each engine installs (the window's "Needed", and the files whose bytes
 * landing ARE its "Copying files" step) and calls `cg-setup-pack` once per product. The version is the
 * release's, read by `release-version.mjs` from every file that carries it — never typed here — and the
 * packer refuses an engine that states another.
 *
 *   node tools/release/src/pack-installers.mjs <version> --setup <dir> --out <dir> [--guide <pdf>]
 *
 * `--setup` holds `cg-setup.exe` and `cg-setup-pack.exe`; `--out` receives the three installers under
 * their built names (`releaseFiles`), so everything downstream — the artifacts, the smokes, the release
 * — sees the names it always saw.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseFiles } from './release-files.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Every file under `dir`, with its size. */
function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push({ path: full, bytes: fs.statSync(full).size });
  }
  return out;
}

/** The three products, as `cg-setup-pack` needs them. Pure over the file system it is given. */
export function packPlan({ root = REPO, version, outDir, guide = null }) {
  const names = releaseFiles(version);
  const icons = (app) => ({
    icon: path.join(root, 'apps', app, 'src-tauri', 'icons', 'icon.ico'),
    tile: path.join(root, 'apps', app, 'src-tauri', 'icons', 'icon.png'),
  });
  const size = (file) => fs.statSync(file).size;

  // CG Bridge: its payload is what it installs; the node runtime, the service host and the bridge
  // are the bytes whose landing is "Copying files".
  const payload = path.join(root, 'tools', 'bridge-installer', 'payload');
  const bridgeMain = ['cg-bridge.exe', 'shawl.exe', 'bridge/caspar-bridge.mjs'].map((rel) => ({
    path: rel.replaceAll('/', '\\'),
    bytes: size(path.join(payload, rel)),
  }));
  const app = (exe) => {
    const bytes = size(path.join(root, 'target', 'release', exe));
    return { mainFiles: [{ path: exe, bytes }], installBytes: bytes };
  };
  return [
    {
      product: 'bridge',
      engine: path.join(root, 'tools', 'bridge-installer', names.bridge.built),
      out: path.join(outDir, names.bridge.built),
      // CG Bridge has no window of its own; it is CG Control's service and wears CG Control's tile.
      ...icons('runtime'),
      mainFiles: bridgeMain,
      installBytes: filesUnder(payload).reduce((sum, f) => sum + f.bytes, 0),
      guide,
    },
    {
      product: 'control',
      engine: path.join(root, 'target', 'release', 'bundle', 'nsis', names.control.built),
      out: path.join(outDir, names.control.built),
      ...icons('runtime'),
      ...app('cg-control.exe'),
      guide,
    },
    {
      product: 'designer',
      engine: path.join(root, 'target', 'release', 'bundle', 'nsis', names.designer.built),
      out: path.join(outDir, names.designer.built),
      ...icons('designer'),
      ...app('cg-designer.exe'),
      guide,
    },
  ];
}

/** `cg-setup-pack`'s arguments for one product. */
export function packArgs(item, { version, setupDir }) {
  const args = [
    '--ui',
    path.join(setupDir, 'cg-setup.exe'),
    '--engine',
    item.engine,
    '--product',
    item.product,
    '--version',
    version,
    '--install-bytes',
    String(item.installBytes),
  ];
  for (const f of item.mainFiles) args.push('--main', `${f.path}=${String(f.bytes)}`);
  args.push('--icon', item.icon, '--tile', item.tile);
  if (item.guide !== null) args.push('--guide', item.guide);
  args.push('--out', item.out);
  return args;
}

function main(argv) {
  const [version] = argv;
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const setupDir = opt('--setup');
  const outDir = opt('--out');
  const guide = opt('--guide');
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || setupDir === null || outDir === null) {
    process.stderr.write(
      'usage: pack-installers.mjs <version> --setup <dir> --out <dir> [--guide <pdf>]\n',
    );
    return 2;
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const item of packPlan({ version, outDir, guide })) {
    const r = spawnSync(path.join(setupDir, 'cg-setup-pack.exe'), packArgs(item, { version, setupDir }), {
      stdio: 'inherit',
    });
    if (r.status !== 0) {
      process.stderr.write(`packing ${item.product} failed (${String(r.status)})\n`);
      return 1;
    }
    const before = fs.statSync(item.engine).size;
    const after = fs.statSync(item.out).size;
    process.stdout.write(
      `${path.basename(item.out)}: engine ${String(before)} bytes, installer ${String(after)} bytes (+${String(after - before)})\n`,
    );
  }
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
