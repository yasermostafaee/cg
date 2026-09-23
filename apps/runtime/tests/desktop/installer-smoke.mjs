#!/usr/bin/env node
/**
 * 🔴 `DESKTOP-APPS-01` §5 — **THE TWO INSTALLERS, INSTALLED AND DRIVEN ON A CLEAN WINDOWS RUNNER.**
 *
 * Run by `.github/workflows/desktop.yml` on a fresh `windows-latest` VM that has built nothing:
 * it installs what the `installers` job produced, launches each app the way an operator does,
 * and reaches into the running WebView2 over the DevTools protocol
 * (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…`) — so every page check below
 * is made INSIDE the installed app, not in a test browser.
 *
 * Dependency-free on purpose: Node's own `fetch` and `WebSocket` speak CDP, so the runner needs
 * no `pnpm install`. The runner's Node runs THIS SCRIPT only — CG Control's bridge must run on the
 * `cg-bridge.exe` the installer put down, and the health check proves which one answered.
 *
 * Every absence below is paired with the positive control that makes it mean something.
 *
 * THREE PHASES, because the runner is elevated and an operator is not. WebView2 ignores
 * `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` in an elevated process (wry#1782; measured on runs
 * 35856634409 and 35859184149 — both apps' WebView2 running, neither DevTools port open), so the
 * apps are driven at MEDIUM integrity, as an operator runs them, and only what needs admin runs
 * elevated:
 *   install   (elevated) — CG Control's per-machine install, its files and firewall rules
 *   drive     (medium)   — CG Designer's per-user install, then both apps launched and driven
 *   uninstall (elevated) — CG Control's uninstall, then every phase's results summed
 * A phase that never ran leaves no results file, and the summary counts that as a failure.
 *
 * Usage: node installer-smoke.mjs --phase <install|drive|uninstall> --out <dir>
 *          [--control <setup.exe>] [--designer <setup.exe>]
 */
/* global process, fetch, WebSocket, AbortSignal, Buffer, setTimeout */
// The page probes below run INSIDE the installed apps (serialised through CDP), not in Node.
/* global window, document, navigator, location, performance, File, URL */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, i, all) =>
        i % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[i + 1]]] : pairs,
      [],
    ),
);
const out = path.resolve(args.out ?? 'smoke');
fs.mkdirSync(out, { recursive: true });

const CONTROL_DIR = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'CG Control');
const CONTROL_EXE = path.join(CONTROL_DIR, 'cg-control.exe');
const SIDECAR_EXE = path.join(CONTROL_DIR, 'cg-bridge.exe');
const CONSOLE = 'http://127.0.0.1:5174';
const RULE_OSC = 'CG Control - OSC from CasparCG (UDP 6250)';
const RULE_TEMPLATES = 'CG Control - templates to CasparCG (TCP 7911)';
const APPDATA = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');

const results = [];
let failed = false;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  — ${detail}`}\n`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* not yet */
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(500);
  }
}

