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
 * 🔴 `RELEASE-0111-01` Part A (`P-065`) — CG Bridge's Playout page (Welcome → Location → Playout):
 *   B. unticked, the page is the checkbox and the Playout on this machine, and the install is today's:
 *      the configuration equals what `/S` alone writes.
 *   E. refused ON THE PAGE, in words: an empty Playout address, then one the engine's rules refuse
 *      (`ftp://192.0.2.10`) — Cancel exits 1 and nothing is installed. CONTROL: the same value on the
 *      command line (`/S /PLAYOUT=ftp://192.0.2.10`) exits as it always did, the engine alone and the
 *      installer alike — the install does not refuse it; the service it leaves cannot start.
 *   F. ticked and filled: the configuration equals, field by field, what `/S /PLAYOUT=… /AMCPHOST=…
 *      /BRIDGEADDRESS=…` writes; the service runs and `/health` names that Playout.
 *   G. (`--previous`) an upgrade from the `0.11.0` installer, installed as a separate server by command
 *      line: the page opens ticked and filled from the stored configuration, and the values are kept.
 *   H. (`R-098`) Explicit unattended standalone installs with direct AMCP and loopback control,
 *      and retains its mode and custom endpoint on a silent upgrade with no options.
 *
 * Usage (elevated): node tools/bridge-installer/setup-smoke.mjs --installer <setup.exe> --engine <engine.exe>
 *   --version <x.y.z> --out <dir> [--previous <CG-Bridge_0.11.0_x64-setup.exe> --previous-version 0.11.0]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
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
const SHARED_TEXT = path.join(OUT, 'shared text');
const KEY = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CGBridge';
const { check, save } = checks(OUT);
fs.mkdirSync(SHARED_TEXT, { recursive: true });

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
const CONFIG = path.join(DATA_DIR, 'cg-bridge.json');
const config = () => JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
/** The configuration, or `null` when there is none. */
const configOrNull = () => (fs.existsSync(CONFIG) ? config() : null);
/** Uninstall, and forget the configuration: the next install is a first install. */
function fresh() {
  if (fs.existsSync(path.join(PROGRAM_DIR, 'uninstall.exe'))) uninstall();
  fs.rmSync(PROGRAM_DIR, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
}
/** Field by field: every key of either, equal. */
function sameFields(a, b) {
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
  const differ = keys.filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
  return { same: differ.length === 0, keys, differ };
}
/** CG Bridge's `/health`, once it answers 200 (or `null`). */
async function health(ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch('http://127.0.0.1:5280/health');
      if (res.status === 200) return await res.json();
    } catch {
      // not yet
    }
    await sleep(1000);
  }
  return null;
}
/** Welcome → Location → the Playout page (`RELEASE-0111-01` Part A). */
function toServerPage(marker = 'separate server') {
  uia(TITLE, 'invoke', 'next');
  until(TITLE, 'PROGRAM', 20);
  uia(TITLE, 'invoke', 'next');
  return until(TITLE, marker, 20);
}
const PLAYOUT_ENGINE = 'APASAI Playout Engine';
const PLAYOUT_DOC = '192.0.2.10';
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

/** What a local console can read before any authentication. */
function localCapabilities() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:5280');
    const finish = (payload) => {
      clearTimeout(timer);
      ws.close();
      resolve(payload);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'request',
          id: 'caps',
          channel: 'bridge.capabilities',
          payload: {},
        }),
      );
    });
    ws.addEventListener('message', (event) => {
      const frame = JSON.parse(String(event.data));
      if (frame.type === 'response' && frame.id === 'caps') finish(frame.payload ?? null);
    });
    ws.addEventListener('error', () => finish(null));
  });
}

/** What `/S` alone writes on a first install — the baseline an unticked Playout page must equal. */
let silentConfig = null;

// ── A. the silent paths, against the engine alone ───────────────────────────────────────────────
{
  // A first install: the configuration `smoke.mjs` left (its data folder is kept) is forgotten.
  fresh();
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
  silentConfig = configOrNull();
  check(
    'what /S alone writes on a first install: this machine’s Playout',
    silentConfig?.playoutAddress === 'http://127.0.0.1:8080',
    JSON.stringify(silentConfig),
  );
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
  fresh();
}

