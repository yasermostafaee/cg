#!/usr/bin/env node
/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — **CG CONTROL'S AND CG DESIGNER'S SETUP WINDOW, DRIVEN.** Run
 * unelevated (as an operator runs it) on the clean runner the app smoke already used, after its drive
 * phase. For each app, through UI Automation, every page captured:
 *
 *   0. the SILENT paths first: the engine alone and the installer, same `/S`, same exit code; then
 *      Tauri's own silent uninstall;
 *   1. a FRESH interactive install: Welcome → Location (the folder, changeable; the space) →
 *      Installing (a real bar) → Done — and Installed apps lists the release;
 *   2. "Launch when ready" (CG Designer: ticked, Finish) STARTS the app; unticked (CG Control), it
 *      does not;
 *   3. an UPDATE: Installed apps names an older release — Welcome says "Update from … to …", the
 *      folder is the installed one (a fact, not a control), the update keeps the app's settings
 *      folder, and Installed apps names the release again;
 *   4. a DAMAGED download (one byte of the engine flipped): the Error page says so, offers its log,
 *      and Close exits 2.
 *
 * Usage: node setup-smoke.mjs --control <setup.exe> --designer <setup.exe> --control-engine <exe>
 *   --designer-engine <exe> --version <x.y.z> --out <dir>
 */
/* global process */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checks, exitCode, launch, page, shot, sleep, uia, until } from './setup-window.mjs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, v, i, all) => (i % 2 === 0 ? [...pairs, [v.replace(/^--/, ''), all[i + 1]]] : pairs),
      [],
    ),
);
const OUT = path.resolve(args.out ?? 'setup-smoke');
const VERSION = args.version;
const OLDER = '0.9.9';
const { check, save } = checks(OUT);
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const APPDATA = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const UNINSTALL = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

const APPS = [
  {
    key: 'designer',
    name: 'CG Designer',
    exe: 'cg-designer.exe',
    installer: args.designer,
    engine: args['designer-engine'],
    launch: true,
  },
  {
    key: 'control',
    name: 'CG Control',
    exe: 'cg-control.exe',
    installer: args.control,
    engine: args['control-engine'],
    launch: false,
  },
];
const title = (a) => `${a.name} Setup`;

function run(file, argv) {
  try {
    return execFileSync(file, argv, { encoding: 'utf8', windowsHide: true });
  } catch {
    return null;
  }
}
function displayVersion(a) {
  const text = run('reg', ['query', `${UNINSTALL}\\${a.name}`, '/v', 'DisplayVersion']);
  return /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(text ?? '')?.[1] ?? null;
}
function running(image) {
  return (run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH']) ?? '')
    .toLowerCase()
    .includes(`"${image}"`);
}
const installedExe = (a) => path.join(LOCALAPPDATA, a.name, a.exe);

async function waitFor(what, fn, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (fn()) return true;
    if (Date.now() > deadline) return false;
    await sleep(500);
  }
}

/** Tauri's own uninstaller, silently: a clean slate for a fresh interactive install. */
async function uninstall(a) {
  const exe = path.join(LOCALAPPDATA, a.name, 'uninstall.exe');
  if (!fs.existsSync(exe)) return true;
  run(exe, ['/S']);
  return waitFor(
    `${a.name} uninstalled`,
    () => !fs.existsSync(installedExe(a)) && displayVersion(a) === null,
    90_000,
  );
}

/** Capture the page once the bar is moving (or the page has moved on). */
async function captureInstalling(a, file) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const pg = page(title(a), 5);
    if (!pg.ok) return false;
    const pct = pg.elements.find((e) => /^\d+%$/.test(e.name));
    if (pg.byId.progress !== undefined && pct !== undefined && Number.parseInt(pct.name, 10) > 0) {
      return shot(title(a), file).ok;
    }
    if (pg.byId.finish !== undefined || pg.byId.close !== undefined) return false;
    await sleep(150);
  }
  return false;
}

/**
 * THE SILENT PATHS ARE THE ENGINE'S: the engine alone (today's installer, the exact file appended
 * behind CG Setup) and the installer, given the same `/S`, exit the same — over an installed copy
 * (the upgrade path) — and Tauri's own uninstaller, which CG Setup does not touch, removes it.
 */
