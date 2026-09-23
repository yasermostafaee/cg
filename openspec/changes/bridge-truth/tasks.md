# Tasks — `BRIDGE-TRUTH-01`

## 0. Preconditions

- [x] Pulled; clean tree on `dev`; remote head = local (`f07ddf10`)
- [x] `OPERATOR-NAME-SWEEP-01`'s missing `e2e` URL recorded in `operator-name-retirement/tasks.md`
      before anything else (`5c07fc09`), both runs read back at STEP level

## 1. The exemption audit (§1)

- [x] The table — `design.md` §1 and `B-257`. Four lines MEASURED by scratch specs, run and
      deleted; §1 changed no code
- [x] The live line reported and the session stopped before §2 (`eab83bee`)

## 2. Commit 1 — the lock and auth axis (`REPLY 1` R1 + R2)

- [x] 🔴 PANIC check done BEFORE building and reported first — `design.md` §3
- [x] `B-257` — `LockState.channels`; `lockScopeAtEngage` / `coveredChannelsHeld` /
      `lockReaches` / `lockRefuses`; `refusedWhileLocked` untouched (the census pins it)
- [x] `B-257` constraint 5 — `lockCoverage` (`useLock.ts`); lock screen, status-bar slot and
      channel strip read it
- [x] `B-259` — the `auth` frame refuses a DIFFERENT principal on a console the lock reaches
- [x] `B-260` (a) `template-redeliver` / `template-remove`; (b) an overwriting re-delivery is
      refused under a lock — refuse, not defer (no new state); re-sent at the next resync
- [x] `B-258` — `isReconnectMachinery` suppresses the `refused` row, never the refusal
- [x] `lock-scope.integration.test.ts` — 9 cases; **RED FIRST against the old bridge: 6 failed**;
      the 3 that pass on both sides are the byte-identity guards
- [x] `lockCoverage.test.ts` — the console's one decision
- [x] `playout-authz.spec.ts` — two contexts, two principals; the absences on page two are read
      only AFTER that page proved it heard the lock. Local Windows run: 4/4 (non-authoritative)
- [x] `lock-refuses-intents.integration.test.ts` unchanged and green
- [x] `cg-op-ch2` added to the fake Playout (`FAKE_CHANNEL_TWO_OPERATOR`)
- [x] `pnpm gate` green — 93/93 tasks, `0 cached`, control-bytes clean, 86/86 OpenSpec items
- [ ] Commit + push; remote head verified
- [ ] 🔴 Linux `e2e` run URL, with the `E2E (Playwright)` job confirmed to have RAN

## 3. Commit 2 — §2 + §3, with `REPLY 1` R3's corrections

- [x] §2 confirmed in OUR code before fixing — `B-253`'s annotation: LOAD sends nothing; the
      restore re-ADD and `setPosition`'s re-ADD stop after the muted `CG ADD`; our take was
      always audible (R3a — severity corrected there, heading kept as filed)
- [x] `#reassertDeclaredVolumes` traced (`8248c7ee`, R-022, predates the ADD-mute
      `6336af29`) — not this fix's predecessor, not dead, left in place
- [x] `#resetEmptiedLayerMixer` — `MIXER <ch>-<layer> CLEAR` after a landed `CLEAR` inside the
      declared bank, at `out` / `remove` / bank clear / orphan clear; NOT playout, NOT adopt
- [x] R3(c) — our "`MIXER CLEAR` leaves volume alone on the real one" had NO source; removed from
      `command-builder.ts` and the mock, which now models the Playout team's measurement
- [x] R3(b) — the discriminating test replaces the vacuous one: raw `PLAY` after our clear, then
      `MIXER … VOLUME` over the wire — **RED FIRST: read `0` against the old bridge**
- [x] Guards with live controls: outside the band (CLEAR sent, no reset); a refused CLEAR (CLEAR
      sent, no reset, the mute read back untouched)
- [x] §3.1 `CommandBuilder.info(channel)`; both inline sites replaced; guard + control
- [x] §3.2 no reader parses `<volume>` (bridge and `shared-ipc` guards, each with a control)
- [x] §3.3 the fork's `<limiter>`/`<lufs>` change no reading — read, then pinned
- [x] The band reader — `@cg/caspar-client` `readBandVolumes`: 50 layers in 2.7 ms against the
      loopback fake (the Playout team's 182 ms is the real-server figure)
- [x] R3(d) `occupancy-tap.ts` corrected; "no producer, never clean" — one emitted probe line and
      one comment corrected, old wording swept to 0
- [x] `docs/integration/playout/README.md` item 13
- [x] `pnpm gate` green — 93/93, `0 cached`. ⚠ The FIRST run was red on one test of this
      commit's own: R-022's boot blanket re-asserted `VOLUME 1` after the muted re-ADD under the
      gate's load. The test now waits for the blanket before building state — the race was the
      test's setup, not the product
- [ ] Commit + push; no `e2e` owed — nothing here renders (the CI run is still read back)

## 4. Commit 3 — §4

- [x] `CONSOLE_ACTOR = 'console'` — the operator's word for the device ("The console is locked");
      names no person, so it claims no identity. Reserved in `normalizeActor` like `template`
- [x] `runAsActor` records `console` for a principal-less request and no longer reads the wire's
      `actor` — the last live path for a self-declared label. `unattributed` stays for appends no
      request caused. The mock writes `console` (every mock row is a press at this console)
- [x] `audit-actor.integration.test.ts` REWRITTEN — it pinned the retired label reaching the row.
      **RED FIRST against the old attribution: 6/6 failed.** Its first case carries its own control
      (a machine row, `unattributed`, in the same file)
- [x] `auth-principal`'s control REBUILT: it relied on auth OFF believing the wire
- [x] `library-audit-geometry.spec.ts:282` → `toBe('console')`: with two reachable values it now
      tells a console's press from the machine's act, and a typed name coming back reds it
- [x] Four unarchived deltas amended IN PLACE — `operator-name-retirement`,
      `runtime-redesign-programme`, `audit-actor-console-name` (two requirements still MANDATED
      the declared name in SHALL terms — superseded here), `template-signals-completion`
- [x] Rule-9 sweep: the old column title (0 left, control 1); class axis `data-audit-actor-head`;
      value axis `unattributed` across tests, e2e, docs, living and pending specs
- [x] §6 — `R-066`'s "44 files" corrected to 21 files / 41 hits, measured at `546258d3`; the
      `LayerRow` prop rename filed as a candidate under `R-066`

## 5. Discharges

- [x] 🔴 **Commit 1 (`66dfbf8b`) — Linux `e2e` discharged** —
      https://github.com/yasermostafaee/cg/actions/runs/35797043689 · `conclusion: success`, and
      the `E2E (Playwright)` job's `E2E` step `completed · success`, read back from the API
- [ ] Commit 2 (`34ee9ec2`) — renders nothing; its run is read back for the whole-tree jobs
- [ ] Commit 3 — renders (the audit column's title and value); its `e2e` is owed
