#!/usr/bin/env node
/**
 * 🔴 `DESKTOP-APPS-01` §5 — **THE INSTALLERS, INSTALLED AND DRIVEN ON A CLEAN WINDOWS RUNNER.**
 *
 * Run by `.github/workflows/desktop.yml` on a fresh `windows-latest` VM that has built nothing:
 * it installs what the `installers` job produced, launches each app the way an operator does,
 * and reaches into the running WebView2 over the DevTools protocol
 * (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…`) — so every page check below
 * is made INSIDE the installed app, not in a test browser.
 *
 * `CENTRAL-BRIDGE-01` — CG Control is a CONSOLE now: it carries no bridge, no Node and no port, and
 * connects to CG Bridge, the service on the Playout machine. So this smoke installs CG Bridge first
 * (as the Playout's installer will chain it), then drives CG Control the way an operator meets it on
 * a fresh install: one question (the Playout's address), then CG Bridge on that host, port 5280 —
 * and, with no token, NO state. CG Bridge's own lifecycle (service, recovery, rules, upgrade,
 * uninstall) is `tools/bridge-installer/smoke.mjs`, on its own runner.
 *
 * Dependency-free on purpose: Node's own `fetch` and `WebSocket` speak CDP, so the runner needs
 * no `pnpm install`. The runner's Node runs THIS SCRIPT only.
 *
 * Every absence below is paired with the positive control that makes it mean something.
 *
 * THREE PHASES, because the runner is elevated and an operator is not. WebView2 ignores
 * `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` in an elevated process (wry#1782; measured on runs
 * 35856634409 and 35859184149 — both apps' WebView2 running, neither DevTools port open), so the
 * apps are driven at MEDIUM integrity, as an operator runs them, and only what needs admin runs
 * elevated:
 *   install   (elevated) — the installers' names; CG Bridge, per machine, silently, its /health
 *   drive     (medium)   — CG Designer and CG Control, each installed per user without admin, then
 *                          both launched and driven; CG Control connects to CG Bridge
 *   uninstall (elevated) — CG Control opened no firewall port; its uninstall leaves CG Bridge
 *                          running; then every phase's results summed
 * A phase that never ran leaves no results file, and the summary counts that as a failure.
 *
 * Usage: node installer-smoke.mjs --phase <install|drive|uninstall> --out <dir> --version <x.y.z>
 *          [--bridge <setup.exe>] [--control-installer <setup.exe>]
 *          [--designer-installer <setup.exe>] [--control <setup.exe>] [--designer <setup.exe>]
 * (the install phase takes the three installers by their built names, to check them; the drive
 * phase takes CG Control's and CG Designer's under names without a space, which gsudo needs.)
 *
 * `CLIENT-TEST-RELEASE-01` — `--version` is the release version the build read from every file
 * that carries it (`tools/release/src/release-version.mjs`): the installers' names and what Windows
 * lists under Installed apps are checked against it (B1), and a firewall rule is read by the fields
 * `netsh` prints, never by its name (B2, `firewall-rule.mjs`).
 *
 * `RELEASE-091-01` §3 (`B-290`) — once both apps are installed, each exe's icon, each shortcut's icon
 * and AppUserModelID, and each Installed-apps icon are read, and the two apps' values must DIFFER
 * (`app-identity.mjs`). The identifiers are read from each app's own `tauri.conf.json`, sparse-checked
 * out beside this folder for that alone.
 */
/* global process, fetch, WebSocket, AbortSignal, Buffer, setTimeout */
// The page probes below run INSIDE the installed apps (serialised through CDP), not in Node.
/* global window, document, navigator, location, performance, File, URL, Event, HTMLInputElement, KeyboardEvent */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityChecks, parseIdentityRead } from './app-identity.mjs';
import {
  closeDialogProbe,
  designerEdit,
  designerNewProject,
  pidsOf,
  pressInDialog,
  processCount,
  sendClose,
  webViewArgs,
} from './app-window.mjs';
import { parseRules } from './firewall-rule.mjs';

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

/** Both apps' pages: each bundles its own, served by its shell. */
const APP_PAGE = 'http://tauri.localhost';
/** CG Bridge, installed by the install phase: the service CG Control connects to. */
const BRIDGE_HEALTH = 'http://127.0.0.1:5280/health';
const BRIDGE_LOGS = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'CG Bridge', 'logs');
/**
 * The Playout this station is set up with: a port on this runner that nothing answers — the smoke
 * connects to no Playout. CG Bridge is found on its HOST, so the console connects to 127.0.0.1:5280.
 */
const PLAYOUT = 'http://127.0.0.1:59999';
const BRIDGE_AT = '127.0.0.1:5280';
/** `AUTH_REQUIRED_REFUSAL` (`@cg/shared-ipc` `channels/auth.ts`) — the auth gate's own words. */
const NOT_SIGNED_IN = 'This console is not signed in';
const APPDATA = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
/** The checkout root: this script sits at `apps/runtime/tests/desktop/`. */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

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
/**
 * `FIELD-FIXES-01` G — the TITLE BAR's text, as Windows holds it: the main window title of the
 * app's process. Read after its page is up, so the window exists. '' when none is found.
 */
function windowTitle(image) {
  const name = image.replace(/\.exe$/i, '');
  try {
    return run('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1).MainWindowTitle`,
    ]).trim();
  } catch {
    return '';
  }
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
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: webViewArgs(cdpPort),
    },
  });
  child.unref();
  return child;
}
/** The name of every firewall rule on this machine, as `netsh` prints them (`firewall-rule.mjs`). */
function firewallRuleNames() {
  try {
    // Every rule on the machine: more than `execFileSync`'s default 1 MB can hold.
    const text = execFileSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=all'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    return parseRules(text).map((rule) => rule['Rule Name']);
  } catch {
    return null;
  }
}
/** A PowerShell script, encoded — so no quote in it is ever re-parsed by a command line. */
function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
}
/**
 * `CLIENT-TEST-RELEASE-01` B1 — what Windows lists under Installed apps for a product: the uninstall
 * key the NSIS installer writes (`Software\Microsoft\Windows\CurrentVersion\Uninstall\<productName>`,
 * in HKLM for a per-machine install and HKCU for a per-user one). Both registry views are asked, so a
 * 32-bit-view write is not read as absent. `null` when neither holds it.
 */
