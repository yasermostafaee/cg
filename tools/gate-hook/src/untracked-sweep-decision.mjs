/**
 * `GUARDS-18` §2 — the UNTRACKED-SWEEP guard's PURE decision, separated from its CLI exactly
 * as `never-stage-decision.mjs` is from `never-stage-cli.mjs`.
 *
 * ── WHY A MECHANISM, AND WHY THIS IS THE THIRD TIME ────────────────────────
 *
 * `git add -A` and `git add <directory>` cannot tell the work being committed from the
 * owner's long-standing uncommitted work, because they were never asked to. On this tree
 * that has now swept three times:
 *
 *   1. `git add docs` took two `docs/design/*.html` the owner had not offered;
 *   2. a `git add tools/caspar-bridge` took the plant-testing LAN-host hack onto `dev`
 *      (the incident `P-035`'s never-stage list exists for);
 *   3. `LAYER-BANDS-16`'s `git add -A` took `.codex/`, `AGENTS.md` and `docs/design/`.
 *
 * `P-044` forbids it in writing. It kept happening, which is the argument for an exit code
 * rather than a fourth sentence.
 *
 * ── THE DISTINCTION THAT MATTERS, AND HOW IT IS DRAWN ──────────────────────
 *
 * "A file this change adds" and "a file the owner happens to have lying around" look
 * identical at commit time: both are staged ADDITIONS. Nothing in git records which `git add`
 * named them, so the difference has to come from somewhere else — and the honest somewhere is
 * TIME. A path that was already untracked at the previous commit is the owner's; a path that
 * did not exist then is this change's.
 *
 * So the CLI keeps a BASELINE of untracked paths, refreshed on every clean commit, and this
 * module answers the only question that matters: which staged additions were already sitting
 * there.
 *
 * ⚠ **This is not satisfiable by `.gitignore`.** Ignoring a path hides it from the baseline —
 * and from `git add -A` — so the accident becomes impossible by making the file invisible,
 * which is the opposite of the point. `AGENTS.md` in particular is owed as a TRACKED pointer
 * and must stay visible as untracked until somebody adds it on purpose;
 * `untracked-sweep-decision.test.ts` pins that it is not ignored.
 */

/** One baseline file → the set of paths it records. Comments and blanks stripped. */
export function parseBaseline(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/^#.*$/, '').trim())
      .filter((l) => l.length > 0),
  );
}

/** The set of paths → the baseline file's text. Sorted, so a diff of it reads. */
export function serializeBaseline(paths) {
  return (
    '# GUARDS-18 §2 — paths that were UNTRACKED as of the last clean commit.\n' +
    '# Written by tools/gate-hook/src/untracked-sweep-cli.mjs. Not committed, not shared:\n' +
    '# it lives in .git/ precisely so it can never be staged and never needs ignoring.\n' +
    [...paths].sort().join('\n') +
    '\n'
  );
}

/**
 * The adopt escape, parsed.
 *
 * `1` / `all` adopts everything this commit stages; anything else is a list of explicit
 * paths, comma- or whitespace-separated. A LIST is the ordinary case, because adopting a
 * file on purpose is a statement about THAT file.
 */
export function parseAdoptList(raw) {
  const value = (raw ?? '').trim();
  if (value === '') return { all: false, paths: new Set() };
  if (value === '1' || value.toLowerCase() === 'all') return { all: true, paths: new Set() };
  return {
    all: false,
    paths: new Set(
      value
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  };
}

/**
 * Which staged additions were already untracked — the paths a sweep would have taken.
 *
 * `baseline` is what was untracked at the last clean commit; `adopt` is the explicit escape.
 * A path named in `adopt` is a deliberate adoption and not an offence.
 */
export function sweptPaths(stagedAdditions, baseline, adopt = { all: false, paths: new Set() }) {
  if (adopt.all) return [];
  return stagedAdditions.filter((p) => baseline.has(p) && !adopt.paths.has(p));
}