async function silent(a) {
  const engine = spawnSync(a.engine, ['/S'], { windowsHide: true }).status;
  const setup = spawnSync(a.installer, ['/S'], { windowsHide: true }).status;
  check(
    `${a.name}: a silent upgrade (/S) — the engine alone exits 0`,
    engine === 0,
    String(engine),
  );
  check(`${a.name}: …and the installer exits the same, 0`, setup === engine, String(setup));
  check(
    `${a.name}: …and Installed apps names ${VERSION}`,
    displayVersion(a) === VERSION,
    String(displayVersion(a)),
  );
  check(`${a.name}: the silent uninstall (uninstall.exe /S) removes it`, await uninstall(a));
}

async function fresh(a) {
  check(`${a.name}: removed first, for a fresh install`, await uninstall(a));
  const r = launch(a.installer);
  check(`${a.name}: the setup window opens`, uia(title(a), 'wait', '', 90).ok);
  await sleep(700);
  let pg = page(title(a));
  check(
    `${a.name}: Welcome asks "Install ${a.name}?"`,
    pg.byId.title?.name === `Install ${a.name}?`,
    pg.byId.title?.name,
  );
  check(
    `${a.name}: …with the publisher, this release and what it installs`,
    pg.names.includes('Publisher: APASAI') &&
      pg.names.includes(`Version ${VERSION}`) &&
      pg.names.some((n) => n.includes('This user only')),
    pg.names.join(' | '),
  );
  shot(title(a), path.join(OUT, `${a.key}-welcome.png`));
  uia(title(a), 'invoke', 'next');
  pg = until(title(a), 'FOLDER', 20);
  const folder = path.join(LOCALAPPDATA, a.name);
  check(
    `${a.name}: Location shows the folder (${folder}) and offers to change it`,
    pg.names.includes(folder) && pg.byId.change?.enabled === true,
    pg.names.join(' | '),
  );
  check(
    `${a.name}: …and the space it needs and has`,
    pg.names.includes('Needed') && pg.names.some((n) => n.startsWith('Free on ')),
    pg.names.join(' | '),
  );
  shot(title(a), path.join(OUT, `${a.key}-location.png`));
  uia(title(a), 'invoke', 'install');
  check(
    `${a.name}: Installing shows a moving bar, captured`,
    await captureInstalling(a, path.join(OUT, `${a.key}-installing.png`)),
  );
  pg = until(title(a), 'is installed', 300);
  check(
    `${a.name}: Done — "${a.name} is installed"`,
    pg.byId.title?.name === `${a.name} is installed`,
    pg.byId.title?.name ?? pg.error,
  );
  check(
    `${a.name}: …the rail ticks every step`,
    ['step-1', 'step-2', 'step-3', 'step-4'].every((s) => pg.byId[s]?.status === 'done'),
  );
  check(
    `${a.name}: …one option, "Launch when ready", and one primary, Finish`,
    pg.byId.launch?.name === 'Launch when ready' && pg.byId.finish?.name === 'Finish',
  );
  shot(title(a), path.join(OUT, `${a.key}-done.png`));
  check(
    `${a.name}: Installed apps lists ${VERSION}`,
    displayVersion(a) === VERSION,
    String(displayVersion(a)),
  );
  check(
    `${a.name}: the program is installed where Location said`,
    fs.existsSync(installedExe(a)),
    installedExe(a),
  );
  if (!a.launch) uia(title(a), 'toggle', 'launch');
  uia(title(a), 'invoke', 'finish');
  const code = await exitCode(r, 30_000);
  check(`${a.name}: Finish exits 0`, code === 0, String(code));
  if (a.launch) {
    const started = await waitFor(`${a.exe} running`, () => running(a.exe), 45_000);
    check(`${a.name}: "Launch when ready" starts the app`, started);
    run('taskkill', ['/IM', a.exe, '/F']);
    await waitFor(`${a.exe} closed`, () => !running(a.exe), 20_000);
  } else {
    await sleep(5000);
    check(`${a.name}: unticked, Finish starts nothing`, !running(a.exe));
  }
}

