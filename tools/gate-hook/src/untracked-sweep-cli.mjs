#!/usr/bin/env node
/**
 * `GUARDS-18` §2 — REFUSE a commit that stages a path which was merely lying around.
 *
 * The decision is `untracked-sweep-decision.mjs`, which is what the tests import. This is the
 * I/O: ask git what is staged and what is untracked, keep the baseline, exit 0 or 1.
 *
 * ── WHERE THE BASELINE LIVES, AND WHY THERE ────────────────────────────────
 *
 * `.git/cg-untracked-baseline`. Inside `.git` on purpose: it can never be staged, never needs
 * a `.gitignore` entry, and is per-checkout state like the index itself. A baseline committed
 * to the tree would be shared between machines whose untracked work differs, which is the one
 * thing it must not be.
 *
 * It is refreshed on every CLEAN commit, by this guard, on its way to exit 0 — and ONLY when
 * invoked with `--commit`, which is what `.husky/pre-commit` passes. One writer, one moment,
 * so "what does the baseline say" is answerable by looking at the last commit.
 *
 * 🔴 **Reading the guard must not change it, and the first draft got that wrong.** Without the
 * flag, every bare `node untracked-sweep-cli.mjs` — exactly what you run to check the thing
 * works — refreshed the baseline, writing whatever was untracked at that moment into it. Two
 * `types/*.d.ts` files created during this very change were condemned on the first real commit
 * because a verification run had adopted them into the baseline. An instrument that alters what
 * it measures reports on itself.
 *
 * ⚠ **The residual window, stated rather than hidden:** a file the owner creates AFTER the
 * last commit is not in the baseline, so a sweep in the very next commit would not be caught.
 * Closing that would need a second writer (a refresh at gate time) and the ordering then stops
 * being obvious — a refresh that runs after a bad `git add` would clear the evidence. One
 * writer and a named gap beats two writers and a subtle one.
 *
 * Exit 0 = nothing swept (or adopted deliberately). Exit 1 = refuse.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAdoptList,
  parseBaseline,
  serializeBaseline,
  sweptPaths,
} from './untracked-sweep-decision.mjs';

const BASELINE = 'cg-untracked-baseline';
const ADOPT = 'CG_ADOPT_UNTRACKED';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function gitDir(root) {
  return path.resolve(root, git(root, ['rev-parse', '--git-dir']).trim());
}

/** NUL-separated git output → a clean list. `-z` because a path may contain a newline. */
function zsplit(out) {
  return out.split('\0').filter(Boolean);
}

/** Paths this commit ADDS — `A` only: a modification or a deletion is not a sweep. */
function stagedAdditions(root) {
  return zsplit(git(root, ['diff', '--cached', '--name-only', '--diff-filter=A', '-z']));
}

/** Everything still untracked and not ignored — `--untracked-files=all` so a directory expands. */
function untrackedNow(root) {
  return zsplit(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
}

function main() {
  // Only a COMMIT writes. See the header: a verification run must be side-effect free.
  const isCommit = process.argv.includes('--commit');
  const root = repoRoot();
  const baselinePath = path.join(gitDir(root), BASELINE);

  const additions = stagedAdditions(root);
  const adopt = parseAdoptList(process.env[ADOPT]);

  // No baseline yet (a fresh clone, or the first run after this guard landed): record what is
  // untracked and let this commit through. Fail-OPEN for exactly one commit, and loudly, so
  // the state it is about to rely on is visible rather than assumed.
  if (!fs.existsSync(baselinePath)) {
    const now = untrackedNow(root);
    if (isCommit) fs.writeFileSync(baselinePath, serializeBaseline(new Set(now)), 'utf8');
    console.error(
      `[untracked-sweep] first run — ${isCommit ? 'recorded' : 'would record'} ` +
        `${String(now.length)} untracked path(s) as the baseline. Armed from the next commit.`,
    );
    return 0;
  }

  const baseline = parseBaseline(fs.readFileSync(baselinePath, 'utf8'));
  const swept = sweptPaths(additions, baseline, adopt);

  if (swept.length === 0) {
    // Clean: the baseline becomes whatever is untracked once this commit lands — and only a
    // commit may move it, so checking the guard by hand leaves it exactly where it was.
    if (isCommit) {
      fs.writeFileSync(baselinePath, serializeBaseline(new Set(untrackedNow(root))), 'utf8');
    }
    if (adopt.all || adopt.paths.size > 0) {
      // LOUD, like never-stage's override: a deliberate adoption must be visible in the
      // terminal, never a silent pass. That is the difference between an escape and a hole.
      console.error(
        `[untracked-sweep] ⚠ ADOPT (${ADOPT}) — ` +
          (adopt.all ? 'every' : [...adopt.paths].join(', ')) +
          ' untracked path staged deliberately.',
      );
    }
    return 0;
  }

  console.error('\n[untracked-sweep] COMMIT REFUSED — this stages files that were just lying around.\n');
  for (const p of swept) console.error(`  ✖ ${p}`);
  console.error(
    `\nEach was already UNTRACKED at the last commit, so it is the owner's work rather than\n` +
      'this change\'s. `git add -A` and `git add <directory>` cannot tell the two apart — that\n' +
      'is how `docs/design/*.html`, the bridge LAN-host hack, and `.codex/` + `AGENTS.md` were\n' +
      'each swept in turn (P-044).\n',
  );
  console.error('THE REMEDY IS TO STAGE BY EXPLICIT FILE. Drop these, then name what you meant:');
  console.error(`    git restore --staged ${swept.join(' ')}`);
  console.error('    git add path/to/the/file/you/changed.ts\n');
  console.error('If you REALLY mean to adopt one, name it — never a blanket add:');
  console.error(`    ${ADOPT}="${swept[0]}" git commit ...\n`);
  console.error(
    '⚠ Do NOT silence this by adding these paths to .gitignore. The point is to stop an\n' +
      'accidental ADD, not to hide the files — `AGENTS.md` is owed as a TRACKED pointer and\n' +
      'must stay visible as untracked until it is added deliberately.\n',
  );
  return 1;
}

process.exit(main());
