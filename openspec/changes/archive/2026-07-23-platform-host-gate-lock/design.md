# Design — the host-wide gate lock (P-013)

## The failure it closes, concretely

Two gates, one host, no interlock. The sharpest instance is the double-fire: `git push`
runs `.husky/pre-push` → `pnpm gate`, and a Claude Code turn ending at the same moment runs
`.claude/hooks/gate-stop.mjs` → `pnpm gate`. Both are full gates in ONE worktree. vitest's
coverage writes to a shared `.tmp/` under the workspace; two runs interleave their
create/read/unlink of the same paths and one dies with a bare `ENOENT` that looks like a
product regression (B-097). The cross-worktree variant is milder but the same shape: two
worktrees on one machine, both gating, both fanning out — CPU starvation between gates that
B-098's within-gate cap cannot see.

The remedy is a mutual-exclusion the machine enforces, not a rule a session must remember.

## Why a lock, and why `proper-lockfile`

A gate is a coarse, minutes-long critical section; an advisory file lock is exactly the
right tool. Hand-rolling one correctly across Windows + POSIX is deceptively hard — atomic
create, stale detection when a holder is `kill -9`'d, the compromised-lock case where a
stale lock is stolen while the original holder revives. `proper-lockfile` solves all three
with a portable, mtime-based scheme: it creates a `<resource>.lock` directory atomically,
refreshes the holder's mtime every `stale/2` while alive, treats a lock older than `stale`
as abandoned and steals it, and calls `onCompromised` if a lock we hold is stolen out from
under us. No PID guessing (PIDs are reused and are not portable liveness), no lockfile
content parsing.

This is the one `gate-hook` module that carries a runtime dependency, and the boundary is
principled: the DECISION modules (`gate-decision`, `pre-push-decision`, `test-concurrency`)
decide whether/what to gate and must run on a fresh clone before `pnpm install`, so they
stay zero-dependency. This module runs the gate ITSELF, which cannot run without
`node_modules` present anyway (turbo, vitest, prettier, openspec) — so it may lean on an
installed package. It is loaded by dynamic `import()` so that even a botched install
degrades to an unserialized run rather than crashing the sole enforcement mechanism.

## Where the lock is applied — one chokepoint, not each caller

Every gate entry point funnels through the `gate` / `gate:e2e` package.json scripts:

- a direct `pnpm gate` / `pnpm gate:e2e`,
- `.husky/pre-push` → `pnpm gate`,
- the Stop hook → `pnpm gate` (+ `pnpm gate:e2e` on UI/render diffs).

So the lock wraps THOSE two scripts and every entry point inherits it. The scripts are
split so the lock is a clean outer layer:

    gate:run      = <the existing gate chain: bounded-turbo-cli … && format:check && openspec validate>
    gate          = gate-lock-cli.mjs  pnpm run gate:run
    gate:e2e:run  = turbo run test:e2e … --concurrency=1
    gate:e2e      = gate-lock-cli.mjs  pnpm run gate:e2e:run

Wrapping each call site separately was rejected on the B-100 / P-012 principle: a second
(then third) copy of "hold the gate slot" is how one copy drifts and the rule quietly comes
to mean different things in different places. One implementation, one place, every caller
through it.

The lock is the OUTER layer over B-098's `bounded-turbo-cli`, never a replacement: the lock
serializes gates against each other (host scope); B-098 bounds one gate's worker fan-out
(intra-gate scope). Removing either re-opens a distinct load hazard.

## The lock resource, and why it is host-global

`hostLockPath(os.tmpdir())` → `<tmpdir>/cg-platform-gate` (proper-lockfile appends `.lock`).
A FIXED path under the OS temp dir, outside every worktree, is the whole point: the three
worktrees must resolve to the SAME lock to serialize against each other. A per-worktree path
would let them run concurrently — exactly what this prevents. The name is distinctive to
this project, so an unrelated checkout does not share the slot while these worktrees do.

## The numbers, and why each is where it is

    stale        = 5 min   (proper-lockfile refreshes every stale/2 = 2.5 min while alive)
    wait timeout = 15 min
    poll         = 750 ms

- **stale (5 min) < wait timeout (15 min)**, deliberately: a LIVE gate — even a ~6-min
  `gate:e2e`, even a CPU-starved one — keeps refreshing its mtime and never goes stale, so
  it is never falsely stolen (which would fire `onCompromised` and re-open the double-run).
  Only a CRASHED holder stops refreshing; then any waiter reclaims the slot after 5 min,
  comfortably inside its 15-min wait. If stale were ABOVE the wait timeout, a crashed holder
  would deadlock the host until the waiter gave up.
- **wait timeout (15 min)** is generous — a legitimate gate ahead is 2–6 min — but finite,
  so a genuinely stuck gate surfaces as a clear error instead of an infinite hang.
- All three are overridable via `CG_GATE_LOCK_{STALE,WAIT,POLL}_MS`, mainly so the scripted
  two-process check runs in seconds; an unusable override falls back to the default.

## Fail-safety is asymmetric on purpose

While Actions billing is out, this gate is the ONLY landing gate. The lock must never be the
thing that lets an unchecked push through, nor the thing that refuses to check a legitimate
one:

- library missing / non-timeout acquisition error → warn, run the gate WITHOUT
  serialization. Enforcement is preserved; only the (rare) concurrency guarantee is dropped.
- wait timeout (a stuck gate) → THROW, do not run. A 15-min-held slot is abnormal and a
  human should see it, not have a second gate pile on behind it.
- our held lock compromised mid-gate → shout on stderr, keep running. Losing a nearly-done
  gate's result is worse than the extremely rare concurrent run the warning flags.
- the child gate itself → fail CLOSED as always: a spawn error or signal death reads as
  exit 1, never as a green gate.

## Testing strategy

The acquire/wait/timeout/release LOGIC is pure with its side effects injected (`lock`,
`sleep`, `now`, `log`), so 31 unit tests pin it deterministically with no real filesystem or
clock — including "waits while held then acquires", "announces exactly once", "times out",
"re-throws a non-held error immediately", "releases even when the gate throws", and the
fail-open degrade paths. One test drives the REAL `proper-lockfile` through `runUnderLock`
on a unique temp resource and asserts the `<resource>.lock` directory exists during the run
and is gone after — proving the wiring genuinely holds and frees a lock on disk, in a single
process with no timing sensitivity, isolated from the actual host lock the parent gate holds.

Genuine cross-PROCESS serialization is proved by `scripts/two-process-lock-check.mjs`, run by
hand for evidence (kept OUT of the gate's vitest run so it never adds the cross-process load
B-098 warns about): two worker processes contend for one temp lock; the second announces the
wait and only acquires after the first releases.

## Alternatives considered

- **Wrap each entry point (pre-push, Stop hook) in its own lock call.** Rejected — a second
  and third copy of the rule (B-100 / P-012). One chokepoint, inherited by all.
- **Hand-rolled PID lockfile.** Rejected — PIDs are reused and not portable liveness;
  cross-platform atomic create + stale + compromised handling is what `proper-lockfile`
  already gets right.
- **Fail the gate when the lock is unavailable.** Rejected — that lets the enforcement
  mechanism block a legitimate push, inviting `--no-verify`. Degrade to unserialized
  instead; only a stuck slot errors.
- **Serialize `pnpm test` too.** Out of scope — the hazard is two GATES (coverage tmp +
  cross-worktree load). `pnpm test` alone is a dev convenience and is left unwrapped.
