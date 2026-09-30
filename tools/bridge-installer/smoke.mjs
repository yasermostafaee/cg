#!/usr/bin/env node
/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 E — **CG BRIDGE ON A CLEAN WINDOWS**, driven the way the Playout's own
 * installer will chain it: silently, elevated, with its exit codes read.
 *
 *   1. a silent install (`/S /PLAYOUT=…`) exits 0;
 *   2. the service: registered, AUTOMATIC, RUNNING, its own account, NO dependency (rule 1: never
 *      on `ApasaiEngine`), restarted by Windows on failure;
 *   3. `/health` answers in under a second, in its fixed shape, with no secret (rule 13), naming
 *      the Playout it was given — ALL of it (the first run of this smoke found `http:` there);
 *   4. our three firewall rules, judged by their FIELDS (`firewall-rule.mjs`): scoped to our exe,
 *      on the ports in force, inbound, allowing; nothing binds UDP 6250 (rule 7 — the Playout
 *      engine's);
 *   5. the data folder: the configuration written; no ordinary user may read the folder;
 *   6. CONTROL — a console with no token gets no state: the socket answers `bridge.capabilities`
 *      (the release), and a WELL-FORMED `stack.snapshot` is refused by the AUTH gate, in its own
 *      words — a malformed one is refused by the parse before auth is asked, which proves nothing;
 *   7. a stop is a stop: stopped by hand, the service STAYS stopped (recovery answers a failure,
 *      never an admin's stop); and a crash is not the end: the bridge killed, Windows starts it again;
 *   8. a silent upgrade (the same installer again) exits 0, keeps the configuration, and the
 *      service is running again;
 *   9. a silent uninstall — `_?=` last and unquoted, so it finishes before it exits — exits 0 and
 *      removes our service, our rules and our files; the data folder is kept.
 *
 * Node built-ins only, and the firewall judge beside CG Control's smoke (sparse-checked out with
 * this file): this runner has the smoke, the judge and the installer, and nothing built.
 * Usage (elevated): `node tools/bridge-installer/smoke.mjs --installer <exe> --version <x.y.z> --out <dir>`
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ruleProblems } from '../../apps/runtime/tests/desktop/firewall-rule.mjs';

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
/** Our three rules, each as `firewall-rule.mjs` judges it: a name, a protocol, the ports in force. */
const RULES = [
  { name: 'CG Bridge - consoles', protocol: 'TCP', port: '5280' },
  { name: 'CG Bridge - template pages', protocol: 'TCP', port: '7911' },
  // Added as `6251,6252` (the OSC port and server B's, D14); `netsh` may read the pair back as a range.
  { name: 'CG Bridge - OSC from CasparCG', protocol: 'UDP', port: ['6251-6252', '6251,6252'] },
];
/** `AUTH_REQUIRED_REFUSAL` (`@cg/shared-ipc` `channels/auth.ts`) — the auth gate's own words. */
const NOT_SIGNED_IN = 'This console is not signed in';

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
  const res = await fetch(HEALTH, { signal: AbortSignal.timeout(2000) });
  const body = await res.json();
  return { ms: performance.now() - t0, status: res.status, body };
}
/** `/health`'s body once it answers 200, else `null` after `timeoutMs`. */
const healthy = (timeoutMs) =>
  until(() => health().then((r) => (r.status === 200 ? r : null)), timeoutMs);
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
const h = await healthy(60_000);
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
    '…naming the configured Playout, whole',
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
for (const [i, expected] of RULES.entries()) {
  const text = rule(expected.name);
  // Evidence: what `netsh` printed, so the next reader sees the rule — and the spelling of its ports.
  fs.writeFileSync(path.join(OUT, `firewall-${String(i + 1)}.txt`), text ?? 'absent');
  const problems = ruleProblems(text, { ...expected, program: EXE });
  check(
    `firewall rule "${expected.name}" allows ${[expected.port].flat()[0]}/${expected.protocol.toLowerCase()} inbound, for our exe only`,
    problems.length === 0,
    problems.join('; '),
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
    // WELL-FORMED: `stack.snapshot` takes no payload (or `{ channel }`). The first run of this
    // smoke sent `null`, was refused by the request PARSE — which runs before the auth gate — and
    // passed a check it had never reached.
    ws.send(JSON.stringify({ type: 'request', id: 'stack', channel: 'stack.snapshot' }));
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
  '…and gives it NO state: a well-formed stack.snapshot is refused by the auth gate',
  answers.stack?.payload === undefined &&
    String(answers.stack?.error?.message ?? '').startsWith(NOT_SIGNED_IN),
  JSON.stringify(answers.stack ?? null).slice(0, 200),
);

// ── 7. a stop is a stop; a crash is restarted ───────────────────────────────────────────────
// An admin's stop: recovery answers a FAILURE, so a stopped service stays stopped — past the first
// restart delay (5 s) with room to spare.
ps("Stop-Service -Name 'CGBridge' -Force");
const stopped = await until(() => service()?.state === 'Stopped', 30_000);
await sleep(12_000);
check(
  'stopped by hand, the service STAYS stopped (recovery answers a failure, never a stop)',
  stopped !== null && service()?.state === 'Stopped',
  JSON.stringify(service()),
);
ps("Start-Service -Name 'CGBridge'");
const restarted = await healthy(60_000);
check('…and starts again when asked', restarted !== null, JSON.stringify(service()));
// A crash: the bridge's own process killed. Windows' recovery — not the service host — starts it
// again: `/health` answers from a NEW process (a later `startedAt`).
const before = restarted?.body.startedAt ?? null;
// Its exit code is not the verdict (nothing to kill is a failure below, not a crash of the smoke).
spawnSync('taskkill', ['/F', '/IM', 'cg-bridge.exe'], { windowsHide: true });
const reborn = await until(
  () => health().then((r) => (r.status === 200 && r.body.startedAt !== before ? r : null)),
  60_000,
);
check(
  'the bridge killed, Windows starts it again (restart on failure, measured)',
  before !== null && reborn !== null,
  `${String(before)} -> ${String(reborn?.body.startedAt ?? 'no answer')}`,
);

// ── 8. upgrade ──────────────────────────────────────────────────────────────────────────────
const upgraded = exitCodeOf(INSTALLER, ['/S']);
check('a silent upgrade (the same installer again) exits 0', upgraded === 0, String(upgraded));
check(
  '…keeps the configuration',
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cg-bridge.json'), 'utf8')).playoutAddress ===
    PLAYOUT,
);
const back = await until(() => service()?.state === 'Running', 60_000);
check('…and the service is running again', back !== null, JSON.stringify(service()));
const h2 = await healthy(60_000);
check('…and answers /health', h2 !== null);

// ── 9. uninstall ────────────────────────────────────────────────────────────────────────────
// `_?=` LAST and UNQUOTED, spaces and all — NSIS's rule, and the only way the uninstaller finishes
// before it exits. Node quotes an argument with a space, so the command line is written whole and
// handed to cmd (`cmd /d /s /c "…"`): the first run of this smoke passed it as an argument, NSIS
// never saw `_?=`, and the uninstaller exited 0 in 220 ms with its copy still working.
const uninstall = spawnSync(`"${path.join(PROGRAM_DIR, 'uninstall.exe')}" /S _?=${PROGRAM_DIR}`, {
  shell: true,
  windowsHide: true,
});
check('a silent uninstall exits 0', uninstall.status === 0, String(uninstall.status));
// Deleted by the service manager once nothing holds it open: a short wait, bounded.
const gone = await until(() => service() === null, 30_000);
check('…removes the service', gone !== null, JSON.stringify(service()));
for (const { name } of RULES) check(`…removes the rule "${name}"`, rule(name) === null);
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
