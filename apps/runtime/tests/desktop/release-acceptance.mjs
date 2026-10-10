#!/usr/bin/env node
/**
 * 🔴 `RELEASE-0110-01` §3 — **THE RELEASE, ACCEPTED ON A CLEAN WINDOWS RUNNER**: the three installers
 * installed in the guide's order with the network cut, the INSTALLED CG Control driven end to end
 * against the INSTALLED CG Bridge and a fake Playout (sign in, sign CG Bridge in, channel 2, a take ON
 * AIR, a clear), the real upgrade from the classic `0.10.0` the owner holds, and the uninstall.
 *
 * The other smokes prove each installer's own lifecycle (`installer-smoke.mjs`, `setup-smoke.mjs`,
 * `tools/bridge-installer/smoke.mjs`). This one proves the RELEASE: the parts together, the way a
 * station meets them. CasparCG is `@cg/amcp-mock` behind the fake Playout (`acceptance-station.mjs`),
 * whose every received line is read back — "nothing on air is cleared" is read off the wire.
 *
 * PHASES (the runner is elevated and an operator is not — WebView2 opens DevTools only unelevated):
 *   install         (elevated) the guide's order — CG Bridge, CG Control, CG Designer — each through
 *                              its setup window, with the network CUT (a positive control proves it)
 *   install-classic (elevated) the `--from` draft's own three installers, silently
 *   drive           (medium)   CG Control end to end; `--mode fresh` clears what it took, `--mode
 *                              classic` leaves it on air for the upgrade
 *   upgrade         (elevated) each of this release's installers over `--from`: its Welcome, then `/S`; the
 *                              service, the settings and CG Bridge's session kept; no `CLEAR`
 *                              (`--apps-open yes`: CG Control's and CG Designer's `/S` left to the next)
 *   upgrade-apps-open (medium) `RELEASE-0114-01-C`: CG Control's and CG Designer's upgrades over the two
 *                              apps OPEN (CG Designer with unsaved changes), then again over the
 *                              guarded upgraded apps; bounded, exit 0, never waiting on a dialog
 *   drive-upgraded  (medium)   the upgraded CG Control: the station kept, the row still ON AIR, cleared
 *   stuck-station   (medium)   `B-320`: the owner's stuck console — a record naming CG Bridge at this
 *                              runner's LAN address, no session, the Playout silent — gate → Set up
 *                              again → Set up → a good address connects, signed in
 *   uninstall       (elevated) all three: the service, its rules and the shortcuts gone; data kept
 *   summary                    every phase's results; a phase that never ran is a failure
 *
 *   node release-acceptance.mjs --phase <phase> --out <dir> --version <x.y.z>
 *     [--bridge <setup.exe>] [--control <setup.exe>] [--designer <setup.exe>] [--mode fresh|classic]
 *     [--from <x.y.z>]   (the release the upgrade starts from; `0.10.0` by default)
 *     [--apps-open yes]   (upgrade: leave the two apps' own upgrades to `upgrade-apps-open`)
 *     [--expect <phase,phase,…>]   (summary)
 *
 * Node built-ins only, plus `../desktop/setup-window.mjs`'s hands on the setup window.
 */
/* global process, fetch, WebSocket, AbortSignal, Buffer, setTimeout */
// The page probes run INSIDE the installed CG Control (serialised through DevTools), not in Node.
/* global window, document, location, localStorage */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  exitCode,
  launch as launchSetup,
  page as setupPage,
  shot,
  uia,
  until as untilSetup,
} from './setup-window.mjs';
import { checkInstalledAppsRow } from '../../../../tools/bridge-installer/installed-apps.mjs';
import {
  closeDialogProbe,
  designerEdit,
  designerNewProject,
  pressInDialog,
  processCount,
  sendClose,
  splashGone,
  webViewArgs,
} from './app-window.mjs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, i, all) =>
        i % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[i + 1]]] : pairs,
      [],
    ),
);
const PHASE = args.phase;
const OUT = path.resolve(args.out ?? 'acceptance');
const VERSION = args.version;
/**
 * The release the upgrade starts from: the classic `0.10.0` by default; `RELEASE-0111-01` §3 runs it again
 * from `0.11.0` (`--from 0.11.0`, the `v0.11.0` draft's own installers).
 */
const OLD = args.from ?? '0.10.0';
/**
 * `RELEASE-0114-01-C` — `--apps-open yes`: `upgrade` still reads each installer's Welcome, but leaves
 * CG Control's and CG Designer's own silent upgrades to `upgrade-apps-open`, which runs them over
 * the two apps OPEN — CG Designer with unsaved changes.
 */
const APPS_OPEN = args['apps-open'] === 'yes';
fs.mkdirSync(OUT, { recursive: true });

