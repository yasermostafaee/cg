/**
 * `GUARDS-18` §2 — the typed surface of `../src/untracked-sweep-decision.mjs` (plain
 * zero-dep ESM, no build). Same convention and same obligation as
 * `never-stage-decision.d.ts`: if the module's API drifts, update BOTH files in the same
 * change.
 */
declare module '*untracked-sweep-decision.mjs' {
  /** The adopt escape, parsed: a blanket `all`, or an explicit set of paths. */
  export interface AdoptList {
    all: boolean;
    paths: Set<string>;
  }

  /** One baseline file → the set of paths it records. */
  export function parseBaseline(text: string): Set<string>;
  /** The set of paths → the baseline file's text. Sorted, so a diff of it reads. */
  export function serializeBaseline(paths: Set<string>): string;
  /** `1` / `all`, or a comma- or whitespace-separated list of paths. */
  export function parseAdoptList(raw: string | undefined): AdoptList;
  /** Which staged additions were already untracked — the paths a sweep would have taken. */
  export function sweptPaths(
    stagedAdditions: readonly string[],
    baseline: Set<string>,
    adopt?: AdoptList,
  ): string[];
}
