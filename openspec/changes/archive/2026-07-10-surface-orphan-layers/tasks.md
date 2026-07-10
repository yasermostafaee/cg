# Tasks — surface-orphan-layers

## 1. Artifacts

- [x] Part-A diagnosis in `design.md`, incl. the live INFO capture (2.5.0
      `69e8ad5`: no per-layer data in AMCP INFO — the tap justification) and
      the structural proof `unexpected-onair` could never satisfy R-009.
- [x] `pnpm openspec validate surface-orphan-layers --strict` passes.

## 2. `@cg/caspar-client` — the tap

- [x] `OscOccupancyTap` (osc/occupancy-tap.ts): passive bounded map,
      `note()` records only `foreground.producer`, `occupied(staleMs)`
      excludes empty + stale, `reset()`.
- [x] ONE line in `OscTransport.attachHandlers` after `messageToEvent`,
      BEFORE the interest check; tap cleared in `resetState()`; exported.
- [x] Tests: tap semantics; independence proof — a non-interest layer's
      producer event is still dropped from the events pipeline exactly as
      before while the tap records it; interest/rate-limiter/change-tracker
      source files untouched (suites run unmodified).

## 3. `@cg/shared-ipc` — channels

- [x] `layers.orphans` (pull), `layers.orphans-changed` (publish),
      `layers.clear` (request → ok/reason owned|amcp-error); schema tests.

## 4. `tools/caspar-bridge` — the sweep + Clear

- [x] Pure `OrphanTracker` (orphan-tracker.ts): 2-consecutive-sightings
      surface, 1-sweep resolve, owned-key subtraction, change-only report.
- [x] `CasparRuntime`: `sweepMs`/`occupancyStaleMs` options (5000/2500);
      unref'd interval armed in `start()`, cleared in `stop()`; each tick
      reads `#adapter.primarySession` dynamically and skips unless
      `healthy`; `orphans()` + `orphansChanged` emitter; `setConfig` clears
      sightings + surfaced orphans (old-server knowledge).
- [x] `clearLayer(channel, layer)`: refuse `'owned'` for `#slots` values;
      urgent `CLEAR <ch>-<layer>` via the adapter; `ok && onPrimary` marks
      `#adopted`; touches no slots/interest.
- [x] Routes (`layers.orphans`, `layers.clear`) + `orphans-changed` in
      `wirePublishes`.
- [x] Unit: OrphanTracker debounce both directions.
- [x] Integration (mock + real OSC): foreign `PLAY 1-77` from a second AMCP
      connection surfaces within two sweeps; Clear sends `CLEAR 1-77` and
      resolves on observed empty; owned layer never surfaces; no orphans →
      no publishes; Clear refused on owned; sweep follows a manual failover;
      warnings freeze when the primary dies; `stop()` disposes the timer.

## 5. `apps/runtime` — the surface

- [x] Contract + `WebSocketRuntime` + mock wrapper: the orphans / clear /
      onOrphansChanged surface; `MockRuntime` parity (empty set, clearLayer,
      `CG_E2E_ORPHAN`-guarded seeded orphan for Playwright).
- [x] `useOrphans` hook; `OrphanLayersBanner` (in-flow amber strip above the
      stack — avoids fixed-position conflicts with FailoverBanner; noted
      placement choice), `role="alert"`, null when empty, per-row
      confirm-gated CLEAR via native confirm + `runCommand` (the
      Remove-All/lock house precedent for confirm-gated destructive acts;
      row disappearance on the resolving sweep is the success feedback).
- [x] jsdom: banner null/named/confirm-accept/confirm-cancel.
- [x] Playwright e2e: seeded orphan → banner names 1-60 → CLEAR resolves →
      idle-quiet.

## 6. Gate

- [x] Full uncached gate (`turbo --force`) for every touched workspace +
      root `pnpm format:check`.
- [x] `pnpm test:e2e` (full run).
- [x] `pnpm openspec validate --all --strict`.

## 7. Wrap-up (Part C)

- [x] Optional live smoke: PARTIALLY RUN on CasparCG 2.5.0 `69e8ad5`
      (non-gating) — foreign `PLAY 1-99 RED` + cleanup `CLEAR 1-99` verified
      live over AMCP (202s, no residue); the orphan-surfacing half was
      environment-blocked: the operator's RUNNING pre-R-009 bridge (PID
      holding UDP 6250) owns the OSC ingest. Completion checklist recorded
      in the R-009 PRD entry (stop the old bridge → run the new build →
      foreign graphic → banner within ~10 s → Clear → idle-quiet).
- [x] Flip R-009 → [x] with the validation record; noted the tap superseding
      the PRD's unexpected-onair sketch (structurally unable to see
      never-loaded layers) and that observe/collision, beginResync, and
      HeartbeatService stay dead for C-010.
- [x] Archive with the shared-spec ordering check — re-verified at archive
      time: the held pair's owned headings are unchanged and this delta only
      ADDs two new ones → archived independently.
- [x] Conventional commits, push, compare URL, final report.
