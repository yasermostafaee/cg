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
- [x] Verify B and Follow use the selected engine meter or its authenticated PCM peaks.
      Windows Chromium covers distinct stereo peaks, show/hide persistence, the unresolved
      owner case, and one reader while toggling the speaker and the meter.

## 2. Commands to the active engine

- [x] Review the Playout team's 2.19.0 contract report. The tested build has no execution fence
      or replica state for external CG. Its proposed external command API is prospective.
- [x] Review external-cg-v2-implementation.fa.md. The Engine/Core candidate exercises
      managed API transfer with real Core processes. Enabled channels refuse raw AMCP writes.
- [x] Diagnose the reported station without sending commands. After B was added, both AMCP
      sessions were up and the legacy B graphics route waited for the backup engine sign-in.
      After the station admin signed in, Bridge reported channel 1 mapped on both engines with
      no backup warnings. The operator confirmed graphics on B.
- [x] Check the installed Playout 2.19.0. It advertises one reserve, and the External CG v2
      owner and state routes return HTTP 404 on the installed engine. Its graphics route is
      the legacy Bridge mirror.
- [x] Review the candidate OpenAPI and exchange examples for target mapping, fences,
      durable command IDs, ambiguous results and replica readiness.
- [x] Check the installed `2.19.0-externalcg.11` endpoints on both engines. Channel
      `apasai` returned `cg.channelNotMigrated` on owner and state on both engines.
- [x] Review the `.12` OpenAPI, actual requests and two/four Core evidence. The Playout
      harness applied the complete Live, video and HTML layout, transferred control and
      preserved the previous image on a forced rollback. Real CG acceptance remains open.
- [x] Implement owner-only External CG v2 layout transport and a durable per-group command journal.
      Exercise ownership transfer, a lost reply, receipt reconciliation, stale recovery and restart
      with two isolated HTTP Engine fixtures.
- [x] Verify template preparation accepts matching bundle hashes from each configured member.
- [x] Build complete managed snapshots for the static HTML pilot, wire per-Engine operator
      sessions and bundle preparation, and block legacy raw mutations in the pilot.
- [x] Connect the Control Play, Update, Stop and Clear actions to the pilot and restore the
      applied data and visibility after Bridge restart.
- [x] Verify absolute static HTML recovery in Chromium, including embedded fonts and Persian text.
- [x] Verify cold HTML recovery on the real .22 Core in isolation. The restored PGM frame
      matched the initial frame pixel for pixel and Stop removed the graphic.
- [x] Read the test pair's External CG v2 capabilities on Playout .26. Both PGM returns are live,
      the layout request schema matches .22, and both channels report `cg.channelNotMigrated`.
- [x] Start two isolated full Engine .26 hosts from the supplied installer and verify the
      first-run, administrator session and CG license endpoints. Both hosts report Missing
      CG licensing and reject the CG operator session with `403 cg_not_licensed`.
- [x] Confirm the administrator setup session and a valid CG licence for one channel on test B
      (`21.43`). The initial inspection found an active programme and no managed group.
- [x] On the licensed .26 test pair, capture B's real programme after Control sends Play only
      to A. B reports `htmlPaintConfirmed` for the applied revision. Transfer to B keeps
      the graphic instance and caption, Update reaches B, and Control recovers the updated row
      after Bridge restart. Stop removes the picture and Clear removes the layout from both
      members. Verify both applied revision 8 and return control to A.
- [ ] Verify recovery from a documented pre-admission refusal and establish journal retention.
- [ ] Verify whole-layout state and a mirrored media plate with the real CG Bridge and the
      managed contract on an isolated channel.
- [ ] Inspect B's authenticated D11 match for the flagged media on the target station.
- [ ] Extend the pilot to sequence pages and verify Next and page recovery on a real isolated
      redundant channel.
- [ ] Verify the managed export adapter with real graphics and collect acceptance for cold
      recovery, masked multi-plate presets, authored outros and physical programme output.

## Backup input status

- [x] Observe the long media warning replacing the template name on the target station.
- [x] Keep the name and compact status visible and show specific causes on demand.
- [x] Verify combined missing media and live input warnings in Layers and Inspector. Four Windows Chromium cases and 14 warning tests passed.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43667950106/job/132671500381) ran the complete E2E step successfully on `194e37ac`.
- [x] Confirmed by the operator on CG 1.2.10: the two media clips appear in the
      reserve's programme return after the D11 replica ID correction.

## Legacy reserve picture and sound follow-up

- [x] Prepare both fresh, hidden A/B media seats before dispatch when both members
      can confirm readiness. Verify preparation and the independent fallback in Bridge tests.
- [x] Run eligible resident preset and Focus effects on the mapped reserve.
      Bridge tests cover reserve faults and stale queues, seats and mapping.
- [x] Diagnose the reserve's own D10 readiness with read-only lookups on the mapped
      reserve session. Cover missing and unavailable sources in Bridge tests.
- [ ] Verify media phase and preset/Focus transitions separately from monitor-return
      latency on an isolated real engine pair.
- [ ] Verify the reserve's own D10 clean Playlist source and engine-local holder.
      Gate the route on authenticated availability and prove B-local playback and
      audio on a mapped, isolated channel.
- [x] Verify each PGM meter is bound to its actual engine and source in Chromium.
- [ ] Compare measured A/B PGM levels with deterministic aligned media and equal
      programme settings on a real engine pair.
