# Design — surface orphaned/unknown on-air layers (R-009)

## Part A diagnosis (confirmed against code + live capture, 2026-07-11)

### The dead wiring (the C-010 half R-009 touches)

- `unexpected-onair`: declared `reconciler.ts:70-71`, single emit site
  `:216-241` — fires on an `osc.layer.foreground.producer` event whose
  (channel,layer) is bound to no item and whose producer is non-empty;
  fire-and-forget (no record, no quarantine). ZERO production subscribers
  (full-repo grep enumerated: source, tests, docs only; the bridge's
  Reconciler instance subscribes only to `item-changed`/`item-removed`).
- `LayerManager.observe`/`collision`: `layer-manager.ts:166-190` — quarantines
  a free-but-observed-occupied slot, emits `collision`. ZERO production
  callers (the bridge's `#layers` uses only allocate/deallocate).
- `beginResync`/`endResync` (`reconciler.ts:258-297`) and `HeartbeatService`:
  no production callers (C-010's own text).

**Structural proof the PRD's original idea could not work:** the OSC interest
filter drops layer-scoped events for layers not in the interest set at
`osc/transport.ts:125`, UPSTREAM of every consumer; the only production
interest mutators are the bridge's `#addInterest`/`#removeInterest`
(`caspar-runtime.ts:802-810`) for slots it owns. `Reconciler.applyOsc` —
and therefore `unexpected-onair` — can never see a never-loaded layer.
Wiring that signal (the PRD sketch) could not have satisfied R-009's
acceptance. The sweep decision was right; only the instrument needed
correcting.

### The instrument — verified by live capture, not assumed

Read-only probe against the local CasparCG **2.5.0 `69e8ad5`** (VERSION +
INFO variants only; nothing state-mutating), 2026-07-11:

- `VERSION` → `201 VERSION OK\r\n2.5.0 69e8ad5 Stable\r\n`
- `INFO` → `200 INFO OK\r\n1 720p5000 PLAYING\r\n\r\n`
- `INFO 1` → `201 INFO OK\r\n` + one CRLF-terminated blob of LF-separated
  XML containing ONLY `<format>`, `<framerate>`, `<mixer><audio>…`,
  `<output><port>…` — **no `<stage>`, no per-layer nodes of any kind**.
- `INFO 1-10` → the identical channel XML (the layer part is ignored).

Conclusion: the 2.0-era `<stage><layer_N>` INFO sections are gone from the
2.3+ lineage; **AMCP cannot report per-layer occupancy on the target build**.
No hardware INFO capture existed in the repo before this probe (full-repo
grep); the amcp-mock's `<layers/>` stub (`handlers.ts:39-53`) is invented —
building a sweep on it would have validated our assumption, not reality (the
B-041 lesson).

What real hardware DOES emit, per layer, for EVERY layer, continuously:
OSC `/channel/N/stage/layer/L/foreground/producer` (`"html" | "empty" | …`)
— ADR 0004's 315,626-event capture, re-verified through B-053 (which also
established: a CLEARed layer goes SILENT on real CasparCG rather than
reporting `empty`, and `CG PLAY` causes no wire change — producer presence
is OCCUPANCY evidence, not play evidence).

### The firehose protections (must not regress — and how independence is proven)

Pipeline order verified at `osc/transport.ts:112-133`:
`parsePacket → flatten → messageToEvent → interest.shouldEmit(:125) →
rateLimiter(:126) → changeTracker(:127) → emit`. Two facts make the tap
safe by construction:

1. **Every producer message is already fully parsed and mapped BEFORE the
   interest drop** — interest gates emission into the pipeline, not parsing.
   The tap reads the already-produced event; it adds one bounded map upsert
   and zero events.
2. **AMCP and OSC are independent module graphs** (CommandQueue imports only
   the AMCP transport; OscTransport imports only the OSC pipeline; they meet
   as ServerSession siblings) — and the tap adds no AMCP traffic at all,
   which the original INFO plan would have.

### Ownership — "orphan" precisely defined

- `#slots` (`caspar-runtime.ts:115-119`): itemId → the (channel,layer) this
  process COMMANDS. Set at load only after the adopt-CLEAR round-trip and
  remove-race guard; retained through out; deleted only at remove; survives
  setConfig (with interest re-registration).
- Reconciler snapshot: stack ROWS — items can exist without slots (failed
  loads); not an ownership source.
- `#adopted`: CLEAR-knowledge per layer, not ownership.

**Owned = the (channel,layer) values of `#slots`. Orphan = a layer with a
fresh non-empty foreground producer on the CURRENT PRIMARY that is not
owned.** An adopted-then-loaded layer is owned; a pre-adoption orphan is
not; a mid-load layer is never flagged (the slot binds before the CG ADD is
sent).

## The design (owner-approved 2026-07-11, deviation stated)

**Approved deviation:** the sweep's source changes from "periodic AMCP INFO
query" (disproven on the actual build by the capture above) to "periodic
sweep of a passive `OscOccupancyTap`". Every other operator-decided property
stands: periodic cadence, bridge-side compare against ownership,
primary-only + health-gated, debounced change-only publish, explicit
per-layer operator Clear, never auto-clear, idle-quiet.

### OscOccupancyTap (`packages/caspar-client/src/osc/occupancy-tap.ts`)

Passive `Map<'ch:layer', {producer, at}>`. `note(event, at)` records only
`osc.layer.foreground.producer` events; `occupied(staleMs, now)` returns
entries with producer ≠ `empty` seen within `staleMs`; `reset()` clears
(called from `OscTransport.resetState()` so reconnect ghosts die with the
cycle). Bounded: opportunistic pruning of stale entries when the map grows
past a soft cap. Wired by ONE line in `attachHandlers` after
`messageToEvent`, before the interest check. It has no event emitter and no
subscribers.

### The sweep (`CasparRuntime`)

- `sweepMs` (default 5000) / `occupancyStaleMs` (default 2500), constructor-
  injectable for tests. `setInterval` armed in `start()`, `unref?.()`,
  cleared+nulled in `stop()` (the B-053 dispose caution). No per-tick logs.
- Each tick: read `this.#adapter.primarySession` DYNAMICALLY — after a
  failover or setConfig the next tick automatically sweeps the new primary
  with zero rewiring (the R-010 dynamic-read pattern). Skip unless
  `session.state === 'healthy'`: while disconnected the sweep neither runs
  nor resolves — existing warnings FREEZE (absence of knowledge is not
  knowledge of absence).
- Orphan math is factored into a pure, unit-testable `OrphanTracker`
  (`tools/caspar-bridge/src/orphan-tracker.ts`): sightings keyed
  `ch:layer` with consecutive-sweep counts; SURFACE at 2 consecutive
  sightings (blip-proof); RESOLVE after 1 sweep in which the layer is empty
  or aged out (the safe direction is prompt; ageing covers real CasparCG's
  goes-silent-on-CLEAR, the mock's explicit `empty` reports cover the other
  path). Publish (`layers.orphans-changed`) only when the surfaced set
  changes. `setConfig` clears sightings + surfaced orphans (they described
  the old server) alongside `#loaded`/`#adopted`.

### Channels + Clear

- `layers.orphans` (pull, → `OrphanLayer[]`), `layers.orphans-changed`
  (publish, same payload), `layers.clear` (request `{channel, layer}` →
  `{ok, reason?: 'owned' | 'amcp-error'}`).
- `clearLayer(channel, layer)`: refuse `'owned'` when the layer is a
  `#slots` value (clearing owned layers is Out/Remove's job — guard against
  UI races); otherwise send `CLEAR <ch>-<layer>` (the CommandBuilder `out`
  shape) at urgent priority via the adapter (mirror-sync fans it out — a
  real pair clears everywhere); `ok && onPrimary` marks `#adopted`
  (consistent with out/remove: the layer's state is now KNOWN); it touches
  no slots and no interest (it owns neither). The warning resolves via the
  next sweep's observation — the PRD's "observed empty transition" — never
  optimistically.
- NEVER auto-clear. The warning is informational until the operator acts.

### UI

`useOrphans` hook (pull + subscribe, the `useConnections` shape) →
`OrphanLayersBanner` rendered as an in-flow amber strip in the workspace
above the stack (avoids fixed-position stacking conflicts with
FailoverBanner; noted placement choice), `role="alert"`, null when empty
(idle-quiet), one row per orphan — "Layer 1-60 is on air but not on your
stack" + a confirm-gated CLEAR (native confirm + `runCommand` error
surface, the Remove-All/lock-button house precedent; row disappearance on
the resolving sweep is the success feedback). Persistent while the orphan
persists — no auto-dismiss.

MockRuntime parity: `orphans()` (empty by default), `onOrphansChanged`,
`clearLayer` (removes a surfaced mock orphan), and a `CG_E2E_ORPHAN`-guarded
seeded orphan (channel 1, layer 60) so Playwright can drive the visible
flow; the bridge-side truth is integration-tested against real mock OSC.

### Stays dead (C-010 unchanged) — recorded per the approval

- `unexpected-onair`: superseded by the tap for R-009's purpose; structurally
  unable to see never-loaded layers (interest drops them upstream of the
  Reconciler — see the proof above). Left as-is for C-010 to decide
  (wire-or-remove).
- `LayerManager.observe`/`collision`: quarantine-on-sweep would CHANGE the
  designed allocation behavior (adopt-CLEAR-on-load is deliberate
  reconnect-reconciliation semantics; the allocator skipping orphaned layers
  is a different feature) — out of scope, C-010/C-011 territory.
- `beginResync`/`endResync`, `HeartbeatService`: untouched.
- C-011 relation: R-009 ships the "unknown layer" surface; persisted
  occupancy would later upgrade it to "layer X held template Y last session —
  resume or clear?".

## Test matrix

- caspar-client unit: tap note/stale/reset/bounds; transport-level
  independence proof — a producer event for a NON-interest layer is still
  DROPPED from the events pipeline exactly as before while the tap records
  it; `interest.ts`/`rate-limiter.ts`/`change-tracker.ts` files untouched
  (their suites run unmodified).
- caspar-bridge unit: `OrphanTracker` debounce both directions (2-in, 1-out),
  owned-key subtraction, change-only reporting.
- caspar-bridge integration (mock + real OSC): a foreign `PLAY 1-77` from a
  SECOND AMCP connection (the "dead previous session") surfaces within two
  sweeps; `layers.clear` sends `CLEAR 1-77` and the warning resolves on the
  observed empty; an owned layer never surfaces; no orphans → no publishes;
  Clear refused (`'owned'`) on an owned layer; the sweep follows the primary
  across a manual failover; warnings freeze (don't resolve) when the primary
  dies; `stop()` disposes the timer (no further publishes).
- Renderer: jsdom banner (null when empty; names the layer; confirm accept →
  `layers.clear` called; cancel → not) + Playwright e2e over the seeded
  orphan (banner visible, names 1-60, CLEAR resolves it, idle-quiet after).
- Every existing suite incl. the failover integration test stays green.

## Optional live smoke (Part C, NOT a gate)

The read-only probe script that produced the INFO capture is step 0. Then:
leave a graphic on a layer via a second AMCP connection (or a dead bridge
session), start the bridge + Runtime, confirm the banner names the layer
within a sweep cycle (~5-10 s), CLEAR it → output clears + banner resolves,
and confirm idle-quiet when the stack matches the output.

## Out of scope (frozen)

AMCP escape rule; B-044 lifecycle and its OSC firehose/interest protections
(untouched, asserted); reconnect-reconciliation behavior; R-003; R-010
setConfig; B-046 redundancy internals; any auto-clear heuristic.
