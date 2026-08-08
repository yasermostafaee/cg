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
 *  - UI/render paths ⇒ still CLASSIFIED as owing an E2E, but the suite is NOT run
 *    locally any more (P-028). It runs on CI, on Linux, on every push to `dev`; the
 *    hook only prints the non-blocking reminder that the debt is unpaid until a
 *    COMPLETED green run URL exists. `CG_GATE_HOOK_E2E=1` opts the local run back in.
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
 * the CasparCG output) SEES, so the E2E gate is owed.
 *
 * P-029 — this list was WIDENED when `needsE2e` was promoted from a local hint into the
 * sole decision of whether the authoritative Linux suite runs at all. It is DERIVED from
 * the two apps' real runtime `dependencies` closure, read out of the package manifests,
 * not from memory:
 *
 *   @cg/caspar-client · @cg/lottie-bridge · @cg/shared-ipc · @cg/shared-schema
 *   @cg/single-file-export · @cg/splash-kit · @cg/starter-templates · @cg/storage
 *   @cg/template-runtime · @cg/text-shaping · @cg/ui · @cg/vcg-format
 *
 * Two of those are easy to miss and are called out deliberately: `@cg/splash-kit` lives
 * under `tools/`, so any "tools/** is not render" shortcut would silently drop the
 * package that draws the splash screen; and `@cg/caspar-client` is a runtime dependency
 * of the Runtime app, which decides what actually reaches air.
 *
 * Beyond the closure: ALL of `apps/[*]/src/` (not just `renderer/` — `platform/` is the
 * browser implementation behind the bridge and `shared/` is the bridge contract itself),
 * each app's `index.html`, `public/` assets and Vite config, any vanilla-extract
 * stylesheet anywhere, and the Playwright suites and configs themselves.
 *
 * This list is an ALLOWLIST of things KNOWN to affect render. It is no longer what
 * decides the answer on its own — see `affectsRender`, where anything unrecognised
 * counts as render-affecting.
 */
export const UI_RENDER_PATTERNS = [
  // Both SPAs, entire source tree + the shell/assets Vite builds around it.
  /^apps\/[^/]+\/src\//,
  /^apps\/[^/]+\/index\.html$/,
  /^apps\/[^/]+\/public\//,
  /^apps\/[^/]+\/vite\.config\./,
  // The apps' runtime dependency closure, derived from their package manifests.
  /^packages\/caspar-client\//,
  /^packages\/lottie-bridge\//,
  /^packages\/shared-ipc\//,
  /^packages\/shared-schema\//,
  /^packages\/single-file-export\//,
  /^packages\/starter-templates\//,
  /^packages\/storage\//,
  /^packages\/template-runtime\//,
  /^packages\/text-shaping\//,
  /^packages\/ui\//,
  /^packages\/vcg-format\//,
  /^tools\/splash-kit\//,
  // Anywhere.
  /\.css\.ts$/,
  /^apps\/[^/]+\/tests\/e2e\//,
  /^apps\/[^/]+\/playwright\.config\.ts$/,
];

/**
 * Paths KNOWN not to be able to change what the apps render. Deliberately SHORT: this is
 * the only list whose membership can cause the authoritative suite to be skipped, so a
 * wrong entry here is the one mistake that costs coverage. Everything on it is
 * documentation, or tooling that cannot reach the built apps.
 *
 * Notably NOT here, and that is on purpose: root config (`package.json`, `turbo.json`,
 * `tsconfig.base.json`, the lockfile) decides what twenty workspaces emit — [[B-066]] is
 * an `es2022` setting in a root tsconfig that `SyntaxError`d on CEF 71 — and everything
 * under `tools/` other than the gate hook, because `tools/splash-kit` proves that
 * directory is not uniformly harmless.
 */
export const NON_RENDER_PATTERNS = [
  /^docs\//,
  /^openspec\//,
  /\.md$/,
  /^\.github\//,
  /^\.husky\//,
  /^\.claude\//,
  /^tools\/gate-hook\//,
];

/** Does ONE path fall in the KNOWN UI/render set? */
export function isUiRenderPath(path) {
  const p = normalizePath(path);
  return UI_RENDER_PATTERNS.some((re) => re.test(p));
}

