# The Runtime never pretends to be on air when it is not (R-006)

## Why

**This is a broadcast-safety failure, observed live.** The operator pressed PLAY, the row
went solid-red **ON AIR**, the servers read **HEALTHY** — and nothing was on air. The
graphic never existed.

Three things compound into that lie:

1. **The fallback to the mock is silent.** `createRuntimeBridge()` probes the bridge for
   1500ms and, on any failure, does a **bare `catch`** → `createMockBridge()`. No throw, no
   log, no operator decision. The session is pinned to an in-memory simulation for its whole
   life, and the only tell is one amber pill.
2. **The mock simulates a SUCCESSFUL playout.** `MockRuntime.take()` drives the row
   `playing` → `on-air` and returns `accepted: true`. The PLAY button flashes success. An
   audit row is written with `outcome: 'ok'`.
3. **The mock also claims the servers are HEALTHY.** `seedHealth()` reports
   `state: 'healthy', amcpAxisOk: true` for BOTH servers — so the amber
   "OFFLINE (mock)" pill sits directly beside a green "PRIMARY A HEALTHY". Two
   contradictory claims, same visual weight, and the reassuring one looks normal.

And there is no guard: `CasparRuntime.take()` checks only that a slot exists — it never
reads session state — while the orphan sweep 100 lines away _does_ gate on
`session.state !== 'healthy'`. A repo-wide grep for a refusal reason of
`disconnected`/`offline`/`no-server` returns **zero matches**. Nothing anywhere refuses a
command because the server is not there.

R-006 already documented this exact incident ("commands _never reached CasparCG_") but was
scoped to visibility only, at ⟨low⟩. It is the same bug, and it is not a visibility nit.

## What Changes

The owner's call: **the mock is a valuable test tool, but it must be an EXPLICIT operator
choice — never an automatic fallback, and never mid-show.**

1. **No silent fallback.** An unreachable bridge no longer selects the mock. The app stays
   on the live backend in an explicit **DISCONNECTED** state (`WebSocketRuntime` already
   reconnects on its own and already rejects every command with
   `BridgeDisconnectedError` — "Not sent to CasparCG"). The mock is selected **only** when
   explicitly requested.
2. **The disconnected state is loud.** A full-width `role="alert"` banner — not a pill —
   states that nothing can reach air and that commands are refused, and offers Retry and an
   explicit "Enter test mode".
3. **On-air verbs are refused while the server is not connected.** `take` / `update` /
   `out` gate on the primary session's health, mirroring R-010's refusal shape
   (`{ accepted: false, errorCode: 'disconnected' }`) and the orphan sweep's health gate.
   The intent is **never applied**, so no optimistic status can exist. The PLAY button is
   disabled with the reason surfaced.
   **Refuse, do not defer.** Offline work cannot be queued-and-sent-later: the mock is a
   different object, and reconnect-reconciliation replays _template HTML_ only — never
   stack intents. A queued take would be stranded, which is the same lie one step later.
4. **Test mode is explicit, and it never claims air.** The operator enters it deliberately;
   it is impossible to enter by accident. While in it, a **persistent full-width TEST MODE
   bar** dominates the UI, the badge for a simulated item reads **SIM ON AIR** in a
   distinct non-broadcast colour (the sacred red is reserved for real air), and the server
   pills are replaced by "NO SERVER — SIMULATED". `seedHealth()` no longer claims healthy.

### The one interpretation worth stating

"The mock must not drive rows to ON AIR **as if a real playout happened**" is implemented
as: the mock keeps its state machine (so every on-air-dependent surface — R-010's on-air
block, R-011's position lock, the B-044 badge settle — stays exercisable offline, which is
the mock's whole value, which the owner explicitly wants preserved), but **the claim** is
rendered unmistakably as simulation. Deleting the on-air state entirely would make the mock
unable to test the very gates that keep air safe. The safety property — _the operator can
never believe a graphic is on air when it is not_ — is carried by the loud banner + the
distinct SIM badge + the honest health, not by crippling the simulation.

## Non-goals / explicitly unchanged

- **No AMCP change.** No new verb; ADR-0006's verb sequence, the quoter, and the escape
  rule are untouched. A refusal sends nothing to the wire.
- **Reconnect-reconciliation is NOT repurposed.** It keeps re-delivering template HTML only.
  Stack intents are never replayed.
- **R-010's on-air block is mirrored, not modified.**
- **No mid-session backend swap.** Entering/leaving test mode is a deliberate, explicit
  re-boot of the app — the live backend is never swapped out from under a running show.

## Capabilities

- `runtime-caspar-bridge` — MODIFIED: boot selection no longer falls back to the mock.
  ADDED: on-air verbs are refused while the server is not connected.
- `runtime-ui` — ADDED: the disconnected state and test mode are loud and unmistakable.

## Impact

- `apps/runtime` — `createRuntimeBridge`, `MockRuntime`, `seed.ts`, `App`, `StatusBar`,
  `LinkIndicator`, `StackRow`/`StackPanel`, new `DisconnectedBanner` + `TestModeBanner`.
- `tools/caspar-bridge` — `CasparRuntime.take/update/out` gain the connection gate.
- R-006 → ⟨low⟩ → ⟨high⟩, scope widened, `[x]` on archive.
