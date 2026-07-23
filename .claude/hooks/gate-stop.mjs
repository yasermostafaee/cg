#!/usr/bin/env node
/**
 * P-009 — the Stop hook that keeps a Claude Code turn from ending with a red local
 * gate. Zero dependencies, plain Node ESM; works whether the session was launched
 * from PowerShell, Git Bash, or WSL (no jq, no bash-isms — everything is Node).
 *
 * Decision order (see `tools/gate-hook/src/gate-decision.mjs` for the pure logic and
 * its unit tests):
 *   1. `stop_hook_active` → exit 0 (mandatory loop guard: never re-block a stop that
 *      is itself the continuation of a previous block; the NEXT natural turn end
 *      re-verifies).
 *   2. plan mode → exit 0 (plans don't change files; don't tax them).
 *   3. changed set = working tree ∪ commits vs the `origin/main` merge-base;
 *      empty → exit 0 (read-only turns cost nothing).
 *   4. docs-only → the CLAUDE.md carve-out (openspec validate strict + format:check);
 *      otherwise `pnpm gate`, plus `pnpm gate:e2e` when UI/render paths changed.
 *   5. green → exit 0 (with a NON-AUTHORITATIVE note when gate:e2e ran on win32).
 *   6. red → per-session attempt counter: attempts ≤ 2 ⇒ exit 2 with the failing
 *      tail + repair rules on stderr; attempts > 2 ⇒ exit 0 + a systemMessage asking
 *      for human eyes. Never thrash.
 *
 * Full command output lands in `.gate-logs/<session_id>.log` (gitignored); stderr
 * carries only the tail (hook output is capped ~10k chars).
 *
 * P-013: this hook does NOT lock anything itself. The `pnpm gate` / `pnpm gate:e2e` it
 * runs each acquire this host's exclusive gate slot inside their own scripts (a host-wide
 * advisory lock), so if a turn end fires this hook at the same moment a push fires
 * `.husky/pre-push` → `pnpm gate`, the second gate WAITS for the slot rather than racing
 * the first over vitest's shared coverage tmp dir (the false-ENOENT double-fire, B-097).
 * The lock lives at the single `gate`/`gate:e2e` chokepoint every entry point funnels
 * through — never re-implemented per caller.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyChangedSet,
  commandsFor,
  nextAttempt,
  parseNameOnly,
  parsePorcelain,
} from '../../tools/gate-hook/src/gate-decision.mjs';

const REPAIR_RULES = `REPAIR RULES (non-negotiable):
- Fix the CODE, not the test. Never delete, skip, .only, loosen an assertion, or widen a tolerance to go green.
- A test may change ONLY when the OpenSpec spec for this change deliberately changed the behavior — and you must say so explicitly in your final report.
- A Playwright failure at port 4321 is almost always a stale-process collision (see B-078), not a code bug: kill the stale process and re-run. Do not "fix" code for it.
- State plainly in your final report what you changed to turn the gate green.`;

/** Read all of stdin synchronously (the hook JSON). */
function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin());
  } catch {
    // Malformed input is OUR bug — never block the user's session for it.
    return 0;
  }

  // 1. Loop guard — a stop that continues a previous block must not re-block.
  if (input.stop_hook_active === true) return 0;
  // 2. Plan mode changes no files; stay out of the way.
  if (input.permission_mode === 'plan') return 0;

  // The repo root: the hook file lives at <root>/.claude/hooks/, so resolve from the
  // FILE, not the cwd — a session launched from a subdirectory still gates the repo.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const git = (args) =>
    spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });

  // 3. Changed set = working tree ∪ branch commits vs the origin/main merge-base.
  // -uall: porcelain COLLAPSES untracked directories to 'dir/' by default, which
  // would hide a new renderer file inside a new folder from the UI/render match
  // (found by the proof harness: '?? apps/' matched nothing). List every file.
  const status = git(['status', '--porcelain', '-uall']);
  if (status.status !== 0) return 0; // not a repo / git broken — not ours to block on
  const paths = parsePorcelain(status.stdout);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  if (mergeBase.status === 0) {
    const base = mergeBase.stdout.trim();
    const diff = git(['diff', '--name-only', `${base}..HEAD`]);
    if (diff.status === 0) paths.push(...parseNameOnly(diff.stdout));
  }

  const classification = classifyChangedSet(paths);
  const commands = commandsFor(classification);
  if (commands.length === 0) return 0;

  const sessionId = String(input.session_id ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const logDir = join(root, '.gate-logs');
  const logFile = join(logDir, `${sessionId}.log`);
  const attemptsFile = join(logDir, `${sessionId}.attempts`);
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    /* logging is best-effort */
  }
  const log = (text) => {
    try {
      appendFileSync(logFile, text);
    } catch {
      /* best-effort */
    }
  };

  let ranE2e = false;
  for (const command of commands) {
    ranE2e = ranE2e || command === 'pnpm gate:e2e';
    log(`\n──── ${new Date().toISOString()} $ ${command}\n`);
    // `shell: true` so `pnpm` resolves on Windows (pnpm.cmd) and POSIX alike; the
    // command strings are our own constants, never user input.
    const run = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', windowsHide: true });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    log(output);
    if (run.status !== 0) {
      // 6. Red — bounded, non-cheating self-repair.
      let prev = null;
      try {
        prev = readFileSync(attemptsFile, 'utf8');
      } catch {
        /* first attempt */
      }
      const attempts = nextAttempt(prev);
      try {
        writeFileSync(attemptsFile, String(attempts));
      } catch {
        /* best-effort */
      }
      if (attempts > 2) {
        process.stdout.write(
          JSON.stringify({
            systemMessage:
              `Local gate STILL RED after ${attempts - 1} auto-repair attempts ` +
              `(failing: \`${command}\`). The hook has stopped blocking to avoid thrashing — ` +
              `this needs human eyes. Full log: .gate-logs/${sessionId}.log`,
          }),
        );
        return 0;
      }
      const tail = output.split('\n').slice(-120).join('\n');
      process.stderr.write(
        `The turn's local gate is RED — \`${command}\` failed (attempt ${attempts}/2 before escalation).\n` +
          `Failing output tail (full log: .gate-logs/${sessionId}.log):\n\n${tail}\n\n${REPAIR_RULES}\n`,
      );
      return 2;
    }
  }

  // 5. Green — reset the episode so a later, unrelated red starts a fresh count.
  try {
    rmSync(attemptsFile, { force: true });
  } catch {
    /* best-effort */
  }
  if (ranE2e && process.platform === 'win32') {
    // Windows honesty (per CLAUDE.md/README): a local Windows E2E pass is evidence,
    // not the authoritative gate — pixel geometry differs (~19px) vs Linux.
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          'Gate green, including gate:e2e — but this E2E run was on win32 and is ' +
          'NON-AUTHORITATIVE for pixel geometry (~19px vs Linux). A Linux/WSL ' +
          'gate:e2e run is still owed before merge.',
      }),
    );
  }
  return 0;
}

process.exit(main());