function run(file, argv) {
  return execFileSync(file, argv, { encoding: 'utf8', windowsHide: true });
}
/** A close or kill request: its outcome is judged by the process list afterwards, not its exit code. */
function request(file, argv) {
  try {
    run(file, argv);
  } catch {
    /* judged below */
  }
}
function processCount(image) {
  const listing = run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH']);
  return listing.split('\n').filter((l) => l.toLowerCase().startsWith(`"${image.toLowerCase()}"`))
    .length;
}
function pidsOf(image) {
  return run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'])
    .split('\n')
    .filter((l) => l.toLowerCase().startsWith(`"${image.toLowerCase()}"`))
    .map((l) => Number(l.split(',')[1]?.replace(/"/g, '')));
}
/** This process's mandatory integrity level, read from its own token: `High` or `Medium`. */
function integrityLevel() {
  const groups = run('whoami', ['/groups', '/fo', 'csv', '/nh']);
  return /Mandatory Label\\(\w+) Mandatory Level/.exec(groups)?.[1] ?? 'unknown';
}
/**
 * Launch an app the way an operator does, with DevTools opened by the environment variable —
 * which WebView2 honours only in an unelevated process, hence the `drive` phase's integrity check.
 * Test instrumentation only: the installed app is untouched.
 */
function launch(exe, cdpPort) {
  const child = spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
  });
  child.unref();
  return child;
}
function firewallRule(name) {
  try {
    return run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`, 'verbose']);
  } catch {
    return null;
  }
}
async function health() {
  const res = await fetch(`${CONSOLE}/__cg/health`, { signal: AbortSignal.timeout(2000) });
  return res.ok ? res.json() : null;
}

/** What to look at when an app cannot be reached: the screen, the processes, the logs. */
async function diagnose(tag, cdpPort) {
  const shot = path.join(out, `${tag}-screen.png`);
  const capture = [
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
    '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
    '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;',
    '$g=[System.Drawing.Graphics]::FromImage($bmp);',
    '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);',
    `$bmp.Save('${shot.replace(/'/g, "''")}')`,
  ].join(' ');
  request('powershell', ['-NoProfile', '-Command', capture]);
  const lines = [`--- ${tag} diagnostics`];
  for (const image of [
    'cg-control.exe',
    'cg-bridge.exe',
    'cg-designer.exe',
    'msedgewebview2.exe',
  ]) {
    lines.push(`${image}: ${String(processCount(image))} running`);
  }
  lines.push(`this process: ${integrityLevel()} integrity`);
  try {
    // Whether the DevTools flag reached WebView2's browser process at all.
    const flagged = run('powershell', [
      '-NoProfile',
      '-Command',
      '(Get-CimInstance Win32_Process -Filter "Name=\'msedgewebview2.exe\'" | Where-Object { $_.CommandLine -notmatch \'--type=\' } | ForEach-Object { $_.CommandLine }) -join "`n"',
    ]);
    lines.push(`WebView2 browser process: ${flagged.trim().slice(0, 1200) || 'none'}`);
  } catch (err) {
    lines.push(`WebView2 browser process: unread (${err instanceof Error ? err.message : ''})`);
  }
  const devtools = await fetch(`http://127.0.0.1:${String(cdpPort)}/json/list`, {
    signal: AbortSignal.timeout(2000),
  })
    .then((r) => r.text())
    .catch((err) => `unreachable (${err instanceof Error ? err.message : String(err)})`);
  lines.push(`DevTools ${String(cdpPort)} /json/list: ${devtools.slice(0, 600)}`);
  const logs = path.join(APPDATA, 'CG Control', 'logs');
  for (const file of ['shell.log', 'bridge.log']) {
    const full = path.join(logs, file);
    lines.push(
      `${file}: ${fs.existsSync(full) ? `\n${fs.readFileSync(full, 'utf8').slice(-3000)}` : 'absent'}`,
    );
  }
  const text = lines.join('\n');
  fs.writeFileSync(path.join(out, `${tag}-diagnostics.txt`), text);
  process.stdout.write(`${text}\n`);
}

