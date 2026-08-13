# Tasks — the playhead drives the canvas, and the loop range is authorable

> ✅ **§9.1–§9.4 ANSWERED (2026-08-12). The Lottie half (§4) and the carve-out (§6) are BUILT.**
>
> Every implementation task still carries its **GATE** naming the `design.md` §9 question behind
> it, kept as the record of what unblocked it. Answering §9.3 opened ONE new question — **§9.5**,
> the forward-1× hybrid — and it gates **§5 (the video half) alone**. Nothing in D-133 is gated any
> more.
>
> Both D-133 and D-135 were marked RECON-FIRST in `docs/prd/designer.md` and both owed a design
> before code. The design debt is discharged; the code lands in the sequence §4 → D-133 → §5.

## 0. Design phase — COMPLETE

- [x] Recon: the canvas's playhead path (`CanvasArea` → `scrub` → `runtime.tick(frame)`) — §1.1
- [x] Recon: what `tick(frame)` actually touches, and what it omits — §1.2
- [x] Recon: **the canvas's PLAY is already a scrub stream** (`TransportBar` → `setCurrentFrame`
      only; the canvas never receives the `play` action) — §1.3
- [x] Recon: **the transport plays BACKWARD (`J`) and BOUNCES** — the fact that decides §5 — §1.4
- [x] Recon: the driving-element set — the "six places" claim corrected to ONE canonical predicate + one documented mirror + three call sites + two unrelated predicates — §1.5
- [x] Recon: `video-driver.ts`'s architecture statement confirmed verbatim; no stepped frame driver
      exists in the engine — §1.6
- [x] Recon: `holdBehavior: 'freeze'` confirmed as the shipped positioned-`<video>` precedent — §1.7
- [x] Recon: SESSION I's `live()` resolver read, and its constraint on this design recorded — §1.8
- [x] **D-133's core decision: map the loop range onto the SHIPPED lifecycle** — the mapping is
      exact, no new lifecycle mode is proposed, and the seam-continuation rule falls out free — §3
- [x] **D-135's architecture question ANSWERED with evidence and cost**: position by `currentTime`,
      not play-and-re-anchor — §5
- [x] The ticker/sequence/clock carve-out preserved verbatim and raised to its own requirement — §6
- [x] Spec deltas authored (`designer-playout-lifecycle`, `designer-animation-timeline`)
- [x] Four owner decisions recorded as OPEN QUESTIONS, each with both candidate answers and their
      costs — §9

## 0a. Corrections folded back in (2026-08-12) — the design was re-read against the tree

- [x] 🔴 §1.5's "`hasContentElement` counts no Lottie, no video" was **FALSE** — it counts opted-in
      media exactly as the canonical predicate does. The REAL divergence is `drivesHold` on
      ticker/sequence/countdown clock and D-112 `holdOverrides`, in BOTH directions — §1.5
- [x] 🔴 §8 risk 5 rewritten: this change removes the divergence at "Pin content start" ONLY; the
      Hold-source select and the `ContentHoldChecklist` keep it. Recorded as a residual, **not
      fixed here**, and **no item number minted** — §8 risk 5
- [x] 🔴 §3.5's "this is also a bug fix" claim withdrawn — it rested on the false reading
- [x] 🔴 §5.2 note 3 corrected on BOTH counts: the GOP is a **fixed 1 s** (`-g 25 -keyint_min 25`),
      not ~5 s, so a seek decodes ≤25 frames not ~125; and **`fastSeek()` does not exist on this
      engine** (absent from Chromium, absent from this repo), so the recommendation is removed
      rather than hedged
- [x] `video-driver.ts`'s stale "~5 s keyframe interval" comment annotated **at its own site**, so
      the premise is not re-derived from it

## 0b. Owner decisions — ANSWERED

- [x] **`design.md` §9.1** — loop range under a `timed` hold: **INERT (a), as filed** — AND the
      surface must state that it is inert and what would make it active. Three of this question's
      own cost claims were corrected in the process (empty affected set; the real exposure is
      compositions that HAVE drivers and never touched the hold select; there are THREE hold states,
      not two)
- [x] **`design.md` §9.2** — **NO**: remove only the `hasContent` half of the gate, keep
      `lifecycle !== undefined`. The shipped "Add out point" button IS the path; no implicit
      promotion out of `static`, and no new compound verb