async function captureInstalling(file) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const pg = page(TITLE, 5);
    if (!pg.ok) return false;
    if (pg.byId.progress !== undefined) return shot(TITLE, file).ok;
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
  check(
    '…and it goes on with Next (CG Bridge’s Playout page comes before Install)',
    pg.byId.next !== undefined && pg.byId.install === undefined,
  );
  shot(TITLE, path.join(OUT, 'bridge-location.png'));
  uia(TITLE, 'invoke', 'next');
  pg = until(TITLE, 'separate server', 20);
  check(
    'APASAI Playout Engine: the page, its rail step current',
    pg.byId.title?.name === PLAYOUT_ENGINE &&
      pg.byId['step-3']?.name === PLAYOUT_ENGINE &&
      pg.byId['step-3']?.status === 'current',
    `${String(pg.byId.title?.name)} ${String(pg.byId['step-3']?.status)}`,
  );
  check(
    'the separate-server option is unticked and a fresh Setup exposes no standalone switch',
    pg.byId['separate-server']?.name ===
      'CG Bridge and APASAI Playout Engine run on separate servers' &&
      pg.byId['separate-server']?.state === 'Off' &&
      pg.byId['no-playout'] === undefined &&
      pg.byId['standalone-amcp-host'] === undefined,
    JSON.stringify(pg.byId['separate-server']),
  );
  check(
    '…and the Playout on this machine, as a fact; no field',
    pg.names.includes('http://127.0.0.1:8080 · on this machine') &&
      pg.byId['playout-address'] === undefined,
    pg.names.join(' | '),
  );
  shot(TITLE, path.join(OUT, 'bridge-server-unticked.png'));
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
  // `RELEASE-0111-01` Part A — unticked is today's install: the same configuration `/S` writes.
  const unticked = sameFields(configOrNull(), silentConfig);
  check(
    'unticked, the configuration is what /S alone writes, field by field',
    unticked.same,
    `${JSON.stringify(configOrNull())} — differs on ${unticked.differ.join(', ')}`,
  );
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
  pg = toServerPage();
  check(
    '…its Playout page opens unticked: this machine was set up as the Playout machine',
    pg.byId['separate-server']?.state === 'Off',
    JSON.stringify(pg.byId['separate-server']),
  );
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
  toServerPage();
  uia(TITLE, 'invoke', 'install');
  const pg = until(TITLE, 'was not', 300);
  check(
    'the Error page names the step that failed',
    pg.names.includes('Writing the configuration failed.'),
    pg.names.join(' | '),
  );
  // Welcome · Location · Playout · Installing · Done: Installing is the fourth step.
  check('…marks Installing failed on the rail', pg.byId['step-4']?.status === 'failed');
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

