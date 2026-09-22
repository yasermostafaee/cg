/**
 * 🔴 `C-037` / `PLAYOUT-AUTH-01` §8 — **THE SIGN-IN, SEEN ON ONE MACHINE, REACHING NOTHING.**
 *
 * Starts a fake Playout on loopback AND a bridge in `auth: 'playout'` mode pointed at it, as one
 * command, and shuts both down together.
 *
 * ── 🔴 WHY THIS SCRIPT ISOLATES EVERYTHING, AND IT IS NOT CAUTION ───────────
 *
 * **Measured, not imagined: the first version of this script did not isolate, and it connected
 * to the plant.** `caspar-bridge.mjs` defaults every persisted path to `~/.cg-runtime/…`, and on
 * THIS machine `bridge-connection.json` names `192.168.21.114` — so a demo whose entire purpose
 * was "see the sign-in without touching the plant" opened an AMCP session to the plant on its
 * first run. It wrote no audit row and took nothing to air, and it should never have been able
 * to reach that far.
 *
 * So this script:
 *
 *  1. points every persisted path at a scratch directory under the OS temp dir, so the owner's
 *     real connection config, audit record, ledger, bank and template library are untouched and
 *     unreadable from here;
 *  2. forces `--caspar-host 127.0.0.1`, so the only CasparCG it can address is one on this
 *     machine;
 *  3. starts with an EMPTY station, deliberately. There is nothing to put on air because there
 *     is nothing configured to put anywhere.
 *
 * ⚠ An explicit `--caspar-host` passed through by the caller still wins — it is their machine
 * and their choice — but the DEFAULT can no longer be "whatever this host was last pointed at".
 *
 * ── WHY IT IS NOT A SECOND COPY OF THE TEST FIXTURE ─────────────────────────
 *
 * It IMPORTS `tests/support/fake-playout.ts`. Node strips the types at run time (v23+), so the
 * one implementation the acceptance suite is written against is the one the owner sees — a demo
 * server that had drifted from the fixture would show a sign-in that nothing tests.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * 🔴 **Not a Playout and not a security component.** It signs anything it is asked to, its key
 * lives in memory for as long as the process does, and its one password is a constant printed on
 * this screen. Never point a station at it.
 *
 * Usage:  pnpm dev:playout-auth
 *         pnpm dev:playout-auth -- --port 5280        (extra bridge flags pass through)
 */
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAKE_LONG_NAME_USER,
  FAKE_OPERATOR,
  FAKE_PLAYOUT_PASSWORD,
  FAKE_VIEWER,
  startFakePlayout,
} from '../tests/support/fake-playout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, '..');
const bridgeCli = path.join(pkgRoot, 'bin', 'caspar-bridge.mjs');

/*
  🔴 `DELTA C` — **BUILD FIRST. THIS SCRIPT RAN A STALE BRIDGE AND NOTHING SAID SO.**

  `bin/caspar-bridge.mjs` imports `../dist/index.js`. This script did not build, so it ran
  whatever was last compiled — and the owner, having pulled a commit that fixed the audit's
  sign-in rows, watched the OLD bridge keep writing one row per reload and reported the fix as
  not working. It was working; it was not running.

  Measured both ways on the same rig (a real browser, five real reloads, the same `jti`):
  pre-fix `dist` → 6 `sign-in` rows; post-fix `dist` → 1. Nothing about the source differed
  between those runs except which one had been compiled.

  ⚠ It is a BUILD and not a staleness WARNING. A warning is a thing to read and ignore at
  19:00, and the failure it prevents is silent: a demo that contradicts the code, which costs
  far more than the four seconds `tsc -b` takes.
*/
const built = spawnSync(
  process.execPath,
  [path.join(pkgRoot, 'node_modules/typescript/bin/tsc'), '-b'],
  {
    cwd: pkgRoot,
    stdio: 'inherit',
  },
);
if (built.status !== 0) {
  console.error(
    '[dev-playout] the bridge did not compile — refusing to start, because the alternative is ' +
      'running yesterday’s bridge against today’s console and believing the result.',
  );
  process.exit(built.status ?? 1);
}

/** A scratch station, so nothing here can read or write the real one. */
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-dev-playout-'));

const passthrough = process.argv.slice(2);
const caller = (flag: string): boolean => passthrough.includes(flag);

const playout = await startFakePlayout();

for (const line of [
  '',
  '  ── FAKE PLAYOUT (development only — this is NOT a Playout) ─────────────',
  `  base URL / iss : ${playout.issuer}`,
  `  JWKS (D3)      : ${playout.jwksUrl}`,
  `  sign-in (D1)   : ${playout.tokenUrl}`,
  `  revoked (D9)   : ${playout.revokedUrl}`,
  '',
  '  Sign in as one of these. The password is a CONSTANT, not a secret:',
  `    ${FAKE_OPERATOR.username.padEnd(9)} ${FAKE_OPERATOR.name}   operator, ONE channel`,
  `    ${FAKE_VIEWER.username.padEnd(9)} ${FAKE_VIEWER.name}   viewer, NO channels — and it STILL`,
  "               signs in. That is C-038's gap, and it is meant to be visible.",
  `    ${FAKE_LONG_NAME_USER.username.padEnd(9)} a name longer than 64 characters, so the audit`,
  '               record shows the truncation being recorded',
  `    password : ${FAKE_PLAYOUT_PASSWORD}`,
  '',
  '  ── THE STATION IS EMPTY AND ISOLATED ──────────────────────────────────',
  `  scratch state  : ${stateDir}`,
  '  CasparCG       : 127.0.0.1 (forced — the real connection config is NOT read)',
  '  Nothing here can reach the plant. There is no bank, no template library and no',
  '  ledger, so there is nothing to put on air — the sign-in is what this shows.',
  '',
  '  Now open the Runtime (pnpm --filter @cg/runtime dev) and reload the console.',
  '  Ctrl-C stops both and leaves the scratch directory for inspection.',
  '',
]) {
  console.error(line);
}

const bridge = spawn(
  process.execPath,
  [
    bridgeCli,
    '--auth',
    'playout',
    '--playout-issuer',
    playout.issuer,
    '--playout-jwks-url',
    playout.jwksUrl,
    '--playout-config-path',
    path.join(stateDir, 'bridge-playout.json'),
    // Every persisted path, named: a default left unnamed is a default that reads the real one.
    '--persist-path',
    path.join(stateDir, 'bridge-connection.json'),
    '--fixed-layers-path',
    path.join(stateDir, 'bridge-fixed-layers.json'),
    '--reserved-layers-path',
    path.join(stateDir, 'bridge-reserved-layers.json'),
    '--source-catalog-path',
    path.join(stateDir, 'bridge-source-catalog.json'),
    '--source-assignments-path',
    path.join(stateDir, 'bridge-source-assignments.json'),
    '--live-layers-path',
    path.join(stateDir, 'bridge-live-layers.json'),
    '--audit-log-path',
    path.join(stateDir, 'bridge-audit.ndjson'),
    '--templates-dir',
    path.join(stateDir, 'bridge-templates'),
    // Loopback unless the caller says otherwise. The plant is not reachable by default.
    ...(caller('--caspar-host') ? [] : ['--caspar-host', '127.0.0.1']),
    ...passthrough,
  ],
  { stdio: 'inherit' },
);

let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  console.error('[dev-playout] stopping');
  bridge.kill('SIGINT');
  void playout.stop().then(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// If the bridge refuses to start — a missing key, a port in use — the fake goes with it rather
// than being left listening on a port nobody is talking to.
bridge.on('exit', (code) => {
  void playout.stop().then(() => process.exit(code ?? 0));
});
