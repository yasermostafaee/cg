# Tasks — the single-clock look switch

## 1. SPEC — the amendments, quoted (landed 2026-09-01)

- [x] 1.1 **`C-015` — "a dedicated layer BELOW the template's layer" INVERTS for a plate-bearing
      package.** The acceptance sentence today reads _"the bridge allocates a dedicated layer below
      the template's layer, plays the mapped producer there, and applies MIXER FILL derived from the
      Live Source's scene-px geometry"_, and `design.md §4` states the constraint as _"Templates sit
      on 70–99; C-015 needs sources BELOW the template's layer."_
      **The new rule:** a template that declares live plates is placed on a SECOND DECLARED BANK,
      **layers 1–9**, BELOW every live-source layer; a template that declares none keeps the operator
      bank at 70–99, above them. The live band itself does not move.
      **Why 1–9:** they are free — `DEFAULT_LAYER_POLICY` spans 10–69, the bank is 70–99, playout owns
      60–69, and the suggested Live Source band starts at 10 — and they are below every live band a
      station can declare, because `LiveSourceLayerRangeSchema` is validated disjoint from the bank
      and the reserved range. Layer 0 is excluded: it is legal but reads as "unset" in too many
      places to spend the ambiguity on one slot.
- [x] 1.2 **`design.md §9a` — "painting nothing is not the same as ERASING" no longer costs
      anything.** The punch exists because _"The whole HTML page is ONE CasparCG layer, sitting above
      the Live Source layers … painting nothing is not the same as ERASING what is beneath it in the
      same page."_ **That sentence is still true and stops applying**: with the plate-bearing page
      BELOW the plates there is nothing above the live layer to erase. The argument is not refuted —
      its premise is removed. What made removing it affordable is `B-195`: across the client's twelve
      packages and the repo's nine, **no element draws over a live picture**, so nothing on that page
      needed to survive above a plate.
- [x] 1.3 **`design.md §9a-Z` (`:2628`) — RE-SCOPED, with the flip-back shape recorded verbatim.**
      The 2026-08-15 ruling stands as written — _"Name supers over a live guest are ordinary
      broadcast, not an edge case"_ — and is satisfied by SEPARATE ROWS rather than by elements inside
      a plate-bearing template; `B-195` found zero CLASS 1 elements in either population.
      🔴 **The flip-back shape, verbatim from `B-195`:** _"A name super **positioned under a
      particular guest BOX** is CLASS 1: its geometry follows the box, so it must move on the frame
      the fills move. Nothing in the client's set does that today … but it is the obvious next thing
      to author for a multibox layout."_ **Authoring guidance follows from the audit rather than from
      taste: a super that must sit under a box re-imposes frame alignment; a super at a fixed place
      on its own row never does.**
- [x] 1.4 **`design.md §9b.5` — its 2026-08 rejection, and whether the reorder is that shape.**
      Quoted: _"**two artifacts to coordinate instead of one.** The backdrop's geometry and the holes'
      geometry would live in two places that can drift, and the export would have to emit a backdrop
      artifact CasparCG can play — which `proposal.md` currently rules out."_
      **The objection does NOT transfer, on both halves.** (i) There are no holes to drift against —
      the mask is retired, so the only geometry is the plate rects, computed once by
      `collectLiveSources` and consumed once by `MIXER FILL`/`CLIP`. §9b.5's two geometries become
      one. (ii) The export emits no new artifact: the backdrop stays INSIDE the template's own page,
      which is simply placed lower. `.vcg` is unchanged.
      ⚠ **And the objection IS honoured where it does apply** — it is exactly why `design.md §1`
      rejects the "item's slot ≠ its row" shape, which would put one layer coordinate in two places.
- [x] 1.5 `openspec validate --all --strict` clean.

## 2. THE REORDER — BUILT 2026-09-01, NOT LANDED (see §4)

- [x] 2.1 A second declared bank, low, defaulting to 1–9: `LowFixedLayerBankSchema` on
      `FixedLayerBankSchema` (DEFAULTED, so a bank written before it parses into 1–9 and no reader
      branches on absence), validated disjoint from the operator half (`banks-overlap`), the policy
      ranges and the reservation, and BELOW the Live Source band (`low-bank-not-below-band`, checked
      in `validateSourceCatalog` because the BAND is the side that can move).
