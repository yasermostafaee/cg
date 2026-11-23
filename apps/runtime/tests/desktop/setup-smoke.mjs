#!/usr/bin/env node
/**
 * 🔴 `INSTALLER-DESIGN-01` (`P-063`) — **CG CONTROL'S AND CG DESIGNER'S SETUP WINDOW, DRIVEN.** Run
 * unelevated (as an operator runs it) on the clean runner the app smoke already used, after its drive
 * phase. For each app, through UI Automation, every page captured:
 *
 *   0. the SILENT paths first: the engine alone and the installer, same `/S`, same exit code; then
 *      Tauri's own silent uninstall;
 *   1. a FRESH interactive install: Persian language selection for CG Control, then Welcome → Location →
 *      Installing (a real bar) → Done — and Installed apps lists the release;
 *   2. Finish with "Launch when ready" checked STARTS the app. CG Control's actual first
 *      window renders in Persian, and a relaunch checks both persisted language preferences;
 *   3. an UPDATE: Installed apps names an older release — Welcome says "Update from … to …", the
 *      folder is the installed one (a fact, not a control), the update keeps the app's settings
 *      folder, and Installed apps names the release again. CG Designer leaves launch
 *      unchecked. CG Control updates in Arabic and opens in that language over saved English;
 *   4. a DAMAGED download (one byte of the engine flipped): the Error page says so, offers its log,
 *      and Close exits 2.
 *
 * Usage: node setup-smoke.mjs --control <setup.exe> --designer <setup.exe> --control-engine <exe>
 *   --designer-engine <exe> --version <x.y.z> --out <dir>
 */
/* global process, document, location, localStorage, setTimeout */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webViewArgs } from './app-window.mjs';
import { Cdp } from './cdp.mjs';
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
  },
  {
    key: 'control',
    name: 'CG Control',
    exe: 'cg-control.exe',
    installer: args.control,
    engine: args['control-engine'],
  },
];
const INSTALL_LANGUAGE = 'cg-control-install-language';
const CONTROL_TITLE = 'APASAI CG CONTROL';
const CONTROL_LANGUAGE_KEY = 'cg.runtime.language.v1';
const CONTROL_CDP_PORT = 9238;
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
function registeredInstallDir(a) {
  const text = run('reg', ['query', UNINSTALL + '\\' + a.name, '/v', 'InstallLocation']);
  const directory = /InstallLocation\s+REG_(?:EXPAND_)?SZ[ \t]+([^\r\n]+)/.exec(text ?? '')?.[1];
  return directory === undefined ? null : directory.trim().replace(/^"|"$/g, '');
}

function installLanguagePath(a) {
  const directory = registeredInstallDir(a);
  return directory === null ? null : path.join(directory, INSTALL_LANGUAGE);
}

function readInstallLanguage(file) {
  return file !== null && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function setupLanguageRequest(seed, language) {
  const [locale, request, extra] = seed?.split('\n') ?? [];
  return locale === language &&
    request !== undefined &&
    request.length <= 96 &&
    /^[0-9]+(?:-[0-9]+)*$/.test(request) &&
    extra === undefined
    ? request
    : null;
}

// Directional controls preserve the version and folder ordering when drawn.
const visible = (value) => value.replace(/[\u202a-\u202e\u2066-\u2069]/g, '');

function wizardWords(a, language) {
  if (language === 'fa') {
    return {
      language,
      publisher: 'ناشر:',
      version: 'نسخهٔ ' + VERSION,
      perUser: 'فقط برای این کاربر',
      welcome: 'CG Control نصب شود؟',
      folder: 'پوشهٔ نصب',
      needed: 'مورد نیاز',
      free: 'آزاد در ',
      done: 'CG Control نصب شد',
      stepDone: 'انجام شد',
      launch: 'اجرای CG Control پس از نصب',
      finish: 'پایان',
      appNames: ['راه‌اندازی CG Control', 'ورود', 'نام کاربری'],
    };
  }
  if (language === 'ar') {
    return {
      language,
      publisher: 'الناشر:',
      welcome: 'هل تريد تحديث CG Control؟',
      updateLine: 'التحديث من ' + OLDER + ' إلى ' + VERSION + '. ستُحفظ إعداداتك.',
      folder: 'مجلد التثبيت',
      update: 'تحديث',
      updated: 'تم تحديث CG Control',
      stepDone: 'مكتمل',
      launch: 'تشغيل CG Control بعد التثبيت',
      finish: 'إنهاء',
      appNames: ['إعداد CG Control', 'تسجيل الدخول', 'اسم المستخدم'],
    };
  }
  return {
    language,
    publisher: 'Publisher:',
    version: 'Version ' + VERSION,
    perUser: 'This user only',
    welcome: 'Install ' + a.name + '?',
    folder: 'FOLDER',
    needed: 'Needed',
    free: 'Free on ',
    done: a.name + ' is installed',
    stepDone: 'done',
    launch: 'Launch when ready',
    finish: 'Finish',
    update: 'Update',
    updated: a.name + ' is updated',
    updateLine: 'Update from ' + OLDER + ' to ' + VERSION + '. Your settings are kept.',
  };
}

function enterWelcome(a, words) {
  if (a.key !== 'control') return page(title(a));
  const first = page(title(a));
  check(
    a.name + ': starts with the language chooser and English selected',
    first.byId.title?.name === 'Choose a language' &&
      first.byId['step-1']?.status === 'current' &&
      first.byId['language-en']?.selected === true,
    first.names.join(' | '),
  );
  if (words.language !== 'en') {
    const selected = uia(title(a), 'select', 'language-' + words.language, 20);
    check(
      a.name + ': selects ' + words.language,
      selected.ok && selected.selected === true,
      selected.error,
    );
  }
  uia(title(a), 'invoke', 'next');
  const welcome = until(title(a), words.publisher, 20);
  check(a.name + ': advances to language-specific Welcome', welcome.ok, welcome.error);
  return welcome;
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
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await sleep(500);
  }
}

