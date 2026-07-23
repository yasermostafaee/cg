# platform-local-gate — delta (host-wide gate lock, P-013)

## ADDED Requirements

### Requirement: A host runs at most one gate at a time

The local gate SHALL acquire a host-wide exclusive lock before it runs and SHALL hold it
for the gate's whole duration, so that no two gates ever run concurrently on the same host.
This governs every gate entry point — a direct `pnpm gate` or `pnpm gate:e2e`, the
`.husky/pre-push` invocation, and the P-009 Stop hook's gate runs — and it SHALL be applied
at the single script boundary those entry points funnel through, NOT re-implemented per
caller (a second copy of the rule is how the rule comes to mean different things in
different places).

The lock resource SHALL live at a stable, host-global path outside every worktree, so that
all worktrees sharing the host serialize against one another rather than each taking a
private slot. The lock SHALL wrap — and SHALL NOT replace — the within-gate test-fan-out
bound (B-098): the two are load controls at different scopes, one between gates and one
inside a gate.

Adding this serialization SHALL NOT change what any gate checks, any test timeout, or the
deletion carve-out that decides WHEN the pre-push gate runs. It adds mutual exclusion around
execution only.

Because the local gate is the sole landing gate while remote CI is unavailable, the lock
SHALL fail safe asymmetrically: a lock mechanism that is unavailable or errors on
acquisition SHALL degrade to running the gate WITHOUT serialization rather than refusing to
gate, while a slot that stays held past a bounded wait SHALL surface a clear error rather
than hanging forever. The gated command itself SHALL continue to fail closed — a spawn
failure or a signal death reads as a failed gate, never a passing one.

#### Scenario: A second gate waits rather than running concurrently

- **WHEN** a gate is invoked while another gate already holds the host slot
- **THEN** the second gate announces that it is waiting, blocks until the holder releases,
  and only then runs — it never runs concurrently with the first

#### Scenario: The slot is released on every exit path

- **WHEN** a gate that holds the slot finishes — whether it passed, failed, or threw
- **THEN** the slot is released, so the next waiter can proceed

#### Scenario: A crashed holder does not deadlock the host

- **WHEN** the process holding the slot dies without releasing it
- **THEN** the lock becomes reclaimable after a staleness window shorter than the wait
  timeout, so a waiting gate reclaims the slot rather than blocking forever

#### Scenario: A stuck slot surfaces as an error, not an infinite hang

- **WHEN** a gate waits for the slot for the full wait timeout without ever acquiring it
- **THEN** it stops waiting and reports a clear error that the slot was held too long,
  rather than hanging indefinitely

#### Scenario: A broken lock never defeats the gate

- **WHEN** the lock mechanism is unavailable, or acquisition fails for a reason other than
  the slot being held
- **THEN** the gate still runs — without the host serialization guarantee — and says so,
  so the sole enforcement mechanism is never blocked by its own lock

#### Scenario: Every entry point serializes through one lock

- **WHEN** the pre-push hook or the Stop hook runs the gate
- **THEN** it acquires the same host slot as a direct `pnpm gate`, because the lock is
  applied at the shared gate/gate:e2e script boundary rather than duplicated in each hook

#### Scenario: The serialization is proven across processes, not only in one

- **WHEN** the lock's behavior is validated
- **THEN** unit tests pin the acquire, wait-while-held, timeout, release, and fail-open
  logic, and a two-process check demonstrates that a second process waits for the slot and
  acquires it only after the first process releases