/** A minimal DevTools client over Node's own WebSocket. */
class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  static async attach(port, urlPrefix, timeoutMs) {
    const target = await until(
      `a page at ${urlPrefix} on DevTools port ${port}`,
      async () => {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        return list.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix));
      },
      timeoutMs,
    );
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    return new Cdp(ws, target.url);
  }
  constructor(ws, url) {
    this.#ws = ws;
    this.url = url;
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.#pending.get(message.id);
      if (pending === undefined) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
  }
  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.#pending.delete(id)) reject(new Error(`DevTools ${method} timed out`));
      }, 90_000);
    });
  }
  async evaluate(fn) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})()`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }
  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
  close() {
    this.#ws.close();
  }
}

// ── Page probes, evaluated inside the installed apps ─────────────────────────

/** CG Control's console: where it came from, and the Persian face with nothing off the machine. */
async function consoleProbe() {
  const probe = document.createElement('p');
  probe.textContent = 'سلام، کنترل پخش';
  probe.style.fontFamily = 'var(--cg-font)';
  document.body.append(probe);
  void probe.offsetWidth;
  await document.fonts.ready;
  const face = [...document.fonts].find(
    (f) => f.family.replace(/["']/g, '') === 'Vazirmatn' && /U\+600/i.test(f.unicodeRange),
  );
  probe.remove();
  const offOrigin = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => {
      try {
        const u = new URL(n);
        return u.protocol.startsWith('http') && u.origin !== location.origin;
      } catch {
        return false;
      }
    });
  const fonts = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => n.includes('/fonts/vazirmatn/'));
  return {
    origin: location.origin,
    secure: window.isSecureContext,
    userAgent: navigator.userAgent,
    text: document.body.innerText.slice(0, 200),
    vazirmatn: face?.status ?? 'missing',
    fonts,
    offOrigin,
  };
}

/** CG Designer's page: the origin facts §1.4 asks to be measured, not assumed. */
async function designerProbe() {
  let opfs = false;
  try {
    await navigator.storage.getDirectory();
    opfs = true;
  } catch {
    opfs = false;
  }
  return {
    origin: location.origin,
    secure: window.isSecureContext,
    crossOriginIsolated: window.crossOriginIsolated,
    showDirectoryPicker: typeof window.showDirectoryPicker,
    showOpenFilePicker: typeof window.showOpenFilePicker,
    showSaveFilePicker: typeof window.showSaveFilePicker,
    opfs,
    userAgent: navigator.userAgent,
    text: document.body.innerText.slice(0, 200),
  };
}

/**
 * ffmpeg under the installed Designer's own CSP: load the app's OWN lazy chunk and probe a file
 * that is not a video. `no-stream` with ffmpeg's log lines means ffmpeg loaded and ran; a load
 * refused by the CSP comes back as `converter-crashed`.
 */
async function ffmpegProbe() {
  const entry = [...document.querySelectorAll('script[type="module"][src]')].map((s) => s.src)[0];
  const seen = new Set();
  const queue = [entry];
  let chunk = null;
  while (queue.length > 0 && chunk === null && seen.size < 60) {
    const url = queue.shift();
    if (url === undefined || seen.has(url)) continue;
    seen.add(url);
    const text = await (await fetch(url)).text();
    const hit = /video-convert-(?!args-)[\w-]{8}\.js/.exec(text);
    if (hit !== null) {
      chunk = new URL(`/assets/${hit[0]}`, location.href).href;
      break;
    }
    for (const m of text.matchAll(/(?:\.\/|\/assets\/|assets\/)([\w.-]+\.js)/g)) {
      queue.push(new URL(`/assets/${m[1]}`, location.href).href);
    }
  }
  if (chunk === null) return { ran: false, reason: 'chunk-not-found', logTail: [] };
  const mod = await import(chunk);
  const result = await mod.probeSource(new File([new Uint8Array([1, 2, 3, 4])], 'not-a-video.bin'));
  return {
    ran: true,
    reason: result.ok ? 'ok' : result.reason,
    logTail: result.ok ? [] : result.logTail,
  };
}

// ── CG Designer ──────────────────────────────────────────────────────────────

async function designer() {
  // Installed from THIS phase's medium-integrity process: "without admin" is exercised, not read.
  try {
    run(args.designer, ['/S']);
  } catch (err) {
    check('CG Designer installs without admin', false, err instanceof Error ? err.message : '');
    return;
  }
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'CG Designer', 'cg-designer.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'CG Designer', 'cg-designer.exe'),
  ];
  const exe = candidates.find((c) => fs.existsSync(c));
  check(
    'CG Designer installs per user, without admin, under LOCALAPPDATA',
    exe !== undefined,
    exe ?? candidates.join(' | '),
  );
  if (exe === undefined) return;
  check(
    'CG Designer installs no bridge',
    !fs.existsSync(path.join(path.dirname(exe), 'cg-bridge.exe')),
  );

  launch(exe, 9231);
  const page = await Cdp.attach(9231, 'http://tauri.localhost', 90_000).catch(async (err) => {
    await diagnose('designer', 9231);
    throw err;
  });
  await sleep(4000);
  const facts = await page.evaluate(designerProbe);
  fs.writeFileSync(path.join(out, 'designer-facts.json'), JSON.stringify(facts, null, 2));
  check(
    'CG Designer opens on http://tauri.localhost',
    facts.origin === 'http://tauri.localhost',
    facts.origin,
  );
  check('…which is a secure context', facts.secure === true);
  check('…with OPFS available', facts.opfs === true);
  check(
    '…and the file pickers present',
    facts.showSaveFilePicker === 'function' && facts.showOpenFilePicker === 'function',
    `save ${facts.showSaveFilePicker}, open ${facts.showOpenFilePicker}, directory ${facts.showDirectoryPicker}`,
  );
  await page.screenshot(path.join(out, 'designer.png'));
  const ffmpeg = await page.evaluate(ffmpegProbe);
  fs.writeFileSync(path.join(out, 'designer-ffmpeg.json'), JSON.stringify(ffmpeg, null, 2));
  check(
    "ffmpeg loads and runs under the installed Designer's CSP",
    ffmpeg.ran && ffmpeg.reason === 'no-stream' && ffmpeg.logTail.length > 0,
    `${ffmpeg.reason}; ${ffmpeg.logTail.slice(-2).join(' / ')}`,
  );
  page.close();
  for (const pid of pidsOf('cg-designer.exe')) request('taskkill', ['/PID', String(pid)]);
  await until('CG Designer to close', () => processCount('cg-designer.exe') === 0, 30_000).catch(
    () => undefined,
  );
  check('CG Designer closes', processCount('cg-designer.exe') === 0);
}

// ── CG Control ───────────────────────────────────────────────────────────────

function controlInstall() {
  run(args.control, ['/S']);
  for (const file of [
    CONTROL_EXE,
    SIDECAR_EXE,
    path.join(CONTROL_DIR, 'payload', 'bridge', 'caspar-bridge.mjs'),
    path.join(CONTROL_DIR, 'payload', 'console', 'index.html'),
  ]) {
    check(`CG Control installs ${path.relative(CONTROL_DIR, file)}`, fs.existsSync(file), file);
  }
  for (const [rule, port, proto] of [
    [RULE_OSC, '6250', 'UDP'],
    [RULE_TEMPLATES, '7911', 'TCP'],
  ]) {
    const text = firewallRule(rule) ?? '';
    check(
      `firewall rule "${rule}" allows ${port}/${proto.toLowerCase()} inbound for the sidecar only`,
      text.includes(port) &&
        text.toUpperCase().includes(proto) &&
        text.toLowerCase().includes(SIDECAR_EXE.toLowerCase()),
    );
  }
}

async function controlDrive() {
  // Start → the bridge is the INSTALLED sidecar, and the window loads the console from it.
  launch(CONTROL_EXE, 9230);
  const h = await until('the bridge to answer on 5174', health, 90_000).catch(() => null);
  check(
    'CG Control starts its bridge — the installed cg-bridge.exe, not any other Node',
    h !== null &&
      h.app === 'cg-caspar-bridge' &&
      String(h.execPath).toLowerCase() === SIDECAR_EXE.toLowerCase(),
    h === null ? 'no answer' : `${h.execPath} (pid ${h.pid})`,
  );
  if (h === null) await diagnose('control', 9230);
  const page = await Cdp.attach(9230, CONSOLE, 90_000).catch((err) => {
    check('the window loads the console from the bridge', false, err.message);
    return null;
  });
  if (page !== null) {
    await sleep(4000);
    const facts = await page.evaluate(consoleProbe);
    fs.writeFileSync(path.join(out, 'control-facts.json'), JSON.stringify(facts, null, 2));
    check(
      'the window loads the console from the bridge at http://127.0.0.1:5174',
      facts.origin === CONSOLE,
      facts.origin,
    );
    // The absence, and the control that makes it mean something.
    check(
      'Persian renders in the self-hosted Vazirmatn (control)',
      facts.vazirmatn === 'loaded' && facts.fonts.length > 0,
      facts.fonts.join(', '),
    );
    check(
      '…and nothing the console loaded came from another origin',
      facts.offOrigin.length === 0,
      facts.offOrigin.join(', '),
    );
    // A fresh install opens on first-run, at its first step: the Playout address.
    const firstRunPhase = () =>
      page.evaluate(
        () => document.querySelector('[data-first-run]')?.getAttribute('data-first-run') ?? null,
      );
    const opened = await until('first-run', firstRunPhase, 30_000).catch(() => null);
    check(
      'a fresh install opens on first-run, at the Playout address',
      opened === 'target',
      String(opened),
    );
    await sleep(3000);
    await page.screenshot(path.join(out, 'control.png'));

    // DESKTOP-APPS-01-A — the one door that writes the Playout target: the app's own command,
    // callable from the console this window loaded, never over the control socket.
    // A mark on the page: a reload would wipe it, so its survival proves the console moved on alone.
    await page.evaluate(() => {
      window.cgSmokeMark = 'kept';
    });
    const before = await health().catch(() => null);
    const door = await page.evaluate(async () => {
      try {
        const said = await window.__TAURI_INTERNALS__.invoke('set_playout_address', {
          address: 'http://127.0.0.1:59999/',
        });
        return { ok: true, said: String(said) };
      } catch (err) {
        return { ok: false, said: String(err) };
      }
    });
    check('the console can set the Playout address through the app', door.ok, door.said);
    const playoutFile = path.join(APPDATA, 'CG Control', '.cg-runtime', 'bridge-playout.json');
    const written = fs.existsSync(playoutFile)
      ? JSON.parse(fs.readFileSync(playoutFile, 'utf8'))
      : null;
    check(
      '…which writes the address, normalised, with no issuer to type',
      written?.playout?.address === 'http://127.0.0.1:59999' &&
        written?.playout?.issuer === undefined,
      JSON.stringify(written),
    );
    const after = await until('the restarted bridge', health, 60_000).catch(() => null);
    check(
      '…and restarts the bridge with the new target in force',
      after !== null && before !== null && after.pid !== before.pid,
      `${String(before?.pid)} -> ${String(after?.pid)}`,
    );
    const next = await until(
      'first-run to move on',
      async () => ((await firstRunPhase()) === 'channel' ? 'channel' : null),
      60_000,
    ).catch(() => null);
    const moved = await page.evaluate(() => ({
      mark: window.cgSmokeMark ?? null,
      signIn: document.getElementById('cg-first-run-user') !== null,
    }));
    check(
      '…and the console moves on to the sign-in by itself, without a reload',
      next === 'channel' && moved.signIn && moved.mark === 'kept',
      `phase ${String(next)}, sign-in ${String(moved.signIn)}, mark ${String(moved.mark)}`,
    );
    await sleep(2000);
    await page.screenshot(path.join(out, 'control-sign-in.png'));
    page.close();
  }

  // State lives in this user's own data folder, never ~/.cg-runtime.
  const log = path.join(APPDATA, 'CG Control', 'logs', 'bridge.log');
  const logText = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  check(
    'the bridge log is written under %APPDATA%\\CG Control\\logs (control)',
    logText.includes('candidate layers'),
    log,
  );
  check(
    '…and it names every station file under %APPDATA%\\CG Control\\.cg-runtime',
    logText.includes(path.join(APPDATA, 'CG Control', '.cg-runtime')),
  );
  check(
    'nothing was written to ~/.cg-runtime',
    !fs.existsSync(path.join(os.homedir(), '.cg-runtime')),
  );

  // A second launch focuses the open window and exits.
  launch(CONTROL_EXE, 9232);
  await sleep(8000);
  check(
    'a second launch leaves ONE CG Control running',
    processCount('cg-control.exe') === 1,
    `${processCount('cg-control.exe')} running`,
  );

  // Close → no bridge left behind.
  check(
    'the bridge is running before the app closes (control)',
    processCount('cg-bridge.exe') === 1,
  );
  for (const pid of pidsOf('cg-control.exe')) request('taskkill', ['/PID', String(pid)]);
  await until('CG Control to close', () => processCount('cg-control.exe') === 0, 30_000).catch(
    () => undefined,
  );
  await until('the bridge to stop', () => processCount('cg-bridge.exe') === 0, 20_000).catch(
    () => undefined,
  );
  check(
    'closing CG Control stops the bridge — no process left behind',
    processCount('cg-control.exe') === 0 && processCount('cg-bridge.exe') === 0,
  );
  check('…and releases the console port', (await health().catch(() => null)) === null);

  // Killed (a crash, or Task Manager) → the lifeline stops the bridge anyway.
  launch(CONTROL_EXE, 9233);
  await until('the bridge to answer again', health, 90_000).catch(() => null);
  check('a relaunch starts the bridge again (control)', processCount('cg-bridge.exe') === 1);
  for (const pid of pidsOf('cg-control.exe')) request('taskkill', ['/F', '/PID', String(pid)]);
  await until(
    'the orphaned bridge to stop',
    () => processCount('cg-bridge.exe') === 0,
    20_000,
  ).catch(() => undefined);
  check(
    'killing CG Control still stops the bridge — its lifeline closed',
    processCount('cg-bridge.exe') === 0,
  );
}

async function controlUninstall() {
  // Uninstall removes exactly the rules the install added (their presence is the install phase's).
  run(path.join(CONTROL_DIR, 'uninstall.exe'), ['/S']);
  await until('the uninstaller to finish', () => !fs.existsSync(CONTROL_EXE), 60_000).catch(
    () => undefined,
  );
  check(
    'uninstalling removes both firewall rules',
    firewallRule(RULE_OSC) === null && firewallRule(RULE_TEMPLATES) === null,
  );
}

const PHASES = ['install', 'drive', 'uninstall'];
const phase = args.phase;
if (!PHASES.includes(phase)) throw new Error(`--phase must be one of ${PHASES.join(', ')}`);

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(`${name} ran to the end`, false, err instanceof Error ? err.message : String(err));
  }
}

const level = integrityLevel();
if (phase === 'install') {
  // The control for the drive phase's reading: the same instrument must read High here.
  check('the install phase runs elevated (control)', level === 'High', level);
  await step('CG Control install', controlInstall);
} else if (phase === 'drive') {
  check('the apps are driven unelevated, as an operator runs them', level === 'Medium', level);
  await step('CG Designer smoke', designer);
  await step('CG Control smoke', controlDrive);
} else {
  await step('CG Control uninstall', controlUninstall);
}
fs.writeFileSync(path.join(out, `results-${phase}.json`), JSON.stringify(results, null, 2));

if (phase === 'uninstall') {
  const all = PHASES.flatMap((p) => {
    const file = path.join(out, `results-${p}.json`);
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : [{ name: `the ${p} phase ran`, ok: false, detail: 'no results file' }];
  });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(all, null, 2));
  process.stdout.write('\n');
  for (const r of all) {
    process.stdout.write(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail === '' ? '' : `  — ${r.detail}`}\n`,
    );
  }
  process.stdout.write(`\n${all.filter((r) => r.ok).length}/${all.length} checks passed\n`);
  process.exit(all.every((r) => r.ok) ? 0 : 1);
}
process.exit(failed ? 1 : 0);
