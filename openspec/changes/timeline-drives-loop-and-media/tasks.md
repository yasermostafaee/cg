# Tasks — the playhead drives the canvas, and the loop range is authorable

> ✅ **§9.1–§9.4 ANSWERED (2026-08-12). The Lottie half (§4) is UNBLOCKED and lands in this change.**
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

## 4. D-135 — the Lottie half ⟨§9.4 ANSWERED: (a)⟩ — LANDS FIRST

- [ ] Extend `tick(frame)` to map composition frame → clip frame through the element's phase mapping
      and call `goToAndStop`, for EVERY Lottie regardless of `drivesHold`
- [ ] Test: scrub positions a Lottie at the mapped frame
- [ ] Test: PLAY animates it, through the SAME call (assert the mechanism, not just the pixels —
      the singularity is the requirement)
- [ ] Test: outside its span, the resting state is unchanged under both scrub and play
- [ ] Test: a Lottie with `drivesHold` absent/false follows the playhead exactly as an opted-in one

Sequenced first deliberately: it makes the acceptance demonstrable on one element kind while §9.5
is still open, and it validates the frame↔time mapping the video half then reuses. No new
architecture, no decoder.

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

## 6. The carve-out

- [ ] Test: a ticker ignores the playhead under scrub
- [ ] Test: a ticker ignores the playhead under **PLAY** — the half the carve-out newly covers, and
      the half that only becomes assertable once `tick` drives media
- [ ] Test: a sequence and a clock are unaffected by either half

## 7. Docs and gate

- [ ] **Engine doc-sync** — `tick(frame)`'s contract changes in this change:
      `packages/template-runtime/README.md`,
      `apps/designer/src/renderer/features/timeline/README.md`, `docs/engines/overview.md`
- [ ] Full green gate for every touched workspace
- [ ] **E2E**: this is user-facing UI and rendering, so a Linux `gate:e2e` is OWED. Record the
      completed, green run URL beside this box — a tick with no URL is a claim, not a discharge
- [ ] `pnpm openspec validate timeline-drives-loop-and-media --strict`
- [ ] Mark D-133 and D-135 `[~]` with this change dir; archive only on the owner's confirmation

## Not in this change

- [ ] **D-151** (`docs/prd/designer.md:4266`) — deliberately excluded. It needs no design, only the
      owner's answer on whether the add-time dialog gets a third "add anyway" choice. Folding it in
      would make a design wait on an unrelated product decision. See `proposal.md`.
- [ ] The `hasContentElement` divergence at the **Hold-source select** and the
      **`ContentHoldChecklist`** (§8 risk 5). Recorded as a residual; no item number is minted here.
