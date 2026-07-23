#!/usr/bin/env node
/**
 * P-013 — the thin CLI half of the host gate lock. Acquires the host-wide slot (waiting
 * while another gate holds it), spawns the actual gate command as a child with inherited
 * stdio, forwards its exit code, and releases the slot on the way out — whatever the
 * outcome.
 *
 * All decidable logic lives in the pure `gate-lock.mjs` next door, where the unit tests
 * pin the acquire/wait/timeout/release behavior; this file is only plumbing. The gate
 * command arrives as argv, e.g. `gate-lock-cli.mjs pnpm run gate:run`, and is spawned
 * with `shell: true` so `pnpm` resolves on Windows (`pnpm.cmd`) and POSIX alike — the
 * same pattern as `bounded-turbo-cli.mjs`.
 *
 * Fail-closed on the CHILD (a spawn error or a signal death reads as exit 1, never as a
 * passing gate) and fail-open on the LOCK (a broken lock degrades to an unserialized run
 * rather than refusing to gate) — the asymmetry is deliberate; see `runUnderLock`.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';

import { GateLockTimeoutError, hostLockPath, resolveLockConfig, runUnderLock } from './gate-lock.mjs';

/**
 * Spawn the gate command and resolve its normalized exit code. A signal death or a spawn
 * error both resolve to a non-zero code so they can never be mistaken for a green gate.
 *
 * @param {string} command
 * @param {readonly string[]} commandArgs
 * @returns {Promise<{ code: number }>}
 */
function runChild(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', shell: true, env: process.env });

    // Forward interrupts to the child so a Ctrl-C tears the gate down cleanly; the child
    // exiting then unwinds runUnderLock's `finally` and releases the slot.
    const forward = (signal) => () => {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    };
    const onSigint = forward('SIGINT');
    const onSigterm = forward('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);

    const done = (result) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      resolve(result);
    };

    child.on('error', (err) => {
      process.stderr.write(`gate-lock: failed to start the gate: ${err.message}\n`);
      done({ code: 1 });
    });
    child.on('close', (code, signal) => done({ code: signal ? 1 : (code ?? 1) }));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write('gate-lock: no command given to run under the host gate lock\n');
    return 1;
  }
  const [command, ...commandArgs] = argv;

  try {
    const { code } = await runUnderLock({
      resource: hostLockPath(os.tmpdir()),
      config: resolveLockConfig(process.env),
      run: () => runChild(command, commandArgs),
      log: (message) => process.stderr.write(message),
    });
    return code ?? 1;
  } catch (err) {
    if (err instanceof GateLockTimeoutError) {
      process.stderr.write(`${err.message}\n`);
      process.stderr.write(
        'gate-lock: the host gate slot was held too long — a gate may be stuck. Investigate before retrying.\n',
      );
      return 1;
    }
    process.stderr.write(
      `gate-lock: unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
