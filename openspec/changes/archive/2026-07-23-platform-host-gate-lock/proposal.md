# Serialize the gate to one-per-host with an advisory lock (P-013)

## Why

The standing rule is stated but not enforced: **never two gates running concurrently on
this host.** P-010 already names it — "this host's exclusive gate slot" — yet nothing
holds anyone to it. It has been discipline, and discipline has a known failure:

- **The pre-push / Stop-hook double-fire.** A `git push` fires `.husky/pre-push` →
  `pnpm gate` at (or near) the same moment a Claude Code turn end fires
  `.claude/hooks/gate-stop.mjs` → `pnpm gate`. Two full gates then run in the SAME
  worktree at once and race on vitest's shared coverage `.tmp/` directory — the bare
  `ENOENT` that reads exactly like a product regression (B-097). B-097's own note is
  blunt about it: "Never background a push … two gates in one workspace collide over
  vitest's shared coverage tmp dir."
- **Cross-worktree contention.** The three worktrees (`cg`, `cg-designer`, `cg-runtime`)
  share one machine. Two of them gating at once is the same CPU-starvation load class
  B-098 just bounded WITHIN a gate — only now BETWEEN gates, where B-098's per-gate cap
  cannot see it.

Both are the same shape: two gates, one host, no interlock. B-098 bounded a gate's fan-out
to the machine; this bounds the machine to one gate.

## What Changes

- **A host-wide advisory lock wraps gate execution.** A new `tools/gate-hook/gate-lock.mjs`
  (pure decision logic) + `gate-lock-cli.mjs` (plumbing) acquire an exclusive lock at a
  stable HOST-GLOBAL path under `os.tmpdir()` — outside every worktree, so all three
  resolve to the same lock — run the gate as a child while holding it, and release on the
  way out. Backed by `proper-lockfile` (cross-platform stale + compromised-lock handling)
  rather than a hand-rolled PID file.
- **When the slot is held, a second gate WAITS** (announcing "waiting for host gate slot…"
  once), polling until the holder releases, then proceeds — up to a generous 15-minute
  timeout that then ERRORS with a clear message rather than hanging forever.
- **The lock lives at the ONE chokepoint every entry point funnels through** — the `gate`
  and `gate:e2e` package.json scripts. A direct `pnpm gate`, the pre-push hook, and the
  Stop hook all invoke those scripts, so all of them serialize through a SINGLE lock
  implementation. Wrapping each caller separately would be a second (then third) copy of
  the same rule — precisely the "one canonical predicate, never a local re-derivation"
  hazard CLAUDE.md rule 6 and P-012 exist to forbid.
- **The lock WRAPS B-098's `bounded-turbo-cli`; it does not replace it.** Two load
  controls at different scopes: this bounds how many gates run at once on the machine;
  B-098 bounds how many test workers ONE gate may fork.

Deliberately NOT done, and why:

- **No change to WHAT any gate checks, any test timeout, or the P-010 deletion carve-out.**
  This adds serialization AROUND execution only. A longer timeout was B-073's remedy and
  B-098 is that failing; a lock is orthogonal to both.
- **No second lock at each call site.** The pre-push hook and the Stop hook inherit the
  lock by invoking the wrapped scripts — they do not re-implement it.
- **The lock never DEFEATS the gate.** While GitHub Actions billing is out the gate is the
  sole landing gate, so a missing `proper-lockfile` or a non-timeout acquisition failure
  DEGRADES to an unserialized run (with a warning) rather than refusing to check the push.
  Only a genuine 15-minute-held slot — a stuck gate — errors out instead of running.

## Impact

- Affected spec: `platform-local-gate` — one ADDED requirement (a host runs at most one
  gate at a time).
- Affected code: `tools/gate-hook/src/gate-lock.mjs` (new, pure + orchestrator),
  `tools/gate-hook/src/gate-lock-cli.mjs` (new, plumbing),
  `tools/gate-hook/types/gate-lock.d.ts` (new), `tools/gate-hook/tests/gate-lock.test.ts`
  (new, 31 tests), `tools/gate-hook/scripts/two-process-lock-check.mjs` (new, scripted
  cross-process evidence), `tools/gate-hook/package.json` (+`proper-lockfile`),
  `tools/gate-hook/eslint.config.mjs` (lint `scripts/**/*.mjs` with node globals), root
  `package.json` (`gate`/`gate:e2e` route through the lock via inner `gate:run`/
  `gate:e2e:run`).
- Comment-only notes in `.husky/pre-push` and `.claude/hooks/gate-stop.mjs` so a reader
  sees the serialization without hunting for it.
- **No test file, timeout, or product source changed.** The gate's shape is otherwise
  preserved: still one uncached `turbo … --force` reporting `0 cached, 82 total`, still
  with the `format:check` + `openspec validate` tail, still B-098-bounded inside.
- Evidence: 31 unit tests (acquire / wait-when-held / timeout / release / fail-open),
  one real-`proper-lockfile` on-disk round-trip, and a two-process script proving a
  second process waits for the slot and only acquires after the first releases (measured:
  B acquired 77 ms after A released, having announced the wait).