- [x] 2.2 Classification at import: `requiredBankFor`, off the carrier `collectLiveSources`
      produces. No operator choice, no flag. An ABSENT carrier resolves `high`, with the positive
      argument written at the function.
- [x] 2.3 Refusal by name on the wrong bank, BOTH directions (`wrong-bank`), and the template picker
      reads the SAME predicate so the surface can never offer a placement the bridge refuses.
- [x] 2.4 Restore: MIGRATE a retained bed to the highest free bed row and REPORT it
      (`stack.restore`'s `migrated`, its own panel notice). The ROW moves and the AIR does not — the
      migrated row comes back `loaded`, so the wire is untouched; `no-bed-row` when the group is full.
- [x] 2.5 `B-039`'s pre-roll `CG ADD`, the union pre-seat, the take path, `setActiveLook`,
      `#tellPageLook`, `#recordActiveLook`, the level-2 freeze and `reconcileLivePlates` all keep
      working — 723 bridge tests green, including the whole-list wire-sequence pin.
- [x] 2.6 `C-028` re-proved on the plant: measured in §4's campaign rather than inherited. Under
      `contain` the fills and clips are equal on the wire, and the frame outside a plate is the BED
      PAGE — the classifier's BLACK class is exactly "belonging to neither look", and it read **0 %
      in 100 recordings of 100**. Black behind a plate would have been the loudest reading it has.

🔴 **THE IDENTITY DID NOT SPLIT, which is what `design.md` §1 made the condition.** Sites touched:
`#slotForRestore` (the migration branch) and the fixed-state publish (`layerAlias`, so a bed row's
alias is not dropped). Sites NOT touched, because they key on the `(channel, layer)` coordinate and
never ask which half it came from: **`#layers.bindFixed` / `isFixed` / `fixedSlots` / `unbindFixed`,
`#slots` and all 43 of its read sites, occupancy, quarantine, `clearLayer`, `#reassertDeclaredVolumes`
and the LayerManager itself.** `fixedBankSlots` hands them one union; that is the whole trick.

## 3. RETIRE THE MASK — DONE 2026-09-01, and it lands WITH section 2

- [x] 3.1 Removed: `liveSourceMask` / `LiveSourceMask` / `MaskHole` (`scene.ts`), `sceneMaskHoles`,
      `intersectPunches`, `PlateFits`, `PlateFitFacts` and `ArrangementView.transitionFrom`
      (`scene-flatten.ts`), `live-source-punch.ts` entire, the build funnel's `punchLiveSourceHoles`
      and `ctx.punchTargets`, `runtime.ts`'s re-punch, and `liveArrangementView`.
- [x] 3.2 Removed: `CgControl.from` and `CgControl.plates` with `readPlateFits`, the bridge's
      `#plateFits` / `fitsOverride` / `planFits`, `updateLook`'s two extra arguments, the narrow /
      settle pair in `setActiveLook`, and `--look-transition-lead-ms` / `--look-transition-tail-ms` /
      `--no-look-transition-mask`. ⚠ `CgControl.look` SURVIVES — the page still flips its own
      decoration — and so does `--look-mixer-hold-ms`, at its untouched default.
- [x] 3.3 Second consumers named and kept: `B-178`'s `fitProvenance` (the operator-facing report of
      where each mode came from) is untouched and now carries the punched-seat-wins guard on its own;
      `applyArrangementGeometry` is untouched (a moved plate still takes its geometry with it, read by
      `collectLiveSources` for `MIXER FILL` instead of by a mask); the two Designer copies of
      `intersects` are untouched, only the third with nothing left to test went.
- [x] 3.4 The export format is unchanged, and it is checkable rather than asserted: `sceneMaskHoles`
      ran in the BROWSER at build and at re-punch, and `collectLiveSources` — the thing that crosses
      into the package — records plate rects and never held a hole. `@cg/vcg-format`'s 155 tests,
      including the pack/unpack/verify round trip, are green with no fixture edited.

