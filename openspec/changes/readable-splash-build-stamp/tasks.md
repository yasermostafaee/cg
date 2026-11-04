# Tasks

## 1. Shared splash identity

- [x] 1.1 Label release version, Git revision and build date in the shared formatter.
- [x] 1.2 Keep development and `nogit` fallbacks truthful.
- [x] 1.3 Update shared and app splash tests.

## 2. Verification

- [ ] 2.1 Run focused checks, full gate and both splash E2E suites.

Integration follow-up, 2026-11-05: the merged formatter had labelled Version and Built but omitted
Revision, contrary to this accepted contract. The shared formatter now retains all available
identity values as `Version … · Revision … · Build date …`, without changing the structured build
object or advertising `0.0.0`/`nogit` as available identity. Four deterministic unit cases cover
release/source-only/no-Git/unavailable combinations; both browser assertions require the labelled
release identity. All four unit cases pass; the fresh 18-task app dependency build passes, as do
both complete splash browser suites within the integration batches. Both Designer TypeScript realms,
Runtime and splash-kit typechecks pass; splash-kit lint passes. The full repository gate and
carrying-commit Linux result are still owed and are not inferred from these focused checks.
