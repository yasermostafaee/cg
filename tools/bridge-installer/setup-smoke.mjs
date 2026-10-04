#!/usr/bin/env node
/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — **CG BRIDGE'S INSTALLER: THE SAME SILENT CONTRACT, AND ITS NEW
 * WINDOW.** Run elevated, after `smoke.mjs` (which ends with CG Bridge uninstalled, its data folder
 * kept), on the same clean runner.
 *
 *   A. THE SILENT PATHS ARE THE ENGINE'S. The installer and its engine (today's NSIS installer, the
 *      exact file appended behind CG Setup) are run with the same arguments, and must exit the same:
 *      a refused configuration (`/OSCPORT=6250`) → 2 from both; an install → 0 from both; the
 *      uninstall line of `CG-BRIDGE-FOR-PLAYOUT.md` §2 → 0.
 *   B. A FRESH install through the window: Welcome (its service and ports), Location (the folders as
 *      facts), Installing, Done (the service read: running) — and "Open CG Bridge status" opens
 *      `/health`.
 *   C. An UPDATE: Installed apps names an older release — "Update from … to …", and the configuration
 *      is kept.
 *   D. A FAILED install (an argument the engine refuses, given to the window): the Error page names the
 *      step, Close exits 2.
 *
 * Usage (elevated): node tools/bridge-installer/setup-smoke.mjs --installer <setup.exe> --engine <engine.exe>
 *   --version <x.y.z> --out <dir>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  checks,
  exitCode,
  launch,
  page,
  shot,
  sleep,
  uia,
  until,
} from '../../apps/runtime/tests/desktop/setup-window.mjs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, v, i, all) => (i % 2 === 0 ? [...pairs, [v.replace(/^--/, ''), all[i + 1]]] : pairs),
      [],
    ),
);
const OUT = path.resolve(args.out ?? 'bridge-setup');
const VERSION = args.version;
const OLDER = '0.9.9';
const TITLE = 'CG Bridge Setup';
const PROGRAM_DIR = path.join(
  process.env.ProgramW6432 ?? process.env.ProgramFiles ?? 'C:\\Program Files',
  'CG Bridge',
);
const DATA_DIR = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'CG Bridge');
const KEY = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CGBridge';
const { check, save } = checks(OUT);

const code = (file, argv) => spawnSync(file, argv, { windowsHide: true }).status;
const uninstall = () =>
  spawnSync(`"${path.join(PROGRAM_DIR, 'uninstall.exe')}" /S _?=${PROGRAM_DIR}`, {
    shell: true,
    windowsHide: true,
  }).status;
function displayVersion() {
  try {
    const text = execFileSync('reg', ['query', KEY, '/v', 'DisplayVersion', '/reg:64'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}
const config = () => JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cg-bridge.json'), 'utf8'));
function edgeAt(url) {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${url}*' }).Count`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    return Number.parseInt(out.trim(), 10) > 0;
  } catch {
    return false;
  }
}

// ── A. the silent paths, against the engine alone ───────────────────────────────────────────────
{
  const refusedEngine = code(args.engine, ['/S', '/OSCPORT=6250']);
  const refusedSetup = code(args.installer, ['/S', '/OSCPORT=6250']);
  check(
    'A refused configuration (/S /OSCPORT=6250): the engine alone exits 2',
    refusedEngine === 2,
    String(refusedEngine),
  );
  check(
    '…and the installer exits the same, 2',
    refusedSetup === refusedEngine,
    String(refusedSetup),
  );
  const engineInstall = code(args.engine, ['/S']);
  const setupInstall = code(args.installer, ['/S']);
  check('An install (/S): the engine alone exits 0', engineInstall === 0, String(engineInstall));
  check(
    '…and the installer, over it, exits the same, 0',
    setupInstall === engineInstall,
    String(setupInstall),
  );
  check(
    '…and Installed apps names the release',
    displayVersion() === VERSION,
    String(displayVersion()),
  );
  const removed = uninstall();
  check(
    'The uninstall line (uninstall.exe /S _?=<folder>) exits 0',
    removed === 0,
    String(removed),
  );
  fs.rmSync(PROGRAM_DIR, { recursive: true, force: true });
}

async function captureInstalling(file) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const pg = page(TITLE, 5);
    if (!pg.ok) return false;
    const pct = pg.elements.find((e) => /^\d+%$/.test(e.name));
    if (pg.byId.progress !== undefined && pct !== undefined && Number.parseInt(pct.name, 10) > 0)
      return shot(TITLE, file).ok;
    if (pg.byId.finish !== undefined || pg.byId.close !== undefined) return false;
    await sleep(150);
  }
  return false;
}