async function closeApp(a) {
  if (running(a.exe)) run('taskkill', ['/IM', a.exe, '/F']);
  return waitFor(a.exe + ' closed', () => !running(a.exe), 20_000);
}

async function verifyFinishLaunch(a, words, step) {
  const started = await waitFor(a.exe + ' running', () => running(a.exe), 45_000);
  check(a.name + ' (' + step + '): Finish launches the app when selected', started);
  if (a.key === 'control' && started) {
    // Finish opens the installed shortcut through Explorer. UI Automation observes that very
    // window without needing to set WebView2 flags on Explorer or the user's machine.
    const rendered = uia(CONTROL_TITLE, 'until-any', words.appNames.join('|'), 45);
    check(
      a.name + ' (' + step + '): its first window renders in ' + words.language,
      rendered.ok,
      rendered.name ?? rendered.error,
    );
  }
  check(a.name + ' (' + step + '): the launched app closes', await closeApp(a));
}

function controlProfile(key) {
  return {
    language: document.documentElement.lang,
    direction: document.documentElement.dir,
    saved: JSON.parse(localStorage.getItem(key) ?? 'null'),
  };
}

// A second, directly launched copy uses the same installed executable and WebView profile.
// Only this child gets a DevTools port. This harness runs on the disposable Windows runner.
async function verifyControlProfile(a, words, request, step) {
  const child = spawn(installedExe(a), [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: webViewArgs(CONTROL_CDP_PORT),
    },
  });
  child.on('error', (error) => check(a.name + ': direct launch succeeds', false, error.message));
  let app;
  try {
    app = await Cdp.attach(CONTROL_CDP_PORT, 'http://tauri.localhost', 45_000);
    // DevTools can publish the target before the installed console commits its first document.
    const rendered = await waitFor(
      'The installed CG Control console to render',
      () =>
        app
          .evaluate(() => document.querySelector('#root')?.childElementCount > 0)
          .catch(() => false),
      30_000,
    );
    if (!rendered) throw new Error('the installed CG Control console did not render');
    await app.screenshot(path.join(OUT, 'control-' + step + '-app.png'));
    const profile = await app.evaluateWith(controlProfile, CONTROL_LANGUAGE_KEY);
    check(
      a.name + ' (' + step + '): the UI and both saved languages match the setup choice',
      profile.language === words.language &&
        profile.direction === 'rtl' &&
        profile.saved?.interface === words.language &&
        profile.saved?.feedback === words.language &&
        profile.saved?.setupRequest === request,
      JSON.stringify(profile),
    );
    if (step === 'fresh' && request !== null && profile.saved?.setupRequest === request) {
      // Model independent changes made in Settings and keep the acknowledged request.
      await app.evaluateWith((key) => {
        const saved = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...saved, interface: 'en', feedback: 'fa' }));
        setTimeout(() => location.reload(), 100);
      }, CONTROL_LANGUAGE_KEY);
      const changed = await waitFor(
        'Preferences after reloading CG Control',
        () =>
          app
            .evaluate(
              () =>
                document.documentElement.lang === 'en' &&
                document.querySelector('#root')?.childElementCount > 0,
            )
            .catch(() => false),
        30_000,
      );
      const after = await app.evaluateWith(controlProfile, CONTROL_LANGUAGE_KEY);
      check(
        a.name + ': the acknowledged request preserves independent changes after reloading',
        changed &&
          after.direction === 'ltr' &&
          after.saved?.interface === 'en' &&
          after.saved?.feedback === 'fa' &&
          after.saved?.setupRequest === request,
        JSON.stringify(after),
      );
    }
  } catch (error) {
    check(
      a.name + ' (' + step + '): the installed WebView profile can be checked',
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    app?.close();
    await closeApp(a);
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

/**
 * THE SILENT PATHS ARE THE ENGINE'S: the engine alone (today's installer, the exact file appended
 * behind CG Setup) and the installer, given the same `/S`, exit the same — over an installed copy
 * (the upgrade path) — and Tauri's own uninstaller, which CG Setup does not touch, removes it.
 */
async function silent(a) {
  const before = a.key === 'control' ? readInstallLanguage(installLanguagePath(a)) : null;
  const engine = spawnSync(a.engine, ['/S'], { windowsHide: true }).status;
  const seed = a.key === 'control' ? installLanguagePath(a) : null;
  if (a.key === 'control') {
    check(
      'CG Control: the silent engine preserves the previous language state',
      seed !== null && readInstallLanguage(seed) === before,
      seed,
    );
    // Model an earlier interactive install, then exercise quiet upgrade and uninstall.
    if (seed !== null && before === null) fs.writeFileSync(seed, 'ar', 'utf8');
  }
  const setup = spawnSync(a.installer, ['/S'], { windowsHide: true }).status;
  if (a.key === 'control') {
    check(
      'CG Control: silent setup keeps the existing seed',
      seed !== null && readInstallLanguage(seed) === (before ?? 'ar'),
      seed,
    );
  }
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
  if (a.key === 'control') {
    check(
      'CG Control: uninstall removes the seed next to the installed executable',
      seed !== null &&
        (await waitFor('installer language seed removed', () => !fs.existsSync(seed), 10_000)),
      seed,
    );
  }
}

async function fresh(a) {
  const words = wizardWords(a, a.key === 'control' ? 'fa' : 'en');
  check(a.name + ': removed first, for a fresh install', await uninstall(a));
  const r = launch(a.installer);
  check(a.name + ': the setup window opens', uia(title(a), 'wait', '', 90).ok);
  let pg = enterWelcome(a, words);
  check(
    a.name + ': localized Welcome names the product',
    pg.byId.title?.name === words.welcome,
    pg.byId.title?.name,
  );
  const names = pg.names.map(visible);
  check(
    a.name + ': Welcome names the publisher, release and install scope',
    names.includes(words.publisher + ' APASAI') &&
      names.includes(words.version) &&
      names.some((n) => n.includes(words.perUser)),
    names.join(' | '),
  );
  shot(title(a), path.join(OUT, a.key + '-welcome.png'));

  uia(title(a), 'invoke', 'next');
  pg = until(title(a), words.folder, 20);
  const folder = path.join(LOCALAPPDATA, a.name);
  check(
    a.name + ': Location shows the folder and offers to change it',
    pg.names.map(visible).includes(folder) && pg.byId.change?.enabled === true,
    pg.names.join(' | '),
  );
  check(
    a.name + ': Location shows the space it needs and has',
    pg.names.includes(words.needed) && pg.names.some((n) => n.startsWith(words.free)),
    pg.names.join(' | '),
  );
  shot(title(a), path.join(OUT, a.key + '-location.png'));

  const progress = uia(title(a), 'shot-progress', path.join(OUT, a.key + '-installing.png'), 120);
  check(
    a.name + ': Installing shows a progress bar with a status, captured',
    progress.ok,
    progress.status ?? progress.error,
  );
  if (a.key === 'control') {
    check(
      'CG Control: the progress status is Persian',
      /[\u0600-\u06ff]/.test(progress.status ?? ''),
      progress.status,
    );
  }
  pg = until(title(a), words.done, 300);
  check(
    a.name + ': the install completes in the chosen language',
    pg.byId.title?.name === words.done,
    pg.byId.title?.name ?? pg.error,
  );
  const steps = a.key === 'control' ? 5 : 4;
  check(
    a.name + ': Done marks every rail step complete',
    Array.from({ length: steps }, (_, i) => pg.byId['step-' + (i + 1)]?.status).every(
      (status) => status === words.stepDone,
    ),
  );
  check(
    a.name + ': Done offers the localized launch choice and Finish',
    pg.byId.launch?.name === words.launch && pg.byId.finish?.name === words.finish,
  );
  shot(title(a), path.join(OUT, a.key + '-done.png'));
  check(
    a.name + ': Installed apps lists ' + VERSION,
    displayVersion(a) === VERSION,
    String(displayVersion(a)),
  );
  check(
    a.name + ': the program is installed where Location said',
    fs.existsSync(installedExe(a)),
    installedExe(a),
  );

  uia(title(a), 'invoke', 'finish');
  const code = await exitCode(r, 30_000);
  check(a.name + ': Finish exits 0', code === 0, String(code));
  await verifyFinishLaunch(a, words, 'fresh');
  if (a.key === 'control') {
    const seed = installLanguagePath(a);
    const request = setupLanguageRequest(readInstallLanguage(seed), 'fa');
    check(
      a.name + ': saves an explicit Persian request next to the installed executable',
      request !== null,
      seed,
    );
    await verifyControlProfile(a, words, request, 'fresh');
  }
}

async function update(a) {
  const words = wizardWords(a, a.key === 'control' ? 'ar' : 'en');
  const before = a.key === 'control' ? readInstallLanguage(installLanguagePath(a)) : null;
  // An older release, as Installed apps would name it, and a marker in the user's settings.
  run('reg', [
    'add',
    UNINSTALL + '\\' + a.name,
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
  check(a.name + ' (update): the setup window opens', uia(title(a), 'wait', '', 90).ok);
  let pg = enterWelcome(a, words);
  const prompt = a.key === 'control' ? words.welcome : 'Update ' + a.name + '?';
  check(
    a.name + ' (update): Welcome asks to update',
    pg.byId.title?.name === prompt,
    pg.byId.title?.name,
  );
  check(
    a.name + ' (update): shows the previous and new versions',
    pg.names.map(visible).includes(words.updateLine),
    pg.names.join(' | '),
  );
  shot(title(a), path.join(OUT, a.key + '-update.png'));

  uia(title(a), 'invoke', 'next');
  pg = until(title(a), words.folder, 20);
  check(
    a.name + ' (update): Location shows the installed folder without Change',
    pg.byId.change === undefined && pg.names.map(visible).includes(path.join(LOCALAPPDATA, a.name)),
    pg.names.join(' | '),
  );
  check(
    a.name + ' (update): the primary says Update in the selected language',
    pg.byId.install?.name === words.update,
    pg.byId.install?.name,
  );
  shot(title(a), path.join(OUT, a.key + '-update-location.png'));
  const progress = uia(
    title(a),
    'shot-progress',
    path.join(OUT, a.key + '-update-installing.png'),
    120,
  );
  if (a.key === 'control') {
    check(
      'CG Control (update): the progress status is Arabic',
      progress.ok && /[\u0600-\u06ff]/.test(progress.status ?? ''),
      progress.status ?? progress.error,
    );
  }
  pg = until(title(a), words.updated, 300);
  check(
    a.name + ' (update): Done uses the selected language',
    pg.byId.title?.name === words.updated,
    pg.byId.title?.name ?? pg.error,
  );
  if (a.key === 'control') {
    check(
      'CG Control (update): the Language step is marked complete',
      pg.byId['step-1']?.status === words.stepDone,
    );
  }
  shot(title(a), path.join(OUT, a.key + '-update-done.png'));
  if (a.key === 'designer') {
    const toggle = uia(title(a), 'toggle', 'launch');
    check(
      a.name + ' (update): unchecks the launch choice',
      toggle.ok && toggle.state === 'Off',
      toggle.error ?? toggle.state,
    );
  }
  uia(title(a), 'invoke', 'finish');
  check(a.name + ' (update): Finish exits 0', (await exitCode(r, 30_000)) === 0);
  check(
    a.name + ' (update): Installed apps lists ' + VERSION + ' again',
    displayVersion(a) === VERSION,
    String(displayVersion(a)),
  );
  check(
    a.name + ' (update): preserves existing settings',
    fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === 'kept',
    marker,
  );
  if (a.key === 'control') {
    const seed = installLanguagePath(a);
    const request = setupLanguageRequest(readInstallLanguage(seed), 'ar');
    check(
      a.name + ' (update): saves a new explicit Arabic request',
      request !== null && request !== setupLanguageRequest(before, 'fa'),
      seed,
    );
    await verifyFinishLaunch(a, words, 'update');
    await verifyControlProfile(a, words, request, 'update');
  } else {
    await sleep(5000);
    check(a.name + ' (update): unticked, Finish starts nothing', !running(a.exe));
  }
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
  const seed = a.key === 'control' ? installLanguagePath(a) : null;
  const before = readInstallLanguage(seed);
  enterWelcome(a, wizardWords(a, 'en'));
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
    pg.byId[a.key === 'control' ? 'step-4' : 'step-3']?.status === 'failed',
  );
  check(
    `${a.name} (damaged): …with Open log and Close`,
    pg.byId['open-log'] !== undefined && pg.byId.close?.name === 'Close',
  );
  if (a.key === 'control') {
    check(
      'CG Control: failed English setup keeps the previous Arabic seed',
      setupLanguageRequest(before, 'ar') !== null && readInstallLanguage(seed) === before,
      seed,
    );
  }
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
