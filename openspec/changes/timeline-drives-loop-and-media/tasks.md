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
- [ ] 🔴 **`design.md` §9.5 — NEW, OPEN.** Does forward-1× PLAY drive a canvas video through the
      shipped `VideoDriver`, with scrub/backward/bounce positioned? Opened by §9.3's measurement
      (10 fps against 25 fps in the dominant mode). **GATES §5 ONLY** — not §4, not D-133

## 1. D-133 — authoring the loop range ⟨§9.2 ANSWERED⟩

- [ ] Remove the `hasContent` half of the "Pin content start" gate (`PlayoutSection.tsx` ~`:780`),
      so the loop option is offered on a shapes-only scene that has an out-point
- [ ] **No change to the out-point path** — §9.2 settled it: the existing "Add out point" button IS
      the path, and authoring a loop range must NOT create an out-point as a side effect. This item
      is a decision to make no change, kept visible rather than deleted, and it carries a test:
      assert the loop-range surface never calls `setLifecycle`
- [ ] Regression guard, **not a fix**: a composition whose only hold driver is an opted-in Lottie
      can pin its content start. This already holds today (`hasContentElement` counts opted-in
      media) — the earlier "removing the gate resolves a discrepancy" claim was false and is
      withdrawn — so the test exists to keep it true, not to prove a change
- [ ] Name the three loops distinguishably on the surface (transport loop / `loop-cycle` /
      loop range) — §3.4

## 2. D-133 — the loop range at playback ⟨§9.1 ANSWERED: INERT⟩

- [ ] Render the HOLD as a repeating `[contentStart → outPoint]` instead of a parked frame, for a
      content-driven hold
- [ ] 🔴 **Test the seam invariant directly**: assert the wrap issues NO driver lifecycle call
      (`reset`/`start`/any transition). §8 risk 1 — this must be a test, never a comment, because
      the requirement is satisfiable by accident and breakable by accident
- [ ] Test: a ticker set to repeat 3× flows unbroken across two seams and consumes no repeat through
      the wraps
- [ ] Test: after the driver's Nth repeat, playback passes the loop end and the OUT phase runs
- [ ] §9.1's answer for a `timed` hold: the range is **INERT** — no playback change — **and the
      surface states that it is inert and what would make it active**, naming the missing condition
      from the already-computed `hasEffectiveHoldDrivers` rather than saying something generic

## 3. D-133 — timeline rendering ⚠ LOAD-BEARING for the item's acceptance

- [ ] Draw the loop range with start/end markers whose indicator lines span the full timeline height
- [ ] Present by default for a composition that loops or holds, not hand-added

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

🔴 **D-125's POSTER SURVIVES — the first implementation got this wrong and CI caught it.** At or
before the composition's in-point the canvas RESTS on the poster (a representative VISIBLE frame);
from the frame after it, the playhead owns the frame. Positioning faithfully at the in-point paints
`ip` — the intro-START, scaled to nothing — and a scene OPENS there, so every Lottie became an empty
box on the design surface: the exact bug D-125's poster was filed to fix. The Linux `e2e` job failed
on the two D-125 canvas tests and was right to. See design §4.3; the rule is now guarded at unit
level in BOTH drivers' tests as well.

## 5. D-135 — the video half ⟨GATE: §9.5 — the forward-1× hybrid — and §9.4⟩

> 🔴 **STILL GATED.** §9.3 is answered, so direction is no longer the open question; what is open is
> whether forward-1× play uses the shipped `VideoDriver` instead of positioning (§9.5). That
> decides whether the tasks below describe one mechanism or two, so none of them may start.

- [ ] Position each `<video>` by `currentTime`, PAUSED, from `tick(frame)` ⟨GATE: §9.5⟩
- [ ] Skip (never queue) a tick that finds a seek in flight, reusing the existing guard
- [ ] 🔴 Resolve the node through `live()` on EVERY access — never a build-time reference. §1.8 /
      §5.5: the canvas is a second host that reparents nodes, which is B-137's exact shape
- [ ] Backward play and bounce position exactly as forward does — §9.3 (a), no direction special
      case, no badge, no deferral. (The former "prefer `fastSeek()` where available" task is
      **deleted**: `fastSeek` is not implemented in Chromium and appears nowhere in this repo —
      measured `typeof video.fastSeek === 'undefined'` on Chrome 151)
- [ ] Test: the canvas element is never `play()`ed ⟨re-read after §9.5 — the hybrid would change
      this test's premise for forward-1× play⟩
- [ ] Test: a reparented node is re-resolved and positioned, not commanded detached

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
      the canvas" section, including the poster consequence), `docs/engines/overview.md`
- [x] Full green gate for every touched workspace (`pnpm gate`, uncached, exit 0; openspec 48/48)
- [x] **E2E**: DISCHARGED for `6e620f70` — <https://github.com/yasermostafaee/cg/actions/runs/31612094833>
      `conclusion: success`, and the `e2e` job **RAN** (not skipped — the P-029 classifier read the
      diff as render-affecting). ⚠ The PREVIOUS push (`f2ce18ae`) went **RED** on this same job, on
      a real regression this change introduced and not a flake: it broke D-125's canvas poster. See
      design §4.3 — the failing run is <https://github.com/yasermostafaee/cg/actions/runs/31589324495>
      and it discharges nothing; it is recorded because a red run in this branch's history deserves
      a reader who knows why
- [x] `pnpm openspec validate timeline-drives-loop-and-media --strict`
- [x] D-133 and D-135 are `[~]` with this change dir; **archive only on the owner's confirmation** —
      and this change is NOT ready for it: §1–§3 (D-133) and §5 (the video half) are unbuilt

## Not in this change

- [ ] **D-151** (`docs/prd/designer.md:4266`) — deliberately excluded. It needs no design, only the
      owner's answer on whether the add-time dialog gets a third "add anyway" choice. Folding it in
      would make a design wait on an unrelated product decision. See `proposal.md`.
- [ ] The `hasContentElement` divergence at the **Hold-source select** and the
      **`ContentHoldChecklist`** (§8 risk 5). Recorded as a residual; no item number is minted here.