// ── B. a fresh install, through the window ───────────────────────────────────────────────────────
{
  const r = launch(args.installer);
  check('B. the setup window opens', uia(TITLE, 'wait', '', 90).ok);
  await sleep(700);
  let pg = page(TITLE);
  check(
    'Welcome asks "Install CG Bridge?"',
    pg.byId.title?.name === 'Install CG Bridge?',
    pg.byId.title?.name,
  );
  check(
    '…a Windows service, its ports',
    pg.names.includes('A Windows service · ports 5280, 7911 · UDP 6251'),
    pg.names.join(' | '),
  );
  check(
    '…the publisher and this release',
    pg.names.includes('Publisher: APASAI') && pg.names.includes(`Version ${VERSION}`),
  );
  shot(TITLE, path.join(OUT, 'bridge-welcome.png'));
  uia(TITLE, 'invoke', 'next');
  pg = until(TITLE, 'PROGRAM', 20);
  check(
    'Location: the program and data folders, as facts (no Change)',
    pg.names.includes(PROGRAM_DIR) && pg.names.includes(DATA_DIR) && pg.byId.change === undefined,
    pg.names.join(' | '),
  );
  shot(TITLE, path.join(OUT, 'bridge-location.png'));
  uia(TITLE, 'invoke', 'install');
  check(
    'Installing: a moving bar, captured',
    await captureInstalling(path.join(OUT, 'bridge-installing.png')),
  );
  pg = until(TITLE, 'is installed', 300);
  check(
    'Done — "CG Bridge is installed"',
    pg.byId.title?.name === 'CG Bridge is installed',
    pg.byId.title?.name ?? pg.error,
  );
  check(
    '…the service, read: running',
    pg.names.includes('Service CGBridge · running'),
    pg.names.join(' | '),
  );
  check('…one option, "Open CG Bridge status"', pg.byId.launch?.name === 'Open CG Bridge status');
  shot(TITLE, path.join(OUT, 'bridge-done.png'));
  uia(TITLE, 'invoke', 'finish');
  const exited = await exitCode(r, 30_000);
  check('Finish exits 0', exited === 0, String(exited));
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) {
    opened = edgeAt('127.0.0.1:5280/health');
    if (!opened) await sleep(500);
  }
  check('"Open CG Bridge status" opens http://127.0.0.1:5280/health', opened);
  spawnSync('taskkill', ['/IM', 'msedge.exe', '/F'], { windowsHide: true });
}

// ── C. an update keeps the configuration ─────────────────────────────────────────────────────────
{
  const before = config();
  execFileSync(
    'reg',
    ['add', KEY, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', OLDER, '/f', '/reg:64'],
    { windowsHide: true },
  );
  const r = launch(args.installer);
  check('C. the setup window opens', uia(TITLE, 'wait', '', 90).ok);
  await sleep(700);
  let pg = page(TITLE);
  check(
    'Welcome asks "Update CG Bridge?"',
    pg.byId.title?.name === 'Update CG Bridge?',
    pg.byId.title?.name,
  );
  const line = `Update from ${OLDER} to ${VERSION}. Your settings are kept.`;
  check(`"${line}"`, pg.names.includes(line), pg.names.join(' | '));
  shot(TITLE, path.join(OUT, 'bridge-update.png'));
  uia(TITLE, 'invoke', 'next');
  until(TITLE, 'PROGRAM', 20);
  uia(TITLE, 'invoke', 'install');
  pg = until(TITLE, 'is updated', 300);
  check(
    'Done — "CG Bridge is updated"',
    pg.byId.title?.name === 'CG Bridge is updated',
    pg.byId.title?.name ?? pg.error,
  );
  shot(TITLE, path.join(OUT, 'bridge-update-done.png'));
  uia(TITLE, 'toggle', 'launch');
  uia(TITLE, 'invoke', 'finish');
  check('Finish exits 0', (await exitCode(r, 30_000)) === 0);
  check(
    'Installed apps names the release again',
    displayVersion() === VERSION,
    String(displayVersion()),
  );
  check(
    'the configuration is kept',
    JSON.stringify(config()) === JSON.stringify(before),
    JSON.stringify(config()),
  );
}

// ── D. a failed install ──────────────────────────────────────────────────────────────────────────
{
  const r = launch(args.installer, '/OSCPORT=6250');
  check(
    'D. the setup window opens (with /OSCPORT=6250 on its command line)',
    uia(TITLE, 'wait', '', 90).ok,
  );
  uia(TITLE, 'invoke', 'next');
  until(TITLE, 'PROGRAM', 20);
  uia(TITLE, 'invoke', 'install');
  const pg = until(TITLE, 'was not', 300);
  check(
    'the Error page names the step that failed',
    pg.names.includes('Writing the configuration failed.'),
    pg.names.join(' | '),
  );
  check('…marks Installing failed on the rail', pg.byId['step-3']?.status === 'failed');
  check(
    '…and offers Open log and Close',
    pg.byId['open-log'] !== undefined && pg.byId.close?.name === 'Close',
  );
  shot(TITLE, path.join(OUT, 'bridge-error.png'));
  uia(TITLE, 'invoke', 'close');
  check('Close exits 2', (await exitCode(r, 30_000)) === 2);
  // Leave the runner as smoke.mjs left it: put it right, then remove it.
  check('a silent install afterwards exits 0', code(args.installer, ['/S']) === 0);
  check('…and the uninstall line exits 0', uninstall() === 0);
}

process.exit(save('results-setup.json') ? 0 : 1);