function installedEntry(hive, product) {
  const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${product}`;
  for (const view of ['/reg:64', '/reg:32']) {
    let text;
    try {
      text = run('reg', ['query', key, view]);
    } catch {
      continue;
    }
    const value = (name) =>
      new RegExp(`^\\s+${name}\\s+REG_SZ\\s+(.*?)\\s*$`, 'm').exec(text)?.[1] ?? null;
    return {
      displayName: value('DisplayName'),
      displayVersion: value('DisplayVersion'),
      // `RELEASE-091-01` §3 — the icon Installed apps draws for it.
      displayIcon: value('DisplayIcon'),
    };
  }
  return null;
}
/** `CLIENT-TEST-RELEASE-01` B1 — the release version this build must carry everywhere. */
const RELEASE = typeof args.version === 'string' ? args.version : null;
function releaseGiven() {
  check(
    'the smoke was given the release version (the build read it from every file that carries it)',
    RELEASE !== null && /^\d+\.\d+\.\d+$/.test(RELEASE),
    String(args.version),
  );
  return RELEASE !== null;
}
/** CG Bridge's `/health` body once it answers 200, else `null`. */
async function health() {
  const res = await fetch(BRIDGE_HEALTH, { signal: AbortSignal.timeout(2000) });
  return res.ok ? res.json() : null;
}
/** The installer's own exit code, never thrown: a refusal is a failed check, not a dead smoke. */
function exitCodeOf(file, argv) {
  return spawnSync(file, argv, { windowsHide: true }).status;
}
/**
 * The image name of each `cg-bridge.exe`'s PARENT. CG Bridge's is the service host (`shawl.exe`), so
 * a `cg-bridge.exe` whose parent is anything else was started by someone else — CG Control, say.
 */
function bridgeParents() {
  return powershell(
    [
      '$bridges = @(Get-CimInstance Win32_Process -Filter "Name=\'cg-bridge.exe\'")',
      '$names = foreach ($b in $bridges) {',
      '  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($b.ParentProcessId)"',
      "  if ($p) { $p.Name } else { '?' }",
      '}',
      "@($names) -join ','",
    ].join('\n'),
  )
    .trim()
    .split(',')
    .filter((name) => name !== '');
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
    'shawl.exe',
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
  const shellLog = path.join(APPDATA, 'CG Control', 'logs', 'shell.log');
  lines.push(
    `shell.log: ${fs.existsSync(shellLog) ? `\n${fs.readFileSync(shellLog, 'utf8').slice(-3000)}` : 'absent'}`,
  );
  lines.push(`CG Bridge /health: ${JSON.stringify(await health().catch(() => null))}`);
  // CG Bridge's own logs: readable to an elevated phase only (the folder is the service's).
  try {
    for (const file of fs.readdirSync(BRIDGE_LOGS).filter((f) => f.endsWith('.log'))) {
      lines.push(`${file}:\n${fs.readFileSync(path.join(BRIDGE_LOGS, file), 'utf8').slice(-3000)}`);
    }
  } catch (err) {
    lines.push(`CG Bridge logs: unread (${err instanceof Error ? err.message : String(err)})`);
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
  /** `evaluate`, handing the page function ONE JSON-serialisable argument. */
  async evaluateWith(fn, arg) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(arg)})`,
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

/**
 * CG Control's console: where it came from, and the Persian face with nothing off the machine.
 * `shellCommands` — the commands its capability grants it ({@link consoleShellCommands}).
 */
async function consoleProbe(shellCommands) {
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
  /*
    `TEXT-DIGITS-01` — the console asks its own shell which keyboard language the window types in,
    through Tauri's IPC, which WebView2 carries as `http://ipc.localhost/<command>` (measured on this
    job: one entry per ask). That is the app talking to its own shell, not a load from another
    machine, so the shell's commands are set aside BY NAME — exactly the ones the console's capability
    grants (`R-094`'s close guard asks `close_guard` as soon as the console can answer a close; measured
    on this job as `http://ipc.localhost/close_guard`). Any other origin — and any command the
    capability does not grant — still counts. (Inline: this function runs inside the page.)
  */
  const shellAsk = (u) =>
    u.origin === 'http://ipc.localhost' && shellCommands.includes(u.pathname.slice(1));
  const keyboardAsk = (u) =>
    u.origin === 'http://ipc.localhost' && u.pathname === '/keyboard_language';
  /*
    `CENTRAL-BRIDGE-01` — CG Bridge is this console's own server (its state, its PGM return, its
    logs), so ITS origin is set aside too — by the address the console itself names, never a guess.
    Anything else — a CDN, the internet, another machine — still counts.
  */
  const bridgeAt = window.cg?.link?.bridgeAddress?.() ?? null;
  const fromBridge = (u) => bridgeAt !== null && u.host === bridgeAt;
  const offOrigin = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => {
      try {
        const u = new URL(n);
        return (
          u.protocol.startsWith('http') &&
          u.origin !== location.origin &&
          !shellAsk(u) &&
          !fromBridge(u)
        );
      } catch {
        return false;
      }
    });
  const keyboardAsks = performance.getEntriesByType('resource').filter((e) => {
    try {
      return keyboardAsk(new URL(e.name));
    } catch {
      return false;
    }
  }).length;
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
    keyboardAsks,
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

/** `TEXT-DIGITS-01` — every answer the shells' `keyboard_language` may give. */
const KEYBOARD_LANGUAGES = ['persian', 'arabic', 'latin', 'unknown'];

/**
 * `TEXT-DIGITS-01` — ask the shell which keyboard language its window types in, through its one
 * read-only command, exactly as the page's detector asks it. Both apps; the answer is kept.
 */
async function keyboardProbe() {
  try {
    return { ok: true, said: String(await window.__TAURI_INTERNALS__.invoke('keyboard_language')) };
  } catch (err) {
    return { ok: false, said: String(err) };
  }
}

/**
 * 🔴 `RELEASE-0114-01-C` — **THE INSTALLED DESIGNER STILL DOES ITS WORK** under the capability
 * `D-162` gave it (before it, every command the shell registered was open to the page; now only
 * the four granted are). With the project `name` open and unchanged: a composition SETTING changed
 * (its duration, to 137 frames), SAVE, EXPORT (.vcg), Home, then OPEN it again from Recent on the
 * landing page (its stored file handle), the setting read back; Home again, at the landing page.
 *
 * Windows' file pickers are the ONE thing replaced: each hands the page a file in its own OPFS, so
 * the page's real save, export and open code runs and writes bytes read back here. A picker is a
 * Windows window, and no capability governs it. The pickers stay replaced for the page's life, so
 * {@link designerOpenFile} opens the same saved file.
 */
async function designerWork(name) {
  const said = { steps: [] };
  const step = (s) => said.steps.push(s);
  const wait = async (find, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      const found = await find();
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };
  const buttons = () => [...document.querySelectorAll('button')];
  const named = (label) => buttons().find((b) => b.getAttribute('aria-label') === label);
  const durationField = () =>
    document.querySelector('input[aria-label="Scene duration in frames"]');
  const setDuration = (n) => {
    const field = durationField();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(field, String(n));
    field?.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // `null` while the page is still writing it: a file read mid-write is a stale snapshot.
  const fileFacts = async (dir, file) => {
    if (file === undefined) return null;
    try {
      const blob = await (await dir.getFileHandle(file)).getFile();
      const head = [...new Uint8Array(await blob.slice(0, 4).arrayBuffer())];
      return { file, bytes: blob.size, zip: head.join(',') === '80,75,3,4' };
    } catch {
      return null;
    }
  };
  const atLanding = () => wait(() => named('New project') !== undefined);
  try {
    const dir = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('cg-smoke', { create: true });
    const written = [];
    window.showSaveFilePicker = async (options) => {
      const file = options?.suggestedName ?? 'untitled';
      if (!written.includes(file)) written.push(file);
      return dir.getFileHandle(file, { create: true });
    };
    window.showOpenFilePicker = async () => [
      await dir.getFileHandle(written.find((f) => f.endsWith('.cgproj'))),
    ];

    // A composition setting: its duration. The title then reads `* name`.
    step('setting');
    said.durationBefore = durationField()?.value ?? null;
    setDuration(137);
    said.dirtyTitle = await wait(() => (document.title.startsWith('* ') ? document.title : null));

    // Save: the title loses its `*`.
    step('save');
    buttons()
      .find((b) => b.textContent?.trim() === 'SAVE')
      ?.click();
    said.savedTitle = await wait(() => (document.title === name ? document.title : null));
    said.saved = await fileFacts(
      dir,
      written.find((f) => f.endsWith('.cgproj')),
    );

    // Export: the open composition, to .vcg.
    step('export');
    named('Export .vcg')?.click();
    said.exported = await wait(async () => {
      const facts = await fileFacts(
        dir,
        written.find((f) => f.endsWith('.vcg')),
      );
      return facts !== null && facts.zip && facts.bytes > 0 ? facts : null;
    });

    // Home, then Open from Recent: the setting read back from the saved file.
    step('home');
    named('Home')?.click();
    said.home = (await atLanding()) !== null;
    step('open-recent');
    buttons()
      .find((b) => b.querySelector('strong')?.textContent === name)
      ?.click();
    said.recentDuration = await wait(() => durationField()?.value ?? null);
    said.recentTitle = document.title;

    step('home-again');
    named('Home')?.click();
    said.homeAgain = (await atLanding()) !== null;
    step('done');
  } catch (err) {
    said.error = String(err);
  }
  return said;
}

/**
 * `RELEASE-0114-01-C` — File → Open (Ctrl+O, by its physical key) from ANOTHER project, open and
 * unchanged: the studio then shows the saved one, its title and its duration read from the file
 * (`designerWork` saved it; its picker hands the page that file). Home again, at the landing page.
 */
async function designerOpenFile(name) {
  const wait = async (find, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      const found = find();
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };
  const named = (label) =>
    [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);
  const before = document.title;
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyO', key: 'o', ctrlKey: true, bubbles: true }),
  );
  const title = await wait(() => (document.title === name ? document.title : null));
  const duration =
    document.querySelector('input[aria-label="Scene duration in frames"]')?.value ?? null;
  named('Home')?.click();
  const home = (await wait(() => named('New project') !== undefined)) !== null;
  return { before, title, duration, home };
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

// ── Each app's icon and taskbar identity (`RELEASE-091-01` §3, `B-290`) ──────

/**
 * Where a per-user install puts an app's exe, and the first that exists. Both apps install per user
 * now — CG Designer always did; CG Control since `CENTRAL-BRIDGE-01` (nothing in it needs admin).
 */
function installedPerUser(product, exeName) {
  const candidates = [
    path.join(LOCALAPPDATA, product, exeName),
    path.join(LOCALAPPDATA, 'Programs', product, exeName),
  ];
  return { exe: candidates.find((c) => fs.existsSync(c)), candidates };
}
const installedDesignerExe = () => installedPerUser('CG Designer', 'cg-designer.exe');
const installedControlExe = () => installedPerUser('CG Control', 'cg-control.exe');

/**
 * The bundle identifier Tauri's NSIS stamps on every shortcut it writes (`SetLnkAppUserModelId`), read
 * from the app's own config — never a second copy here.
 */
function identifierOf(app) {
  const file = path.join(REPO, 'apps', app, 'src-tauri', 'tauri.conf.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).identifier;
}

/**
 * The commands CG Control's capability grants its console (`allow-close-guard` → `close_guard`), read
 * from the app's own `capabilities/console.json` — the list the shell enforces, never a second copy.
 */
function consoleShellCommands() {
  const file = path.join(REPO, 'apps', 'runtime', 'src-tauri', 'capabilities', 'console.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'))
    .permissions.filter((p) => typeof p === 'string' && p.startsWith('allow-'))
    .map((p) => p.slice('allow-'.length).replace(/-/g, '_'));
}

/**
 * One PowerShell read of what Windows shows for an app: the SHA-256 of the icon inside its exe (as the
 * shell extracts it, rendered to PNG), and for every `<product>.lnk` under Start and the desktop — both
 * the all-users and this user's folders — the file its icon comes from, that icon's hash, and its
 * AppUserModelID (the shortcut's own property; `Get-StartApps` only when the shell cannot say).
 */
function identityScript(product, exe) {
  const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;
  return [
    "$ErrorActionPreference = 'Stop'",
    // `Get-StartApps` loads a module on first use and reports progress on stderr as CLIXML.
    "$ProgressPreference = 'SilentlyContinue'",
    'Add-Type -AssemblyName System.Drawing',
    'function IconHash([string]$p) {',
    '  if ([string]::IsNullOrWhiteSpace($p) -or -not (Test-Path -LiteralPath $p)) { return $null }',
    '  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p)',
    '  if ($null -eq $icon) { return $null }',
    '  $ms = New-Object System.IO.MemoryStream',
    '  $icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
    '  $sha = [System.Security.Cryptography.SHA256]::Create()',
    "  return (($sha.ComputeHash($ms.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join '')",
    '}',
    `$product = ${literal(product)}`,
    `$exe = ${literal(exe)}`,
    '$places = @(',
    "  @{ where = 'start'; root = [Environment]::GetFolderPath('CommonPrograms') },",
    "  @{ where = 'start'; root = [Environment]::GetFolderPath('Programs') },",
    "  @{ where = 'desktop'; root = [Environment]::GetFolderPath('CommonDesktopDirectory') },",
    "  @{ where = 'desktop'; root = [Environment]::GetFolderPath('DesktopDirectory') }",
    ')',
    '$ws = New-Object -ComObject WScript.Shell',
    '$shell = New-Object -ComObject Shell.Application',
    '$startApps = @()',
    'try { $startApps = @(Get-StartApps) } catch { }',
    '$seen = @{}',
    '$shortcuts = @()',
    'foreach ($place in $places) {',
    '  if ([string]::IsNullOrWhiteSpace($place.root) -or -not (Test-Path -LiteralPath $place.root)) { continue }',
    '  foreach ($lnk in @(Get-ChildItem -LiteralPath $place.root -Filter "$product.lnk" -Recurse -Depth 1 -ErrorAction SilentlyContinue)) {',
    '    if ($seen.ContainsKey($lnk.FullName)) { continue }',
    '    $seen[$lnk.FullName] = $true',
    '    $sc = $ws.CreateShortcut($lnk.FullName)',
    '    $loc = [string]$sc.IconLocation',
    "    $cut = $loc.LastIndexOf(',')",
    '    $src = if ($cut -ge 0) { $loc.Substring(0, $cut) } else { $loc }',
    '    if ([string]::IsNullOrWhiteSpace($src)) { $src = $sc.TargetPath }',
    '    $src = [Environment]::ExpandEnvironmentVariables($src)',
    '    $aumid = $null; $via = $null',
    "    try { $aumid = [string]$shell.Namespace($lnk.DirectoryName).ParseName($lnk.Name).ExtendedProperty('System.AppUserModel.ID'); $via = 'shortcut' } catch { }",
    "    if ([string]::IsNullOrEmpty($aumid)) { $app = $startApps | Where-Object { $_.Name -eq $product } | Select-Object -First 1; if ($null -ne $app) { $aumid = [string]$app.AppID; $via = 'Get-StartApps' } }",
    '    $shortcuts += [pscustomobject]@{ path = $lnk.FullName; where = $place.where; iconSource = $src; icon = (IconHash $src); aumid = $aumid; aumidVia = $via }',
    '  }',
    '}',
    '[pscustomobject]@{ exeIcon = (IconHash $exe); shortcuts = $shortcuts } | ConvertTo-Json -Compress -Depth 4',
  ].join('\n');
}

/** Run {@link identityScript} — encoded, so no quote in it is ever re-parsed by a command line. */
function readIdentity(product, exe) {
  const encoded = Buffer.from(identityScript(product, exe), 'utf16le').toString('base64');
  return parseIdentityRead(
    run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]),
  );
}

