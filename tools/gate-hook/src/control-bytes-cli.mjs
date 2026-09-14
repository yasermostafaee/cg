#!/usr/bin/env node
/**
 * `GUARDS-18` §1 — REFUSE a gate whose tree contains a control byte or a BOM in a text file.
 *
 * The decision — which bytes, which files, what to say — is `control-bytes-decision.mjs`,
 * which is what the tests import. This is only the I/O around it: ask git what is tracked,
 * read the bytes, turn the answer into an exit code.
 *
 * ── THE TWO CHOICES THAT MATTER ────────────────────────────────────────────
 *
 * **Enumerate with `git ls-files`, never a directory walk.** It inherits `.gitignore` for
 * free, so the scan never trips on `node_modules`, `dist/`, `.turbo/` or a 26 MB stray
 * capture, and it never has to carry a second copy of the ignore rules. It also scopes the
 * guard to exactly what a commit can carry, which is what the guard is about.
 *
 * **Read the bytes.** Not grep, not ripgrep — see the decision module's header: their binary
 * heuristic is the blindness this closes.
 *
 * Exit 0 = clean. Exit 1 = refuse, naming every file, its byte and the escape to use.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  describeOffence,
  EXEMPT_PATHS,
  findFirstOffence,
  isTextPath,
} from './control-bytes-decision.mjs';

/** Repo root, so the guard works from any subdirectory. */
function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

/**
 * Every TRACKED path, NUL-separated.
 *
 * `-z` rather than newline-separated, because a filename may legitimately contain a newline
 * and the whole subject of this guard is bytes that break naive parsing. The buffer is
 * raised for a tree of a few thousand files.
 */
function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    maxBuffer: 1 << 28,
    encoding: 'buffer',
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function main() {
  const started = Date.now();
  const root = repoRoot();
  const files = trackedFiles(root);

  const offences = [];
  let scanned = 0;
  let skippedBinary = 0;

  for (const rel of files) {
    if (!isTextPath(rel)) {
      skippedBinary += 1;
      continue;
    }
    if (EXEMPT_PATHS.has(rel)) continue;
    let bytes;
    try {
      bytes = fs.readFileSync(path.join(root, rel));
    } catch {
      // A tracked path that cannot be read right now (a stale index entry, a permission)
      // is not this guard's business, and failing on it would make the guard flaky about
      // something it does not measure.
      continue;
    }
    scanned += 1;
    const offence = findFirstOffence(bytes);
    if (offence !== null) offences.push({ rel, offence });
  }

  const ms = Date.now() - started;
  if (offences.length === 0) {
    // stderr, not stdout: the repo's lint rule allows only `warn`/`error`, and an
    // informational line from a gate step belongs beside the rest of the gate's output
    // rather than in a pipeline someone might be capturing.
    console.error(
      `[control-bytes] clean — ${String(scanned)} text files scanned, ` +
        `${String(skippedBinary)} binaries skipped by extension (${String(ms)} ms)`,
    );
    return 0;
  }

  console.error('\n[control-bytes] GATE REFUSED — a text file carries a byte it must not.\n');
  for (const { rel, offence } of offences) console.error(describeOffence(rel, offence));
  console.error(
    `\n${String(offences.length)} file(s) of ${String(scanned)} scanned. ` +
      'Fix the file — do NOT add it to the exemption list to go green:\n' +
      '`EXEMPT_PATHS` in tools/gate-hook/src/control-bytes-decision.mjs is for a byte that\n' +
      'genuinely belongs, with the reason written beside it, and it is empty on purpose.\n',
  );
  return 1;
}

process.exit(main());