// ── E. the separate-server page refuses in words, on the page (`RELEASE-0111-01` §A2) ────────────
{
  fresh();
  const r = launch(args.installer);
  check('E. the setup window opens', uia(TITLE, 'wait', '', 90).ok);
  await sleep(700);
  toServerPage();
  const ticked = uia(TITLE, 'toggle', 'separate-server');
  check(
    'ticking "CG Bridge runs on a separate server" turns it on',
    ticked.state === 'On',
    JSON.stringify(ticked),
  );
  let pg = until(TITLE, 'APASAI PLAYOUT ENGINE ADDRESS', 20);
  check(
    '…and asks for the Playout Engine address and AMCP host, plus this server’s address',
    pg.byId['playout-address']?.type === 'Edit' &&
      pg.byId['amcp-host']?.type === 'Edit' &&
      pg.byId['amcp-host']?.name === 'APASAI Playout Engine (AMCP) host' &&
      pg.byId['address-other']?.type === 'RadioButton',
    pg.elements.map((e) => `${String(e.id)}:${String(e.type)}`).join(' | '),
  );
  uia(TITLE, 'invoke', 'install');
  pg = until(TITLE, 'Type the APASAI Playout Engine address.', 20);
  check(
    'an EMPTY Playout address is refused on the page, in words',
    pg.names.includes('Type the APASAI Playout Engine address.') &&
      pg.byId.title?.name === PLAYOUT_ENGINE,
    pg.names.join(' | '),
  );
  const typed = uia(TITLE, 'set', 'playout-address=ftp://192.0.2.10');
  check(
    'a value can be typed into the field (UI Automation)',
    typed.value === 'ftp://192.0.2.10',
    JSON.stringify(typed),
  );
  uia(TITLE, 'invoke', 'install');
  pg = until(TITLE, 'That is not an APASAI Playout Engine address.', 20);
  check(
    'an address the engine’s rules refuse is refused on the page, in CG Control’s own words',
    pg.names.includes('That is not an APASAI Playout Engine address.') &&
      pg.byId.title?.name === PLAYOUT_ENGINE,
    pg.names.join(' | '),
  );
  shot(TITLE, path.join(OUT, 'bridge-server-refused.png'));
  // The Playout page has no Cancel button — like Location, it is left with Back, Esc or the window's ×.
  uia(TITLE, 'invoke', 'close-window');
  const closed = await exitCode(r, 30_000);
  check('closing the window on the page (×) exits 1', closed === 1, String(closed));
  // A window left open would share its title with the next section's.
  if (closed === null) r.child.kill();
  check('…and nothing was installed', displayVersion() === null, String(displayVersion()));

  // CONTROL — the same value on the command line exits as it always did: the install does not refuse it.
  const engineCode = code(args.engine, ['/S', '/PLAYOUT=ftp://192.0.2.10']);
  fresh();
  const setupCode = code(args.installer, ['/S', '/PLAYOUT=ftp://192.0.2.10']);
  check(
    `CONTROL: /S /PLAYOUT=ftp://192.0.2.10 exits ${String(engineCode)} from the engine alone, and the same from the installer`,
    setupCode === engineCode,
    `engine ${String(engineCode)}, installer ${String(setupCode)}`,
  );
  check(
    '…and the service it leaves never answers /health — the failure the page says first',
    (await health(30_000)) === null,
  );
  fresh();
}

// ── F. ticked and filled: exactly what the command line writes (`RELEASE-0111-01` §A2) ────────────
let serverIp = null;
{
  const r = launch(args.installer);
  check('F. the setup window opens', uia(TITLE, 'wait', '', 90).ok);
  await sleep(700);
  toServerPage();
  uia(TITLE, 'toggle', 'separate-server');
  until(TITLE, 'PLAYOUT ADDRESS', 20);
  uia(TITLE, 'set', `shared-text-folder=${SHARED_TEXT}`);
  uia(TITLE, 'set', `playout-address=${PLAYOUT_DOC}`);
  let pg = page(TITLE);
  check(
    'the AMCP host follows the Playout Engine address',
    pg.byId['amcp-host']?.value === PLAYOUT_DOC,
    JSON.stringify(pg.byId['amcp-host']),
  );
  const listed = pg.elements.filter((e) => /^address-\d+$/.test(String(e.id)));
  check(
    'this server’s addresses are listed, loopback never among them',
    listed.length > 0 && listed.every((e) => !String(e.name).startsWith('127.')),
    listed.map((e) => e.name).join(', '),
  );
  serverIp = listed[0]?.name ?? null;
  uia(TITLE, 'select', 'address-0');
  pg = page(TITLE);
  check(
    '…and one is chosen',
    pg.byId['address-0']?.selected === true,
    JSON.stringify(pg.byId['address-0']),
  );
  shot(TITLE, path.join(OUT, 'bridge-server-filled.png'));
  uia(TITLE, 'invoke', 'install');
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
  uia(TITLE, 'toggle', 'launch');
  uia(TITLE, 'invoke', 'finish');
  check('Finish exits 0', (await exitCode(r, 30_000)) === 0);
  const fromPage = configOrNull();
  const h = await health();
  check(
    '/health names that Playout',
    h?.playout?.address === `http://${PLAYOUT_DOC}:8080`,
    JSON.stringify(h?.playout ?? null),
  );
  // What a command-line user's install writes, on the same first-install state.
  fresh();
  const silent = code(args.installer, [
    '/S',
    `/PLAYOUT=http://${PLAYOUT_DOC}:8080`,
    `/AMCPHOST=${PLAYOUT_DOC}`,
    `/BRIDGEADDRESS=${String(serverIp)}`,
    `/TEXTSOURCEROOT=${SHARED_TEXT}`,
  ]);
  check('the same values on the command line install too (exit 0)', silent === 0, String(silent));
  const fromCommand = configOrNull();
  const cmp = sameFields(fromPage, fromCommand);
  check(
    `the page's configuration equals the command line's, field by field (${cmp.keys.join(', ')})`,
    cmp.same && fromPage?.bridgeAddress === serverIp && fromPage?.textSourceRoot === SHARED_TEXT,
    `page ${JSON.stringify(fromPage)} · command line ${JSON.stringify(fromCommand)}`,
  );
}

