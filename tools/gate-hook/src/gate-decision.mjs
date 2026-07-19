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