const APP_PAGE = 'http://tauri.localhost';
const BRIDGE_HEALTH = 'http://127.0.0.1:5280/health';
const PROGRAM_DIR = path.join(process.env.ProgramW6432 ?? 'C:\\Program Files', 'CG Bridge');
const DATA_DIR = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'CG Bridge');
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
/** The template the drive takes on air: one page, nothing in it CasparCG must fetch. */
const TEMPLATE = {
  templateId: 'acceptance-lower-third',
  name: 'Acceptance',
  templateType: 'lower-third',
  fields: [],
};
const TEMPLATE_HTML =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><div>CG</div></body></html>';
const ITEM = 'acceptance-row';
/** The channel the drive chooses: the prompt's, and the fake `cg-admin` holds it (`fake-station.ts`). */
const CHANNEL = 2;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  process.stdout.write(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  — ${String(detail)}`}\n`,
  );
  return Boolean(ok);
}
function save() {
  fs.writeFileSync(path.join(OUT, `results-${PHASE}.json`), JSON.stringify(results, null, 2));
  return results.every((r) => r.ok);
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
const run = (file, argv) => execFileSync(file, argv, { encoding: 'utf8', windowsHide: true });
const codeOf = (file, argv) => spawnSync(file, argv, { windowsHide: true }).status;
function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encoded,
  ]).trim();
}
const station = () => JSON.parse(fs.readFileSync(path.join(OUT, 'station.json'), 'utf8'));
async function stationLines() {
  return (await fetch(`${station().control}/lines`)).json();
}
async function stationLayer(channel, layer) {
  return (
    await fetch(`${station().control}/layer?channel=${String(channel)}&layer=${String(layer)}`)
  ).json();
}
async function health() {
  try {
    const res = await fetch(BRIDGE_HEALTH, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
/** What Windows lists under Installed apps for a product (both registry views). */
function displayVersion(hive, product) {
  const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${product}`;
  for (const view of ['/reg:64', '/reg:32']) {
    try {
      const text = run('reg', ['query', key, '/v', 'DisplayVersion', view]);
      return /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(text)?.[1] ?? null;
    } catch {
      /* the other view */
    }
  }
  return null;
}
function uninstallString(hive, product) {
  const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${product}`;
  for (const view of ['/reg:64', '/reg:32']) {
    try {
      const text = run('reg', ['query', key, '/v', 'UninstallString', view]);
      return /UninstallString\s+REG_\w+\s+(.+?)\s*$/m.exec(text)?.[1] ?? null;
    } catch {
      /* the other view */
    }
  }
  return null;
}
const installedPerUser = (product, exe) =>
  [path.join(LOCALAPPDATA, product, exe), path.join(LOCALAPPDATA, 'Programs', product, exe)].find(
    (c) => fs.existsSync(c),
  );
/** The service's configuration and recovery, as `sc` prints them. */
function serviceConfig() {
  try {
    return { qc: run('sc', ['qc', 'CGBridge']), failure: run('sc', ['qfailure', 'CGBridge']) };
  } catch {
    return null;
  }
}
/** The CG Bridge firewall rules by their display names, through PowerShell. */
function bridgeRules() {
  try {
    return powershell(
      "@(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'CG Bridge*' } | ForEach-Object { $_.DisplayName }) -join '|'",
    )
      .split('|')
      .filter(Boolean);
  } catch {
    return null;
  }
}
function shortcuts(product) {
  try {
    return powershell(
      [
        `$p = '${product}'`,
        "$roots = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms'), [Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('CommonDesktopDirectory'))",
        '@($roots | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter "$p.lnk" -Recurse -Depth 1 -ErrorAction SilentlyContinue } | ForEach-Object { $_.FullName }) -join \'|\'',
      ].join('\n'),
    )
      .split('|')
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** A minimal DevTools client over Node's own WebSocket (as `installer-smoke.mjs`'s). */
class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  static async attach(port, urlPrefix, timeoutMs) {
    const target = await until(
      `a page at ${urlPrefix} on DevTools port ${String(port)}`,
      async () => {
        const list = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json();
        return list.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix));
      },
      timeoutMs,
    );
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    return new Cdp(ws);
  }
  constructor(ws) {
    this.#ws = ws;
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
  /** `fn(...args)` in the page; `fn` is serialised, so it may use only its arguments. */
  async evaluate(fn, ...fnArgs) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(...${JSON.stringify(fnArgs)})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }
  /** A picture of the page — once the start-up splash has left ({@link splashGone}). */
  async screenshot(name) {
    await until('the start-up splash to leave', () => this.evaluate(splashGone), 25_000).catch(
      () => undefined,
    );
    try {
      const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
    } catch {
      /* evidence only */
    }
  }
  close() {
    this.#ws.close();
  }
}

/** Type into a field through the page's own input pipeline: focus, select what is there, insert. */
async function type(page, selector, text) {
  const focused = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return false;
    el.focus();
    if (typeof el.select === 'function') el.select();
    return document.activeElement === el;
  }, selector);
  if (!focused) return false;
  await page.send('Input.insertText', { text });
  return page.evaluate((sel, want) => document.querySelector(sel)?.value === want, selector, text);
}
/** Press the enabled button reading `label` inside `scope` (a selector, or the whole page). */
function press(page, scope, label) {
  return page.evaluate(
    (sc, lb) => {
      const root = sc === '' ? document : document.querySelector(sc);
      if (root === null) return false;
      const button = [...root.querySelectorAll('button')].find(
        (b) =>
          b.textContent?.trim() === lb && !b.disabled && b.getAttribute('aria-disabled') !== 'true',
      );
      if (button === undefined) return false;
      button.click();
      return true;
    },
    scope,
    label,
  );
}

/** Start CG Control as an operator does, with DevTools opened by the environment (unelevated only). */
function launchControl(cdpPort) {
  const exe = installedPerUser('CG Control', 'cg-control.exe');
  if (exe === undefined) return null;
  const child = spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: webViewArgs(cdpPort),
    },
  });
  child.unref();
  return exe;
}
async function openControl(cdpPort) {
  const exe = launchControl(cdpPort);
  if (
    !check('CG Control is installed for this user', exe !== null && exe !== undefined, String(exe))
  )
    return null;
  const page = await Cdp.attach(cdpPort, APP_PAGE, 90_000).catch((err) => {
    check('CG Control opens its window', false, err instanceof Error ? err.message : String(err));
    return null;
  });
  if (page === null) return null;
  await until(
    'the console to commit its own origin',
    () => page.evaluate(() => location.origin).then((o) => o === 'http://tauri.localhost'),
    60_000,
  ).catch(() => null);
  return page;
}
function closeControl() {
  spawnSync('taskkill', ['/IM', 'cg-control.exe', '/F'], { windowsHide: true });
}

/** The first slot of the station's bank on CHANNEL — the row the take goes on. */
async function rowOnChannel(page) {
  return until(
    `a row of the bank on channel ${String(CHANNEL)}`,
    () =>
      page.evaluate(async (ch) => {
        const slots = await window.cg.fixedLayers.state();
        const mine = slots.filter((s) => s.channel === ch).map((s) => s.layer);
        mine.sort((a, b) => a - b);
        return mine.find((l) => l >= 80) ?? mine[0] ?? null;
      }, CHANNEL),
    60_000,
  ).catch(() => null);
}
const rowText = (page, layer) =>
  page.evaluate(
    (l) => document.querySelector(`[data-layer="${String(l)}"]`)?.textContent ?? null,
    layer,
  );

