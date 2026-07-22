#!/usr/bin/env node
/**
 * B-098 — the thin CLI half of the gate's test-parallelism bound. Runs turbo with
 * `--concurrency` set to the computed task bound, and with vitest's own fork cap
 * exported into the environment, so the PRODUCT of the two stays inside the machine.
 *
 * All decidable logic lives in the pure `resolveTestBound` next door, where the unit
 * tests pin the `taskConcurrency * forksPerTask <= cores` invariant; this file is only
 * plumbing: detect cores, export the caps, spawn turbo, forward the exit code.
 *
 * The cap travels as vitest's own documented `VITEST_*` env overrides (see
 * `testWorkerEnv` for why it takes four of them), so it reaches EVERY package uniformly
 * — including @cg/ui, which has a `test` script but no vitest.config.ts to put a
 * setting in. turbo runs in strict env mode by default, so those names are also listed
 * in the `test` tasks' `passThroughEnv` in turbo.json; without that they would be
 * filtered out before vitest ever saw them, and the bound would silently be a no-op.
 *
 * The banner is not decoration: it is what makes that silent no-op impossible to ship
 * unnoticed. Every gate log now states the bound it ran under, so a future starvation
 * report can be checked against the numbers actually in force rather than the numbers
 * someone intended.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import { applyConcurrencyFlag, resolveTestBound, testWorkerEnv } from './test-concurrency.mjs';

const detectedCores =
  typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;

// Escape hatches for a machine whose shape the formula reads wrong (a shared CI runner
// advertising more cores than it is scheduled). Both only ever TIGHTEN — see the clamp
// in resolveTestBound — so neither can be used to widen the bound back out.
const bound = resolveTestBound(detectedCores, {
  forksPerTask: process.env.CG_TEST_FORKS_PER_TASK,
  taskConcurrency: process.env.CG_TEST_TASK_CONCURRENCY,
});

const args = applyConcurrencyFlag(process.argv.slice(2), bound.taskConcurrency);

process.stdout.write(
  `gate bound (B-098): ${bound.cores} cores -> ${bound.taskConcurrency} concurrent tasks x ` +
    `${bound.forksPerTask} vitest forks = ${bound.maxTestWorkers} max test workers\n`,
);

const child = spawn('turbo', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...testWorkerEnv(bound.forksPerTask) },
});

// Fail closed: a spawn error or a signal death must not read as a passing gate.
child.on('error', (err) => {
  process.stderr.write(`gate bound (B-098): failed to start turbo: ${err.message}\n`);
  process.exit(1);
});
child.on('close', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
