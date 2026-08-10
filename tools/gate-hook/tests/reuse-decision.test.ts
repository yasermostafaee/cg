import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideReuse, REQUIRED_JOB_NAMES } from '../src/reuse-decision.mjs';

/**
 * P-030 — the merge-run reuse guard.
 *
 * ⭐ **The fixtures are REAL Actions API responses from this repository**, captured
 * with `gh api` from three actual runs on `dev`, so the rule is exercised against
 * the shapes GitHub really returns rather than shapes invented here:
 *
 *   - `both-ran`   — c16d25f, run 31408479929: `ci` AND `e2e` both ran, both green.
 *   - `docs-only`  — 7237b70, run 31411394748: green, but BOTH heavy jobs `skipped`
 *                    (P-029 classified the diff as unable to affect rendering).
 *   - `e2e-failed` — ab7d12e, run 31406199136: `ci` green, `e2e` `failure`.
 *
 * The middle one is the case the whole guard exists to get right: a completed,
 * successful run that proves nothing about the E2E.
 */

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

interface Runs {
  workflow_runs: { id: number }[];
}

const runsOf = (name: string): unknown => (fixture(`runs-${name}`) as Runs).workflow_runs;
const jobsOf = (name: string) => (): unknown => fixture(`jobs-${name}`);

/** No candidate run may ever be this run — a run cannot verify itself. */
const OTHER_RUN = 99999999999;

describe('P-030 — reuse only on a positive, complete match', () => {
  it('REUSES when the prior run is green and RAN both heavy jobs', () => {
    const d = decideReuse({
      runs: runsOf('both-ran'),
      jobsFor: jobsOf('both-ran'),
      currentRunId: OTHER_RUN,
    });
    expect(d.reuse).toBe(true);
    expect(d.priorRunUrl).toBe('https://github.com/yasermostafaee/cg/actions/runs/31408479929');
    // Constraint 5 — the reason must name the run, so a green merge run that did
    // nothing is never indistinguishable from one that passed.
    expect(d.reason).toContain('31408479929');
  });

  it('🔴 does NOT reuse a green run whose e2e was SKIPPED — the backstop case', () => {
    // A docs-only push to `dev` produces exactly this: completed, successful, and
    // no evidence at all about the suite. The merge run must still do the work.
    const d = decideReuse({
      runs: runsOf('docs-only'),
      jobsFor: jobsOf('docs-only'),
      currentRunId: OTHER_RUN,
    });
    expect(d.reuse).toBe(false);
    expect(d.priorRunUrl).toBeNull();
    expect(d.reason).toContain('E2E (Playwright)');
    expect(d.reason).toContain('backstop');
  });

  it('does not reuse when the prior run FAILED its e2e', () => {
    // Belt and braces: the run-level `conclusion` already excludes this one, so
    // the job-level check is asserted against a run whose overall verdict is a
    // failure to prove the two filters are independent.
    const runs = (runsOf('e2e-failed') as { conclusion: string }[]).map((r) => ({
      ...r,
      conclusion: 'success',
    }));
    const d = decideReuse({ runs, jobsFor: jobsOf('e2e-failed'), currentRunId: OTHER_RUN });
    expect(d.reuse).toBe(false);
    expect(d.reason).toContain('E2E (Playwright)');
  });

  it('does not reuse a run whose overall conclusion is not success', () => {
    expect(
      decideReuse({
        runs: runsOf('e2e-failed'),
        jobsFor: jobsOf('e2e-failed'),
        currentRunId: OTHER_RUN,
      }).reuse,
    ).toBe(false);
  });
});

describe('P-030 — every uncertainty runs everything', () => {
  const cases: [string, Parameters<typeof decideReuse>[0]][] = [
    [
      'the API returned an error object rather than a list',
      { runs: { message: 'Not Found' }, jobsFor: () => null, currentRunId: OTHER_RUN },
    ],
    ['the runs list is empty', { runs: [], jobsFor: () => null, currentRunId: OTHER_RUN }],
    [
      'the only run is still in progress',
      {
        runs: [{ id: 1, status: 'in_progress', conclusion: null }],
        jobsFor: () => null,
        currentRunId: OTHER_RUN,
      },
    ],
    [
      'the only run was CANCELLED — neither a pass nor a fail',
      {
        runs: [{ id: 1, status: 'completed', conclusion: 'cancelled' }],
        jobsFor: () => null,
        currentRunId: OTHER_RUN,
      },
    ],
    [
      'the jobs of the candidate could not be read',
      {
        runs: [{ id: 1, status: 'completed', conclusion: 'success' }],
        jobsFor: () => null,
        currentRunId: OTHER_RUN,
      },
    ],
    [
      'a required job name is absent (a workflow rename this module did not mirror)',
      {
        runs: [{ id: 1, status: 'completed', conclusion: 'success' }],
        jobsFor: () => ({
          jobs: [{ name: 'Renamed CI', status: 'completed', conclusion: 'success' }],
        }),
        currentRunId: OTHER_RUN,
      },
    ],
  ];

  it.each(cases)('%s → run everything', (_label, input) => {
    const d = decideReuse(input);
    expect(d.reuse).toBe(false);
    expect(d.priorRunUrl).toBeNull();
    expect(d.reason.length).toBeGreaterThan(0);
  });

  it('a run can never verify ITSELF', () => {
    // Without this the guard would find its own completed record on a re-run and
    // skip the work it was re-run to do.
    const runs = runsOf('both-ran') as { id: number }[];
    const d = decideReuse({
      runs,
      jobsFor: jobsOf('both-ran'),
      currentRunId: runs[0]?.id as number,
    });
    expect(d.reuse).toBe(false);
  });
});

describe('P-030 — the job names the guard depends on', () => {
  it('matches the names the workflow actually gives those jobs', () => {
    // Read from the workflow itself, so a rename there fails HERE rather than
    // silently turning the guard into a permanent "run everything".
    const wf = readFileSync(new URL('../../../.github/workflows/pr.yml', import.meta.url), 'utf8');
    for (const name of REQUIRED_JOB_NAMES) {
      expect(wf, `pr.yml no longer has a job named "${name}"`).toContain(`name: ${name}`);
    }
  });
});