/** Sign CG Bridge in through its banner's dialog, when it asks; its state then. */
async function signBridgeIn(page, facts) {
  const state = await until(
    'CG Bridge to say whether it has a session',
    () =>
      page.evaluate(async () => {
        const s = await window.cg.bridgeSession.state();
        return s.state === 'waiting' ? null : s.state;
      }),
    60_000,
  ).catch(() => null);
  if (state === 'needs-admin') {
    const opened = await until(
      'the banner to offer "Sign in CG Bridge…"',
      () => press(page, '[data-bridge-session-banner]', 'Sign in CG Bridge…'),
      30_000,
    ).catch(() => false);
    check('the banner offers "Sign in CG Bridge…", and it opens', opened);
    await until(
      'the CG Bridge sign-in dialog',
      () => page.evaluate(() => document.getElementById('cg-bridge-signin-pass') !== null),
      20_000,
    ).catch(() => null);
    await type(page, '#cg-bridge-signin-user', facts.username);
    await type(page, '#cg-bridge-signin-pass', facts.password);
    const sent = await page.evaluate(() => {
      const dialog = document.getElementById('cg-bridge-signin-pass')?.closest('[role="dialog"]');
      const button = [...(dialog?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === 'Sign in',
      );
      if (button === undefined) return false;
      button.click();
      return true;
    });
    check('…the station admin signs CG Bridge in', sent);
  }
  return until(
    'CG Bridge to be signed in',
    () =>
      page.evaluate(async () => {
        const s = await window.cg.bridgeSession.state();
        return s.state === 'signed-in' ? s.state : null;
      }),
    60_000,
  ).catch(() => state);
}

// ── phases ───────────────────────────────────────────────────────────────────────────────────────

/** The guide's order, each through its setup window, with the network cut. */
async function phaseInstall() {
  const facts = station();
  // ── the network, cut: every program's outbound traffic blocked but the runner's own ──
  const before = powershell(
    '(Get-NetFirewallProfile | ForEach-Object { "$($_.Name)=$($_.Enabled)/$($_.DefaultOutboundAction)" }) -join \',\'',
  );
  powershell(
    [
      "$runner = @(Get-Process | Where-Object { $_.ProcessName -like 'Runner.*' } | ForEach-Object { $_.Path } | Where-Object { $_ } | Sort-Object -Unique)",
      "foreach ($p in $runner) { New-NetFirewallRule -DisplayName 'cg-acceptance-runner' -Direction Outbound -Action Allow -Program $p | Out-Null }",
      'Set-NetFirewallProfile -All -Enabled True -DefaultOutboundAction Block',
    ].join('\n'),
  );
  const cut = await fetch('https://api.github.com', { signal: AbortSignal.timeout(10_000) })
    .then(() => false)
    .catch(() => true);
  check(
    'the network is cut for the installs (control: a request to api.github.com fails)',
    cut,
    before,
  );

  // `location`: a word the Location page shows (`setup-smoke.mjs` waits on the same), before Install.
  const products = [
    {
      title: 'CG Bridge Setup',
      file: args.bridge,
      name: 'CG Bridge',
      hive: 'HKLM',
      key: 'CGBridge',
      launchId: 'launch',
      location: 'PROGRAM',
      // `RELEASE-0111-01` Part A — CG Bridge's Playout page, after Location (the Playout machine: unticked).
      playoutPage: true,
    },
    {
      title: 'CG Control Setup',
      file: args.control,
      name: 'CG Control',
      hive: 'HKCU',
      key: 'CG Control',
      launchId: 'launch',
      location: 'FOLDER',
    },
    {
      title: 'CG Designer Setup',
      file: args.designer,
      name: 'CG Designer',
      hive: 'HKCU',
      key: 'CG Designer',
      launchId: 'launch',
      location: 'FOLDER',
    },
  ];
  for (const p of products) {
    const r = launchSetup(p.file);
    check(`${p.name}: its setup window opens`, uia(p.title, 'wait', '', 90).ok);
    await sleep(700);
    const welcome = setupPage(p.title);
    check(
      `${p.name}: Welcome asks "Install ${p.name}?"`,
      welcome.byId.title?.name === `Install ${p.name}?`,
      welcome.byId.title?.name,
    );
    check(
      `${p.name}: …this release`,
      welcome.names.includes(`Version ${VERSION}`),
      welcome.names.join(' | '),
    );
    shot(p.title, path.join(OUT, `install-${p.key.replace(/\s/g, '-').toLowerCase()}-welcome.png`));
    uia(p.title, 'invoke', 'next');
    check(`${p.name}: …Next opens its Location`, untilSetup(p.title, p.location, 20).ok);
    if (p.playoutPage === true) {
      uia(p.title, 'invoke', 'next');
      const server = untilSetup(p.title, 'separate server', 20);
      check(
        `${p.name}: …Next opens its Playout page, "separate server" unticked — the Playout machine`,
        server.byId['separate-server']?.state === 'Off',
        JSON.stringify(server.byId['separate-server'] ?? null),
      );
    }
    uia(p.title, 'invoke', 'install');
    const done = untilSetup(p.title, 'is installed', 600);
    check(
      `${p.name}: Done — "${p.name} is installed"`,
      done.byId.title?.name === `${p.name} is installed`,
      done.byId.title?.name ?? done.error,
    );
    // Nothing is opened afterwards: the drive opens CG Control itself, unelevated.
    if (done.byId[p.launchId] !== undefined) uia(p.title, 'toggle', p.launchId);
    uia(p.title, 'invoke', 'finish');
    const exited = await exitCode(r, 60_000);
    check(`${p.name}: Finish exits 0`, exited === 0, String(exited));
    check(
      `${p.name}: Installed apps lists ${VERSION}`,
      displayVersion(p.hive, p.key) === VERSION,
      String(displayVersion(p.hive, p.key)),
    );
  }
  const h = await until('CG Bridge /health', () => health(), 60_000).catch(() => null);
  check(
    `CG Bridge answers /health as ${String(VERSION)}`,
    h?.version === VERSION,
    JSON.stringify(h),
  );
  check(
    "…aimed at the Playout this machine is (the installer's default address)",
    true,
    facts.playout,
  );

  // ── the network, back ──
  powershell(
    [
      'Set-NetFirewallProfile -All -DefaultOutboundAction Allow',
      "Remove-NetFirewallRule -DisplayName 'cg-acceptance-runner' -ErrorAction SilentlyContinue",
    ].join('\n'),
  );
  const back = await fetch('https://api.github.com', { signal: AbortSignal.timeout(15_000) })
    .then(() => true)
    .catch(() => false);
  check('…and back afterwards (the same request succeeds)', back);
}

/** The classic `0.10.0`, as the owner holds it: its own three installers, silently. */
async function phaseInstallClassic() {
  for (const [name, file, hive, key] of [
    ['CG Bridge', args.bridge, 'HKLM', 'CGBridge'],
    ['CG Control', args.control, 'HKCU', 'CG Control'],
    ['CG Designer', args.designer, 'HKCU', 'CG Designer'],
  ]) {
    const code = codeOf(file, ['/S']);
    check(
      `classic ${OLD} ${name}: /S exits 0`,
      code === 0,
      `${path.basename(file)} → ${String(code)}`,
    );
    check(
      `…Installed apps lists ${OLD}`,
      displayVersion(hive, key) === OLD,
      String(displayVersion(hive, key)),
    );
  }
  const h = await until('CG Bridge /health', () => health(), 60_000).catch(() => null);
  check(`the classic CG Bridge answers /health as ${OLD}`, h?.version === OLD, JSON.stringify(h));
  // `RELEASE-0112-01-C` C1 — the `--from` release's own Installed-apps row, exactly as it wrote it.
  const rows = checkInstalledAppsRow(check, OLD, `classic ${OLD} CG Bridge`);
  fs.writeFileSync(path.join(OUT, `installed-apps-${OLD}.json`), JSON.stringify(rows, null, 2));
}

/** CG Control end to end: the first question, the sign-in, channel 2, CG Bridge's sign-in, a take. */
async function phaseDrive() {
  const facts = station();
  const mode = args.mode === 'classic' ? 'classic' : 'fresh';
  const page = await openControl(9250 + 70);
  if (page === null) return;
  try {
    // ── 1 · the first question: the Playout's address (its IP), CG Bridge's left empty ──
    const gate = await until(
      'the Playout-address gate',
      () => page.evaluate(() => document.querySelector('[data-playout-address-gate]') !== null),
      60_000,
    ).catch(() => false);
    check('a fresh CG Control asks where the Playout is', gate);
    await page.screenshot(`drive-${mode}-1-gate.png`);
    const typed = await type(page, '#cg-playout-address', '127.0.0.1');
    check("…the Playout's IP typed; CG Bridge's address left empty", typed);
    check(
      '…Connect',
      await until(
        'Connect to be pressable',
        () => press(page, '[data-playout-address-gate]', 'Connect'),
        15_000,
      ).catch(() => false),
    );

    // ── 2 · first-run: the check, then the station admin's sign-in ──
    const firstRun = await until(
      'first-run',
      () => page.evaluate(() => document.getElementById('cg-first-run-user') !== null),
      90_000,
    ).catch(() => false);
    check("first-run asks for a station admin's sign-in", firstRun);
    // The check runs on open; Sign in is pressable once the Playout has answered it
    // (`first-run.spec.ts` waits on the same line).
    const answered = await until(
      'the check to reach the Playout',
      () =>
        page.evaluate(
          () =>
            document.querySelector('[data-check="api"]')?.getAttribute('data-status') === 'pass',
        ),
      60_000,
    ).catch(() => false);
    check('…the check reaches the Playout (its `api` line passes)', answered);
    await page.screenshot(`drive-${mode}-2-first-run.png`);
    check('…the username typed', await type(page, '#cg-first-run-user', facts.username));
    check('…the password typed', await type(page, '#cg-first-run-pass', facts.password));
    const pressed = await until(
      'Sign in to be pressable',
      () => press(page, '[data-first-run]', 'Sign in'),
      30_000,
    ).catch(() => false);
    if (!pressed) await page.screenshot(`drive-${mode}-2b-sign-in-not-pressable.png`);
    check('…signed in as the station admin', pressed);

    // ── 3 · channel 2 ──
    const row = `.cg-channel-row[data-channel="${String(CHANNEL)}"]`;
    const offered = await until(
      `channel ${String(CHANNEL)} to be offered`,
      () => page.evaluate((sel) => document.querySelector(sel) !== null, row),
      90_000,
    ).catch(() => false);
    check(`first-run offers channel ${String(CHANNEL)}`, offered);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      (el?.querySelector('input[type="checkbox"]') ?? el)?.click();
    }, row);
    const picked = await until(
      'the channel picked',
      () =>
        page.evaluate(
          (sel) => document.querySelector(sel)?.getAttribute('data-channel-picked') === 'true',
          row,
        ),
      15_000,
    ).catch(() => false);
    check(`…channel ${String(CHANNEL)} chosen`, picked);
    await until(
      'the serve address',
      () =>
        page.evaluate(() => (document.getElementById('cg-first-run-serve')?.value ?? '') !== ''),
      30_000,
    ).catch(() => null);
    await page.screenshot(`drive-${mode}-3-channel.png`);
    check(
      '…Use this channel',
      await until(
        'Use this channel to be pressable',
        () => press(page, '[data-first-run]', 'Use this channel'),
        30_000,
      ).catch(() => false),
    );
    const set = await until(
      'first-run to close',
      () => page.evaluate(() => document.querySelector('[data-first-run]') === null),
      60_000,
    ).catch(() => false);
    check('the station is set up (first-run closes)', set);

    // ── 4 · CG Bridge's own sign-in ──
    const session = await signBridgeIn(page, facts);
    check('CG Bridge is signed in', session === 'signed-in', String(session));

    // ── 5 · a take, ON AIR ──
    const layer = await rowOnChannel(page);
    check(`the bank has a row on channel ${String(CHANNEL)}`, layer !== null, String(layer));
    if (layer === null) return;
    const imported = await page.evaluate(
      async (template, html, channel) => window.cg.templates.import({ template, html, channel }),
      TEMPLATE,
      TEMPLATE_HTML,
      CHANNEL,
    );
    check(
      'a template is imported on the channel',
      imported?.registered === true,
      JSON.stringify(imported),
    );
    const loaded = await page.evaluate(
      async (channel, l, itemId, templateId) =>
        window.cg.fixedLayers.load({ channel, layer: l, itemId, templateId, fields: {} }),
      CHANNEL,
      layer,
      ITEM,
      TEMPLATE.templateId,
    );
    check(
      `…loaded on the row ${String(CHANNEL)}-${String(layer)}`,
      loaded?.accepted === true,
      JSON.stringify(loaded),
    );
    const taken = await page.evaluate(async (itemId) => window.cg.stack.take({ itemId }), ITEM);
    check('…TAKE accepted', taken?.accepted === true, JSON.stringify(taken));
    const onAir = await until(
      'the row to read ON AIR',
      async () => ((await rowText(page, layer)) ?? '').includes('ON AIR'),
      30_000,
    ).catch(() => false);
    check('the row reads ON AIR', onAir, String(await rowText(page, layer)));
    const seated = await stationLayer(CHANNEL, layer);
    check(
      `CasparCG has the graphic on ${String(CHANNEL)}-${String(layer)}`,
      seated !== null,
      JSON.stringify(seated),
    );
    await page.screenshot(`drive-${mode}-4-on-air.png`);

    if (mode === 'classic') {
      const record = await page.evaluate(() => localStorage.getItem('cg.runtime.station.v1'));
      check('the console keeps its station record', record !== null);
      fs.writeFileSync(
        path.join(OUT, 'before-upgrade.json'),
        JSON.stringify({ layer, record }, null, 2),
      );
      return;
    }
    await clearRow(page, layer);
  } finally {
    page.close();
    closeControl();
  }
}

