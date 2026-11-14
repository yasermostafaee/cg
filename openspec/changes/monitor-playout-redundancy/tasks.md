## 1. Playout topology and monitoring

- [x] Verify the read-only topology contract on Playout 2.18.28 for the configured engine and
      its reciprocal reserve. Observe a shared transfer ID across different engine-local epochs.
- [x] Verify the reader identifies the current owner and both real channel-one feeds return MJPEG.
- [x] Read per-channel links, verify each mapping and keep a distinct programme relay per member.
- [x] Reuse the authorized ticket transport and revoke former mapping resources on change.
- [x] Add named Programme tiles, a four-engine grid and single-stream sound selection.
- [x] Windows passed 96 scoped Bridge tests, the shared IPC contract tests, and 17 Chromium
      Playwright scenarios covering legacy A/B, four-engine programme monitoring and the footer.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43584111382/job/132414872512)
      ran its E2E step successfully on `26575458`.
- [ ] Verify the four-engine monitor on a station with three linked reserves.

## 2. Commands to the active engine

- [x] Review the Playout team's 2.19.0 contract report. The tested build has no execution fence
      or replica state for external CG. Its proposed external command API is prospective.
- [x] Review external-cg-v2-implementation.fa.md. The Engine/Core candidate exercises
      managed API transfer with real Core processes. Enabled channels refuse raw AMCP writes.
- [ ] Verify the candidate OpenAPI and actual exchange examples, including target mapping,
      fences, durable command IDs, ambiguous results and replica readiness.
- [ ] Integrate the managed route and verify Take, Update, Next, Stop, Clear and transfer with
      the real CG Bridge and Control on an isolated redundant channel.
- [ ] Verify the managed export adapter with real graphics and collect acceptance for cold
      recovery, masked multi-plate presets, authored outros and physical programme output.