// ── G. an upgrade from 0.11.0, installed as a separate server by command line (§A2) ──────────────
if (args.previous !== undefined && serverIp !== null) {
  fresh();
  const prior = code(args.previous, [
    '/S',
    `/PLAYOUT=http://${PLAYOUT_DOC}:8080`,
    `/AMCPHOST=${PLAYOUT_DOC}`,
    `/BRIDGEADDRESS=${serverIp}`,
  ]);
  check(
    `G. ${String(args['previous-version'])} installed as a separate server by command line (exit 0)`,
    prior === 0,
    String(prior),
  );
  check(
    '…Installed apps names it',
    displayVersion() === args['previous-version'],
    String(displayVersion()),
  );
  const before = configOrNull();
  const r = launch(args.installer);
  check('the setup window opens', uia(TITLE, 'wait', '', 90).ok);
  await sleep(700);
  let pg = page(TITLE);
  const line = `Update from ${String(args['previous-version'])} to ${VERSION}. Your settings are kept.`;
  check(`"${line}"`, pg.names.includes(line), pg.names.join(' | '));
  pg = toServerPage();
  check(
    'the Playout page opens TICKED, from the stored configuration',
    pg.byId['separate-server']?.state === 'On',
    JSON.stringify(pg.byId['separate-server']),
  );
  check(
    '…the Playout Engine address and AMCP host filled in',
    pg.byId['playout-address']?.value === `http://${PLAYOUT_DOC}:8080` &&
      pg.byId['amcp-host']?.value === PLAYOUT_DOC,
    `${JSON.stringify(pg.byId['playout-address'])} ${JSON.stringify(pg.byId['amcp-host'])}`,
  );
  const chosen = pg.elements.find((e) => e.selected === true);
  check(
    '…and this server’s address chosen',
    chosen?.name === serverIp,
    JSON.stringify(chosen ?? null),
  );
  shot(TITLE, path.join(OUT, 'bridge-server-upgrade.png'));
  uia(TITLE, 'invoke', 'install');
  pg = until(TITLE, 'is updated', 300);
  check(
    'Done — "CG Bridge is updated"',
    pg.byId.title?.name === 'CG Bridge is updated',
    pg.byId.title?.name ?? pg.error,
  );
  uia(TITLE, 'toggle', 'launch');
  uia(TITLE, 'invoke', 'finish');
  check('Finish exits 0', (await exitCode(r, 30_000)) === 0);
  const after = configOrNull();
  const kept = sameFields(before, after);
  check(
    'the values are kept, field by field',
    kept.same,
    `before ${JSON.stringify(before)} · after ${JSON.stringify(after)}`,
  );
  check(
    'Installed apps names the new release',
    displayVersion() === VERSION,
    String(displayVersion()),
  );
  const h = await health();
  check(
    '/health names the same Playout',
    h?.playout?.address === `http://${PLAYOUT_DOC}:8080`,
    JSON.stringify(h?.playout ?? null),
  );
} else if (args.previous !== undefined) {
  check('G. an upgrade from the previous release: F found this server’s address first', false);
}