/** Take the row off air: the row stops reading ON AIR, and CasparCG is told. */
async function clearRow(page, layer) {
  const from = (await stationLines()).length;
  const out = await page.evaluate(async (itemId) => window.cg.stack.out({ itemId }), ITEM);
  check('CLEAR (out) accepted', out?.accepted === true, JSON.stringify(out));
  const off = await until(
    'the row to leave air',
    async () => !((await rowText(page, layer)) ?? '').includes('ON AIR'),
    30_000,
  ).catch(() => false);
  check('the row no longer reads ON AIR', off, String(await rowText(page, layer)));
  const target = `${String(CHANNEL)}-${String(layer)}`;
  const offAir = (l) =>
    l.startsWith(`CLEAR ${target}`) ||
    l.startsWith(`CG ${target} STOP`) ||
    l.startsWith(`CG ${target} CLEAR`);
  const told = await until(
    `CasparCG to be told to take ${target} off air`,
    async () => {
      const lines = (await stationLines()).slice(from);
      return lines.some(offAir) ? lines : null;
    },
    20_000,
  ).catch(async () => (await stationLines()).slice(from));
  check(
    `CasparCG was told to take ${target} off air`,
    told.some(offAir),
    told.filter((l) => l.includes(target)).join(' | '),
  );
}

/** What the classic drive left ON AIR, or `null` (a failure said once; the upgrade is checked anyway). */
function beforeUpgrade() {
  const file = path.join(OUT, 'before-upgrade.json');
  const found = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  check('a row was taken ON AIR on the classic station before the upgrade', found !== null, file);
  return found;
}