async function update(a) {
  // An older release, as Installed apps would name it; and a file in the app's own settings folder.
  run('reg', [
    'add',
    `${UNINSTALL}\\${a.name}`,
    '/v',
    'DisplayVersion',
    '/t',
    'REG_SZ',
    '/d',
    OLDER,
    '/f',
  ]);
  const settings = path.join(APPDATA, a.name);
  fs.mkdirSync(settings, { recursive: true });
  const marker = path.join(settings, 'cg-setup-smoke.marker');
  fs.writeFileSync(marker, 'kept');
  const r = launch(a.installer);
  check(`${a.name} (update): the setup window opens`, uia(title(a), 'wait', '', 90).ok);
  await sleep(700);
  let pg = page(title(a));
  check(
    `${a.name} (update): Welcome asks "Update ${a.name}?"`,
    pg.byId.title?.name === `Update ${a.name}?`,
    pg.byId.title?.name,
  );
  const line = `Update from ${OLDER} to ${VERSION}. Your settings are kept.`;
  check(`${a.name} (update): "${line}"`, pg.names.includes(line), pg.names.join(' | '));
  shot(title(a), path.join(OUT, `${a.key}-update.png`));
  uia(title(a), 'invoke', 'next');
  pg = until(title(a), 'FOLDER', 20);
  check(
    `${a.name} (update): the folder is the installed one, and not a control`,
    pg.byId.change === undefined && pg.names.includes(path.join(LOCALAPPDATA, a.name)),
    pg.names.join(' | '),
  );
  check(
    `${a.name} (update): the primary says Update`,
    pg.byId.install?.name === 'Update',
    pg.byId.install?.name,
  );
  shot(title(a), path.join(OUT, `${a.key}-update-location.png`));
  uia(title(a), 'invoke', 'install');
  await captureInstalling(a, path.join(OUT, `${a.key}-update-installing.png`));
  pg = until(title(a), 'is updated', 300);
  check(
    `${a.name} (update): Done — "${a.name} is updated"`,
    pg.byId.title?.name === `${a.name} is updated`,
    pg.byId.title?.name ?? pg.error,
  );
  shot(title(a), path.join(OUT, `${a.key}-update-done.png`));
  uia(title(a), 'toggle', 'launch');
  uia(title(a), 'invoke', 'finish');
  check(`${a.name} (update): Finish exits 0`, (await exitCode(r, 30_000)) === 0);
  check(
    `${a.name} (update): Installed apps names ${VERSION} again`,
    displayVersion(a) === VERSION,
    String(displayVersion(a)),
  );
  check(`${a.name} (update): its settings folder is kept`, fs.existsSync(marker), marker);
}

/** A copy of the installer with one byte of its engine flipped: what a broken download is. */
function damaged(a) {
  const bytes = fs.readFileSync(a.installer);
  const footer = bytes.subarray(bytes.length - 24);
  const indexAt = Number(footer.readBigUInt64LE(8));
  const indexLen = Number(footer.readBigUInt64LE(16));
  const index = JSON.parse(bytes.subarray(indexAt, indexAt + indexLen).toString('utf8'));
  const engine = index.blobs.engine;
  const at = engine.offset + Math.floor(engine.length / 2);
  bytes[at] ^= 0xff;
  const file = path.join(path.dirname(a.installer), `damaged-${path.basename(a.installer)}`);
  fs.writeFileSync(file, bytes);
  return file;
}

async function broken(a) {
  const r = launch(damaged(a));
  check(`${a.name} (damaged): the setup window opens`, uia(title(a), 'wait', '', 90).ok);
  uia(title(a), 'invoke', 'next');
  until(title(a), 'FOLDER', 20);
  uia(title(a), 'invoke', 'install');
  const pg = until(title(a), 'was not', 120);
  check(
    `${a.name} (damaged): the Error page says why`,
    pg.names.includes("Setup's files are damaged. Download it again."),
    pg.names.join(' | '),
  );
  check(
    `${a.name} (damaged): …the Installing step is marked failed`,
    pg.byId['step-3']?.status === 'failed',
  );
  check(
    `${a.name} (damaged): …with Open log and Close`,
    pg.byId['open-log'] !== undefined && pg.byId.close?.name === 'Close',
  );
  shot(title(a), path.join(OUT, `${a.key}-error.png`));
  uia(title(a), 'invoke', 'close');
  check(`${a.name} (damaged): Close exits 2`, (await exitCode(r, 30_000)) === 2);
}

for (const a of APPS) {
  try {
    await silent(a);
    await fresh(a);
    await update(a);
    await broken(a);
  } catch (e) {
    check(`${a.name}: the flow ran to the end`, false, e instanceof Error ? e.message : String(e));
  }
}
process.exit(save('results-setup.json') ? 0 : 1);
