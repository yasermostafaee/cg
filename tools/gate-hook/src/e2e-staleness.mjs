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

/**
 * ⭐ **P-036, WIDENED — THE BUNDLE IS BUILT FROM MORE THAN THE APP'S OWN `src`.**
 *
 * The first cut compared `dist/` against the app's own sources only, which left the
 * check blind to every workspace package the app bundles. Edit `@cg/gesture` — the
 * package both apps' dividers consume — run the suite, and the stale bundle looks
 * CURRENT. That is the same false green P-036 exists to prevent, one level out, and
 * it would be found the same way: not at all.
 *
 * 🔴 **THE SET IS RESOLVED FROM THE DEPENDENCY GRAPH, NEVER FROM A LIST.** A
 * hand-kept list of packages is "extend the list, forget the mutator" — the next
 * package added is precisely the one nobody adds to it, and the guard would go
 * quiet exactly where it is newest. So the walk starts at the app's own
 * `package.json` and follows every `@cg/*` dependency transitively.
 *
 * **The costs are asymmetric, and that is the whole reasoning:** a wrong refusal
 * costs one rebuild; a wrong green costs a wrong conclusion, and this project has
 * already paid that once. Every judgement below therefore leans toward refusing.
 */

/**
 * Every workspace package, NAME → absolute directory.
 *
 * Read from each manifest's `name` rather than assumed from the directory, because
 * they diverge: `@cg/caspar-bridge` lives in `tools/caspar-bridge`, and a
 * convention that happens to hold today is not a resolver.
 */
export function readWorkspacePackages(repoRoot, groups = ['apps', 'packages', 'tools']) {
  const byName = new Map();
  for (const group of groups) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(repoRoot, group), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(repoRoot, group, entry.name);
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      } catch {
        continue;
      }
      if (typeof manifest.name === 'string' && manifest.name.length > 0) {
        byName.set(manifest.name, dir);
      }
    }
  }
  return byName;
}

/**
 * The workspace packages `entryDir` depends on, transitively — directories, in
 * discovery order.
 *
 * BOTH `dependencies` AND `devDependencies` are followed. Deciding per dependency
 * KIND which ones can reach a bundle is a judgement the resolver would have to get
 * right every time; following both is a rule it cannot get wrong, and it errs the
 * cheap way.
 *
 * 🔴 A `@cg/*` dependency that cannot be LOCATED THROWS rather than being skipped.
 * Skipping would make an unresolvable package indistinguishable from a fresh one —
 * a silent hole in a guard whose entire purpose is that silence is not evidence.
 */
export function resolveWorkspaceDeps(entryDir, byName, scope = '@cg/') {
  const visited = new Set([entryDir]);
  const dirs = [];
  const visit = (dir) => {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      return;
    }
    for (const field of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (!name.startsWith(scope)) continue;
        const depDir = byName.get(name);
        if (depDir === undefined) {
          throw new Error(
            `[e2e-staleness] ${name} is declared by ${dir} but is not a workspace package. ` +
              `Refusing rather than skipping it: an unresolvable dependency would be ` +
              `indistinguishable from a fresh one, which is the silent hole this guard exists ` +
              `to close (P-036).`,
          );
        }
        if (visited.has(depDir)) continue;
        visited.add(depDir);
        dirs.push(depDir);
        visit(depDir);
      }
    }
  };
  visit(entryDir);
  return dirs;
}

/**
 * Everything whose contents can change what `appDir`'s bundle contains: the app's
 * own sources, plus each workspace dependency's `src` and manifest.
 *
 * ⚠ **`src` and `package.json`, deliberately NOT the package's `dist` and NOT its
 * `tests`.** Both exclusions are decisions, not oversights:
 *
 *   - **Not `dist`.** A turbo CACHE RESTORE rewrites a package's `dist` mtimes
 *     without anything having been edited, so including it would refuse on
 *     ordinary builds. A guard that refuses routinely is a guard whose override
 *     becomes habit, and then it protects nothing.
 *   - **Not `tests`.** A package's tests are never bundled — the same reason the
 *     app's own `tests/` is absent from its input list.
 *
 * What remains is exactly the surface a human EDITS and that reaches the bundle, so
 * a stale build caused by a source change is always caught. The one case this does
 * not catch is a package rebuilt without any source change, which is not an edit
 * and so is not the red-then-green hazard P-036 exists for.
 */
export function bundleInputDirs({ appDir, repoRoot }) {
  const dirs = [
    path.join(appDir, 'src'),
    path.join(appDir, 'index.html'),
    path.join(appDir, 'vite.config.ts'),
  ];
  const byName = readWorkspacePackages(repoRoot);
  for (const depDir of resolveWorkspaceDeps(appDir, byName)) {
    dirs.push(path.join(depDir, 'src'), path.join(depDir, 'package.json'));
  }
  return dirs;
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
  );
  // The named file may live in a workspace PACKAGE rather than in the app, and
  // rebuilding only the app would not pick it up. `pnpm build` builds the graph.
  if (verdict.file !== null && !verdict.file.includes(`${path.sep}apps${path.sep}`)) {
    lines.push(
      '  That file is in a workspace PACKAGE the app bundles, so the app alone is not',
      '  enough — the package has to be rebuilt first.',
      '',
      '  Fix:  pnpm build              # the whole graph, in dependency order',
    );
  } else {
    lines.push(`  Fix:  pnpm --filter ${label} build`);
  }
  lines.push(
    '  Or:   pnpm test:e2e          # turbo builds first',
    '',
    /*
      ⚠ MEASURED, and the reason this line exists: a FULL turbo cache hit does not
      re-stamp `dist`. Turbo hashes CONTENT, so a file whose mtime moved without its
      bytes changing produces a 100% cache hit — `pnpm build` reports
      "21 cached, 21 total", writes nothing, and this guard keeps refusing with the
      remedy it just told you to run. An ORDINARY edit does not hit this (changed
      bytes bust the hash and the app rebuilds), but a rebase, a checkout or a
      `touch` does.

      Named rather than left to be discovered: a guard whose printed remedy does not
      work is a guard whose override becomes the habit, and then it protects nothing.
    */
    '  If pnpm build reports everything CACHED, the bundle is current in CONTENT and',
    '  only its timestamps are behind (a rebase or a checkout does this):',
    '',
    '        pnpm build --force    # re-stamps dist without changing what is in it',
    '',
    `  If testing the existing bundle IS the intent:  ${escape}=1 ...`,
    '',
  );
  throw new Error(lines.join('\n'));
}
