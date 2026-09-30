#!/usr/bin/env node
/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 E — **CG BRIDGE ON A CLEAN WINDOWS**, driven the way the Playout's own
 * installer will chain it: silently, elevated, with its exit codes read.
 *
 *   1. a silent install (`/S /PLAYOUT=…`) exits 0;
 *   2. the service: registered, AUTOMATIC, RUNNING, its own account, NO dependency (rule 1: never
 *      on `ApasaiEngine`), restarted by Windows on failure;
 *   3. `/health` answers in under a second, in its fixed shape, with no secret (rule 13);
 *   4. our three firewall rules, scoped to our exe, on the ports in force; nothing binds UDP 6250
 *      (rule 7 — the Playout engine's);
 *   5. the data folder: the configuration written; no ordinary user may read the folder;
 *   6. CONTROL — a console with no token gets no state: the socket answers `bridge.capabilities`
 *      (the release) and refuses `stack.snapshot`;
 *   7. a silent upgrade (the same installer again) exits 0, keeps the configuration, and the
 *      service is running again;
 *   8. a silent uninstall exits 0 and removes our service, our rules and our files — the data
 *      folder is kept.
 *
 * Node built-ins only: this runner has the smoke script and the installer, and nothing built.
 * Usage (elevated): `node tools/bridge-installer/smoke.mjs --installer <exe> --version <x.y.z> --out <dir>`
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : null))
    .filter((e) => e !== null),
);
const INSTALLER = args.installer;
const RELEASE = args.version;
const OUT = args.out ?? 'bridge-smoke';
const PLAYOUT = 'http://127.0.0.1:59999';
const PROGRAM_DIR = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'CG Bridge');
const DATA_DIR = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'CG Bridge');
const EXE = path.join(PROGRAM_DIR, 'cg-bridge.exe');
const HEALTH = 'http://127.0.0.1:5280/health';
const RULES = [
  'CG Bridge - consoles',
  'CG Bridge - template pages',
  'CG Bridge - OSC from CasparCG',
];