// ── H. Explicit unattended standalone, using a raw AMCP peer ────────────────────────────────────
{
  fresh();
  const sockets = new Set();
  let amcpTraffic = '';
  const amcp = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('data', (chunk) => {
      amcpTraffic = (amcpTraffic + String(chunk)).slice(-4096);
    });
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    amcp.once('error', reject);
    amcp.listen(0, '127.0.0.1', resolve);
  });
  try {
    const amcpPort = amcp.address().port;
    const oscPort = 16251;
    const installed = code(args.installer, [
      '/S',
      '/MODE=standalone',
      '/AMCPHOST=127.0.0.1',
      `/AMCPPORT=${String(amcpPort)}`,
      `/OSCPORT=${String(oscPort)}`,
    ]);
    check('H. the explicit unattended standalone install exits 0', installed === 0);
    const before = configOrNull();
    const r = launch(args.installer);
    check('interactive maintenance opens Setup', uia(TITLE, 'wait', '', 90).ok);
    let pg = toServerPage('AMCP PORT');
    check(
      'an installed standalone station shows its endpoint without a mode switch',
      pg.byId.title?.name === 'CasparCG' &&
        pg.byId['no-playout'] === undefined &&
        pg.byId['standalone-amcp-host']?.value === '127.0.0.1' &&
        pg.byId['amcp-port']?.value === String(amcpPort) &&
        pg.byId['osc-port']?.value === String(oscPort) &&
        pg.byId['separate-server'] === undefined &&
        pg.byId['playout-address'] === undefined,
      pg.names.join(' | '),
    );
    uia(TITLE, 'set', 'osc-port=6250');
    uia(TITLE, 'invoke', 'install');
    pg = until(TITLE, '6250 is reserved', 20);
    check(
      'standalone maintenance describes the local connection and tested CasparCG version',
      pg.names.includes('Run CG Control on the same PC as CG Bridge.') &&
        pg.names.includes('Tested with CasparCG 2.5.0 Stable.'),
      pg.names.join(' | '),
    );
    check(
      'standalone maintenance refuses reserved OSC port 6250 on the page',
      pg.ok,
      pg.names.join(' | '),
    );
    uia(TITLE, 'set', `osc-port=${String(oscPort)}`);
    shot(TITLE, path.join(OUT, 'bridge-server-no-playout.png'));
    uia(TITLE, 'invoke', 'install');
    pg = until(TITLE, 'is installed', 300);
    check(
      'standalone maintenance reinstalls the service',
      pg.byId.title?.name === 'CG Bridge is installed',
    );
    uia(TITLE, 'toggle', 'launch');
    uia(TITLE, 'invoke', 'finish');
    check('standalone maintenance Finish exits 0', (await exitCode(r, 30_000)) === 0);
    const maintained = configOrNull();
    check(
      'the installed config stores standalone mode and the raw endpoint',
      before?.mode === 'standalone' &&
        !Object.hasOwn(before, 'playoutAddress') &&
        before.amcpHost === '127.0.0.1' &&
        before.amcpPort === amcpPort &&
        before.oscPort === oscPort &&
        sameFields(before, maintained).same,
      `before ${JSON.stringify(before)} · maintained ${JSON.stringify(maintained)}`,
    );
    const h = await health();
    const server = h?.casparcg?.servers?.find((row) => row.label === 'A');
    check(
      '/health shows Playout off and A with the configured direct AMCP endpoint',
      h?.playout?.address === null &&
        h.playout.session === 'off' &&
        server?.host === '127.0.0.1' &&
        server.amcpPort === amcpPort &&
        JSON.stringify(h.casparcg.channels) === '[1]',
      JSON.stringify(h),
    );
    const amcpDeadline = Date.now() + 15_000;
    while (amcpTraffic.length === 0 && Date.now() < amcpDeadline) await sleep(200);
    check(
      'the service sends AMCP directly to the configured TCP peer',
      /\r\n/.test(amcpTraffic),
      amcpTraffic.trim(),
    );
    const caps = await localCapabilities();
    check(
      'a local console without a token sees standalone capabilities',
      caps?.stationMode === 'standalone' && caps.auth === 'off',
      JSON.stringify(caps),
    );
    const listenerProbe = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-NetTCPConnection -State Listen -LocalPort 5280 | Select-Object -ExpandProperty LocalAddress',
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    const listeners = (listenerProbe.stdout ?? '').trim().split(/\s+/).filter(Boolean);
    check(
      'standalone control HTTP and WebSocket are served only on loopback',
      listenerProbe.status === 0 &&
        listeners.length > 0 &&
        listeners.every((address) => address === '127.0.0.1'),
      listeners.join(', ') || listenerProbe.stderr,
    );
    const upgraded = code(args.installer, ['/S']);
    const after = configOrNull();
    check(
      'a silent upgrade without /MODE keeps the standalone configuration',
      upgraded === 0 &&
        sameFields(before, after).same &&
        (await health())?.playout?.session === 'off',
      `exit ${String(upgraded)} · before ${JSON.stringify(before)} · after ${JSON.stringify(after)}`,
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => amcp.close(resolve));
  }
}

process.exit(save('results-setup.json') ? 0 : 1);
