# Tasks — the host-wide gate lock (P-013)

## 1. The pure lock logic + its unit tests

- [x] 1.1 New `tools/gate-hook/src/gate-lock.mjs`: `hostLockPath` (host-global resource
      under `os.tmpdir()`), `resolveLockConfig` (stale / wait / poll, with
      `CG_GATE_LOCK_*` overrides that can only fall back to defaults), `isLockHeldError`,
      `lockOptions`, `GateLockTimeoutError`, the `acquireLock` wait loop (side effects —
      `lock`/`sleep`/`now`/`log` — injected), and `runUnderLock` (dynamic-import
      `proper-lockfile`, acquire, run child, release in `finally`).
- [x] 1.2 Typed surface `tools/gate-hook/types/gate-lock.d.ts`, matching the P-010 / B-098
      wildcard-module convention; update BOTH files if the API drifts.
- [x] 1.3 `tools/gate-hook/tests/gate-lock.test.ts` — 31 tests: path/config/error helpers,
      the acquire loop (immediate, wait-while-held + announce-once, timeout, re-throw a
      non-held error without waiting), `runUnderLock` (release on success, release on
      throw, propagate timeout without running, degrade to unserialized on missing lib and
      on a non-timeout failure), and one REAL `proper-lockfile` on-disk round-trip.

## 2. The launcher (plumbing only)

- [x] 2.1 New `tools/gate-hook/src/gate-lock-cli.mjs`: read the gate command from argv,
      acquire the host slot via `runUnderLock`, spawn the gate as a child with inherited
      stdio, forward interrupts to the child, forward the exit code, and translate a wait
      timeout into a clear non-zero error. Fail closed on the child, fail open on the lock.

## 3. Wire-up — one chokepoint, every entry point

- [x] 3.1 Root `package.json`: split the gate chain into `gate:run` / `gate:e2e:run` and
      make `gate` / `gate:e2e` route through `gate-lock-cli.mjs pnpm run <inner>`. Every
      entry point (direct, pre-push, Stop hook) inherits the lock; no per-caller copy.
- [x] 3.2 `tools/gate-hook/package.json`: `proper-lockfile` as a runtime dependency;
      `pnpm install`.
- [x] 3.3 `tools/gate-hook/eslint.config.mjs`: lint `scripts/**/*.mjs` with node globals so
      the evidence script is covered.
- [x] 3.4 Comment-only notes in `.husky/pre-push` and `.claude/hooks/gate-stop.mjs`
      pointing a reader at the serialization and the single-chokepoint principle.

## 4. Cross-process evidence

- [x] 4.1 New `tools/gate-hook/scripts/two-process-lock-check.mjs`: two worker processes
      contend for one temp lock; assert the second announces the wait and acquires only
      after the first releases. Kept OUT of the gate's vitest run so it never adds
      cross-process load (B-098). Run by hand:
      **PASS — worker A held ~2.5 s; worker B started 0.4 s in, printed
      "waiting for host gate slot…", and acquired 77 ms AFTER A released.**

## 5. Docs

- [x] 5.1 `CLAUDE.md`: the gate section notes the host lock (P-013); the `pnpm gate`
      description reflects the `gate` → lock → `gate:run` indirection so it is not
      "simplified" back to the inline chain (which would remove the lock).
- [x] 5.2 `docs/prd/platform.md`: P-013 `[ ] → [~]` with the mechanism, evidence, and the
      owner-confirmation-owed note.
- [x] 5.3 This OpenSpec change (proposal / design / spec delta / tasks).

## 6. Gate

- [x] 6.1 `tools/gate-hook` typecheck + lint + test green (142 tests, 31 new).
- [x] 6.2 Full `pnpm gate` green — this run goes through the new lock AND B-098's bound.
- [x] 6.3 `pnpm openspec validate platform-host-gate-lock --strict` and
      `pnpm openspec validate --all --strict`.
- [x] 6.4 `gate:e2e` NOT owed: no path in this change matches `UI_RENDER_PATTERNS`; the
      change adds host serialization around execution only, no renderer/render surface.

## 7. To reach [x] + archive

- [x] 7.1 Owner confirms cross-worktree serialization in real use — run `pnpm gate` in one
      worktree, start it in another, observe the second print "waiting for host gate slot…"
      and proceed only when the first releases.
      **EVIDENCE (owner, 2026-07-23): confirmed in real use — with a gate running in one
      worktree, a gate started in another worktree WAITED for the host slot ("waiting for
      host gate slot…") instead of racing it, and proceeded only after the first released.**
