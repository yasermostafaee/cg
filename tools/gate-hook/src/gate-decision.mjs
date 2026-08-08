/**
 * P-009 — the PURE decision logic behind `.claude/hooks/gate-stop.mjs`, the Stop hook
 * that keeps a Claude Code turn from ending with a red local gate.
 *
 * Zero dependencies, plain ESM, NO build step: the hook imports this file by relative
 * path (`../../tools/gate-hook/src/gate-decision.mjs`), so it works on a fresh clone
 * from PowerShell, Git Bash, or WSL alike. Everything here is deterministic and
 * side-effect-free — the unit tests in `../tests/` pin it, and keeping it in a
 * `tools/*` workspace means `turbo run test` (the ordinary gate) runs those tests with
 * correct caching (module + tests share the package, so no cross-package `inputs`
 * gymnastics against the frozen root turbo.json).
 *
 * The CLASSIFICATION mirrors CLAUDE.md's gate rules — it does not redefine them:
 *  - docs-only carve-out: every changed path under `openspec/**`, `docs/**`, or any
 *    `*.md` ⇒ only `openspec validate --all --strict` + `format:check`;
 *  - anything else ⇒ the full `pnpm gate`;
 *  - UI/render paths additionally ⇒ `pnpm gate:e2e` (CLAUDE.md: user-facing changes
 *    run their E2E).
 *
 * It also owns WHICH ref the turn's diff is measured against (`pickDiffBaseRef`). That
 * is a decision, not plumbing, so it is pinned by unit tests here rather than buried in
 * the hook — see `P-026`: measuring against `origin/main` under a dev-only model made
 * every turn's changed set the whole unmerged backlog, which silently killed the
 * docs-only carve-out.
 */

/**
 * Normalize a git path for matching: forward slashes, no leading `./`, unquoted.
 * `git status --porcelain` quotes paths containing special characters.
 */
export function normalizePath(p) {
  let out = String(p).trim().replace(/\\/g, '/');
  if (out.startsWith('"') && out.endsWith('"') && out.length >= 2) {
    out = out.slice(1, -1);
  }
  if (out.startsWith('./')) out = out.slice(2);
  return out;
}

/**
 * Parse `git status --porcelain` output into changed paths.
 * Handles the rename form `R  old -> new` (the NEW path is what matters for
 * classification) and skips blank lines.
 */
export function parsePorcelain(stdout) {
  const paths = [];
  for (const line of String(stdout).split('\n')) {
    if (line.trim().length === 0) continue;
    // Two status columns + space, then the path (possibly `old -> new`).
    const body = line.slice(3);
    const arrow = body.indexOf(' -> ');
    paths.push(normalizePath(arrow === -1 ? body : body.slice(arrow + 4)));
  }
  return paths;
}

/** Parse `git diff --name-only` output into paths. */
export function parseNameOnly(stdout) {
  return String(stdout)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(normalizePath);
}

/**
 * The refs the turn's diff base is taken from, in priority order.
 *
 * P-026 — all work lands on `dev`; the owner merges `dev` → `main` by hand at the end of
 * a day. So `origin/main` is a HIGH-WATER MARK of finished days, not of this turn: a
 * merge-base against it spans every commit since the last merge, and the turn's "changed
 * set" becomes the entire unmerged backlog. One docs commit on a `dev` that is twenty
 * commits ahead then classifies as `code` — the docs-only carve-out dies and every turn
 * pays a full `pnpm gate`, often `gate:e2e` too, over files the turn never touched.
 *
 * `origin/main` stays as the FALLBACK because a fresh clone that has never pushed `dev`
 * still has to gate something sensible.
 */
export const DIFF_BASE_REFS = ['origin/dev', 'origin/main'];

/**
 * Pick the ref to measure the turn's commits against: the first of `refs` that RESOLVES
 * in this repo, or `null` when none does (the caller then falls back to the working tree
 * alone — a real state on a fresh clone with no remote, and one that must never throw).
 *
 * Pure by injection: the caller supplies the resolver, so this stays deterministic and
 * unit-testable while the actual `git rev-parse` lives in the hook. A resolver that
 * THROWS is treated as "does not resolve" — probing a ref must never be able to fail the
 * turn, and falling through to the next candidate is strictly safer than propagating.
 *
 * @param {(ref: string) => boolean} resolves true when the ref names a commit here
 * @param {readonly string[]} [refs] candidates, highest priority first
 * @returns {string | null} the ref to diff against, or null for "working tree alone"
 */
export function pickDiffBaseRef(resolves, refs = DIFF_BASE_REFS) {
  for (const ref of refs) {
    let ok = false;
    try {
      ok = resolves(ref) === true;
    } catch {
      ok = false; // an unprobeable ref is not a usable base — try the next one.
    }
    if (ok) return ref;
  }
  return null;
}

