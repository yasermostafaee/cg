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

- [ ] 3.1 The discovery channel on the contract: per channel `named` / `declared` / `permitted`,
      kept separate
- [ ] 3.2 Sources in order: D4, then the bank, then channel settings
- [ ] 3.3 D4's read: ≤ every 30 s, `ETag`; a bearer never revoked or expired, released on sign-out;
      any failure ABSENT, no alarm; auth OFF → no read
- [ ] 3.4 The join: `casparHost` + `casparChannel` against `configuredCasparHosts` and the declared
      channel
- [ ] 3.5 The strip: declared channels only, under the catalogue's name when the join matches
- [ ] 3.6 Preview channels `N+1..2N` never addressed or probed
- [ ] 3.7 The fake Playout serves D4: channel 2 named, channel 1 as the Playout's programme channel;
      `cg-op-both` holds both
- [ ] 3.8 Tests, each absence beside its control; E2E for the strip

## 4. Records

- [x] 4.1 `B-261` filed; `B-257` noted (its spec asserted this hazard as a fix)
- [ ] 4.2 The bank half closed where it was filed open, citing commit 1
- [ ] 4.3 `R-062` gap 2 → done; gaps 1 and 3 and A16 untouched
- [ ] 4.4 `C-039` → `[~]`
- [ ] 4.5 `docs/integration/playout/README.md` — what we read from D4, how often, with whose bearer,
      and that it can never widen what we write to

## 5. Gate and discharge

- [ ] 5.1 Commit 1: `pnpm gate` green; pushed; `e2e` run URL recorded with the job confirmed RAN
- [ ] 5.2 Commit 2: `pnpm gate` green; pushed; `e2e` run URL recorded with the job confirmed RAN
