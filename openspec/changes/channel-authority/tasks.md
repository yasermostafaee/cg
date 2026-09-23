# Tasks — `channel-authority` (`CHANNEL-AUTHORITY-01`)

## 1. Establish, before changing anything

- [x] 1.1 Every door that names a channel, found by WALKING the request schemas (83 channels, 8 with
      a `channel` key) rather than merging the two earlier lists — `design.md` §1
- [x] 1.2 Operating vs declaration, with the reason for each; `channelSettings.set` corrected — it is
      a configuration door already refused an undeclared channel by its store, not a declaration door
- [x] 1.3 🔴 The hazard MEASURED at the wire before any fix, auth ON and OFF, with the `cg-op2`-shaped
      principal: `layers.clear` → `CLEAR 1-20` and `playoutLayers.clear` → `CLEAR 1-60`, both modes;
      `fixedLayers.clear-layer` / `fixedLayers.load` stopped by `isFixed`; `stack.load` under a
      declared policy → a full take onto channel 1. Filed as `B-261` — `design.md` §2
- [x] 1.4 The D9 bearer mechanism and what guards it — `design.md` §9
- [x] 1.5 `channelList.ts`: inputs, consumers, and how the strip labels a channel — `design.md` §9
- [x] 1.6 The recorded D4 shape (`docs/integration/playout/handoff/2026-09-16/channels.json`)
- [x] 1.7 `#declaredChannels()` and `not-declared`: NOT one predicate before this change — the
      restore fence read the bank directly, the settings store kept a boot copy — `design.md` §8

## 2. Commit 1 — the station fence (🔴 refusal conditions on the path to air, auth OFF included)

- [x] 2.1 `channelNotDeclaredRefusal(channel)` in `@cg/shared-ipc` (`stationChannels.ts`)
- [x] 2.2 `#isDeclaredChannel` — the ONE predicate; public `isDeclaredChannel` for the gate
- [x] 2.3 `stationRefusal` + `CHANNEL_DECLARING_ROUTES` (fenced by default, two exemptions by name);
      `explicitChannel` shared with `channelsForRequest`
- [x] 2.4 Wired into `handleMessage` after the auth gate and before the permission gate
- [x] 2.5 The orphan sweep reads only declared channels
- [x] 2.6 `playoutLayersState()` reports the declared channel, not `DEFAULT_CHANNEL`
- [x] 2.7 `#allocate` places on the declared channel
- [x] 2.8 The restore fence asks `#isDeclaredChannel`; the settings store reads the predicate live
- [x] 2.9 Tests — `station-channel-fence.integration.test.ts`: each of the four doors, auth OFF and
      ON, silent on channel 1 at the wire WITH the declared-channel control landing in the same boot;
      the allocator; the two surface reads, each with its control; the gate order; the census; the
      bank-less restore. `channel-settings-store.test.ts`: the live predicate. Red-first for every
      one of them against the unfixed runtime
- [x] 2.10 The two specs that met the fence, corrected rather than loosened: `authz-gate` (the
      grant sentence now needs a DECLARED ungranted channel) and `lock-scope` (asserted `CLEAR 2-40`
      on a channel-1 station as `B-257`'s fix — inverted; `B-257`'s property kept, proven by PANIC)

## 3. Commit 2 — the discovery call (`R-062` gap 2, `C-039`)

- [x] 3.1 `channels.list` + `channels.changed` (`@cg/shared-ipc` `stationChannels.ts`): per channel
      `named` / `declared` / `permitted?` / `sources`, kept separate; one composition,
      `stationChannelsFor`
- [x] 3.2 Sources in order: D4, then the bank, then channel settings
- [x] 3.3 D4's read (`playout-catalogue.ts`): a fixed 30 s floor, `If-None-Match` / `304`; the
      bearer is `PlayoutAuth.usableBearer()` — checked AT USE, never expired or revoked, gone on
      sign-out; any failure ABSENT, no alarm; auth OFF builds no reader
- [x] 3.4 The join: `casparHost` in `configuredCasparHosts` + `casparChannel`; another host's row
      joins nothing
- [x] 3.5 The strip: declared channels only, the name in its own `<bdi>`, the number on `title`
      (`TabSpec.label` takes markup; `TabSpec.title` added)
- [x] 3.6 Preview channels `N+1..2N` never addressed or probed — pinned at the wire
- [x] 3.7 The fake Playout serves D4 (`FAKE_CATALOGUE`: channel 1 the Playout's programme, channel 2
      ours), records every bearer presented; `cg-op-both` holds both; the demo station is on
      channel 2
- [x] 3.8 Tests — `station-channels-discovery.integration.test.ts` (the answer; the join; auth OFF;
      the 30 s floor + `304`; ABSENT on an outage, verbs unchanged; revoked and expired bearers
      never presented, mutation-checked; sign-out; the push; nothing past the lists probed);
      `channelList.test.ts` + `channelStripNames.dom.test.ts` (catalogue-only channel absent, each
      beside the declared control; the isolate; the fallback); `playout-authz.spec.ts` E2E (the
      name on a real page; `cg-op-both` offered channel 2 only). Every absence names its control

- [x] 3.9 An auth-OFF console is pushed nothing its answer did not change (the dedupe is seeded when
      the socket is already deliverable) — red-first against commit 2, which pushed one copy per
      connect; and a sign-in is ALWAYS pushed its answer (the viewer case, mutation-checked)

- [x] 3.10 A due catalogue read goes when it falls due: the tick looks every second, the 30 s floor is
      unchanged — found by driving the §7 demo (an outage took ~60 s to reach the strip), red-first
      in `playout-catalogue.test.ts`
- [x] 3.11 The demo takes `offline` / `online` on stdin, so §7 step 3 can stop the fake Playout
      without stopping the bridge — driven end to end: name gone 30.7 s after `offline`, a clear on
      channel 2 answered by its handler throughout, name back 29.8 s after `online`

## 4. Records

- [x] 4.1 `B-261` filed; `B-257` noted (its spec asserted this hazard as a fix)
- [x] 4.2 The bank half closed where it was filed open, citing commit 1 (`9d114657`): `C-038`'s
      status, `playout-auth-signin/proposal.md`, `B-261`
- [x] 4.3 `R-062` gap 2 → done; gaps 1 and 3 and A16 untouched
- [x] 4.4 `C-039` → `[~]`
- [x] 4.5 `docs/integration/playout/README.md` item 14 — what we read from D4, how often, with whose
      bearer, and that it can never widen what we write to

## 5. Gate and discharge

- [x] 5.1 Commit 1 (`9d114657`): `pnpm gate` green (93/93, 0 cached); pushed; Linux `e2e` discharged
      by https://github.com/yasermostafaee/cg/actions/runs/35837546906 — `conclusion: success`,
      and the `E2E (Playwright)` job RAN: its `E2E` step concluded `success` (08:31 → 08:45 UTC),
      read back from the API; only the browser-install step skipped, on a cache hit
- [ ] 5.2 Commit 2: `pnpm gate` green; pushed; `e2e` run URL recorded with the job confirmed RAN
