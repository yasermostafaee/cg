# Design: Current Designer/gallery preview integration

## Boundaries

The requested deliverable is one local browser preview containing both the current Designer and the
latest reviewed gallery. Integration takes place in the existing isolated worktree. The owner's
working checkout, original project files and unrelated uncommitted work stay untouched.

The common source base is `01719158`. Gallery work was checkpointed as `6770f8d4` and `db80eaf4`
before the selected owner browser/shared/docs paths were reconciled. These identifiers describe
provenance, not test approval. No private machine paths or source-project copies are published.

## Conflict decisions

- Retain the owner's more detailed current Designer contracts and all queued/in-progress features.
- Keep the latest gallery decisions: Persian-only titles, owner-refined league, visible weather
  choices, centered equal temperature columns, one-pass city weather, clean wide Quran slides,
  persistent Azan announcement, replaceable APASAI images and smooth gallery motion.
- Preserve ordinary Canvas lifecycle behavior, static authored display projection, no observer-to-
  scrub feedback, current Preview data dialogs, and row-effect lifecycle regressions.
- Keep original task checks as historical implementation/test records. Add explicit pending
  integrated validation rather than relabeling prior results as proof of this combined snapshot.
- Keep one PRD entry per existing ID. D-179 links this integration; D-180 combines the detailed
  structured-data contract with standalone Repeaters and the current D-198 File-only policy.

## Scope exclusions

Native/Tauri changes, installers, releases, and CG Control-only WIP are not part of this local
preview integration. Shared dependencies necessary for the Designer still belong in scope and must
retain compatibility; that is not permission to copy unrelated station behavior.

## Validation and owner review

Strict OpenSpec validation checks the reconciled documentation. The merged source separately needs
typecheck, lint, tests, build and real-browser checks for the updated shell and gallery together.
Rebuild the served bundle before refreshing Designer; static screenshots and earlier green checks
cannot establish that the browser is showing the merged revision. Linux E2E is discharged only by
a completed green run for the final carrying commit, with its URL recorded in tasks.
