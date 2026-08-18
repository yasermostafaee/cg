#!/usr/bin/env node
/**
 * P-035 — REFUSE a commit that stages a never-stage path.
 *
 * ── WHY A MECHANISM AND NOT A RULE ─────────────────────────────────────────
 *
 * This repo is one folder on one branch, and it permanently contains the owner's
 * uncommitted local work. `git add <directory>` cannot distinguish that work from
 * the work being committed. On 2026-08-17 a `git add tools/caspar-bridge` swept
 * up the owner's plant-testing hack and `dev` briefly shipped a hardcoded
 * `return '192.168.21.93'` in `guessLanHost()` — every install would have
 * advertised one machine's address. The instruction not to stage it existed, was
 * repeated three times, and was followed until it wasn't.
 *
 * A rule that depends on remembering is the one that already failed, so this is
 * the same rule with a `git` exit code behind it.
 *
 * ⚠ It is a NET, not a cure. The cure is the bridge advertise-host refactor,
 * which removes the reason the hack exists.
 *
 * Exit 0 = nothing listed is staged (or the escape was used). Exit 1 = refuse.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { offendingPaths, readPatterns } from './never-stage-decision.mjs';

const LIST = '.claude/never-stage';
const ESCAPE = 'CG_ALLOW_NEVER_STAGE';

/** Repo root, so the hook works from any subdirectory. */
function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function main() {
  const root = repoRoot();
  const listPath = path.join(root, LIST);
  if (!fs.existsSync(listPath)) return 0; // no list, nothing to guard

  const patterns = readPatterns(fs.readFileSync(listPath, 'utf8'));
  if (patterns.length === 0) return 0;

  // `--diff-filter=d` keeps deletions out: removing a listed file is not the
  // accident this guards, and refusing it would block the eventual cleanup.
  const staged = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=d'],
    { cwd: root, encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const offenders = offendingPaths(staged, patterns);
  if (offenders.length === 0) return 0;

  if (process.env[ESCAPE] === '1') {
    // LOUD on purpose. An intentional override must be visible in the terminal,
    // never a silent pass — that is the difference between an escape and a hole.
    console.error(
      `\n[never-stage] ⚠ OVERRIDE (${ESCAPE}=1) — committing ${String(offenders.length)} normally-forbidden path(s):`,
    );
    for (const p of offenders) console.error(`[never-stage]     ${p}`);
    console.error('[never-stage] If this was not deliberate, `git reset` those paths now.\n');
    return 0;
  }

  console.error('\n[never-stage] COMMIT REFUSED — a never-stage path is staged.\n');
  for (const p of offenders) console.error(`  ✖ ${p}`);
  console.error(`\nThese are listed in ${LIST}, which says why each one is there.`);
  console.error('This exists because `git add <directory>` once swept the owner\'s uncommitted');
  console.error("hack onto `dev`, shipping a hardcoded LAN address in the bridge.\n");
  console.error('To keep the change but drop these from the commit:');
  for (const p of offenders) console.error(`    git restore --staged ${p}`);
  console.error(`\nIf you REALLY mean to commit them:  ${ESCAPE}=1 git commit ...\n`);
  return 1;
}

// This module is only ever the CLI — the decision lives in
// `never-stage-decision.mjs`, which is what the tests import.
process.exit(main());
