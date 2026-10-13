/**
 * P-030 — the typed surface of `../src/reuse-decision.mjs` (plain zero-dep ESM, no
 * build). The wildcard specifier lets the tests import the .mjs by relative path
 * while `tsc` checks every call against this contract; if the module's API drifts,
 * update BOTH files in the same change.
 */
declare module '*reuse-decision.mjs' {
  /** The workflow job names whose execution a reused run must already have done. */
  export const REQUIRED_JOB_NAMES: readonly string[];

  export interface ReuseDecision {
    /** Only ever true on a POSITIVE, COMPLETE match — never on the absence of a negative. */
    reuse: boolean;
    /** Human-readable, and reported with the URL so a "did nothing" run is legible. */
    reason: string;
    priorRunUrl: string | null;
    priorRunId: number | null;
  }

  /**
   * One entry of `workflow_runs`, as the guard reads it. Consumed as `unknown` so a
   * shape the API never sent fails safe rather than throwing; this interface exists to
   * name the fields the rule depends on.
   */
  export interface ReuseCandidateRun {
    id?: number;
    status?: string;
    conclusion?: string | null;
    /**
     * The trigger. ONLY `'push'` is reusable: a `push` run tests the tree of that exact
     * commit, while a `pull_request` run tests `refs/pull/N/merge`. Read POSITIVELY —
     * absent, empty, or unrecognised is an uncertainty, never a permission.
     */
    event?: string;
    html_url?: string;
  }

  export interface ReuseInput {
    /**
     * `workflow_runs` for this workflow at this `head_sha` — see {@link ReuseCandidateRun}
     * for the fields read. Anything else fails safe.
     */
    runs: unknown;
    /** Jobs for a candidate run — `null`/`undefined` is an uncertainty, so it fails safe. */
    jobsFor: (runId: number) => unknown;
    /** This run, which can never verify itself. */
    currentRunId: number | string | undefined;
  }

  export function decideReuse(input: ReuseInput): ReuseDecision;
}