/** Both apps installed: what Windows shows for each, and that the two DIFFER. */
function identities() {
  const apps = [
    {
      product: 'CG Control',
      identifier: identifierOf('runtime'),
      exe: installedControlExe().exe ?? '',
      hive: 'HKCU',
    },
    {
      product: 'CG Designer',
      identifier: identifierOf('designer'),
      exe: installedDesignerExe().exe ?? '',
      hive: 'HKCU',
    },
  ].map(({ hive, ...app }) => ({
    ...app,
    ...readIdentity(app.product, app.exe),
    displayIcon: installedEntry(hive, app.product)?.displayIcon ?? null,
  }));
  fs.writeFileSync(path.join(out, 'app-identity.json'), JSON.stringify(apps, null, 2));
  for (const c of identityChecks(apps)) check(c.name, c.ok, c.detail);
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
  const { exe, candidates } = installedDesignerExe();
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
  // `CLIENT-TEST-RELEASE-01` B1 — Windows lists it under Installed apps as this release, per user.
  if (releaseGiven()) {
    const entry = installedEntry('HKCU', 'CG Designer');
    check(
      `Installed apps lists CG Designer ${String(RELEASE)}, for this user`,
      entry?.displayName === 'CG Designer' && entry.displayVersion === RELEASE,
      JSON.stringify(entry),
    );
  }

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
  {
    const title = windowTitle('cg-designer.exe');
    check(
      "CG Designer's title bar reads APASAI CG DESIGNER",
      title === 'APASAI CG DESIGNER',
      title,
    );
  }
  const keyboard = await page.evaluate(keyboardProbe);
  fs.writeFileSync(path.join(out, 'designer-keyboard.json'), JSON.stringify(keyboard, null, 2));
  check(
    'CG Designer reports its keyboard language through its one read-only command',
    keyboard.ok && KEYBOARD_LANGUAGES.includes(keyboard.said),
    keyboard.said,
  );
  const ffmpeg = await page.evaluate(ffmpegProbe);
  fs.writeFileSync(path.join(out, 'designer-ffmpeg.json'), JSON.stringify(ffmpeg, null, 2));
  check(
    "ffmpeg loads and runs under the installed Designer's CSP",
    ffmpeg.ran && ffmpeg.reason === 'no-stream' && ffmpeg.logTail.length > 0,
    `${ffmpeg.reason}; ${ffmpeg.logTail.slice(-2).join(' / ')}`,
  );

  // `RELEASE-0114-01-C` — its own work, under the capability `D-162` gave it: a setting, Save,
  // Export, and Open (from Recent, and File → Open from another project). The facts are kept.
  const NAME = 'Designer work';
  const started = await page.evaluateWith(designerNewProject, NAME);
  check('CG Designer opens a new project', started.ok && started.said === NAME, started.said);
  const work = started.ok
    ? await page.evaluateWith(designerWork, NAME)
    : { steps: [], error: started.said };
  const target =
    work.homeAgain === true
      ? await page.evaluateWith(designerNewProject, 'Open target')
      : { ok: false, said: 'not at the landing page' };
  const reopened = target.ok ? await page.evaluateWith(designerOpenFile, NAME) : null;
  fs.writeFileSync(
    path.join(out, 'designer-work.json'),
    JSON.stringify({ work, target, reopened }, null, 2),
  );
  const at = `${work.steps.at(-1) ?? 'none'}${work.error === undefined ? '' : `: ${work.error}`}`;
  check(
    `…a composition setting changed (duration ${String(work.durationBefore)} → 137 frames): unsaved (control: the title reads * ${NAME})`,
    work.dirtyTitle === `* ${NAME}`,
    `${String(work.dirtyTitle)}; at ${at}`,
  );
  check(
    '…Save writes the project (.cgproj, a zip) and the title loses its *',
    work.savedTitle === NAME && work.saved?.zip === true && work.saved.bytes > 0,
    `${JSON.stringify(work.saved)}; at ${at}`,
  );
  check(
    '…Export writes the composition (.vcg, a zip)',
    work.exported?.zip === true && work.exported.bytes > 0,
    `${JSON.stringify(work.exported)}; at ${at}`,
  );
  check(
    '…Home, then Open from Recent: the project, its setting read back from the file (137)',
    work.home === true && work.recentTitle === NAME && work.recentDuration === '137',
    `${String(work.recentTitle)}; ${String(work.recentDuration)}; at ${at}`,
  );
  check(
    '…File → Open (Ctrl+O) from another project: the saved one, its setting read from the file (137)',
    reopened !== null &&
      reopened.before === 'Open target' &&
      reopened.title === NAME &&
      reopened.duration === '137' &&
      reopened.home,
    JSON.stringify(reopened ?? target),
  );

  // `D-162` 1 — a project open and UNCHANGED: a close (WM_CLOSE) closes CG Designer at once.
  const made = await page.evaluateWith(designerNewProject, 'Close guard');
  check(
    'CG Designer opens a new project (control: the studio shows it, unchanged)',
    made.ok && made.said === 'Close guard',
    made.said,
  );
  const posted = sendClose('cg-designer.exe');
  const closed = await until(
    'CG Designer to close',
    () => processCount('cg-designer.exe') === 0,
    15_000,
  ).then(
    () => true,
    () => false,
  );
  check(
    'D-162 — with no unsaved changes, a close (WM_CLOSE) closes CG Designer at once',
    posted === 'posted' && closed,
    `${posted}; ${String(processCount('cg-designer.exe'))} running`,
  );
  page.close();
  for (const pid of pidsOf('cg-designer.exe')) request('taskkill', ['/PID', String(pid), '/F']);

  // `D-162` 2 — with unsaved changes the close is held, and the page asks.
  await designerUnsavedClose(exe);
  check('CG Designer closes', processCount('cg-designer.exe') === 0);
}