fs.mkdirSync(OUT, { recursive: true });
const results = [];
let failed = false;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  — ${detail}`}\n`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* not yet */
    }
    if (Date.now() > deadline) return null;
    await sleep(500);
  }
}
function ps(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}
function exitCodeOf(file, argv) {
  const r = spawnSync(file, argv, { windowsHide: true });
  return r.status;
}
/** The service as Windows holds it, or `null`. Single quotes only: argv carries it to PowerShell. */
function service() {
  const json = ps(
    "$s = Get-CimInstance -ClassName Win32_Service | Where-Object { $_.Name -eq 'CGBridge' }; " +
      "if ($s) { $d = @((Get-Service -Name 'CGBridge').ServicesDependedOn | ForEach-Object { $_.Name }); " +
      '[pscustomobject]@{ state = $s.State; start = $s.StartMode; account = $s.StartName; dependsOn = $d } | ConvertTo-Json -Compress } ' +
      "else { 'null' }",
  );
  return JSON.parse(json);
}
async function health() {
  const t0 = performance.now();
  const res = await fetch(HEALTH);
  const body = await res.json();
  return { ms: performance.now() - t0, status: res.status, body };
}
function rule(name) {
  try {
    const text = execFileSync(
      'netsh',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`, 'verbose'],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    return text;
  } catch {
    return null;
  }
}
function udpOwnersOf(port) {
  return ps(
    `@(Get-NetUDPEndpoint -LocalPort ${String(port)} -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalAddress }) -join ','`,
  );
}

// ── 1. install ──────────────────────────────────────────────────────────────────────────────
check(
  'the installer is named for the release',
  path.basename(INSTALLER) === `CG-Bridge_${RELEASE}_x64-setup.exe`,
  path.basename(INSTALLER),
);
const installed = exitCodeOf(INSTALLER, ['/S', `/PLAYOUT=${PLAYOUT}`]);
check('a silent install exits 0', installed === 0, String(installed));
for (const file of [
  EXE,
  path.join(PROGRAM_DIR, 'shawl.exe'),
  path.join(PROGRAM_DIR, 'bridge', 'caspar-bridge.mjs'),
  path.join(PROGRAM_DIR, 'uninstall.exe'),
]) {
  check(`installs ${path.relative(PROGRAM_DIR, file)}`, fs.existsSync(file), file);
}

// ── 2. the service ──────────────────────────────────────────────────────────────────────────
const running = await until(() => service()?.state === 'Running', 60_000);
const svc = service();
fs.writeFileSync(path.join(OUT, 'service.json'), JSON.stringify(svc, null, 2));
check('the service CGBridge is RUNNING', running !== null, JSON.stringify(svc));
check('…starts automatically', svc?.start === 'Auto', svc?.start ?? 'absent');
check(
  '…runs as its own account, NT SERVICE\\CGBridge',
  /^NT SERVICE\\CGBridge$/i.test(svc?.account ?? ''),
  svc?.account ?? 'absent',
);
check(
  '…depends on NO other service (rule 1: never on ApasaiEngine)',
  Array.isArray(svc?.dependsOn) && svc.dependsOn.length === 0,
  JSON.stringify(svc?.dependsOn),
);
const failure = execFileSync('sc.exe', ['qfailure', 'CGBridge'], {
  encoding: 'utf8',
  windowsHide: true,
});
fs.writeFileSync(path.join(OUT, 'qfailure.txt'), failure);
check(
  '…and Windows restarts it on failure',
  (failure.match(/RESTART/gi) ?? []).length >= 3,
  failure.replace(/\s+/g, ' ').trim(),
);

// ── 3. /health ──────────────────────────────────────────────────────────────────────────────
const h = await until(() => health().then((r) => (r.status === 200 ? r : null)), 60_000);
fs.writeFileSync(path.join(OUT, 'health.json'), JSON.stringify(h?.body ?? null, null, 2));
check('/health answers 200', h !== null, h === null ? 'no answer' : String(h.status));
if (h !== null) {
  const again = await health();
  check('…in under a second (rule 13)', again.ms < 1000, `${again.ms.toFixed(0)} ms`);
  check(
    '…as CG Bridge, this release',
    h.body.app === 'cg-bridge' && h.body.version === RELEASE,
    `${String(h.body.app)} ${String(h.body.version)}`,
  );
  check(
    '…naming the configured Playout',
    h.body.playout?.address === PLAYOUT,
    String(h.body.playout?.address),
  );
  check(
    '…with the fixed ports',
    h.body.ports?.control === 5280 &&
      h.body.ports?.templates === 7911 &&
      h.body.ports?.osc === 6251,
    JSON.stringify(h.body.ports),
  );
  check(
    '…and no secret (no token, no account name)',
    !/token|password|cg-admin/i.test(JSON.stringify(h.body)),
    '',
  );
}

// ── 4. firewall and ports ───────────────────────────────────────────────────────────────────
for (const [name, port] of [
  [RULES[0], '5280'],
  [RULES[1], '7911'],
  [RULES[2], '6251-6252'],
]) {
  const text = rule(name) ?? '';
  const scoped = text.toLowerCase().includes(EXE.toLowerCase());
  const onPort =
    text.replace(/\s/g, '').includes(port) ||
    text.replace(/\s/g, '').includes(port.replace('-', ','));
  check(
    `firewall rule "${name}" — our exe, port ${port}`,
    text !== '' && scoped && onPort,
    text === '' ? 'absent' : '',
  );
}
check(
  'nothing binds UDP 6250 (rule 7 — the Playout engine’s)',
  udpOwnersOf(6250) === '',
  udpOwnersOf(6250),
);

// ── 5. the data folder ──────────────────────────────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cg-bridge.json'), 'utf8'));
check(
  'the configuration is written, with the Playout it was given',
  config.playoutAddress === PLAYOUT,
  JSON.stringify(config),
);
const acl = execFileSync('icacls', [DATA_DIR], { encoding: 'utf8', windowsHide: true });
fs.writeFileSync(path.join(OUT, 'data-acl.txt'), acl);
check(
  'no ordinary user can read the data folder (the bridge’s Playout session lives there)',
  !/BUILTIN\\Users|\*S-1-5-32-545|Everyone/i.test(acl),
  acl.replace(/\s+/g, ' ').trim(),
);

// ── 6. CONTROL: no token, no state ──────────────────────────────────────────────────────────
const answers = await new Promise((resolve) => {
  const got = {};
  const ws = new WebSocket('ws://127.0.0.1:5280');
  const timer = setTimeout(() => {
    ws.close();
    resolve(got);
  }, 10_000);
  ws.addEventListener('open', () => {
    ws.send(
      JSON.stringify({ type: 'request', id: 'caps', channel: 'bridge.capabilities', payload: {} }),
    );
    ws.send(
      JSON.stringify({ type: 'request', id: 'stack', channel: 'stack.snapshot', payload: null }),
    );
  });
  ws.addEventListener('message', (event) => {
    const frame = JSON.parse(String(event.data));
    if (frame.type === 'response') got[frame.id] = frame;
    if (got.caps !== undefined && got.stack !== undefined) {
      clearTimeout(timer);
      ws.close();
      resolve(got);
    }
  });
  ws.addEventListener('error', () => undefined);
});
fs.writeFileSync(path.join(OUT, 'no-token.json'), JSON.stringify(answers, null, 2));
check(
  'CONTROL — the socket answers a console with no token: the capabilities, naming this release',
  answers.caps?.payload?.bridgeVersion === RELEASE,
  JSON.stringify(answers.caps ?? null).slice(0, 200),
);
check(
  '…and gives it NO state: stack.snapshot is refused',
  answers.stack?.error !== undefined && answers.stack?.payload === undefined,
  JSON.stringify(answers.stack ?? null).slice(0, 200),
);

// ── 7. upgrade ──────────────────────────────────────────────────────────────────────────────
const upgraded = exitCodeOf(INSTALLER, ['/S']);
check('a silent upgrade (the same installer again) exits 0', upgraded === 0, String(upgraded));
check(
  '…keeps the configuration',
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cg-bridge.json'), 'utf8')).playoutAddress ===
    PLAYOUT,
);
const back = await until(() => service()?.state === 'Running', 60_000);
check('…and the service is running again', back !== null, JSON.stringify(service()));
const h2 = await until(() => health().then((r) => (r.status === 200 ? r : null)), 60_000);
check('…and answers /health', h2 !== null);

// ── 8. uninstall ────────────────────────────────────────────────────────────────────────────
const uninstalled = exitCodeOf(path.join(PROGRAM_DIR, 'uninstall.exe'), [
  '/S',
  `_?=${PROGRAM_DIR}`,
]);
check('a silent uninstall exits 0', uninstalled === 0, String(uninstalled));
check('…removes the service', service() === null, JSON.stringify(service()));
for (const name of RULES) check(`…removes the rule "${name}"`, rule(name) === null);
check('…removes the program files', !fs.existsSync(EXE), EXE);
check(
  '…and KEEPS the data folder (configuration, state, logs)',
  fs.existsSync(path.join(DATA_DIR, 'cg-bridge.json')),
  DATA_DIR,
);

// Evidence: the install and uninstall logs.
for (const log of ['install.log', 'uninstall.log']) {
  const file = path.join(DATA_DIR, 'logs', log);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(OUT, log));
}
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