/** Each of this release's installers over the `--from` station: its Welcome, then `/S`; everything kept. */
async function phaseUpgrade() {
  const before = beforeUpgrade();
  const service = serviceConfig();
  check(
    'the classic CG Bridge runs as a service, recovery set',
    service !== null,
    service?.qc ?? '',
  );
  const config = fs.readFileSync(path.join(DATA_DIR, 'cg-bridge.json'));
  const sessionFile = path.join(DATA_DIR, '.cg-runtime', 'bridge-session.json');
  check(
    'CG Bridge holds a session file before the upgrade',
    fs.existsSync(sessionFile),
    sessionFile,
  );
  const mark = (await stationLines()).length;

  for (const p of [
    {
      title: 'CG Bridge Setup',
      file: args.bridge,
      name: 'CG Bridge',
      hive: 'HKLM',
      key: 'CGBridge',
    },
    {
      title: 'CG Control Setup',
      file: args.control,
      name: 'CG Control',
      hive: 'HKCU',
      key: 'CG Control',
    },
    {
      title: 'CG Designer Setup',
      file: args.designer,
      name: 'CG Designer',
      hive: 'HKCU',
      key: 'CG Designer',
    },
  ]) {
    // The window first — read, then cancelled: what the owner will see on his machine.
    const r = launchSetup(p.file);
    check(`${p.name}: its setup window opens over ${OLD}`, uia(p.title, 'wait', '', 90).ok);
    await sleep(700);
    const welcome = setupPage(p.title);
    const line = `Update from ${OLD} to ${String(VERSION)}. Your settings are kept.`;
    check(
      `${p.name}: Welcome asks "Update ${p.name}?"`,
      welcome.byId.title?.name === `Update ${p.name}?`,
      welcome.byId.title?.name,
    );
    check(`${p.name}: "${line}"`, welcome.names.includes(line), welcome.names.join(' | '));
    shot(p.title, path.join(OUT, `upgrade-${p.key.replace(/\s/g, '-').toLowerCase()}-welcome.png`));
    uia(p.title, 'invoke', 'cancel');
    const cancelled = await exitCode(r, 30_000);
    check(
      `${p.name}: Cancel on Welcome exits 1, nothing changed`,
      cancelled === 1 && displayVersion(p.hive, p.key) === OLD,
      `${String(cancelled)} ${String(displayVersion(p.hive, p.key))}`,
    );
    // `RELEASE-0114-01-C` — CG Control's and CG Designer's own upgrades run over the two apps OPEN,
    // in `upgrade-apps-open` (both install per user: an operator's, unelevated, upgrade).
    if (APPS_OPEN && p.hive === 'HKCU') continue;
    // …then the silent upgrade, as the Playout's installer chains it.
    const started = Date.now();
    const code = codeOf(p.file, ['/S']);
    check(
      `${p.name}: the silent upgrade (/S) exits 0`,
      code === 0,
      `${String(code)}; ${String(Date.now() - started)} ms`,
    );
    check(
      `${p.name}: Installed apps lists ${String(VERSION)}`,
      displayVersion(p.hive, p.key) === VERSION,
      String(displayVersion(p.hive, p.key)),
    );
  }

  const h = await until(
    'CG Bridge /health',
    async () => {
      const x = await health();
      return x?.version === VERSION ? x : null;
    },
    90_000,
  ).catch(() => null);
  check(
    `the upgraded CG Bridge answers /health as ${String(VERSION)}`,
    h !== null,
    JSON.stringify(h),
  );
  // `RELEASE-0112-01-C` C1 — after the upgrade from `--from`, still ONE row, now this release's.
  const appsRows = checkInstalledAppsRow(check, VERSION, `upgraded from ${OLD}`);
  fs.writeFileSync(
    path.join(OUT, `installed-apps-upgraded-from-${OLD}.json`),
    JSON.stringify(appsRows, null, 2),
  );
  const after = serviceConfig();
  check(
    'the service keeps its account and start type',
    after?.qc === service?.qc,
    after?.qc ?? 'gone',
  );
  check(
    '…and its recovery settings',
    after?.failure === service?.failure,
    after?.failure ?? 'gone',
  );
  check(
    "CG Bridge's configuration is kept, byte for byte",
    Buffer.compare(fs.readFileSync(path.join(DATA_DIR, 'cg-bridge.json')), config) === 0,
  );
  check("CG Bridge's session file is kept", fs.existsSync(sessionFile));
  await sleep(5000); // the new service's boot reconcile has had its moment
  const since = (await stationLines()).slice(mark);
  fs.writeFileSync(path.join(OUT, 'upgrade-wire.txt'), since.join('\n'));
  // CONTROL — the instrument is live: CasparCG heard the upgraded CG Bridge come back (its boot reads).
  check(
    'CasparCG heard the upgraded CG Bridge (the wire recorder is live)',
    since.length > 0,
    `${String(since.length)} lines`,
  );
  if (before === null) return;
  // What would take the row off air: a CLEAR of its layer or of its whole channel, a CG STOP/CLEAR/
  // REMOVE of it, a MIXER CLEAR of its geometry. Every clear-like line is written down either way.
  const target = `${String(CHANNEL)}-${String(before.layer)}`;
  const clearLike = since.filter((l) =>
    /^CLEAR\b|^CG \d+-\d+ (STOP|CLEAR|REMOVE)\b| CLEAR$/.test(l),
  );
  const offAir = since.filter(
    (l) =>
      l === `CLEAR ${String(CHANNEL)}` ||
      l === `CLEAR ${target}` ||
      l.startsWith(`CG ${target} STOP`) ||
      l.startsWith(`CG ${target} CLEAR`) ||
      l.startsWith(`CG ${target} REMOVE`) ||
      l === `MIXER ${target} CLEAR`,
  );
  check(
    `NOTHING ON AIR WAS CLEARED: no CLEAR, CG STOP or MIXER CLEAR of ${target} reached CasparCG across the upgrade`,
    offAir.length === 0,
    `${String(since.length)} lines; on air: ${offAir.join(' | ') || 'none'}; every clear-like line: ${clearLike.join(' | ') || 'none'}`,
  );
  const seated = await stationLayer(CHANNEL, before.layer);
  check(
    `…and the graphic is still on ${String(CHANNEL)}-${String(before.layer)}`,
    seated !== null,
    JSON.stringify(seated),
  );
}

/**
 * One silent upgrade of an app, when Windows has it running, bounded: an installer that waited on a
 * dialog would never end on its own, so the bound is how "it never waits" is measured. Generous
 * against the normal time (`upgrade`'s own `/S` lines carry theirs): a per-user install is seconds.
 */
const UPGRADE_BOUND_MS = 120_000;

/** An ended app's WebView2 gone, before the next launch opens the same profile (as the smoke waits). */
function webViewsGone() {
  return until(
    "the last apps' WebView2 to exit",
    () => processCount('msedgewebview2.exe') === 0,
    30_000,
  ).catch(() => undefined);
}

/** Start CG Designer as an operator does, with DevTools opened by the environment (unelevated only). */
function launchDesigner(cdpPort) {
  const exe = installedPerUser('CG Designer', 'cg-designer.exe');
  if (exe === undefined) return null;
  const child = spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: webViewArgs(cdpPort),
    },
  });
  child.unref();
  return exe;
}

/**
 * CG Designer open on a new project with ONE edit made, so it holds unsaved changes (`* Unsaved
 * work`), and CG Control open and connected — the two apps an operator has open when he upgrades.
 * `guarded`: these are apps with `D-162` / `R-094`'s close guard, and it is proved LIVE first — a close
 * (WM_CLOSE) is HELD by each and asked about, then Cancel. Returns nothing: the apps stay open.
 */