/**
 * 🔴 `D-162` — **NEVER LOSE UNSAVED WORK SILENTLY**, in the installed app: a project edited, a close
 * (WM_CLOSE) is HELD and `Unsaved changes` asks; Cancel keeps the window, a second close while it
 * asks stacks no second dialog, and Don't save closes it. The dialog's picture is kept.
 */
async function designerUnsavedClose(exe) {
  const TITLE = 'Unsaved changes';
  // The first run's WebView2 gone before the second starts on the same DevTools port and profile.
  await until(
    "the first run's WebView2 to exit",
    () => processCount('msedgewebview2.exe') === 0,
    20_000,
  ).catch(() => undefined);
  launch(exe, 9231);
  const page = await Cdp.attach(9231, APP_PAGE, 90_000).catch(async (err) => {
    await diagnose('designer-relaunch', 9231);
    throw err;
  });
  await until(
    'the Designer landing page',
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button')].some(
          (b) => b.getAttribute('aria-label') === 'New project',
        ),
      ),
    60_000,
  );
  const made = await page.evaluateWith(designerNewProject, 'Close guard');
  const edited = made.ok ? await page.evaluate(designerEdit) : made.said;
  check(
    '…a project edited, so it holds unsaved changes (control: its title reads * Close guard)',
    edited === '* Close guard',
    edited,
  );
  const asked = () =>
    until('the Unsaved changes dialog', () => page.evaluateWith(closeDialogProbe, TITLE), 15_000)
      .then((d) => d)
      .catch(() => null);

  sendClose('cg-designer.exe');
  const first = await asked();
  await sleep(1000);
  check(
    'D-162 — with unsaved changes, a close (WM_CLOSE) is HELD: CG Designer stays open and asks',
    first !== null && processCount('cg-designer.exe') === 1,
    `${JSON.stringify(first)}; ${String(processCount('cg-designer.exe'))} running`,
  );
  if (first === null) await diagnose('designer-close', 9231);
  check(
    "…in ONE dialog: Unsaved changes, the project's name, Save / Don't save / Cancel, focus on Cancel",
    first !== null &&
      first.title === TITLE &&
      first.project === 'Close guard' &&
      JSON.stringify(first.buttons) === JSON.stringify(['Save', "Don't save", 'Cancel']) &&
      first.focused === 'Cancel' &&
      first.same === 1 &&
      first.dialogs === 1,
    JSON.stringify(first),
  );
  await page.screenshot(path.join(out, 'designer-unsaved-dialog.png'));

  // A second close while it asks: still one dialog, still open.
  sendClose('cg-designer.exe');
  await sleep(1500);
  const again = await page.evaluateWith(closeDialogProbe, TITLE);
  check(
    '…a second close while it asks stacks no second dialog',
    again !== null &&
      again.same === 1 &&
      again.dialogs === 1 &&
      processCount('cg-designer.exe') === 1,
    JSON.stringify(again),
  );

  // Cancel keeps the window open, the work still unsaved.
  await page.evaluateWith(pressInDialog, { title: TITLE, label: 'Cancel' });
  await sleep(1500);
  const afterCancel = await page.evaluateWith(closeDialogProbe, TITLE);
  const stillEdited = await page.evaluate(() => document.title);
  check(
    '…Cancel keeps CG Designer open, the work still unsaved',
    afterCancel === null &&
      processCount('cg-designer.exe') === 1 &&
      stillEdited === '* Close guard',
    `${JSON.stringify(afterCancel)}; ${stillEdited}; ${String(processCount('cg-designer.exe'))} running`,
  );

  // Closed again: Don't save closes it.
  sendClose('cg-designer.exe');
  const second = await asked();
  const pressed =
    second !== null &&
    (await page.evaluateWith(pressInDialog, { title: TITLE, label: "Don't save" }));
  const gone = await until(
    'CG Designer to close',
    () => processCount('cg-designer.exe') === 0,
    20_000,
  ).then(
    () => true,
    () => false,
  );
  check(
    "…closed again, Don't save closes CG Designer",
    pressed && gone,
    `pressed ${String(pressed)}; ${String(processCount('cg-designer.exe'))} running`,
  );
  page.close();
  if (!gone) {
    for (const pid of pidsOf('cg-designer.exe')) request('taskkill', ['/PID', String(pid), '/F']);
  }
}

