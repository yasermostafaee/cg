# Tasks — Skip heavy CI for docs-only PRs (P-008)

## 1. Workflow

- [x] 1.1 `.github/workflows/pr.yml` — add a first `changes` job (dorny/paths-filter@v3) that outputs `code: 'true'|'false'`, STRICT: `code` is true unless EVERY changed path matches `openspec/**` / `docs/**` / `**/*.md`.
- [x] 1.2 Gate the existing `ci` job: `needs: changes` + `if: needs.changes.outputs.code == 'true'`.
- [x] 1.3 Gate the existing `e2e` job the same way.
- [x] 1.4 Add a light `docs-check` job: install deps, run `pnpm openspec validate --all --strict` + `pnpm format:check`.
- [x] 1.5 Add a final `required` aggregator job: `needs: [changes, ci, e2e, docs-check]`, `if: always()`, passing iff (code=='false' ? docs-check succeeded : ci+e2e succeeded), failing on any needed failure.

## 2. Docs / spec

- [x] 2.1 Capability spec `specs/platform-ci/spec.md` (ADDED) — one `#### Scenario` per P-008 Acceptance bullet.
- [x] 2.2 design.md documents the **manual** branch-protection change (require `required`, drop the old `ci` / `e2e` requirements).

## 3. Gate + handoff

- [x] 3.1 `pnpm openspec validate skip-ci-for-docs-only --strict`.
- [x] 3.2 `pnpm format:check`; `pr.yml` confirmed valid YAML (prettier parses it).
- [ ] 3.3 Commit `ci: skip heavy jobs for docs-only PRs (P-008)`; push. This PR touches `pr.yml` (non-docs) so it runs the FULL gate itself.
- [ ] 3.4 After merge: do the manual branch-protection step (design.md). Do NOT archive until confirmed.
