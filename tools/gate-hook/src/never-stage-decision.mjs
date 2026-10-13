/**
 * P-035 — the never-stage guard's PURE decision, separated from its CLI exactly
 * as `pre-push-decision.mjs` is from `pre-push-cli.mjs`.
 *
 * Everything worth trusting is here: which staged paths a list forbids. The CLI
 * around it only asks git what is staged and turns the answer into an exit code.
 */

/**
 * One list line → a RegExp over a repo-relative, forward-slashed path.
 *
 * SPLIT on `**` rather than substituting a placeholder for it. The obvious
 * implementation — swap `**` for a sentinel, expand `*`, swap the sentinel back —
 * needs a character that cannot occur in a path, and the first attempt here used
 * a literal NUL, which is both a lint error and the kind of byte nobody expects
 * to find in a source file. Splitting needs no sentinel at all: each segment
 * between `**` is escaped and gets the single-star rule, and the joins are the
 * cross-segment wildcards.
 */
export function patternToRegExp(pattern) {
  const body = pattern
    .trim()
    .split('**')
    .map((part) =>
      // Escape everything regex-special, THEN re-introduce the single-star form,
      // so a `.` in a filename stays a literal dot rather than "any character".
      part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${body}$`);
}

/** The list, comments and blanks stripped. */
export function readPatterns(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0);
}

/** Which of `stagedPaths` the `patterns` forbid. Empty ⇒ the commit may proceed. */
export function offendingPaths(stagedPaths, patterns) {
  const res = patterns.map(patternToRegExp);
  return stagedPaths.filter((p) => res.some((re) => re.test(p)));
}