// ── CG Bridge, and the installers' names (install phase, elevated) ──────────

async function install() {
  // `CLIENT-TEST-RELEASE-01` B1 — all three installers are NAMED for the release, before any runs.
  if (releaseGiven()) {
    for (const [product, file, name] of [
      ['CG Bridge', args.bridge, `CG-Bridge_${RELEASE}_x64-setup.exe`],
      ['CG Control', args['control-installer'], `CG Control_${RELEASE}_x64-setup.exe`],
      ['CG Designer', args['designer-installer'], `CG Designer_${RELEASE}_x64-setup.exe`],
    ]) {
      const built = path.basename(String(file));
      check(`the ${product} installer is named for ${RELEASE}`, built === name, built);
    }
  }
  // `CENTRAL-BRIDGE-01` — CG Bridge first, as the Playout's installer chains it: per machine,
  // silently, naming the Playout. Its lifecycle is the bridge smoke's; here it is what CG Control
  // connects to.
  const code = exitCodeOf(args.bridge, ['/S', `/PLAYOUT=${PLAYOUT}`]);
  check('CG Bridge installs silently, per machine (exit 0)', code === 0, String(code));
  const h = await until('CG Bridge to answer /health', health, 90_000).catch(() => null);
  check(
    'CG Bridge answers /health on port 5280, as this release, naming the Playout it was given',
    h !== null && h.app === 'cg-bridge' && h.version === RELEASE && h.playout?.address === PLAYOUT,
    h === null
      ? 'no answer'
      : `${String(h.app)} ${String(h.version)} ${String(h.playout?.address)}`,
  );
  if (h === null) await diagnose('bridge', 0);
}

