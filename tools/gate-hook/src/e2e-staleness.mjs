/**
 * P-036 — REFUSE to run an E2E suite against a stale build.
 *
 * ── WHAT THIS PREVENTS, AND WHY IT OUTRANKS A FEATURE ──────────────────────
 *
 * The E2E suites run against the built `dist/` (`vite preview`), not the source.
 * `turbo.json` already declares `test:e2e` `dependsOn: ['build']`, so the ROOT
 * `pnpm test:e2e` rebuilds — but `pnpm --filter <app> test:e2e` runs
 * `playwright test` DIRECTLY and bypasses turbo entirely. Nothing rebuilds, and
 * the suite happily tests whatever bundle happens to be on disk.
 *
 * 🔴 That silently invalidates RED-THEN-GREEN, which is this project's standard
 * proof that a test guards what it claims to guard. Edit the source, run the
 * suite, stash the fix, run it again: both runs execute the SAME bundle, agree
 * perfectly, and prove nothing — **while looking exactly like a rigorous
 * comparison.** It has already produced a false result here: on 2026-08-17 a
 * defect was reported in CC's own fix, escalated to the owner as
 * decision-relevant, and retracted only once it emerged that the second run had
 * executed the first run's bundle.
 *
 * A proof that is vacuous while looking rigorous is worse than no proof, because
 * nobody goes looking for the missing one.
 *
 * ── WHY A FRESHNESS CHECK RATHER THAN A BUILD DEPENDENCY ───────────────────
 *
 * The build dependency is ALREADY THERE and does not close this: the failing path
 * is precisely the one that does not go through turbo. A check that runs inside
 * Playwright's own startup catches every entry point — turbo, a filtered pnpm
 * script, or `pnpm exec playwright test` typed by hand — because they all end in
 * the same runner.
 *
 * It REFUSES rather than rebuilding: a guard that silently fixed the problem
 * would hide how long the suite really takes and would make an intentional
 * "test the bundle I have" impossible. Naming the stale file is the point.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Directories whose contents are never inputs to the bundle. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-results']);

/** Newest mtime under `root`, or null when the path does not exist. */
export function newestMtime(root, out = { path: null, ms: -1 }) {
  let st;
  try {
    st = fs.statSync(root);
  } catch {
    return out.ms < 0 ? null : out;
  }
  if (st.isFile()) {
    if (st.mtimeMs > out.ms) {
      out.ms = st.mtimeMs;
      out.path = root;
    }
    return out;
  }
  if (st.isDirectory()) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      newestMtime(path.join(root, entry.name), out);
    }
  }
  return out.ms < 0 ? null : out;
}

/**
 * The pure verdict: is `dist` older than the newest input?
 *
 * Separated from the filesystem walk so the decision itself is testable without
 * touching mtimes on disk.
 */
export function decideStaleness({ distNewestMs, inputNewest }) {
  if (distNewestMs === null) {
    return { stale: true, reason: 'missing', file: null, behindMs: 0 };
  }
  if (inputNewest === null) return { stale: false, reason: 'no-inputs', file: null, behindMs: 0 };
  if (inputNewest.ms > distNewestMs) {
    return {
      stale: true,
      reason: 'older-than-source',
      file: inputNewest.path,
      behindMs: inputNewest.ms - distNewestMs,
    };
  }
  return { stale: false, reason: 'fresh', file: null, behindMs: 0 };
}

/** Human seconds/minutes, for the refusal message. */
function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${String(s)}s`;
  return `${String(Math.round(s / 60))}m`;
}

/**
 * Throw unless `distDir` is at least as new as everything in `inputDirs`.
 *
 * `label` names the workspace in the message. `escape` documents the opt-out for
 * the case where testing the existing bundle IS the intent.
 */
export function assertFreshBuild({ label, distDir, inputDirs, escape = 'CG_ALLOW_STALE_E2E' }) {
  if (process.env[escape] === '1') {
    console.warn(
      `\n[e2e-staleness] ⚠ OVERRIDE (${escape}=1) — ${label}: running against the EXISTING build, whatever its age.\n`,
    );
    return;
  }
  const dist = newestMtime(distDir);
  let inputNewest = null;
  for (const dir of inputDirs) {
    const n = newestMtime(dir);
    if (n !== null && (inputNewest === null || n.ms > inputNewest.ms)) inputNewest = n;
  }
  const verdict = decideStaleness({ distNewestMs: dist === null ? null : dist.ms, inputNewest });
  if (!verdict.stale) return;

  const lines = ['', `[e2e-staleness] REFUSING TO RUN — ${label}'s build is not current.`, ''];
  if (verdict.reason === 'missing') {
    lines.push(`  ✖ no build found at ${distDir}`);
  } else {
    lines.push(`  ✖ ${verdict.file}`);
    lines.push(`    is ${ago(verdict.behindMs)} NEWER than the newest file in ${distDir}`);
  }
  lines.push(
    '',
    'The E2E suites run against the BUILT bundle, so a stale build means this run',
    'would test code you are not looking at. Two runs of the same stale bundle agree',
    'perfectly and prove nothing — which is how a red-then-green comparison becomes',
    'vacuous while still looking rigorous (P-036).',
    '',
    `  Fix:  pnpm --filter ${label} build`,
    '  Or:   pnpm test:e2e          # turbo builds first',
    '',
    `  If testing the existing bundle IS the intent:  ${escape}=1 ...`,
    '',
  );
  throw new Error(lines.join('\n'));
}
