# Tasks — the playhead drives the canvas, and the loop range is authorable

> 🔴 **DESIGN-FIRST. NOTHING BELOW IS READY TO START.**
>
> Every implementation task carries a **GATE** naming the `design.md` §9 open question that must be
> answered before it may begin. A task whose gate is unanswered is not "next up"; it is not yet
> specified. §0 is the only section that is complete.
>
> Both D-133 and D-135 are marked RECON-FIRST in `docs/prd/designer.md` and both owed a design
> before code. This change discharges that debt and stops there, deliberately.

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

## 0b. Before ANY implementation starts

- [ ] **Answer `design.md` §9.1** — loop range under a `timed` hold: inert, or looping?
- [ ] **Answer `design.md` §9.2** — does an unconditional loop range imply an unconditional
      out-point?
- [ ] **Answer `design.md` §9.3** — canvas video under backward play and bounce. ⚠ Take the
      measurement FIRST: scrub a video element backward on the canvas at speed and watch. That is a
      **"needs the owner at the machine"** observation and must not be guessed.
- [ ] **Answer `design.md` §9.4** — does a Lottie/video that is not a hold driver follow the
      playhead? (Design's read is a strong yes; it is product-visible, so it is asked.)

## 1. D-133 — authoring the loop range ⟨GATE: §9.2⟩

- [ ] Remove the `hasContent` half of the "Pin content start" gate (`PlayoutSection.tsx:621`), so
      the loop option is offered on a shapes-only scene ⟨GATE: §9.2⟩
- [ ] Decide and implement the out-point path per §9.2's answer — either the implicit promotion or
      the explicit two-step ⟨GATE: §9.2⟩
- [ ] Confirm the discrepancy in §1.5 is resolved: a composition held only by an opted-in Lottie can
      pin its content start ⟨GATE: §9.2⟩
- [ ] Name the three loops distinguishably on the surface (transport loop / `loop-cycle` /
      loop range) — §3.4

## 2. D-133 — the loop range at playback ⟨GATE: §9.1⟩

- [ ] Render the HOLD as a repeating `[contentStart → outPoint]` instead of a parked frame, for a
      content-driven hold ⟨GATE: §9.1⟩
- [ ] 🔴 **Test the seam invariant directly**: assert the wrap issues NO driver lifecycle call
      (`reset`/`start`/any transition). §8 risk 1 — this must be a test, never a comment, because
      the requirement is satisfiable by accident and breakable by accident
- [ ] Test: a ticker set to repeat 3× flows unbroken across two seams and consumes no repeat through
      the wraps
- [ ] Test: after the driver's Nth repeat, playback passes the loop end and the OUT phase runs
- [ ] Implement §9.1's answer for a `timed` hold — inert, or looping for `holdMs` ⟨GATE: §9.1⟩

## 3. D-133 — timeline rendering

- [ ] Draw the loop range with start/end markers whose indicator lines span the full timeline height
- [ ] Present by default for a composition that loops or holds, not hand-added

## 4. D-135 — the Lottie half ⟨GATE: §9.4⟩ — LANDS FIRST

- [ ] Extend `tick(frame)` to map composition frame → clip frame through the element's phase mapping
      and call `goToAndStop` ⟨GATE: §9.4⟩
- [ ] Test: scrub positions a Lottie at the mapped frame
- [ ] Test: PLAY animates it, through the SAME call (assert the mechanism, not just the pixels —
      the singularity is the requirement)
- [ ] Test: outside its span, the resting state is unchanged under both scrub and play

Sequenced first deliberately: it makes the acceptance demonstrable on one element kind while §9.3
is still open, and it validates the frame↔time mapping the video half then reuses. §4 — no new
architecture, no decoder.

## 5. D-135 — the video half ⟨GATE: §9.3, §9.4⟩

- [ ] Position each `<video>` by `currentTime`, PAUSED, from `tick(frame)` ⟨GATE: §9.3⟩
- [ ] Skip (never queue) a tick that finds a seek in flight, reusing the existing guard
- [ ] 🔴 Resolve the node through `live()` on EVERY access — never a build-time reference. §1.8 /
      §5.5: the canvas is a second host that reparents nodes, which is B-137's exact shape
- [ ] Prefer `fastSeek()` where available (§5.2 note 3)
- [ ] Implement §9.3's answer for backward play and bounce ⟨GATE: §9.3⟩
- [ ] Test: the canvas element is never `play()`ed
- [ ] Test: a reparented node is re-resolved and positioned, not commanded detached

## 6. The carve-out

- [ ] Test: a ticker ignores the playhead under scrub
- [ ] Test: a ticker ignores the playhead under **PLAY** — the half the carve-out newly covers
- [ ] Test: a sequence and a clock are unaffected by either half

## 7. Docs and gate

- [ ] **Engine doc-sync** if `tick(frame)`'s contract changes: `packages/template-runtime/README.md`,
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