// ── CG Control (drive phase, medium integrity) ───────────────────────────────

function controlInstall() {
  // Installed from THIS phase's medium-integrity process: "without admin" is exercised, not read.
  const code = exitCodeOf(args.control, ['/S']);
  check('CG Control installs without admin (exit 0)', code === 0, String(code));
  const { exe, candidates } = installedControlExe();
  check(
    'CG Control installs per user, under LOCALAPPDATA',
    exe !== undefined,
    exe ?? candidates.join(' | '),
  );
  if (exe === undefined) return;
  // The console is all there is: no bridge, no Node, no staged payload beside it.
  const dir = path.dirname(exe);
  check(
    'CG Control installs no bridge — no cg-bridge.exe, no payload',
    !fs.existsSync(path.join(dir, 'cg-bridge.exe')) && !fs.existsSync(path.join(dir, 'payload')),
    dir,
  );
  // `CLIENT-TEST-RELEASE-01` B1 — Windows lists it under Installed apps as this release, per user.
  if (releaseGiven()) {
    const entry = installedEntry('HKCU', 'CG Control');
    check(
      `Installed apps lists CG Control ${String(RELEASE)}, for this user`,
      entry?.displayName === 'CG Control' && entry.displayVersion === RELEASE,
      JSON.stringify(entry),
    );
  }
}

