# Design — owned-slot occupancy warning (B-056)

## 1. Diagnosis (verified against current `main`, `0e23f7c`)

The window is exactly as the B-053 review predicted, and it is still open:

- `#adoptLayer` (`tools/caspar-bridge/src/caspar-runtime.ts`) sends the
  adopt-CLEAR through `#send`, which reports
  `{ ok, onPrimary: winner === currentPrimary }`. In mirror-sync with the
  primary's AMCP link down, the primary enqueue rejects, the backup's
  fulfilled ack wins (`RedundancyAdapter.sendMirrorSync`), and `#send`
  returns `ok: true, onPrimary: false`. `#adoptLayer` correctly refuses
  `#adopted.add` — **and then discards that result** (`Promise<void>`).
- `load()` proceeds unconditionally after the adopt: binds the slot, adds
  OSC interest on every declared session, and `CG ADD`s — which also
  succeeds backup-only. The item settles READY (honest post-B-053). Nothing
  anywhere says "a previous session's producer may still be VISIBLE on the
  primary output under this item's layer".
- R-009 is structurally unable to surface it: `#sweepOccupancy` diffs
  occupancy against `#slots` — the layer IS owned, so it is subtracted from
  the orphan set. Its warning would also be wrong in remedy: R-009 offers a
  direct Clear, which `clearLayer` REFUSES for owned layers (correctly).
- The window needs no failover to matter: with `autoFailoverEnabled: false`
  (human-in-the-loop stations) the primary stays primary while its AMCP is
  down, and the primary machine keeps rendering (OSC is UDP, bound
  independently — `ServerSession.loop()` binds OSC before any AMCP connect
  attempt, so the occupancy tap keeps populating while the session sits in
  the reconnect loop). With auto-failover ON, the adapter fails over on the
  primary's disconnect, shrinking (not closing) the window.

## 2. Decision: Option B — additive warning; loud-fail REJECTED

Two fix shapes were on the table in the PRD entry:

- **Loud-fail**: reject the load when adoption misses the primary
  (mirroring the unknown-template guard). REJECTED — decided product-level,
  not revisited here: it changes what a backup-only load MEANS in every
  redundancy fault mode. Today a load during a primary AMCP blip
  deliberately succeeds on the surviving mirror (the whole point of
  mirror-sync — the operator can keep preparing items); failing it loudly
  would turn every primary-link blip into a stack full of red items and
  block show prep on the healthy half of the pair. `load()`'s
  proceed-after-adopt is frozen reconnect-reconciliation behavior.
- **Option B (this change)**: keep the load exactly as-is and give the
  operator the missing TELL — a warning that foreign content may be live on
  the primary under this item's layer, with the correct remedy (Out/Remove
  the item), and provable, event-driven resolution.

## 3. Detection — load-time one-shot, observed occupancy only

`#adoptLayer` now returns `{ adopted: boolean }` — the value it already
computes (`true` iff the layer is in `#adopted` after the call: previously
adopted, or this CLEAR landed `ok && onPrimary`). Pure plumb: no command,
gate, or ordering changes; this is the single permitted touch inside
reconnect-reconciliation.

In `load()`, after the adopt and the existing remove-race guard, BEFORE
`#sendAdd`:

```
if (!adopted) {
  occupied = adapter.primarySession.osc.occupancy.occupied(occupancyStaleMs)
  hit = occupied.find(o => o.channel === slot.channel && o.layer === slot.layer)
  if (hit) raise warning { channel, layer, itemId, producer: hit.producer, since }
}
```

- **Why load-time and not a sweep**: after our own ADD, an `html` producer
  report on an owned layer is indistinguishable from our own producer — the
  tap has no identity. The only moment the bridge can KNOW the occupant is
  foreign is after a failed/backup-only adopt and before its own ADD. A
  sweep addition could never re-derive this; hence one-shot, and hence the
  sample is taken strictly before `#sendAdd`.
- **Same freshness contract as R-009** (`occupancyStaleMs`, default 2500
  ms): an aged-out entry is treated as unoccupied — real CasparCG goes
  SILENT for a CLEARed layer (B-053), so ageing-out IS the empty signal.
  Inventing a longer window here would re-introduce the ghost-entry class
  of bugs R-009 already solved.
- **The primary sampled is the CURRENT primary at load time**
  (`#adapter.primarySession`), consistent with everything else in the
  bridge.

### Unknown occupancy does NOT warn (the decided open question)

When adoption misses the primary AND the primary's OSC is also silent/stale
(machine fully partitioned, rebooting, or OSC unconfigured), the bridge
KNOWS it could not clear the primary but CANNOT observe occupancy. Decision:
**no warning — observed occupancy only.** Justification:

1. **Base rate**: the dominant everything-down cause is a machine
   restart/reboot — and a restarted CasparCG boots with EMPTY layers, where
   this warning would be false. Warning on unknown would fire on every load
   of every primary-down window, mostly wrongly.