- [x] **`design.md` §9.3** — **(a)**, position backward and bounce like forward. MEASURED
      2026-08-12: backward 10.6 distinct frames/s against forward 10.2 — the question's premise
      ("backward is the worst case") is true of PLAYBACK and false of POSITIONING
- [x] **`design.md` §9.4** — **(a)**: every Lottie and every video follows the playhead, regardless
      of `drivesHold`. The two are orthogonal, and the spec now says so
- [x] **`design.md` §9.5 — ANSWERED 2026-08-13: (a), position everywhere; the HYBRID is
      REJECTED.** ONE mechanism for all four transport modes — no hand-off at mode boundaries, no
      second path on a surface that reparents nodes (B-137's shape, the risk the question itself
      named). The ~10 fps cost is already the stated §5.2–§5.3 contract; follow mode parks a
      backdrop at `H` for most judging time; the hybrid stays recoverable (the driver machinery
      ships). Both candidates kept in §9.5 as the record of why

## 1. D-133 — authoring the loop range ⟨§9.2 ANSWERED⟩ ✅ DONE

- [x] Remove the `hasContent` half of the "Pin content start" gate (`PlayoutSection.tsx`), so the
      loop option is offered on a shapes-only scene that has an out-point. The
      `lifecycle !== undefined` half is KEPT, and the gate at the Hold-source select /
      `ContentHoldChecklist` is untouched by design (§8 risk 5's recorded residual)
- [x] **No change to the out-point path** — §9.2 settled it: the existing "Add out point" button IS
      the path, and authoring a loop range must NOT create an out-point as a side effect. This item
      is a decision to make no change, kept visible rather than deleted, and it carries a test: the
      loop-range surface never calls `setLifecycle`, with the out-point path as the CONTROL that
      proves the spy discriminates (`loop-range-authoring.dom.test.ts`)
- [x] Regression guard, **not a fix**: a composition whose only hold driver is an opted-in Lottie
      can pin its content start. This already holds today (`hasContentElement` counts opted-in
      media) — the earlier "removing the gate resolves a discrepancy" claim was false and is
      withdrawn — so the test exists to keep it true, not to prove a change
- [x] Name the three loops distinguishably on the surface — **DECIDED and recorded in §3.4**:
      **Preview loop** (the transport toggle; its `aria-label` changed from the bare `Loop`),
      **Loop cycle** (the shipped mode, unchanged) and **Hold loop** (this range). Each is named
      for where it lives; none is called plain "loop". §3.4 also CORRECTS its own earlier count —
      there are THREE loops, not two, because the transport toggle was not in view when it was
      written
- [x] §9.1's inert explanation lives on this same surface: one caption states the range and, when
      it has no playback effect, WHICH condition is missing — resolved in the runtime's own order
      (mode first: `manual`/`static` ignore `holdSource` entirely; then the effective driver set;
      only then the hold select). The tests read the CLAIM, and assert the WRONG advice is absent

## 2. D-133 — the loop range at playback ⟨§9.1 ANSWERED: INERT⟩ ✅ DONE

- [x] Render the HOLD as a repeating `[contentStart → outPoint]` instead of a parked frame, for a
      content-driven hold — `PlayoutController.startHoldLoop()`, ONE `FrameDriver` in the shipped
      `'loop'` mode, opened from `onIntroEnd`'s content-driven branch and nowhere else (design §3.6)
- [x] 🔴 **Test the seam invariant directly**: the wrap issues NO driver lifecycle call. Asserted on
      the MECHANISM — prototype spies on `reset`/`start`/`stop`/`pause`/`resume` for ticker, clock
      AND sequence, baselined at hold entry and re-read after two seams. The seams are COUNTED in
      the same test, so it can never pass on a controller that simply never loops
- [x] Test: a ticker set to repeat 3× flows unbroken across two seams and consumes no repeat through
      the wraps — the crawl's `translateX` is sampled across the whole hold (never resets to `''`,
      never goes backwards), and the exit lands where the ticker's OWN arithmetic puts it, with a
      no-loop neighbour as the control
- [x] Test: after the driver's Nth repeat, playback passes the loop end and the OUT phase runs
- [x] §9.1's answer for a `timed` hold: the range is **INERT** — no playback change (pinned by
      timed- AND manual-hold tests that park across what would have been two seams) — **and the
      surface states that it is inert and what would make it active**, naming the missing condition
      from the already-computed `hasEffectiveHoldDrivers` rather than saying something generic