async function openTheApps(label, ports, guarded) {
  await webViewsGone();
  const opened = launchDesigner(ports.designer);
  check(`${label}: CG Designer is installed for this user`, opened !== null, String(opened));
  const designer =
    opened === null ? null : await Cdp.attach(ports.designer, APP_PAGE, 90_000).catch(() => null);
  let unsaved = null;
  if (designer !== null) {
    await until(
      'the Designer landing page',
      () =>
        designer.evaluate(() =>
          [...document.querySelectorAll('button')].some(
            (b) => b.getAttribute('aria-label') === 'New project',
          ),
        ),
      60_000,
    ).catch(() => false);
    const made = await designer.evaluate(designerNewProject, 'Unsaved work');
    unsaved = made.ok ? await designer.evaluate(designerEdit) : made.said;
  }
  check(
    `${label}: CG Designer is open with unsaved changes (control: its title reads * Unsaved work)`,
    unsaved === '* Unsaved work' && processCount('cg-designer.exe') === 1,
    `${String(unsaved)}; ${String(processCount('cg-designer.exe'))} running`,
  );
  const control = await openControl(ports.control);
  const live =
    control === null
      ? false
      : await until(
          'CG Control to reach CG Bridge',
          () => control.evaluate(() => window.cg?.link?.status?.() === 'live'),
          60_000,
        ).catch(() => false);
  check(
    `${label}: CG Control is open, and connected`,
    live && processCount('cg-control.exe') === 1,
    `${String(live)}; ${String(processCount('cg-control.exe'))} running`,
  );

  if (guarded) {
    for (const [name, image, page, title, key] of [
      ['CG Designer', 'cg-designer.exe', designer, 'Unsaved changes', 'designer'],
      ['CG Control', 'cg-control.exe', control, 'Close CG Control?', 'control'],
    ]) {
      if (page === null) continue;
      sendClose(image);
      const asked = await until(
        `the ${title} dialog`,
        () => page.evaluate(closeDialogProbe, title),
        15_000,
      ).catch(() => null);
      check(
        `${label}: CONTROL — the guard is LIVE: a close (WM_CLOSE) of ${name} is HELD and asks "${title}"`,
        asked !== null && processCount(image) === 1,
        `${JSON.stringify(asked)}; ${String(processCount(image))} running`,
      );
      await page.screenshot(`apps-open-${key}-held.png`);
      await page.evaluate(pressInDialog, { title, label: 'Cancel' });
      await sleep(1500);
      check(
        `${label}: …Cancel keeps ${name} open`,
        processCount(image) === 1 && (await page.evaluate(closeDialogProbe, title)) === null,
        `${String(processCount(image))} running`,
      );
    }
  }
  designer?.close();
  control?.close();
}

/**
 * 🔴 `RELEASE-0114-01-C` — **AN UPGRADE NEVER WAITS ON A DIALOG.** Tauri's NSIS ends a running app
 * with `nsis_tauri_utils::KillProcessCurrentUser` — `OpenProcess(PROCESS_TERMINATE)` and
 * `TerminateProcess` (nsis-tauri-utils `v0.5.3`, `crates/nsis-process/src/lib.rs`, `fn kill`), never a
 * `WM_CLOSE` — so a close guard is never asked. Measured, twice, each installer bounded:
 *
 *   1. CG Control's and CG Designer's upgrades from `--from` over both `--from` apps OPEN, CG Designer
 *      with unsaved changes (what an operator has open when he upgrades);
 *   2. the same installers again over the UPGRADED apps — the ones with the close guard — open the
 *      same way, the guard first proved live (a held WM_CLOSE, then Cancel): the case where a dialog
 *      could stop an installer, and the one every later upgrade meets.
 *
 * Each: exit 0 within the bound, the open app ended, Installed apps this release. Across the phase,
 * nothing on air is cleared — an app ended by an installer sends nothing to CasparCG.
 */
