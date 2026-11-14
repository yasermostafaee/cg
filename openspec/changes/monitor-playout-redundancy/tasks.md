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

- [ ] Confirm the new Playout contract for direct AMCP graphics synchronization and transfer
      fencing, including epoch relationships and in-flight commands.
- [ ] Integrate the confirmed active-only route and test Take, Update, Stop and transfer with a
      running external graphic on an isolated redundant channel.