- [x] Extracted, not copied: `playRange`'s collapse predicate and the hold loop ask one question, so
      both call one `frameDependent`. Asserted by the SHARED CONSEQUENCE (a frame-driver count), not
      by two equal pixel readings — which would pass against a duplicate

## 3. D-133 — timeline rendering ⚠ LOAD-BEARING for the item's acceptance ✅ DONE

- [x] Draw the loop range with start/end markers whose indicator lines span the full timeline
      height — the draggable GRIPS stay in the scene lane (a grip needs a row to live on) and the
      INDICATOR LINES + the range band are body-level overlays alongside the playhead. The unit
      test asserts the structural half (same parent as the shipped full-height playhead, never
      inside the scene row); the E2E MEASURES the rendered boxes against the playhead and the scene
      row, because jsdom applies no stylesheet and the pixel claim would otherwise go untested
- [x] Present by default for a composition that loops or holds, not hand-added — drawn from the
      EFFECTIVE content start (the marker, else the same `contentStartDefaultFrom` the pin button
      writes: one definition, now three callers), so an UNPINNED composition shows its range too. An
      unpinned start draws DASHED — it is derived, and the timeline must not present a derivation as
      an authored decision. A degenerate range draws nothing (design §3.6.4)

⚠ §9.2's consequence: because the loop range is offered only where an out-point exists, **this
section is what discharges D-133's "the conditional affordance is at most a shortcut, never the
only path"**. It is part of the item's acceptance, not decoration — it must not be dropped or
deferred out of this change.

## 4. D-135 — the Lottie half ⟨§9.4 ANSWERED: (a)⟩ — LANDS FIRST ✅ DONE

- [x] Recon first (design §4.1): `tick`'s FOUR call sites are all in `preview.ts`, the canvas never
      sends `play`, the phase mapping is REUSED (one `clipPositionAt`, not a second copy), and a
      Lottie handle CANNOT go stale across `scene-replace` — only `<video>` is pooled and
      transplanted, which is why B-137 needed `live()` and this does not. Recorded in the design so
      it is not re-asked
- [x] Extend `tick(frame)` to map composition frame → clip frame through the element's phase mapping
      and call `goToAndStop`, for EVERY Lottie regardless of `drivesHold`
- [x] Test: scrub positions a Lottie at the mapped frame
- [x] Test: PLAY animates it, through the SAME call — asserted on the MECHANISM (a spy on the one
      mapping function both paths route through), not only on matching pixels, because a fork would
      produce identical frames today
- [x] Test: outside its span, the resting state is unchanged under both scrub and play
- [x] Test: a Lottie with `drivesHold` absent/false follows the playhead exactly as an opted-in one
- [x] Test: a LIVE driver owns the frame — a tick reaching a PLAYING host is a no-op, so the
      playhead can never yank a clip out from under its own driver
- [x] Test: the OUT phase maps from the out-point at the clip's own rate, clamped at `op`; a
      playhead before the in-point clamps to the clip start

Sequenced first deliberately: it makes the acceptance demonstrable on one element kind while §9.5
is still open, and it validates the frame↔time mapping the video half then reuses. No new
architecture, no decoder.

- [x] 🔴 **THE IN-POINT IS NOT A SPECIAL CASE** — settled after the rule was decided twice and the
      second decision was watched on the real canvas. An interim revision rested the in-point on the
      D-125 poster; the result was that the composition's in-point became the ONE frame that did not
      show the clip, deterministically, while every other frame animated correctly. The mapping now
      wins at EVERY frame, `poster()` is a pre-tick transient, and D-125's comment is annotated in
      place with which half of its rationale died. Design §4.3
- [x] Test: the in-point maps like every other frame, on a MARKER-LESS fixture so `posterFrame` (the
      clip midpoint) can never coincide with `ip` — with `phases` present the two collide and the
      assertion passes vacuously, which is how the boundary went unobserved
- [x] Test: `in + 1` (the control that proves the assertion discriminates) and a return to the
      in-point after scrubbing away (the fault was not history-dependent, so a one-shot test would
      have missed nothing — but a reader needs to see that pinned)