async function phaseUpgradeAppsOpen() {
  // Both installers named, and there: a path split by gsudo at its space arrives as half a path.
  const given = [args.control, args.designer].every(
    (file) => typeof file === 'string' && fs.existsSync(file),
  );
  check(
    'upgrade-apps-open was given both installers, each a file that exists',
    given,
    `${String(args.control)} | ${String(args.designer)}`,
  );
  if (!given) return;
  const before = beforeUpgrade();
  const mark = (await stationLines()).length;
  const timings = [];
  for (const [label, ports, guarded] of [
    [`over the open ${OLD} apps`, { designer: 9250 + 72, control: 9250 + 73 }, false],
    [
      `over the open ${String(VERSION)} apps (the close guard)`,
      { designer: 9250 + 74, control: 9250 + 75 },
      true,
    ],
  ]) {
    await openTheApps(label, ports, guarded);
    for (const p of [
      { name: 'CG Control', file: args.control, image: 'cg-control.exe' },
      { name: 'CG Designer', file: args.designer, image: 'cg-designer.exe' },
    ]) {
      const running = processCount(p.image);
      const started = Date.now();
      const r = spawnSync(p.file, ['/S'], { windowsHide: true, timeout: UPGRADE_BOUND_MS });
      const ms = Date.now() - started;
      timings.push({
        label,
        product: p.name,
        ms,
        status: r.status,
        error: r.error?.message ?? null,
      });
      check(
        `${label}: ${p.name}'s installer (/S) exits 0 within ${String(UPGRADE_BOUND_MS / 1000)} s — it waited on no dialog`,
        r.status === 0 && r.error === undefined,
        `exit ${String(r.status)}${r.error === undefined ? '' : ` (${r.error.message})`}; ${String(ms)} ms`,
      );
      check(
        `${label}: …the open ${p.name} was ended by it`,
        running === 1 && processCount(p.image) === 0,
        `${String(running)} running before, ${String(processCount(p.image))} after`,
      );
      check(
        `${label}: …Installed apps lists ${String(VERSION)}`,
        displayVersion('HKCU', p.name) === VERSION,
        String(displayVersion('HKCU', p.name)),
      );
      // An app the installer did NOT end (already a failure above) is ended here, so it cannot hold
      // the next round's or the next phase's single instance.
      if (processCount(p.image) > 0) {
        spawnSync('taskkill', ['/IM', p.image, '/F'], { windowsHide: true });
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'apps-open-upgrade.json'), JSON.stringify(timings, null, 2));
  await webViewsGone();
  if (before === null) return;
  const target = `${String(CHANNEL)}-${String(before.layer)}`;
  const since = (await stationLines()).slice(mark);
  const offAir = since.filter(
    (l) =>
      l === `CLEAR ${String(CHANNEL)}` ||
      l === `CLEAR ${target}` ||
      l.startsWith(`CG ${target} STOP`) ||
      l.startsWith(`CG ${target} CLEAR`) ||
      l.startsWith(`CG ${target} REMOVE`) ||
      l === `MIXER ${target} CLEAR`,
  );
  check(
    `NOTHING ON AIR WAS CLEARED while the open apps were upgraded: no CLEAR, CG STOP or MIXER CLEAR of ${target}`,
    offAir.length === 0,
    `${String(since.length)} lines; on air: ${offAir.join(' | ') || 'none'}`,
  );
  const seated = await stationLayer(CHANNEL, before.layer);
  check(`…and the graphic is still on ${target}`, seated !== null, JSON.stringify(seated));
}

/** The upgraded CG Control: the station kept, the row still ON AIR, then cleared. */
async function phaseDriveUpgraded() {
  const facts = station();
  const before = beforeUpgrade();
  if (before === null) return;
  const page = await openControl(9250 + 71);
  if (page === null) return;
  try {
    const live = await until(
      'CG Control to reach CG Bridge',
      () => page.evaluate(() => window.cg?.link?.status?.() === 'live'),
      90_000,
    ).catch(() => false);
    check('the upgraded CG Control reaches CG Bridge without asking again', live);
    const asked = await page.evaluate(
      () => document.querySelector('[data-playout-address-gate],[data-first-run]') !== null,
    );
    check('…no first question and no first-run: the station is kept', !asked);
    const record = await page.evaluate(() => localStorage.getItem('cg.runtime.station.v1'));
    check('…its station record, byte for byte', record === before.record, String(record));
    const mismatch = await page.evaluate(() => window.cg.link.versionMismatch?.() ?? null);
    check(
      '…one release with CG Bridge (no release-line refusal)',
      mismatch === null,
      String(mismatch),
    );
    // The console's own sign-in: kept, or asked once (the console's session is its own, per release).
    const signedIn = await page.evaluate(() => window.cg.auth.state().kind);
    if (signedIn !== 'signed-in') {
      await until(
        'the sign-in card',
        () => page.evaluate(() => document.getElementById('cg-signin-user') !== null),
        30_000,
      ).catch(() => null);
      await type(page, '#cg-signin-user', facts.username);
      await type(page, '#cg-signin-pass', facts.password);
      await press(page, '', 'Sign in');
    }
    const kind = await until(
      'the console to be signed in',
      () => page.evaluate(() => (window.cg.auth.state().kind === 'signed-in' ? 'signed-in' : null)),
      60_000,
    ).catch(() => null);
    check('the operator is signed in', kind === 'signed-in', String(signedIn));
    const session = await page.evaluate(async () => (await window.cg.bridgeSession.state()).state);
    check(
      'CG Bridge kept its own session across the upgrade',
      session === 'signed-in',
      String(session),
    );
    const onAir = await until(
      'the row to read ON AIR',
      async () => ((await rowText(page, before.layer)) ?? '').includes('ON AIR'),
      60_000,
    ).catch(() => false);
    check(
      'the row taken before the upgrade still reads ON AIR',
      onAir,
      String(await rowText(page, before.layer)),
    );
    await page.screenshot('drive-upgraded-on-air.png');
    await clearRow(page, before.layer);
  } finally {
    page.close();
    closeControl();
  }
}

/** This runner's own IPv4 address on a network card — where a console on another PC would reach it. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
  }
  return null;
}
/** The fake Playout stops answering (`offline`) or answers again (`online`), on the same port. */
async function playoutPower(state) {
  try {
    const res = await fetch(`${station().control}/playout/${state}`, {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
const SIGN_IN_GATE = '[role="dialog"][aria-label="Playout sign-in"]';

/**
 * 🔴 `B-320` + `B-321` (`SIGNIN-ESCAPE-01`) — **THE OWNER'S STUCK CONSOLE, ON THE INSTALLED APPS.** CG Control
 * `0.11.4` on his PC (2026-10-10) was pointed at his own PC's address, where a CG Bridge had just been
 * installed with no Playout behind it: CG Bridge answered with `auth: playout`, so the console opened on
 * the sign-in gate, the check's one line locked the fields, and nothing on the card led anywhere.
 * Reinstalling kept the record (it lives in the WebView2 profile).
 *
 * That state, here: the console's record names CG Bridge at this runner's own LAN address (as `.93`
 * was the owner's own PC's), it holds no session, and the Playout behind the INSTALLED CG Bridge stops
 * answering on its port. Then the way out: `Set up again` → the Set up page → the Playout answers again,
 * `127.0.0.1` typed → Connect → the gate says a sign-in can work → signed in, the gate lifted.
 */
async function phaseStuckStation() {
  const facts = station();
  const lan = lanAddress();
  if (
    !check(
      'this runner has a LAN address to reach its CG Bridge at, as a console on another PC does',
      lan !== null,
      String(lan),
    )
  )
    return;
  check(
    'the Playout stops answering (offline, its port and URLs kept)',
    await playoutPower('offline'),
  );
  const page = await openControl(9250 + 76);
  if (page === null) return;
  try {
    // ── the owner's record: CG Bridge on this machine's LAN address; no session held ──
    const record = JSON.stringify({ playoutAddress: `http://${lan}:8080` });
    const seeded = await page.evaluate((r) => {
      localStorage.setItem('cg.runtime.station.v1', r);
      localStorage.removeItem('cg.runtime.playoutSession');
      return (
        localStorage.getItem('cg.runtime.station.v1') === r &&
        localStorage.getItem('cg.runtime.playoutSession') === null
      );
    }, record);
    check(`the console's record names CG Bridge at ${lan}, and it holds no session`, seeded);
    // The page is gone mid-answer: DevTools may say so, and that is the reload.
    await page.evaluate(() => location.reload()).catch(() => undefined);

    // ── 1 · the gate: the card names the station's host, the line locks the fields ──
    const gate = await until(
      'the sign-in gate',
      () => page.evaluate((sel) => document.querySelector(sel) !== null, SIGN_IN_GATE),
      90_000,
    ).catch(() => false);
    check('the console opens on the sign-in gate (CG Bridge answers; no session)', gate);
    const card = await page.evaluate(
      (sel) => document.querySelector(`${sel} [data-playout-address]`)?.textContent ?? null,
      SIGN_IN_GATE,
    );
    check(
      `…the card names the station's host, http://${lan}:8080`,
      card === `http://${lan}:8080`,
      String(card),
    );
    const line = await until(
      'the check to decide',
      () =>
        page.evaluate((sel) => {
          const l = document.querySelector(`${sel} [data-check="api"]`);
          return l?.getAttribute('data-status') === 'fail' ? (l.textContent ?? '') : null;
        }, SIGN_IN_GATE),
      60_000,
    ).catch(() => null);
    const locked = await page.evaluate(
      () => document.getElementById('cg-signin-user')?.disabled === true,
    );
    check(
      '…its one line says the Playout does not answer, and the fields are locked',
      line !== null && locked,
      String(line),
    );
    await page.screenshot('stuck-1-gate.png');
    // `B-321` — the line names the host on the card, never CG Bridge's loopback.
    check(
      `🔴 …and names that host, never CG Bridge's loopback (B-321)`,
      line === `${lan} answers, but nothing listens on port 8080.`,
      String(line),
    );

    // ── 2 · B-320: the way out ──
    const offered = await page.evaluate(
      (sel) =>
        [...(document.querySelector(sel)?.querySelectorAll('button') ?? [])].some(
          (b) => b.textContent?.trim() === 'Set up again',
        ),
      SIGN_IN_GATE,
    );
    check('🔴 the gate offers "Set up again"', offered);
    check('…pressed', await press(page, SIGN_IN_GATE, 'Set up again'));
    const setUp = await until(
      'the Set up page',
      () => page.evaluate(() => document.querySelector('[data-playout-address-gate]') !== null),
      60_000,
    ).catch(() => false);
    check('…the console starts again on the Set up page', setUp);
    check(
      '…its station record is forgotten',
      await page.evaluate(() => localStorage.getItem('cg.runtime.station.v1') === null),
    );
    await page.screenshot('stuck-2-set-up.png');

    // ── 3 · a good address connects ──
    check('the Playout answers again (online, the same port)', await playoutPower('online'));
    check('…127.0.0.1 typed', await type(page, '#cg-playout-address', '127.0.0.1'));
    check(
      '…Connect',
      await until(
        'Connect to be pressable',
        () => press(page, '[data-playout-address-gate]', 'Connect'),
        15_000,
      ).catch(() => false),
    );
    const connected = await until(
      'the console to connect',
      () =>
        page.evaluate(
          () =>
            document.querySelector('[data-playout-address-gate]') === null &&
            window.cg.link.status() === 'live',
        ),
      90_000,
    ).catch(() => false);
    check('…the console connects to CG Bridge there', connected);
    const answered = await until(
      'the check to reach the Playout',
      () =>
        page.evaluate(
          (sel) =>
            document.querySelector(`${sel} [data-check="api"]`)?.getAttribute('data-status') ===
            'pass',
          SIGN_IN_GATE,
        ),
      60_000,
    ).catch(() => false);
    check('…its gate says a sign-in can work', answered);
    check('…the username typed', await type(page, '#cg-signin-user', facts.username));
    check('…the password typed', await type(page, '#cg-signin-pass', facts.password));
    check(
      '…Sign in',
      await until(
        'Sign in to be pressable',
        () => press(page, SIGN_IN_GATE, 'Sign in'),
        15_000,
      ).catch(() => false),
    );
    const lifted = await until(
      'the gate to lift',
      () => page.evaluate((sel) => document.querySelector(sel) === null, SIGN_IN_GATE),
      60_000,
    ).catch(() => false);
    check('the gate lifts: the console works again', lifted);
    await page.screenshot('stuck-3-signed-in.png');
  } finally {
    page.close();
    closeControl();
    await playoutPower('online');
  }
}

/** All three uninstalled: the service, its rules and the shortcuts gone; the data kept. */
async function phaseUninstall() {
  // CONTROL — the reader sees CG Bridge's three rules while it is installed, so "gone" below means it.
  const present = bridgeRules();
  check(
    "CG Bridge's three firewall rules are there before the uninstall (the reader is live)",
    present?.length === 3,
    String(present),
  );
  const bridge = spawnSync(`"${path.join(PROGRAM_DIR, 'uninstall.exe')}" /S _?=${PROGRAM_DIR}`, {
    shell: true,
    windowsHide: true,
  }).status;
  check('CG Bridge: the uninstall line exits 0', bridge === 0, String(bridge));
  check('…its service is gone', serviceConfig() === null);
  const rules = bridgeRules();
  check('…its firewall rules are gone', rules !== null && rules.length === 0, String(rules));
  check('…Installed apps no longer lists it', displayVersion('HKLM', 'CGBridge') === null);
  check(
    '…its configuration and station files are kept (as documented)',
    fs.existsSync(path.join(DATA_DIR, 'cg-bridge.json')),
  );
  for (const [product, data] of [
    ['CG Control', 'app.cgbroadcast.control'],
    ['CG Designer', 'app.cgbroadcast.designer'],
  ]) {
    const line = uninstallString('HKCU', product);
    check(`${product}: Installed apps names its uninstaller`, line !== null, String(line));
    if (line === null) continue;
    // CONTROL — the shortcuts are there while it is installed, so "gone" below means it.
    const before = shortcuts(product);
    check(
      `${product}: its shortcuts are there before the uninstall (the reader is live)`,
      (before?.length ?? 0) > 0,
      String(before),
    );
    const exe = product === 'CG Control' ? 'cg-control.exe' : 'cg-designer.exe';
    const existed = [
      path.join(LOCALAPPDATA, data),
      path.join(process.env.APPDATA ?? '', product),
    ].filter((d) => fs.existsSync(d));
    const code = spawnSync(`${line} /S`, { shell: true, windowsHide: true }).status;
    check(`${product}: the silent uninstall exits 0`, code === 0, String(code));
    // An NSIS uninstaller copies itself to %TEMP% and returns at once: wait for the copy's work.
    await until(
      `${product}'s uninstall to finish`,
      () =>
        installedPerUser(product, exe) === undefined &&
        displayVersion('HKCU', product) === null &&
        (shortcuts(product)?.length ?? 1) === 0,
      120_000,
    ).catch(() => null);
    check(`${product}: its program is gone`, installedPerUser(product, exe) === undefined);
    check(
      `${product}: …and Installed apps no longer lists it`,
      displayVersion('HKCU', product) === null,
    );
    const left = shortcuts(product);
    check(
      `${product}: …its Start-menu and desktop shortcuts are gone`,
      left !== null && left.length === 0,
      String(left),
    );
    // Kept: every per-user folder it had made — none, when it was never opened.
    const kept = existed.filter((d) => fs.existsSync(d));
    check(
      `${product}: …its per-user data is kept (as documented)`,
      kept.length === existed.length,
      existed.length === 0 ? 'none was made (never opened)' : `kept ${kept.join(', ')}`,
    );
  }
}

function phaseSummary() {
  const expected = String(args.expect ?? '')
    .split(',')
    .filter(Boolean);
  let ok = true;
  for (const phase of expected) {
    const file = path.join(OUT, `results-${phase}.json`);
    if (!fs.existsSync(file)) {
      process.stdout.write(`FAIL  phase ${phase} never ran\n`);
      ok = false;
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    const failed = rows.filter((r) => !r.ok);
    process.stdout.write(
      `${failed.length === 0 ? 'PASS' : 'FAIL'}  ${phase}: ${String(rows.length - failed.length)}/${String(rows.length)}\n`,
    );
    for (const r of failed) process.stdout.write(`        ✗ ${r.name} — ${r.detail}\n`);
    if (failed.length > 0 || rows.length === 0) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

const PHASES = {
  install: phaseInstall,
  'install-classic': phaseInstallClassic,
  drive: phaseDrive,
  upgrade: phaseUpgrade,
  'upgrade-apps-open': phaseUpgradeAppsOpen,
  'drive-upgraded': phaseDriveUpgraded,
  'stuck-station': phaseStuckStation,
  uninstall: phaseUninstall,
};
if (PHASE === 'summary') phaseSummary();
else if (PHASES[PHASE] === undefined) {
  process.stderr.write(`unknown phase ${String(PHASE)}\n`);
  process.exit(2);
} else {
  check(
    'the acceptance was given the release version',
    /^\d+\.\d+\.\d+$/.test(String(VERSION)),
    String(VERSION),
  );
  try {
    await PHASES[PHASE]();
  } catch (err) {
    check(
      `phase ${PHASE} ran to its end`,
      false,
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    );
  }
  process.exit(save() ? 0 : 1);
}