/**
 * The turn's changed set: the working tree UNION the commits `HEAD` carries beyond the
 * diff base. Returns `null` when `git status` itself fails (not a repo, git broken) —
 * the caller must stand down then, never gate on a guess.
 *
 * Impure only through the INJECTED runner: `git(args)` must behave like `spawnSync`,
 * returning `{ status, stdout }`. It lives here rather than inline in the hook so the
 * tests reach the SAME implementation the hook executes ([[P-023]] — a control test that
 * reaches a different implementation than the one under test is not a control test).
 *
 * Both halves are FAIL-SOFT by design: a failed `merge-base` (unrelated histories) or a
 * failed `diff` degrades to the working tree alone rather than throwing. The working
 * tree is always in the set, so degrading can only ever UNDER-count commits already
 * pushed — never lose an uncommitted edit the turn just made.
 *
 * @param {(args: readonly string[]) => { status: number | null, stdout?: string }} git
 * @returns {string[] | null} changed paths, or null when git status failed
 */
export function collectChangedPaths(git) {
  // -uall: porcelain COLLAPSES untracked directories to 'dir/' by default, which would
  // hide a new renderer file inside a new folder from the UI/render match (found by the
  // proof harness: '?? apps/' matched nothing). List every file.
  const status = git(['status', '--porcelain', '-uall']);
  if (status.status !== 0) return null;
  const paths = parsePorcelain(status.stdout ?? '');

  // `rev-parse --verify --quiet <ref>^{commit}` is the resolution probe: silent, exits
  // non-zero for an absent ref, and `^{commit}` rejects a same-named tag or tree that
  // could never serve as a merge-base.
  const baseRef = pickDiffBaseRef(
    (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0,
  );
  // No base ref at all (fresh clone, no remote) ⇒ the working tree alone IS the set.
  if (baseRef === null) return paths;

  const mergeBase = git(['merge-base', 'HEAD', baseRef]);
  if (mergeBase.status !== 0) return paths;
  const base = String(mergeBase.stdout ?? '').trim();
  const diff = git(['diff', '--name-only', `${base}..HEAD`]);
  if (diff.status === 0) paths.push(...parseNameOnly(diff.stdout ?? ''));
  return paths;
}

/** CLAUDE.md docs-only carve-out membership for ONE path. */
export function isDocsPath(path) {
  const p = normalizePath(path);
  return p.startsWith('openspec/') || p.startsWith('docs/') || p.endsWith('.md');
}

/**
 * The UI/RENDER set — a changed path here means the diff can alter what the user (or
 * the CasparCG output) SEES, so the E2E gate is owed. Derived from the repo, not
 * guessed:
 *  - `apps/[*]/src/renderer/` — both SPAs' UI (CLAUDE.md's renderer seam);
 *  - `packages/template-runtime/` — how every scene renders + plays out;
 *  - `packages/lottie-bridge/` — the mounted Lottie players the preview/exports render;
 *  - `packages/ui/` — shared tokens/theme;
 *  - `packages/single-file-export/` — the exported HTML the E2E suite exercises;
 *  - any vanilla-extract stylesheet (`*.css.ts`) anywhere;
 *  - the Playwright suites + configs themselves (a spec/config edit must re-run).
 */
export const UI_RENDER_PATTERNS = [
  /^apps\/[^/]+\/src\/renderer\//,
  /^packages\/template-runtime\//,
  /^packages\/lottie-bridge\//,
  /^packages\/ui\//,
  /^packages\/single-file-export\//,
  /\.css\.ts$/,
  /^apps\/[^/]+\/tests\/e2e\//,
  /^apps\/[^/]+\/playwright\.config\.ts$/,
];

/** Does ONE path fall in the UI/render set? */
export function isUiRenderPath(path) {
  const p = normalizePath(path);
  return UI_RENDER_PATTERNS.some((re) => re.test(p));
}

/**
 * Classify a turn's changed set into the gate to run.
 *
 * @param {readonly string[]} paths changed paths (working tree ∪ branch commits)
 * @returns {{ kind: 'empty' | 'docs-only' | 'code', needsE2e: boolean }}
 */
export function classifyChangedSet(paths) {
  const normalized = [...new Set(paths.map(normalizePath).filter((p) => p.length > 0))];
  if (normalized.length === 0) return { kind: 'empty', needsE2e: false };
  if (normalized.every(isDocsPath)) return { kind: 'docs-only', needsE2e: false };
  return { kind: 'code', needsE2e: normalized.some(isUiRenderPath) };
}

/**
 * Attempt bookkeeping (pure half): given the previous contents of the per-session
 * attempts file (or null), the count AFTER recording one more red gate.
 * Garbage/absent content counts as zero prior attempts — never throws.
 */
export function nextAttempt(prevContent) {
  const n = Number.parseInt(String(prevContent ?? '').trim(), 10);
  return (Number.isFinite(n) && n >= 0 ? n : 0) + 1;
}

/** The commands for a classification, in run order. Pure — the hook executes them. */
export function commandsFor(classification) {
  if (classification.kind === 'empty') return [];
  if (classification.kind === 'docs-only') {
    // The CLAUDE.md docs-only carve-out, verbatim: validation + formatting only.
    return ['pnpm openspec validate --all --strict', 'pnpm format:check'];
  }
  const cmds = ['pnpm gate'];
  if (classification.needsE2e) cmds.push('pnpm gate:e2e');
  return cmds;
}