/** Is ONE path KNOWN to be unable to affect what the apps render? */
export function isKnownNonRenderPath(path) {
  const p = normalizePath(path);
  return NON_RENDER_PATTERNS.some((re) => re.test(p));
}

/**
 * Does ONE path affect what the apps render — i.e. does it owe the E2E suite?
 *
 * P-029 — the DEFAULT for an unrecognised path is `true`. This is the whole point of the
 * predicate and it is the opposite of what the old `isUiRenderPath`-only test did: that
 * one answered `false` for anything it did not recognise, so a new package, a renamed
 * directory, or a root config file would silently answer "no E2E owed". That was
 * tolerable while `needsE2e` merely decided whether to ALSO run a local suite that could
 * not discharge anything ([[P-028]]); it is a defect once the answer decides whether the
 * authoritative run happens at all. Unknown must fail TOWARD running the suite.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function affectsRender(path) {
  return isUiRenderPath(path) || !isKnownNonRenderPath(path);
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
  // `affectsRender`, NOT `isUiRenderPath`: an unrecognised path owes the E2E (P-029).
  return { kind: 'code', needsE2e: normalized.some(affectsRender) };
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

/**
 * The env var that opts the LOCAL `gate:e2e` run back into the hook, for a turn where
 * someone wants the fast local signal despite it not being authoritative.
 */
export const E2E_OPT_IN_ENV = 'CG_GATE_HOOK_E2E';

/**
 * Is the local `gate:e2e` opt-in set? Accepts the usual truthy spellings and treats
 * everything else — including unset — as OFF, because OFF is the documented default.
 *
 * @param {Record<string, string | undefined>} [env] process.env, injected for tests
 * @returns {boolean}
 */
export function localE2eOptIn(env) {
  const raw = String(env?.[E2E_OPT_IN_ENV] ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * The commands for a classification, in run order. Pure — the hook executes them.
 *
 * P-028: a UI/render change no longer runs `pnpm gate:e2e` HERE. The measurement that
 * settled it — ~224 s per UI turn on top of ~140 s for `pnpm gate`, paid on EVERY turn
 * of a multi-turn UI task — bought a signal that could never discharge anything, because
 * a Windows run is non-authoritative by the same rule that owes the debt. CI runs the
 * authoritative Linux suite on every push to `dev` instead. What is NOT weakened: the
 * classification below still reports `needsE2e`, and `e2eReminderFor` still says the debt
 * is owed — only WHO runs the suite changed.
 *
 * @param {{ kind: string, needsE2e: boolean }} classification
 * @param {{ localE2e?: boolean }} [options] `localE2e` re-enables the local suite
 * @returns {string[]}
 */
export function commandsFor(classification, options) {
  if (classification.kind === 'empty') return [];
  if (classification.kind === 'docs-only') {
    // The CLAUDE.md docs-only carve-out, verbatim: validation + formatting only.
    return ['pnpm openspec validate --all --strict', 'pnpm format:check'];
  }
  const cmds = ['pnpm gate'];
  if (classification.needsE2e && options?.localE2e === true) cmds.push('pnpm gate:e2e');
  return cmds;
}

/**
 * The NON-BLOCKING reminder for a turn that owes a Linux E2E, or `null` when none is
 * owed. It never gates anything: it exists so the obligation stays visible now that the
 * hook no longer runs the suite, and it deliberately restates where the authority comes
 * from rather than assuming the reader remembers.
 *
 * @param {{ kind: string, needsE2e: boolean }} classification
 * @returns {string | null}
 */
export function e2eReminderFor(classification) {
  if (classification.kind !== 'code' || !classification.needsE2e) return null;
  return (
    'This turn changed UI/render paths, so a Linux `gate:e2e` is OWED. The hook no ' +
    'longer runs it locally (P-028): a Windows run is non-authoritative and never ' +
    'discharged the debt. The authoritative run is the `e2e` job on GitHub Actions, ' +
    'which runs on every push to `dev`. The debt stays UNPAID until a COMPLETED, GREEN ' +
    'run exists for the commit carrying this change, and its run URL is written into ' +
    'the change\'s tasks.md beside the ticked item (CLAUDE.md, "E2E coverage"). ' +
    `To run the suite locally on a turn anyway, set ${E2E_OPT_IN_ENV}=1.`
  );
}