2. **Alarm fatigue is the worst failure mode for an on-air warning
   surface**: a warning that operators learn to dismiss ("it always says
   that when A is down") is worse than no warning — it also devalues the
   true-positive case this change exists for.
3. **The unknown state is already loudly surfaced**: the health strip /
   FailoverBanner shows the primary disconnected. "Primary unreachable"
   is the honest, already-visible fact; a per-item "maybe something foreign
   is under this layer, cannot tell" adds speculation, not information.
4. The warning's message asserts observed foreign content. Asserting it
   unobserved would be dishonest; hedging it ("may be…?" at lower
   confidence) is exactly the fatigue trap of (2).

Accepted residual (§6.1): a primary whose AMCP is down AND whose OSC never
reaches the bridge while it renders an orphan gets no warning.

## 4. Surface — distinct variant, no Clear, names layer + item

- New channels (`@cg/shared-ipc`): `layers.owned-occupancy` (pull) and
  `layers.owned-occupancy-changed` (publish, change-only). Chosen over a
  discriminated extension of the R-009 orphans payload because the two sets
  have different lifecycles (sweep-debounced vs event-driven), different
  remedies, and R-009's channels/behavior are frozen — a union payload
  would force every existing consumer through a discriminant for zero
  benefit. Payload: `{ channel, layer, itemId, producer, since }`.
- UI: the existing `OrphanLayersBanner` renders BOTH sets (reuse over a new
  component, per the house preference) — R-009 rows unchanged; owned-slot
  rows are a distinct strip with a distinct `role="alert"` name, message
  naming `channel-layer` AND the item, remedy text ("Out or Remove the
  item…"), and **no Clear button** — the R-009 `clearLayer` owned-refusal
  stays authoritative, and offering Clear on an owned layer would be a
  trap (it would be refused) or worse (if it weren't, it would nuke the
  operator's own item).
- `MockRuntime` parity: empty set by default; `out()`/`remove()` resolve an
  item's warnings (the offline mock models healthy servers, where a CLEAR
  lands on the primary); `CG_E2E_OWNED_OCCUPANCY` seeds one warning against
  the seeded stack item so Playwright can drive the visible flow.

## 5. Resolve — event-driven, provable, never optimistic

A warning for (channel, layer) resolves ONLY on:

1. **A bridge-issued CLEAR for that layer landing on the current primary**
   (`ok && onPrimary`) — exactly the sites that mark `#adopted`: the
   adopt-CLEAR, `out()`, `remove()`, and R-009's operator `clearLayer`.
   Implementation: those four sites call one helper that adds the adoption
   key AND resolves the warning, so "provably cleared on the primary" and
   "adopted" can never drift apart. (The adopt-site resolve is defensive
   symmetry — while an item holds the slot no new load can target its
   layer, so it is unreachable today; the helper keeps it correct if
   allocation ever changes.)
2. **The item being removed / the layer deallocated** (`remove()`,
   including via `removeAll()`), regardless of that CLEAR's outcome: the
   layer becomes unowned, and surfacing whatever still lives there is
   R-009's job (the sweep sees occupied-minus-owned; the handoff is
   deliberate — same producer, now with the correct remedy, a real Clear
   button). While the primary stays down the sweep skips (R-009 freeze
   semantics), so the handoff completes when the primary is next
   observable.
3. **A `setConfig` server swap** — all warnings drop, mirroring
   `OrphanTracker.reset()`: they described the OLD primary.

Explicitly NOT resolving:

- **Take** — frozen behavior sends `CG PLAY` (re-ADD only if `#loaded`
  lost the producer); neither proves the primary's layer was cleared, and a
  take may `CG PLAY` the surviving orphan on the primary once it
  reconnects. Tested.
- **Failover** — after A→B failover the warning's subject (A's layer) is no
  longer the live output, but a later fail-back would make it live again
  with no re-detection possible (one-shot). Persisting is the conservative
  direction (a stale warning nudges an Out/Remove that heals both
  servers); resolving would be optimistic. Documented residual (§6.3).
- **Session reconnect ('healthy')** — B-054 clears `#loaded` there, but a
  reconnect proves nothing about layer contents (a link blip preserves the
  orphan; only a restart empties it — indistinguishable from here). No
  auto-CLEAR either: the never-auto-clear rule (B-048/R-009) holds.

## 6. Accepted residuals

1. **Unobservable-primary miss** (§3): AMCP down + OSC never arriving →
   no warning even if an orphan renders. The health surface still shows the
   primary down; C-011 (persisted layer-aware reconciliation) is the
   structural home for closing this.
2. **Stage-replace false-persist**: if the primary's AMCP recovers between
   the failed adopt-CLEAR and this load's own `CG ADD` (sub-second window),
   the ADD lands on the primary and — on real CasparCG — stage-replaces the
   orphan. The warning persists anyway (an ADD is not in the resolve list —
   it is not a CLEAR, and the mock's ADD-vs-orphan fidelity is unproven on
   hardware). Stale-conservative: the operator's Out/Remove resolves it and
   is harmless.
3. **Fail-over/fail-back staleness** (§5): the warning keeps naming a layer
   whose server is currently the backup. Conservative by choice.
4. **No persistence**: warnings are process-memory, like `#adopted` — a
   bridge restart forgets them (and also re-arms adoption, which re-runs
   detection on the next load of that layer, so the loss is self-healing).

## 7. Test strategy

- **Red-first integration** (`tools/caspar-bridge`, amcp-mock): mirror pair
  where server A's `amcpPort` points at a dead port (AMCP link down) while
  a real mock emits A's OSC to the bridge's A-ingest (machine alive and
  rendering); a second AMCP client plants the foreign producer on the
  target layer of the "A machine" (occupancy reads non-empty, refreshed at
  `oscHz`); `autoFailoverEnabled: false`. Load → assert the warning
  (channel-layer + item) AND unchanged load behavior (accepted, slot bound,
  own `CG ADD` reached B). Resolve suite: out with A still down → persists;
  A's AMCP revived → out resolves; remove resolves with A still down; take
  does NOT resolve; unknown occupancy (no OSC for A) does NOT warn.
- **CI discipline**: every socket/port the tests open (observer UDP probe
  included) is released in try/finally; the suite must pass in isolation
  AND under the full parallel `pnpm test` (the reconnect/redundancy suites
  historically only fail under contention, and the past root cause was a
  leaked UDP port, not timing).
- jsdom for the banner variant; Playwright e2e via the
  `CG_E2E_OWNED_OCCUPANCY` seed (banner names layer + item, no Clear
  button, Out/Remove resolves).