- [x] E2E: the two D-125 canvas tests are RETARGETED, not deleted — they now read the RENDERED bbox
      at the in-point (blank, the clip's first frame) and after a scrub into the held region
      (visible). The old assertions encoded the superseded rule; what they were really protecting —
      that a real player renders real content, reachable by the operator — is preserved
- [x] 🔴 **A DEGENERATE outro no longer vanishes at the out-point.** `outroStart` falls back to `op`
      for a clip with no outro marker, and `tick` passed a non-null `outroElapsedMs` for every frame
      at or past the out-point regardless — so the OUT mapping was asked for the out phase of a clip
      that HAS none and clamped to `op`, the frame a furniture clip has animated OFF to. Fixed
      caller-side in `positionAt` (a degenerate outro takes the INTRO mapping), with `clipPositionAt`
      untouched. `hasOutro` is now a driver OPTION computed once by the runtime — the driver had been
      re-deriving the same comparison inside `playOutro`, and that second copy is gone. Design §4.4
- [x] Test: degenerate outro holds its settled frame at the out-point, +10 and at `active.out`, and
      `op` never appears once across the sweep — on a fixture where `introEnd` differs from BOTH
      `op` and `ip`, or the assertion cannot tell the settled frame from the blank one
- [x] Test: a clip that HAS an outro still maps its OUT phase — the control that stops the cheapest
      wrong fix (never use outro mode) from passing
- [x] Test: `idle-loop` + degenerate outro keeps cycling past the out-point, matching air
- [x] Test: ⚠ the LIMIT — a MARKER-LESS clip settles on `op` because `introEnd` falls back to `op`
      too, so the canvas agrees with air and both are blank. Pinned so it is not "fixed" into
      disagreeing with air; the real finding is design §4.5
- [x] ✅ **§4.5 ANSWERED (A) and BUILT** — the Inspector offers "Add phase markers" on a
      marker-less Lottie, seeding `introEnd` at the clip midpoint and `outroStart` at `op`
      (degenerate). (B) — changing the runtime's marker-less `introEnd` fallback — is REJECTED under
      the standing rule that fallback is MISSING DATA and nothing may infer intent from it (design
      §4.5; it is the third encounter and the first two went the same way)
- [x] The midpoint is ONE definition — `lottieClipMidpoint` in `@cg/lottie-bridge`; the runtime's
      poster and the Designer's seed both call it, and BOTH call sites are asserted by **the shared
      call**, not by two equal numbers
- [x] ⚠ FINDING: `VideoSections` had shipped this same affordance since D-128, with the same two
      seeding choices. The Lottie section was the odd one out — design §4.6
- [x] 🔴 **Q — the inert hold-checklist row.** D-128 extended the READ side
      (`contentHoldElementsOf` lists media) without the WRITE side: `patchDrivesHold` filtered to
      ticker / sequence / clock, so the Lottie/video checkbox wrote nothing and re-rendered
      unchanged. The mutator now covers all five flag-carrying kinds, keeps its container
      recursion, and its doc comment is true again; `StyleSection`'s media control now uses the
      SAME action, so the flag has one writer with one reach
- [x] Test (failing first, 4 of 6): a Lottie row and a video row are writable in both directions; a
      ticker is unchanged and its absent-⇒-participates default preserved; a NESTED element is
      reachable; a non-flag kind is untouched on an id match; and the flag survives a schema
      round-trip so a saved scene reloads still ticked
- [x] 🔴 **AUDIT (design §9A.1) — the `undefined outroStart` in the driver test helper cost
      NOTHING that was decided on.** `lottie-driver.test.ts` is the only direct constructor of a
      `LottieDriver`, it never calls `playOutro()`, and D-125's outro decisions are exercised
      through `createRuntime` with real values. No assertion was vacuous; one test NAME was
      misleading and is now true, and the latent NaN hazard is closed

## 5. D-135 — the video half ⟨§9.5 ANSWERED: (a) position everywhere — and §9.4 (a)⟩ ✅ DONE

> **UNGATED 2026-08-13 — and built.** §9.5 is answered: the hybrid is REJECTED, every transport
> mode positions the `<video>` through ONE mechanism (`VideoDriver.positionAt`, resolving through
> the same `expectedClipMs` the driver's own clock uses). The tasks below describe one mechanism,
> and they are done.

- [x] Position each `<video>` by `currentTime`, PAUSED, from `tick(frame)` —
      `VideoDriver.positionAt`, resolving through `expectedClipMs` (the driver's own clock
      mapping; the singularity is spy-asserted, not inferred from matching numbers). The tick
      hands videos the SAME elapsed pair as Lotties; §9.4 (a) holds (`drivesHold` unread); a
      degenerate outro takes the INTRO mapping (the Lottie rule); a follow window composes for
      free (`follow-composition.test.ts` drives the owner's case through the playhead)
- [x] Skip (never queue) a tick that finds a seek in flight, reusing the existing guard —
      `positionAt`'s first media read is the same `seeking()` gate `reconcile`/`tick` use
- [x] 🔴 Resolve the node through `live()` on EVERY access — never a build-time reference. §1.8 /
      §5.5: the canvas is a second host that reparents nodes, which is B-137's exact shape.
      Satisfied at the HANDLE: `positionAt` seeks through `handle.seek`, whose every member
      resolves via `live()` — pinned by the reparent test in `video-node-rebind.test.ts`
- [x] Backward play and bounce position exactly as forward does — §9.3 (a), no direction special
      case, no badge, no deferral. (The former "prefer `fastSeek()` where available" task is
      **deleted**: `fastSeek` is not implemented in Chromium and appears nowhere in this repo —
      measured `typeof video.fastSeek === 'undefined'` on Chrome 151)
- [x] Test: the canvas element is never `play()`ed ⟨re-read after §9.5: (a) — position everywhere —
      keeps this test's premise for ALL transport modes, forward-1× included⟩
- [x] Test: a reparented node is re-resolved and positioned, not commanded detached
- [x] **The §9.5 consistency debt is PAID**: the canvas `<video>` no longer RESTS on
      `data-cg-poster-ms` — the poster routine is kept as the load path + seek-fragile recovery
      (load-bearing for pre-`2026-07-25.5` assets) and paints only a PRE-TICK transient; the
      iframe chains a re-tick on its settle and re-ticks after the pooled-node transplant, so
      the tick's seek always lands last (pinned in `preview-video-poster-guard.test.ts`; the
      runtime-level rest pin is in `playhead-drives-media.test.ts`)

## 5a. D-133's E2E — the scenarios that need a real stylesheet

- [x] `apps/designer/tests/e2e/loop-range.spec.ts` — four scenarios mapped from
      `specs/designer-playout-lifecycle/spec.md`: the shapes-only pin, the range drawn BY
      DEFAULT with its lines MEASURED against the body playhead and the scene row, the three
      loops named apart (including that nothing on screen is called plain "Loop"), and the inert
      caption walked through all three of its reasons in the runtime's own resolution order
- [x] ⚠ The PLAYBACK half is deliberately NOT here: the wrap, the seam invariant and leaving the
      loop after the Nth repeat are covered deterministically against an injected clock in
      `packages/template-runtime/tests/hold-loop-range.test.ts`. A real-timer E2E cannot separate
      "the furniture replayed the range" from "the furniture was repainted for some other reason"
      without reproducing that clock — the same division `content-start-hold-entry.spec.ts` draws

## 6. The carve-out ✅ DONE

- [x] Test: a ticker ignores the playhead under scrub
- [x] Test: a ticker ignores the playhead under **PLAY** — asserted on BOTH halves: the canvas's
      play (a stream of ticks) and a PLAYING host receiving ticks, where the crawl is already
      running on its own clock. The test proves the observable is LIVE (the clock still moves it)
      before proving the ticks do not, so it cannot pass on a ticker that had simply stopped
- [x] Test: a sequence and a clock are unaffected by either half — under scrub, under the play
      stream, and on a playing host

None of these needed the video half: the carve-out is about what `tick` must NOT reach, and it is
now assertable precisely because `tick` demonstrably DOES reach a Lottie in the same scene (each
test pairs the two, so it can never pass by nothing happening).

## 7. Docs and gate

- [x] **Engine doc-sync** — `tick(frame)`'s contract changed, so all three are updated:
      `packages/template-runtime/README.md` (the anchor-here / mapping-in-the-driver split, the
      singularity, the live-driver guard, `drivesHold` unread on this path),
      `apps/designer/src/renderer/features/timeline/README.md` (a new "What the playhead drives on
      the canvas" section, including the poster consequence), `docs/engines/overview.md`.
      **RE-SYNCED for the video half (2026-08-13, §5 built):** the same three docs now state that
      `tick(frame)` positions every `<video>` (paused, `expectedClipMs`, skip-in-flight, `live()`,
      the nearest-decodable-frame contract) and that the video's canvas poster is a pre-tick
      transient like the Lottie's.
      **RE-SYNCED AGAIN for D-133 (2026-08-14, §1–§3 built):** `packages/template-runtime/README.md`
      gains "The HOLD LOOP — what a content-driven hold RENDERS" under `PlayoutController` (the
      seam invariant stated as structural, the two narrowing conditions, the shared
      `frameDependent`, the lifespan-gate consequence);
      `apps/designer/src/renderer/features/timeline/README.md` gains "The HOLD LOOP range, and the
      three loops" (the grips/lines/band split, the effective content start's one definition, the
      dashed-when-derived rule, and the three names); `docs/engines/overview.md` states that a
      content-driven hold renders as a repeating range and that the wrap re-renders the
      composition frame only
- [x] Full green gate for every touched workspace (`pnpm gate`, uncached, exit 0; openspec 48/48)
- [ ] **E2E — OWED for D-133 (2026-08-14).** §1–§3 alter the Inspector, the timeline rendering AND
      playback, so a fresh Linux `e2e` is owed on the commit that carries them; the run URL is
      recorded here the moment it completes green with the `E2E (Playwright)` job actually RAN.
      Until then this box stays UNTICKED — a ticked box with no URL is a claim, not a discharge.
      The previous discharge below verified a tree that has since been replaced
- [x] **E2E**: DISCHARGED for `710f0ab0` (the video half, session U) —
      <https://github.com/yasermostafaee/cg/actions/runs/31683317925>, run
      `conclusion: success`, and the `E2E (Playwright)` job **RAN** (`completed success`, not
      skipped). This SUPERSEDES every earlier discharge rather than joining them — the debt
      follows the pushed HEAD, and each earlier run verified a tree that has since been
      replaced: `d43a9adb` (<https://github.com/yasermostafaee/cg/actions/runs/31647897276>),
      `f9a35507` (<https://github.com/yasermostafaee/cg/actions/runs/31644333051>),
      `0d2d0c3b`
      (<https://github.com/yasermostafaee/cg/actions/runs/31639516131>),
      `f492939d` (<https://github.com/yasermostafaee/cg/actions/runs/31633111026>) and `6e620f70`
      (<https://github.com/yasermostafaee/cg/actions/runs/31612094833>).
      ⚠ **This change's history carries one RED run**, on `f2ce18ae`
      (<https://github.com/yasermostafaee/cg/actions/runs/31589324495>) — not a flake and not
      infrastructure: the D-125 canvas tests, failing on a real regression. It discharges nothing
      and is recorded because a red run in a branch's history deserves a reader who knows why.
      Design §4.3 tells the whole sequence, including that the fix which turned it green was itself
      reverted after the owner watched it on the real canvas
- [x] `pnpm openspec validate timeline-drives-loop-and-media --strict`
- [x] D-133 and D-135 are `[~]` with this change dir; **archive only on the owner's confirmation**.
      **As of 2026-08-14 EVERY section is built** — §0–§0b (design + corrections), §1–§3 (D-133),
      §4–§5 (D-135, both halves), §5a (D-133's E2E), §6 (the carve-out) and §7 (docs) — and every
      owner decision (§9.1–§9.5) is answered. **The ONE thing standing between this change and
      archive-readiness is the E2E discharge above**: a completed, green Linux `e2e` whose job
      actually RAN, for the commit that carries §1–§3. With that URL recorded, the change is
      archive-ready and waiting only on the owner's word

## Not in this change

- [ ] 🔴 **`updateElement` cannot reach a grouped element** (design §9A.2) — `locate()` searches a
      layer's DIRECT children only, so EVERY Inspector control routed through `updateElement` is a
      silent no-op for an element inside a container, not just `drivesHold`. Measured against the
      real store. Not fixed here: recursing `locate` changes the shape every mutation indexes
      (`layer.children[elIdx]`), which is a store-wide refactor. **No number minted — the owner's
      to file, and it should be.**
- [ ] **D-151** (`docs/prd/designer.md:4266`)
- [ ] The `hasContentElement` divergence at the **Hold-source select** and the
      **`ContentHoldChecklist`** (§8 risk 5). Recorded as a residual; no item number is minted here.
