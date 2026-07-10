# Tasks — harden-redundancy-single-and-two-server

## 1. Artifacts + validation

- [x] Part-A diagnosis confirmed with file:line; three decisions approved by
      owner (declared single-server / self-bounding journal / liveness
      gating) — recorded in `design.md`.
- [x] `pnpm openspec validate harden-redundancy-single-and-two-server --strict`
      passes.

## 2. Schema (`@cg/shared-ipc`)

- [x] `ConnectionConfigSchema.servers.B` optional; `ConnectionHealthSchema.backup`
      optional.

## 3. `@cg/caspar-client`

- [x] `InMemoryJournal` self-bounding: `maxEntries = 500` + `retentionMs = 300_000`
      constructor options, enforced on append (drop resolved
      entries older than retention, then evict oldest over cap); contract
      docs state the persistent-journal ownership of full-history rebuild.
- [x] `RedundancyAdapter` accepts `sessions: { A, B? }`: primary-only `send()`
      under every strategy with no B; `failover()` refuses without B; health
      snapshot omits backup.
- [x] Liveness gating: `-1` divergences recorded only when backup state ∈
      {healthy, degraded}; code-vs-code divergences always recorded;
      `triggerCorrectiveResend` + `replayJournalTo` skip a non-live target at
      fire time.
- [x] B-047: single construction-time `state-change` handler on both sessions,
      trigger logic gated on `label === currentPrimary` at event time; stale
      "re-bound in failover-complete" comment replaced with the truth.
- [x] `emitHealth` dedupe against the last-emitted aggregate; primary
      double-emit removed.
- [x] Unit tests (injected clock where the 30 s window matters):
  - [x] B-047 regression (failover A→B, kill B → auto trigger fires) written
        FIRST and confirmed failing against the pre-change adapter.
  - [x] Dead/absent backup → no mirror-divergence, no split-brain-persistent,
        no corrective-resend; journal length ≤ cap after > cap sends.
  - [x] Live diverged backup → split-brain-persistent + corrective resend
        replay the RIGHT entries (asserted by line identity).
  - [x] Journal bounding semantics (retention age, count cap, pending entries
        survive).
  - [x] Adapter without B: primary-only send, refused failover, single-server
        health.
  - [x] Existing suites green; only assertions encoding the old noisy
        behavior updated (intent preserved).

## 4. `tools/caspar-bridge`

- [x] `defaultConnection()` A-only; CLI `--backup-host` / `--backup-amcp-port`
      / `--backup-osc-port` flags construct B only when given.
- [x] `CasparRuntime`: construct B session only when declared; OSC wiring /
      interest / stop() guarded; `health()` omits backup when absent;
      `failover()` surfaces the refusal; `whenServerHealthy()` = all DECLARED
      servers healthy.
- [x] Integration: single-server boot test (A-only + one mock →
      `whenServerHealthy` resolves, load/take work, health has no backup);
      existing failover integration suite stays green.

## 5. `tools/soak-runner`

- [x] Fake sessions with mutable state + `state-change` emission; a
      `SoakOptions.backup` mode (`live` / `absent` / `dead` / `diverging`);
      `SoakReport` event counters + `journalEndSize`.
- [x] Soak regressions: `absent` and `dead` → heap delta under `leakBudgetMb`,
      zero divergence/split-brain/replay events, journal ≤ cap; `diverging` →
      escalation still fires; existing two-server + scheduled-failover soak
      green with the new counters.

## 6. `apps/runtime`

- [x] StatusBar renders the no-backup state and disables manual failover when
      `health.backup` is absent; DOM test. (Playwright harness pins a dead
      bridge URL + two-server MockRuntime, so jsdom is the honest instrument
      for the single-server state; the e2e suite still runs in the gate.)

## 7. Gate

- [x] Full uncached green gate (`turbo --force`) for every touched workspace:
      typecheck + lint + test + build, plus root `pnpm format:check`.
- [x] `pnpm test:e2e` (full run).
- [x] `pnpm openspec validate --all --strict`.

## 8. Wrap-up (Part C)

- [ ] File the server-connection-settings-panel PRD item (next free R-number
      vs merged main; extends R-002; cross-refs B-046; infrastructure notes:
      `ConnectionConfig`, CLI `--caspar-host`, `deriveServeOptions`' routable
      serve path); do NOT start it.
- [ ] Flip B-046 → [x] and B-047 → [x] with the mock/soak-validation record.
- [ ] Archive with the shared-spec ordering check (delta owns only "Failover
      to backup per the redundancy strategy" [MODIFIED] + the new
      single-server requirement — neither owned by the held
      fix-amcp-escaping-v2 / reconnect-reconciliation pair → archive cleanly).
- [ ] Conventional commits, push, compare URL, final report.
