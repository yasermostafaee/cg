/**
 * P-030 — decide whether a `push` to `main` may REUSE a prior run's verdict
 * instead of re-running the heavy gate against a tree that already has one.
 *
 * `dev` -> `main` is a `--ff-only` merge, so `main`'s new HEAD is the SAME COMMIT
 * as `dev`'s tip: same SHA, same tree, and a full run has usually already passed
 * on it. `[skip ci]` cannot help — a fast-forward creates no commit whose message
 * could carry it — so the decision has to be made from the Actions API.
 *
 * 🔴 **GREEN IS NOT ENOUGH — a prior run can be green having SKIPPED the E2E.**
 * `e2e` is gated on `needsE2e` (P-029), so a docs-only push to `dev` produces a
 * completed, successful run in which nothing heavy executed. The merge run is
 * precisely the COMPLETENESS BACKSTOP that catches the day's render changes, so
 * the prior run must have actually EXECUTED what this run would need.
 *
 * 🔴 **AND GREEN ON THE RIGHT *KIND* OF RUN IS ALSO PART OF THE MATCH.** The whole
 * safety argument is about the **TREE** a prior run verified: classification gates
 * WHETHER the heavy jobs run, but the jobs themselves are whole-tree, so a run
 * that EXECUTED both verifies the tree at that SHA. That argument holds for a
 * `push` run, which tests the tree of that exact commit — and NOT for a
 * `pull_request` run, which checks out `refs/pull/N/merge`: its `head_sha` names
 * the commit, but the tree it tested is `merge(head, base)`. Those are the same
 * tree only while base is already an ancestor of head. When they diverge — a
 * squash-merged PR, a base that advanced independently of `dev` — a
 * `pull_request` run is green about a tree that may never land, and reusing it
 * would skip the backstop on that strength. Candidates are therefore `push` runs
 * ONLY, which ELIMINATES the ancestry assumption rather than documenting it.
 *
 * The event check is POSITIVE: only `event === 'push'` qualifies. A missing,
 * empty, or unrecognised `event` is an uncertainty, not a permission — it is
 * never written as `!== 'pull_request'`, because that phrasing turns every event
 * GitHub adds later into an automatic pass.
 *
 * Every uncertainty resolves to "run everything". This function may only ever
 * return `reuse: true` on a positive, complete match.
 *
 * It is pure and takes already-fetched payloads so the rule can be tested against
 * REAL API responses rather than mocked shapes — see `tests/reuse-decision.test.ts`.
 */

/**
 * The jobs whose execution the merge run would otherwise repeat, keyed by the
 * `name:` they carry in `.github/workflows/pr.yml`.
 *
 * ⚠ Matched BY NAME, because the jobs API exposes no stable per-job key. A rename
 * in the workflow that is not mirrored here does NOT silently disable the check:
 * the name simply will not be found, which is an uncertainty, which runs
 * everything. That is the safe direction, and it is why the lookup is strict.
 */
export const REQUIRED_JOB_NAMES = ['Lint • Typecheck • Test • Build', 'E2E (Playwright)'];

/** A job counts only if it actually finished AND actually succeeded. */
function jobSucceeded(job) {
  return job?.status === 'completed' && job?.conclusion === 'success';
}

/**
 * @param {object} input
 * @param {unknown} input.runs           `workflow_runs` for this workflow at this head_sha.
 *   Each entry's `event` is read: only `'push'` is reusable (see the header).
 * @param {(runId: number) => unknown} input.jobsFor  jobs for a candidate run, or null/undefined.
 * @param {number|string} input.currentRunId          this run, which can never verify itself.
 * @returns {{reuse: boolean, reason: string, priorRunUrl: string|null, priorRunId: number|null}}
 */
export function decideReuse({ runs, jobsFor, currentRunId }) {
  const no = (reason) => ({ reuse: false, reason, priorRunUrl: null, priorRunId: null });

  if (!Array.isArray(runs)) return no('the runs payload was not a list (API error or no permission)');
  if (runs.length === 0) return no('no prior run exists for this head_sha');

  const current = String(currentRunId ?? '');
  // A cancelled or in-progress run is NOT A RESULT: `concurrency` cancels PR runs
  // and a burst can supersede a queued one, so `conclusion` is checked explicitly
  // rather than inferred from the run merely existing.
  const green = runs
    .filter((r) => String(r?.id) !== current)
    .filter((r) => r?.status === 'completed' && r?.conclusion === 'success');

  if (green.length === 0) {
    return no(`no COMPLETED, SUCCESSFUL prior run for this head_sha (${runs.length} run(s) seen)`);
  }

  // 🔴 POSITIVE, and deliberately not `!== 'pull_request'`. A `push` run tests the
  // tree of THIS commit; a `pull_request` run tests `merge(head, base)`, which is
  // the same tree only while base is an ancestor of head. An absent or unfamiliar
  // `event` is an uncertainty, and uncertainties run everything — writing this as
  // the absence of a known-bad value would make every event GitHub adds later an
  // automatic pass.
  const candidates = green.filter((r) => r?.event === 'push');

  if (candidates.length === 0) {
    return no(
      `no COMPLETED, SUCCESSFUL PUSH run for this head_sha ` +
        `(${runs.length} run(s) seen, ${green.length} green, ` +
        `all ${green.length} dropped as non-push) — only a \`push\` run tests this ` +
        `commit's own tree, so this run does the work`,
    );
  }

  for (const run of candidates) {
    const payload = jobsFor(run.id);
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : Array.isArray(payload) ? payload : null;
    if (jobs === null) {
      return no(`could not read the jobs of prior run ${String(run.id)}`);
    }
    const missing = REQUIRED_JOB_NAMES.filter(
      (name) => !jobSucceeded(jobs.find((j) => j?.name === name)),
    );
    if (missing.length === 0) {
      return {
        reuse: true,
        reason: `prior push run ${String(run.id)} is completed+successful and RAN both ${REQUIRED_JOB_NAMES.join(' and ')}`,
        priorRunUrl: typeof run.html_url === 'string' ? run.html_url : null,
        priorRunId: run.id ?? null,
      };
    }
    // The backstop case, named explicitly in the log so a human reading a merge
    // run that DID work understands why it did.
    return no(
      `prior run ${String(run.id)} was green but did not RUN: ${missing.join(', ')} ` +
        `(skipped or failed) — this run is the completeness backstop for it`,
    );
  }

  return no('no candidate run satisfied the match');
}
