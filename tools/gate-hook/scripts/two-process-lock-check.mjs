#!/usr/bin/env node
/**
 * P-013 — scripted evidence that the host gate lock genuinely serializes ACROSS
 * processes, which the in-process unit tests (with time and the filesystem injected)
 * cannot prove on their own. Run it by hand:
 *
 *     node tools/gate-hook/scripts/two-process-lock-check.mjs
 *
 * Coordinator mode (default) spawns two worker processes that both try to hold the SAME
 * lock resource:
 *   - worker A acquires first and holds it for ~2.5 s;
 *   - worker B starts ~0.4 s later, finds the slot taken, and must WAIT;
 *   - when A releases, B acquires and runs.
 *
 * It then asserts B only acquired AFTER A released (i.e. B really waited, it did not run
 * concurrently) and that B announced the wait. This is the two concurrent gates the lock
 * exists to prevent — the pre-push/Stop-hook double-fire — reproduced deliberately.
 *
 * It uses a UNIQUE temp resource (not the real host-global path) and a fast poll interval
 * via CG_GATE_LOCK_POLL_MS, so it finishes in a few seconds and never contends with a
 * real gate. Not part of the gate's test run — a real two-process check would add the
 * very cross-process load B-098 warns about — so it lives in scripts/ and is run for
 * evidence.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { HOST_LOCK_BASENAME, resolveLockConfig, runUnderLock } from '../src/gate-lock.mjs';

const SELF = fileURLToPath(import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Worker: acquire the shared lock, hold it, print timestamped ACQUIRED/RELEASED. */
async function worker(label, resource, holdMs) {
  await runUnderLock({
    resource,
    config: resolveLockConfig(process.env),
    run: async () => {
      process.stdout.write(`${label} ACQUIRED ${Date.now()}\n`);
      await sleep(holdMs);
      return { code: 0 };
    },
    log: (message) => process.stderr.write(`${label} ${message}`),
  });
  process.stdout.write(`${label} RELEASED ${Date.now()}\n`);
}

/** Spawn one worker child and collect its stdout/stderr. */
function spawnWorker(label, resource, holdMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SELF, '--worker', label, resource, String(holdMs)], {
      env: { ...process.env, CG_GATE_LOCK_POLL_MS: '100' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', () => resolve({ label, stdout, stderr }));
  });
}

/** Parse `LABEL EVENT <epochMs>` lines into { ACQUIRED, RELEASED } timestamps. */
function parseEvents(stdout) {
  const events = {};
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\w+) (ACQUIRED|RELEASED) (\d+)$/);
    if (match) events[match[2]] = Number(match[3]);
  }
  return events;
}

async function coordinator() {
  const dir = await mkdtemp(join(tmpdir(), 'gate-lock-2p-'));
  const resource = join(dir, HOST_LOCK_BASENAME);
  try {
    const aPromise = spawnWorker('A', resource, 2500);
    await sleep(400); // let A take the slot first
    const bPromise = spawnWorker('B', resource, 300);
    const [a, b] = await Promise.all([aPromise, bPromise]);

    process.stdout.write('\n--- worker A ---\n' + a.stdout + a.stderr);
    process.stdout.write('\n--- worker B ---\n' + b.stdout + b.stderr + '\n');

    const ae = parseEvents(a.stdout);
    const be = parseEvents(b.stdout);

    const problems = [];
    if (!(ae.ACQUIRED && ae.RELEASED)) problems.push('worker A never acquired/released');
    if (!(be.ACQUIRED && be.RELEASED)) problems.push('worker B never acquired/released');
    // The core assertion: B could not acquire until A had released the slot.
    if (be.ACQUIRED && ae.RELEASED && be.ACQUIRED < ae.RELEASED - 50) {
      problems.push(
        `B acquired at ${be.ACQUIRED} BEFORE A released at ${ae.RELEASED} — the lock did NOT serialize`,
      );
    }
    if (!/waiting for host gate slot/.test(b.stderr)) {
      problems.push('worker B did not announce that it was waiting');
    }

    if (problems.length > 0) {
      process.stdout.write('\nFAIL:\n - ' + problems.join('\n - ') + '\n');
      return 1;
    }
    const waited = be.ACQUIRED - ae.ACQUIRED;
    process.stdout.write(
      `\nPASS: B waited for the slot and acquired ~${waited}ms after A (only once A released). ` +
        'The host gate lock serializes across processes.\n',
    );
    return 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worker') {
    const [, label, resource, holdMs] = argv;
    await worker(label, resource, Number(holdMs));
    return 0;
  }
  return coordinator();
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`two-process-lock-check: ${err?.stack ?? err}\n`);
    process.exit(1);
  },
);