async function controlDrive() {
  const { exe } = installedControlExe();
  if (exe === undefined) return; // `controlInstall` has already failed it
  launch(exe, 9230);
  const page = await Cdp.attach(9230, APP_PAGE, 90_000).catch(async (err) => {
    await diagnose('control', 9230);
    check(
      'CG Control opens its window on http://tauri.localhost',
      false,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  });
  if (page === null) return;
  /*
    Wait for the console to COMMIT, never a fixed time: `/json/list` names the page as soon as the
    shell navigates, while the window still holds its initial blank document (origin "null"). Run
    36691878177 probed that document on a slow runner. The origin is still asserted below.
  */
  await until(
    'the console to commit its own origin',
    () =>
      page.evaluate(() => location.origin).then((origin) => origin === 'http://tauri.localhost'),
    60_000,
  ).catch(() => null);

  // 1 — a fresh install asks ONE question before it connects anywhere: where the Playout is.
  const gate = await until(
    'the Playout-address gate',
    () => page.evaluate(() => document.querySelector('[data-playout-address-gate]') !== null),
    30_000,
  ).catch(() => false);
  check('a fresh CG Control asks for the Playout address before it connects anywhere', gate);
  await page.screenshot(path.join(out, 'control-gate.png'));
  // Typed as an operator types it (through the page's own input pipeline), then CONNECT.
  await page.evaluate(() => document.getElementById('cg-playout-address')?.focus());
  await page.send('Input.insertText', { text: PLAYOUT });
  const pressed = await until(
    'CONNECT to be pressable',
    () =>
      page.evaluate(() => {
        const connect = [...document.querySelectorAll('[data-playout-address-gate] button')].find(
          (b) => b.textContent?.trim() === 'Connect',
        );
        if (connect === undefined || connect.disabled) return null;
        // What the gate holds as it is pressed — the address it will save.
        const typed = document.getElementById('cg-playout-address')?.value ?? '';
        connect.click();
        return typed;
      }),
    15_000,
  ).catch(() => null);
  check('…the address typed, and CONNECT pressed', pressed === PLAYOUT, String(pressed));

  // 2 — saved, and the console starts again aimed at CG Bridge on the Playout's host.
  const live = await until(
    'CG Control to connect to CG Bridge',
    () =>
      page.evaluate(() =>
        window.cg?.link?.status?.() === 'live' ? (window.cg.link.bridgeAddress?.() ?? '?') : null,
      ),
    60_000,
  ).catch(() => null);
  check(
    `…and connects to CG Bridge on the Playout's host, ${BRIDGE_AT}`,
    live === BRIDGE_AT,
    String(live),
  );
  if (live === null) await diagnose('control-connect', 9230);
  // Then the settle the probe always had: fonts and the first keyboard asks.
  await sleep(4000);
  const facts = await page.evaluateWith(consoleProbe, consoleShellCommands());
  fs.writeFileSync(path.join(out, 'control-facts.json'), JSON.stringify(facts, null, 2));
  check(
    'the console is the one CG Control bundles, on http://tauri.localhost',
    facts.origin === 'http://tauri.localhost',
    facts.origin,
  );
  check('…which is a secure context', facts.secure === true);
  // The absence, and the control that makes it mean something.
  check(
    'Persian renders in the self-hosted Vazirmatn (control)',
    facts.vazirmatn === 'loaded' && facts.fonts.length > 0,
    facts.fonts.join(', '),
  );
  check(
    '…and nothing the console loaded came from another origin (CG Bridge aside)',
    facts.offOrigin.length === 0,
    facts.offOrigin.join(', '),
  );

  // 3 — CONTROL: no token, no state. The console's OWN request, over its own socket.
  const auth = await page.evaluate(() => window.cg.auth.state().kind);
  check('CONTROL — with no token, CG Control is signed out', auth === 'signed-out', auth);
  const refused = await page.evaluate(() =>
    window.cg.stack.snapshot().then(
      (stack) => `answered with ${String(stack.length)} rows`,
      (err) => String(err instanceof Error ? err.message : err),
    ),
  );
  check(
    '…and CG Bridge gives it NO state: its stack.snapshot is refused by the auth gate',
    refused.startsWith(NOT_SIGNED_IN),
    refused,
  );
  // The station is in first-run, so the sign-in it is sent to is first-run's: CG Bridge's
  // configuration already holds the Playout, so it opens at the sign-in, not at the address.
  const firstRun = await until(
    'the station first-run',
    () =>
      page.evaluate(
        () => document.querySelector('[data-first-run]')?.getAttribute('data-first-run') ?? null,
      ),
    30_000,
  ).catch(() => null);
  const signIn = await page.evaluate(() => document.getElementById('cg-first-run-user') !== null);
  check(
    '…and it is sent to sign in: CG Bridge is in first-run, at its sign-in',
    firstRun === 'channel' && signIn,
    `phase ${String(firstRun)}, sign-in ${String(signIn)}`,
  );
  await sleep(2000);
  await page.screenshot(path.join(out, 'control.png'));
  {
    const counted = await health().catch(() => null);
    check(
      'CG Bridge counts the console connected to it',
      (counted?.consoles ?? 0) >= 1,
      String(counted?.consoles),
    );
  }
  {
    const title = windowTitle('cg-control.exe');
    check("CG Control's title bar reads APASAI CG CONTROL", title === 'APASAI CG CONTROL', title);
  }
  {
    // TEXT-DIGITS-01 — granted to this console page (`capabilities/console.json`), read-only.
    const keyboard = await page.evaluate(keyboardProbe);
    fs.writeFileSync(path.join(out, 'control-keyboard.json'), JSON.stringify(keyboard, null, 2));
    check(
      'the console reads its keyboard language through the app’s one read-only command',
      keyboard.ok && KEYBOARD_LANGUAGES.includes(keyboard.said),
      keyboard.said,
    );
  }
  page.close();

  // 4 — CG Control runs no bridge: the one cg-bridge.exe on this machine is the SERVICE's.
  {
    const parents = bridgeParents();
    check(
      'CG Control started no bridge: the one cg-bridge.exe here is the service’s (its parent is shawl.exe)',
      parents.length === 1 && parents[0]?.toLowerCase() === 'shawl.exe',
      parents.join(', ') || 'none',
    );
  }

  // A second launch focuses the open window and exits.
  launch(exe, 9232);
  await sleep(8000);
  check(
    'a second launch leaves ONE CG Control running',
    processCount('cg-control.exe') === 1,
    `${processCount('cg-control.exe')} running`,
  );

  // 5 — closed: CG Bridge is a service, not the console's child. It keeps running, and stops
  // counting the console (`§5`: the service survives a console closing). `R-094` — the close is
  // HELD and asked about first; Close is a window close, and sends nothing to CG Bridge.
  await controlCloseGuard();
  check('CG Control closes', processCount('cg-control.exe') === 0);
  const after = await until(
    'CG Bridge to stop counting the console',
    () => health().then((h) => (h !== null && h.consoles === 0 ? h : null)),
    30_000,
  ).catch(() => null);
  check(
    'closing CG Control leaves CG Bridge running — and it no longer counts the console',
    after !== null,
    JSON.stringify((await health().catch(() => null))?.consoles ?? 'no answer'),
  );

  // State and logs live in this user's own folders, never ~/.cg-runtime.
  const shellLog = path.join(APPDATA, 'CG Control', 'logs', 'shell.log');
  const logText = fs.existsSync(shellLog) ? fs.readFileSync(shellLog, 'utf8') : '';
  check(
    "CG Control's shell writes its log under %APPDATA%\\CG Control\\logs",
    logText.includes('page loaded: http://tauri.localhost'),
    shellLog,
  );
  // `R-094` — and it wrote down that it HELD the close rather than letting it through.
  check(
    "R-094 — CG Control's shell logged the held close",
    logText.includes('a close was held: the page is asked'),
    logText
      .split('\n')
      .filter((l) => l.includes('a close '))
      .slice(-4)
      .join(' | ') || 'none',
  );
  check(
    'nothing was written to ~/.cg-runtime',
    !fs.existsSync(path.join(os.homedir(), '.cg-runtime')),
  );
}

/**
 * 🔴 `R-094` — **NO CLOSE ON A SLIP**, in the installed app: a close (WM_CLOSE) is HELD and
 * `Close CG Control?` asks — over the first-run gate this fresh station is at, which is exactly the
 * case the dialog's `window` layer exists for. Cancel keeps the window; Close exits. Nothing of this
 * console is on air (it is signed out), so there is no fact line. The dialog's picture is kept.
 */
async function controlCloseGuard() {
  const TITLE = 'Close CG Control?';
  const page = await Cdp.attach(9230, APP_PAGE, 30_000).catch(() => null);
  if (page === null) {
    check('R-094 — the console can be reached to answer a close', false);
    for (const pid of pidsOf('cg-control.exe')) request('taskkill', ['/PID', String(pid), '/F']);
    return;
  }
  const asked = () =>
    until('the Close CG Control? dialog', () => page.evaluateWith(closeDialogProbe, TITLE), 15_000)
      .then((d) => d)
      .catch(() => null);

  sendClose('cg-control.exe');
  const first = await asked();
  await sleep(1000);
  check(
    'R-094 — a close (WM_CLOSE) is HELD: CG Control stays open and asks',
    first !== null && processCount('cg-control.exe') === 1,
    `${JSON.stringify(first)}; ${String(processCount('cg-control.exe'))} running`,
  );
  if (first === null) await diagnose('control-close', 9230);
  check(
    '…in ONE dialog: Close CG Control?, Cancel / Close, focus on Cancel — and no fact line, nothing being on air',
    first !== null &&
      first.title === TITLE &&
      JSON.stringify(first.buttons) === JSON.stringify(['Cancel', 'Close']) &&
      first.focused === 'Cancel' &&
      first.fact === null &&
      // ONE close dialog — asked over the first-run card, itself a dialog (the `window` layer's case).
      first.same === 1,
    JSON.stringify(first),
  );
  await page.screenshot(path.join(out, 'control-close-dialog.png'));

  // Cancel keeps the window open.
  await page.evaluateWith(pressInDialog, { title: TITLE, label: 'Cancel' });
  await sleep(1500);
  const afterCancel = await page.evaluateWith(closeDialogProbe, TITLE);
  check(
    '…Cancel keeps CG Control open',
    afterCancel === null && processCount('cg-control.exe') === 1,
    `${JSON.stringify(afterCancel)}; ${String(processCount('cg-control.exe'))} running`,
  );

  // Closed again: Close exits.
  sendClose('cg-control.exe');
  const second = await asked();
  const pressed =
    second !== null && (await page.evaluateWith(pressInDialog, { title: TITLE, label: 'Close' }));
  const gone = await until(
    'CG Control to close',
    () => processCount('cg-control.exe') === 0,
    30_000,
  ).then(
    () => true,
    () => false,
  );
  check(
    '…closed again, Close exits CG Control',
    pressed && gone,
    `pressed ${String(pressed)}; ${String(processCount('cg-control.exe'))} running`,
  );
  page.close();
  if (!gone) {
    for (const pid of pidsOf('cg-control.exe')) request('taskkill', ['/PID', String(pid), '/F']);
  }
}

// ── CG Control's uninstall (uninstall phase, elevated) ───────────────────────

async function controlUninstall() {
  // CG Control opens no port: no firewall rule is named for it. Read while it is still installed,
  // by the same instrument that lists CG Bridge's three — the control that makes the absence mean
  // something (and elevated, which a full rule listing may need).
  {
    const names = firewallRuleNames();
    const ours = (prefix) => (names ?? []).filter((n) => n.startsWith(prefix));
    check(
      'CG Control added no firewall rule (control: CG Bridge’s three are listed by the same read)',
      names !== null && ours('CG Control').length === 0 && ours('CG Bridge - ').length === 3,
      names === null
        ? 'netsh unread'
        : `CG Control: [${ours('CG Control').join(', ')}] · CG Bridge: [${ours('CG Bridge - ').join(', ')}]`,
    );
  }
  const { exe } = installedControlExe();
  if (exe === undefined) {
    check('CG Control is installed, to be uninstalled', false);
    return;
  }
  // Tauri's uninstaller copies itself away and returns at once; it deletes `cg-control.exe` FIRST
  // and the Installed-apps entry near its END (`CLIENT-TEST-RELEASE-01`, run 36572556033), so wait
  // for both, bounded: an entry that never goes still fails the check below.
  run(path.join(path.dirname(exe), 'uninstall.exe'), ['/S']);
  await until(
    'the uninstaller to finish',
    () => !fs.existsSync(exe) && installedEntry('HKCU', 'CG Control') === null,
    60_000,
  ).catch(() => undefined);
  check('uninstalling removes CG Control', !fs.existsSync(exe), exe);
  // `CLIENT-TEST-RELEASE-01` B1 — and Installed apps no longer lists it (the drive phase's reading of
  // the same key is this absence's positive control).
  check(
    'uninstalling removes CG Control from Installed apps',
    installedEntry('HKCU', 'CG Control') === null,
  );
  // CG Bridge is not CG Control's: removing the console leaves the service answering.
  const still = await health().catch(() => null);
  check('…and leaves CG Bridge running', still !== null && still.app === 'cg-bridge');
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
  await step('CG Bridge install', install);
} else if (phase === 'drive') {
  check('the apps are driven unelevated, as an operator runs them', level === 'Medium', level);
  await step('CG Designer smoke', designer);
  await step('CG Control install', controlInstall);
  // `RELEASE-091-01` §3 — both apps are installed now, each per user.
  await step('Each app its own icon and taskbar identity', identities);
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
