# Tasks — `multi-channel` (`MULTI-CHANNEL-01`)

Every `e2e` URL below is a PR-workflow run whose `E2E (Playwright)` JOB was read back from the API
as `completed/success` — it RAN, it was not skipped. A commit pushed together with a later one is
discharged by the later one's run, which carries it.

## 1. Establish before changing (§1)

- [x] 1.1 Every producer and consumer of `FixedLayerBankSchema`, with plural-readiness — `design.md` §1
- [x] 1.2 The five `z.void()` verbs and `channelIndependence.dom.test.ts` §3 — `design.md` §1.5
- [x] 1.3 `MockRuntime.load()` writes `item.slot`, keyed by channel and layer — `b7317f8b`; e2e https://github.com/yasermostafaee/cg/actions/runs/36022562387
- [x] 1.4 The persisted file's shape measured (all v1) and the decision made — `design.md` §1.6, §2

## 2. The change (§2)

- [x] 2.1 A — one bank per declared channel: schema, the three channels, the store, the file, every consumer, the mock — `9759511e`, `aabaff19`; e2e https://github.com/yasermostafaee/cg/actions/runs/36026001236
- [x] 2.2 J — `cg-admin-ch2`, the demo station's own station-admin — `b11f546a`; e2e https://github.com/yasermostafaee/cg/actions/runs/36028052893
- [x] 2.3 B — the four housekeeping verbs take an optional channel — `f061c1dc`; e2e https://github.com/yasermostafaee/cg/actions/runs/36028052893
- [x] 2.4 C (bridge) — `stack.silence-channel-live-plates` — `50a6ca95`; e2e https://github.com/yasermostafaee/cg/actions/runs/36029483900
- [x] 2.5 D — switching: every per-channel surface follows the channel on screen — `6a8dc8ca`; e2e https://github.com/yasermostafaee/cg/actions/runs/36033228077
- [x] 2.6 C (console) — PANIC on a channel's view, and the every-channel control beside the strip; the A16 test moved with the label — `f7961e3d`; e2e https://github.com/yasermostafaee/cg/actions/runs/36035770252
- [x] 2.7 F — a lock-covered channel's view presents as locked, its verbs absent — `9dd2b887`; e2e https://github.com/yasermostafaee/cg/actions/runs/36037329126
- [x] 2.8 E, M — first-run picks one or more channels; Change channel… edits the set; the Channel pane's legend — `e78d1181` (its own run went red on the Runtime suite's time budget, no assertion failed — see 3.1); e2e https://github.com/yasermostafaee/cg/actions/runs/36041982962
- [x] 2.9 I — every Station setup pane shows values below `station-admin` — `3fd68521`; e2e https://github.com/yasermostafaee/cg/actions/runs/36041982962
- [x] 2.10 G — the playout tab split by channel; H — the subtitle names the channel — `1186f49a`, `f783d1c3`; e2e https://github.com/yasermostafaee/cg/actions/runs/36044276589
- [x] 2.11 L — a channel's messages stay in its view; strip marks — `08deea2a`; e2e https://github.com/yasermostafaee/cg/actions/runs/36046302656
- [x] 2.12 K — `B-263`: Persian chrome in Vazirmatn, measured with CDP — `4858c84b`; e2e https://github.com/yasermostafaee/cg/actions/runs/36048029090

## 3. Shared config

- [x] 3.1 CI: the `e2e` job cap 20 → 24 min, the Runtime suite budget 8 → 10 min (`design.md` §14) — `5831d6c1`; e2e https://github.com/yasermostafaee/cg/actions/runs/36043143440

## 4. Tests (§4)

- [x] 4.1 Channel independence at the wire, two declared channels — a take, a clear, each bulk verb with a channel, the per-channel PANIC; controls: the target channel reached, the every-channel silence reaches both, a bare call unchanged (`multi-channel-banks`, `channel-independence`)
- [x] 4.2 `channelIndependence.dom.test.ts` §3 updated: four verbs take an optional channel; `silenceAllLivePlates` still rejects `{ channel }`, positive control intact; the new verb requires a channel
- [x] 4.3 The lock with partial overlap — the console (`channelSwitch.dom.test.ts` F) and the bridge with two declared channels (`lock-scope.integration.test.ts`, `3ad63a24`)
- [x] 4.4 First-run with two channels, the console (`firstRunChannelStep`, `firstRunStation`) and the permitted-channel push (`authz-strip-freshness`, `de4f12db`); switching; a reload reopens on the lowest declared channel
- [x] 4.5 A load that names no channel is refused on a two-channel station, with its one-channel control (`multi-channel-banks`, `7cca994a`)
- [x] 4.6 Auth OFF with one declared channel: the existing suites green and unchanged apart from the forcing functions of §1.5; the one-channel controls in `channelSwitch.dom.test.ts`
- [x] 4.7 Every absence assertion names its positive control; each new behaviour red under a planted defect first
- [ ] 4.8 The e2e spec `multi-channel.spec.ts` — `e7740f76`; e2e job RAN: (pending)

## 5. Records (§5)

- [x] 5.1 This OpenSpec change; `openspec validate --all --strict`
- [x] 5.2 The owner's A16 follow-up, 2026-09-23, beside A16 in `docs/prd/runtime.md`
- [x] 5.3 `R-062` gaps 1 and 3 → done; `B-263` closed
- [x] 5.4 The bank schema change and its producer/consumer list — `design.md` §1–§2
- [x] 5.5 `docs/operator-guide/README.md`: switching channels, and which PANIC does what
- [x] 5.6 The superseded pending claims rewritten in place (`runtime-redesign-programme`, `add-multibox-audio`, `operator-surface`, `playout-authz-channels`, `station-setup`)
- [ ] 5.7 The installer artifact URLs of the final push (CI builds a fresh pair): (pending)