## 4. 🔴 PROVE ZERO — MEASURED 2026-09-01, AND IT DID NOT PASS. NOTHING WAS PUSHED.

- [x] 4.1 The SAME file-consumer harness that produced the 20 / 30 / 60 ms numbers, same probes, same
      artefact classifier, at `1080i5000`. The only harness change is WHERE THE PAGE SITS: the
      template is taken onto bed row 9 through `loadFixed`, with the live band at 30–39 above it.
      A third look and a third plate were added to match the owner's real template (`B-164` records
      his as 1 box / 2 boxes / 3 boxes), and the probe-placement check now runs over EVERY ORDERED
      PAIR of a multi-look fixture rather than only the first two.
- [x] 4.2 `1↔2`, `1↔3`, `1→2→3`, `3→2→1`, ten recordings each, plus forty more of the leg that
      failed. **100 recordings.** Per recording: BLACK frames, MISPLACED frames, DROPPED frames.
- [x] 4.3 **ACCEPTANCE: MET, on the second campaign.** The first (2026-09-01) found ONE residual
      and it was filed and closed as `B-198`; the campaign was then re-run UNCHANGED on
      2026-09-02 and every term reads zero. **BLACK: 0 in 100 of 100. DROPPED: none — nothing
      discarded, worst cadence deficit 2 frames of ~76. MISPLACED: 0 in 100 of 100. `k`, the
      page-against-mixer skew this change targets: 0 channel frames in 100 of 100.**
      🔴 **The campaign is the REGRESSION check and not the proof.** A 1-in-50 event cannot be
      shown gone by 100 clean recordings, so the proof is the FORCED reproduction: the split made
      to fire on demand at the send seam produced the reported artefact on 6 of 6 before the fix
      (`k` = 0, misplaced 22.68132716049383 % — the departing box's own area to the last digit)
      and 0 % on 10 of 10 after it, **with the forcing still in place**.
- [x] 4.3a The first campaign's finding, for the record: **NOT MET on 2026-09-01.** BLACK: **0 in 100 of 100.** DROPPED: **none — no recording was
      discarded and the worst cadence deficit anywhere was 2 frames of ~76.** `k`, the page-against-
      mixer skew this whole change targets: **0 channel frames in 100 of 100**, which is the first
      zero any `B-174` campaign has produced. MISPLACED: **0 in 99 recordings and 2 frames (40 ms,
      one channel frame) in one** — `seq-3-2-1` run 06, where `MIXER 1-30 FILL` landed a frame before
      `MIXER 1-31 FILL` and the departing box was drawn over the arriving plate. Filed as **`B-198`**.
      An improvement is not a fix: the change is NOT pushed.
- [x] 4.4 Per-look decoration skew on the bed page: **zero, and verified rather than assumed.**
      `B-195`'s audit of the owner's own package found ONE non-plate element in the whole scene — a
      full-frame image on the ROOT layer, below all three look instances — so no decoration changes
      with the look and there is nothing to skew. No per-look-decoration case exists in either
      population (the client's twelve packages or the repo's nine), so no frame count can be given
      for one; that is a statement about the corpus, not a measurement that was skipped.
- [x] 4.5 Term (b), producer start latency (`B-192`), is **UNTOUCHED by this change** and its
      measured value stands at **+2 … +4 fields (40–80 ms)**. It is invisible in this campaign only
      because the `ghab3` fixture seats every plate in every look on purpose, so no producer is ever
      started inside a window. On the owner's real template a look that reveals a box whose producer
      was parked will still show that box dark for 40–80 ms, and no compositing order changes it.

## 5. `B-196` — WIRE `minRuntimeVersion` (landed 2026-09-01)

- [x] 5.1 `CG_RUNTIME_VERSION` + `parseSemver` / `compareSemver` / `runtimeShortfall` /
      `runtimeShortfallMessage` in `@cg/shared-schema`'s `runtime-version.ts`, with the direction and
      the fail-open decision argued in the header.
- [x] 5.2 The exporter writes the real contract version instead of the literal `'0.0.0'`.
- [x] 5.3 The Runtime app compares at import, before the render, and refuses with one sentence naming
      the package and BOTH versions.
- [x] 5.4 Tests, RED-FIRST: neutering the comparison reddens the two guard tests.

## 6. Border-radius — written answer (landed 2026-09-01)

- [x] 6.1 Filed as `B-197`. Under the reorder a rounded plate has nothing above it to hide its square
      corners, so the home §9a.1 recorded ("the CSS hole rounds") disappears with the punch. The only
      home that does not re-impose frame alignment is producer-side, via a keyer layer — unmeasured.
      The overlay-row alternative is CLASS 1 by construction and must not be used.

## 7. 🔴 THE LINUX `e2e` DEBT THIS CHANGE OWED — undischarged for three runs, discharged 2026-09-02

`a7976e14` altered UI, so CLAUDE.md's "E2E coverage" rule owed it a COMPLETED, GREEN `e2e` job
cited by run URL. It never got one, and nothing here recorded that it was outstanding.

- [x] 7.1 **Why no run existed, measured rather than assumed.** The classifier was NOT at fault: it
      scores `a7976e14` `{ kind: 'code', needsE2e: true }`, and 90 of the 91 changed files force
      that verdict independently. `a7976e14` was the MIDDLE COMMIT of a batched three-commit push,
      and GitHub creates one run per push keyed to the push's head — so
      `gh api ".../runs?head_sha=a7976e14…"` returns **`total_count: 0`**, as it does for
      `3bbe1727`. The rule's first clause fires from the diff and works; its CITATION clause is
      enforced by nothing, which is why the gap was invisible.
- [x] 7.2 **What the missing runs were hiding.** Eleven Runtime specs, failing on this change's own
      `wrong-bank` refusal against specs it invalidated and never updated (`B-201`). The three runs
      that did exist could not say so: turbo buffers a task's output until the task completes and
      the job's 20-minute cap killed it first, so a RED suite and a SLOW one produced byte-identical
      evidence — conclusion `cancelled`, zero bytes from the suite (`P-038`).
- [x] 7.3 **The runs that do NOT discharge it, named so the record cannot be misread.**
      `eb228a64` — [33632277519](https://github.com/yasermostafaee/cg/actions/runs/33632277519),
      `E2E (Playwright)` **cancelled** on attempt 1 (20m17s) AND on attempt 2 (20m20s).
      `68da3bfe` — [33637419829](https://github.com/yasermostafaee/cg/actions/runs/33637419829),
      **cancelled** (20m19s). A cancelled run is neither a pass nor a fail and proves nothing.
- [x] 7.4 ✅ **DISCHARGED** —
      <https://github.com/yasermostafaee/cg/actions/runs/33656454945> — head `96090c49`, a later
      `dev` HEAD carrying this change; `completed` + **`success`**, with the **`E2E (Playwright)`
      job RUN, not skipped** (9m19s), alongside a green `Lint • Typecheck • Test • Build`. Both
      suites executed on `ubuntu-latest`: designer `287` collected → 274 passed + 12 skipped + 1
      flaky (`live-source.spec.ts:492`, green on retry #1), runtime **`93 passed (1.6m)`** — the
      eleven that had been failing among them. The local Windows `gate:e2e` is not what discharges
      this and is not cited as such.
- [x] 7.5 ✅ **`BANK-HALF-SWEEP-01` (B-204 / B-205 / P-039 / P-040) — DISCHARGED** —
      <https://github.com/yasermostafaee/cg/actions/runs/33666146082> — head `723a149e`, the
      `dev` HEAD carrying `eac8f3ed` (both bridge walks iterate `fixedBankSlots`), `f8f6b10c`
      (the `cg/bank-shape` guard and its 16 site fixes, five of them in the runtime's bank-config
      modal and mock) and `723a149e` (the gate log); `completed` + **`success`**, with the
      **`E2E (Playwright)` job RUN, not skipped** — started `18:16:24Z`, completed `18:26:50Z`
      (**10m26s**) — alongside a green `Lint • Typecheck • Test • Build` (9m11s). The
      pre-push gate for the same push ran `93 successful, 93 total`, `0 cached`, exit 0 in
      214.7 s, and its full output is the first `.gate-logs/gate-*.log` written by P-040.

## 8. `B-221` — the abort the `DEFER` batch had left open (2026-09-05, `MIXER-DEFER-ABORT-01`)

`B-198` staged the batch; `B-199` put its commit in a `finally`. This section is the path a
`finally` cannot close — a link that dies between the first `DEFER` and the `COMMIT` — and the record
of what was established before it was touched. The full account is `B-221` in `docs/prd/bugs-runtime.md`.

- [x] 8.1 **State first, nothing fixed.** `B-198` closed AND verified (`eb228a64`; 4.3 above);
      `B-199` closed in code with two red-first tests (`68da3bfe`); `B-200` filed only, un-deferred
      by decision and untouched; `command-builder.ts` carries no ban text; `CommandQueue`
      `pipelineDepth: 4` at `command-queue.ts:109` with the awaited send inside `#send` — ⚠ the
      remembered anchor `caspar-runtime.ts:6022` was the `B-199` guard's doc comment, not the seam.
      The staging map has ELEVEN emitters, not eight: the remembered eight plus
      `#applyLivePlatesUnguarded` (all three `DEFER` sites, both in-line commits),
      `#commitStagedMixer` (the one sender) and `#reassertLedgerGeometry` (the repair).
- [x] 8.2 **The one question, answered flatly: YES.** One reachable class — the socket dying
      mid-batch (and its sub-case, a commit that times out against a hung server) — where the
      commit is SENT twice (the failure path, the `finally`) and cannot ARRIVE, the lines acked before
      the death are staged-and-abandoned, and `#commitStagedMixer` had drained its field before
      sending so nothing remembered them. Every other candidate is NOT reached, each cited in the
      item. Plus process death, which no in-process guard can see.
- [x] 8.3 **From 2.5.0's source** (`v2.5.0-stable`, `AMCPCommandsImpl.cpp`, `transforms_applier`):
      the staging area is a process-wide `static` vector per channel index, appended by `DEFER`,
      applied-then-cleared only by `COMMIT`; `mixer_clear_command` and `clear_command` never touch
      it; there is NO discard verb. "Persists indefinitely" is correct, and structural.
- [x] 8.4 **The fix, red-first with a SERVER-SIDE injector** (the mock's `MIXER` handler stages the
      first deferred line, then destroys the socket before the ack): `#sendMixerCommit` judges a
      commit's landing by `ok && onPrimary` and records `#orphanedMixerChannel` otherwise;
      `#flushOrphanedStaging` commits the orphan on the primary's next `healthy` and re-asserts the
      ledger's geometry through `#reassertLedgerGeometry`. RED: `the orphan is committed: expected []
to deeply equal [ 'MIXER 1 COMMIT' ]` after a live reconnect handshake. GREEN with the injector
      in place; the byte-for-byte golden sequence unchanged; 66 of 66.
- [x] 8.5 **The mock learned the verb pair** — it had applied `DEFER` lines at once and answered
      `400` to `COMMIT`. Now one queue per channel, owned by the mock, in-order apply on commit, the
      commit's layer token ignored, untouched by `CLEAR`/`MIXER CLEAR`/undeferred lines;
      `stagedMixerCount(channel)`; six tests in `live-producers.test.ts`.
- [x] 8.6 **The guard at the send seam**, proved by reintroduction: the arm removed from the seating
      loop's staging site → 62 of 66 red, 186 `INVARIANT (B-221)` hits; restored → 66 green. What it
      cannot see is enumerated in the item (seven shapes).
- [x] 8.7 **The dormancy recorded where the mixer path is changed** — `deferMixer`'s doc in
      `command-builder.ts`: channel-wide + shared (measured), two senders ever on the plant's
      retained logs as of 2026-09-05 (`192.168.21.93`, `Console`), the enumeration command, and the
      wake condition (any second client — the owner's playout system first, hence `reservedLayers`).
- [ ] 8.8 **OWED / OPEN.** The plant run of the reconnect path (no AMCP was sent to
      `192.168.21.114` this session, by instruction). The owner's decision on the process-death half:
      an unconditional connect-time `COMMIT` (complete, and the cross-connection exposure itself) or a
      persisted open-batch flag beside the ledger (bounded to our own work, a hot-path disk write).
