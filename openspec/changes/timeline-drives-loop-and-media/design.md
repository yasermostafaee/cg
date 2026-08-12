# Design — the playhead drives the canvas, and the loop range is authorable

> **DESIGN-FIRST — and §9 is ANSWERED as of 2026-08-12.** This document is the deliverable. All
> four owner decisions (§9.1–§9.4) are answered, with the reasoning, the measurement and the
> corrections kept beside them. Answering §9.3 opened exactly ONE new question — **§9.5**, the
> forward-1× hybrid — which gates `tasks.md` §5 (the video half) and nothing else. §4 (the Lottie
> half) and every D-133 task are unblocked.

---

## 1. Recon — what was verified, and what the starting points got wrong

Every claim below was read in the tree at `4cbe3331` (`dev`). Where a hand-off note's starting
point turned out to be imprecise, the correction is stated, because a design built on the
imprecise version would have been built on sand.

### 1.1 The canvas is an iframe running the real runtime — CONFIRMED, and it is the whole story

`CanvasArea.tsx` builds an iframe from `preview.ts`'s host page and speaks a `cg-preview`
postMessage protocol to it: `scene-replace`, `asset-urls`, `lottie-assets`, `editing-text`,
`scrub`, `play`, `stop`, `out`, `next`, `pause`, `resume`, `reset`.

The canvas therefore already hosts `@cg/template-runtime` — the same engine as the Preview and the
same one that renders on air. **The playhead reaches it through exactly one message:**

```
CanvasArea.tsx:485,536   postMessage({ kind: 'cg-preview', action: 'scrub', frame: currentFrame })
preview.ts:899           else if (msg.action === 'scrub' …) { currentFrame = msg.frame;
                                                              if (runtime) runtime.tick(currentFrame); }
```

### 1.2 `runtime.tick(frame)` is three lines, and its omission IS D-135

`packages/template-runtime/src/runtime.ts:2112`:

```ts
tick(frame: number): void {
  for (const entry of allAnimated) applyAnimationAtFrame(entry, frame);
  for (const sub of subtrees)
    for (const r of sub.repeaters)
      for (const row of r.stampedRows) row.applyFrame(frame);
  applyLifespanGatesAtFrame(frame);
}
```

Keyframed properties, stamped repeater rows, lifespan gates. **No Lottie player. No `<video>`.**
D-135's entire gap is that this function does not reach the two frame-mapped driver kinds.

### 1.3 ⭐ The correction that changes the design: the canvas's PLAY is already a scrub stream

The hand-off framed D-135 as two halves — scrub and play — needing to be reconciled. **On the
canvas they are already one mechanism**, and this was not previously written down anywhere.

`TransportBar.tsx` owns playback. Its rAF loop advances the store's `currentFrame` at
`scene.frameRate` and calls `designerStore.setCurrentFrame(next)` — nothing else. The canvas's
`currentFrame` effect then posts a `scrub` message per change. **The canvas never receives the
`play` action at all**; that path belongs to the Preview modal.

So D-135's two acceptance halves do not need reconciling — they need ONE function to grow. The
consequence is stated as a design principle in §5.1: scrub and play cannot disagree, because
after this change they are the same call.

### 1.4 🔴 And the transport plays BACKWARD and BOUNCES — which decides §5 outright

`TransportBar.tsx` ships three transport modes and a J/K/L keyboard transport:

| Control     | Effect                                                                |
| ----------- | --------------------------------------------------------------------- |
| `loop: off` | forward to `frameOut`, stop                                           |
| `loop`      | wrap to `frameIn` at `frameOut`                                       |
| `bounce`    | **reverse direction at every boundary** (`directionRef.current = -1`) |
| `J` key     | **play BACKWARD** (`playDirRef.current = -1`)                         |

**This was not in the recon starting points and it is the single most consequential fact in this
document.** A `<video>` cannot play backward — `playbackRate` must be positive in every shipping
browser — and it cannot ping-pong. Two of the transport's three modes are therefore
**inexpressible** by any design that lets the media element advance itself. See §5.

### 1.5 The driving-element set — the "six places" claim, corrected

The hand-off recorded six sites computing the driving-element set, agreeing as of the last check.
**They still agree, but they are not six independent derivations, and the distinction matters for
D-133**: three are call sites of one canonical predicate, and only three derive anything.

| Site                                                             | What it actually is                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `shared-schema/src/scene.ts` `hasEffectiveHoldDrivers`           | **THE canonical predicate** (walks the scene tree; `drivesHold`-aware)   |
| `template-runtime/src/runtime.ts` `scopeHasEffectiveHoldDrivers` | a deliberate MIRROR over the built `FieldScope` tree, documented as such |
| `vcg-format/src/playout-metadata.ts:44`                          | **CALLS** `hasEffectiveHoldDrivers` — no local copy                      |
| `PlayoutSection.tsx:630`                                         | **CALLS** `hasEffectiveHoldDrivers` (`hasDrivers`)                       |
| `PlayoutSection.tsx:45` `hasContentElement`                      | a genuinely SEPARATE, DIVERGENT predicate — see below                    |
| `PreviewScopeTiming.tsx:112` `contentOf`                         | a third, different set again — TUNABLE content, not hold drivers         |

Two of these are not the driving set at all, and D-133 collides with both:

- 🔴 **`hasContentElement`** is what gates "Pin content start" (and two other affordances — see
  below). An earlier revision of this section recorded it as "ticker / sequence / countdown clock
  only — no Lottie, no video", and **that was wrong**: it was re-read in the tree on 2026-08-12 and
  it DOES count an opted-in media element (`el.type === 'video' || el.type === 'lottie'` with
  `drivesHold === true`, `PlayoutSection.tsx:61-70`), exactly as the canonical predicate does. The
  two agree on media. **The real divergence is elsewhere, and it runs in BOTH directions:**
  - **`drivesHold` on ticker / sequence / countdown clock.** `hasEffectiveHoldDrivers` honours
    `drivesHold !== false` for those kinds; `hasContentElement` does not read `drivesHold` for them
    at all. So a ticker with `drivesHold: false` counts for `hasContentElement` and NOT for the
    canonical predicate — an **over-count**.
  - **D-112 `holdOverrides` on a nested composition instance.** The canonical predicate takes the
    instance's per-element override into account (`overrides?.[el.id] ?? …`); `hasContentElement`
    takes no overrides parameter and cannot. So a force-EXCLUDED nested element **over-counts**,
    and a force-INCLUDED `drivesHold: false` element **under-counts**.

  Three affordances are gated on `hasContentElement`, not one: the **Hold-source select**
  (`PlayoutSection.tsx` ~`:705`), the **`ContentHoldChecklist`** (~`:723`), and **"Pin content
  start"** (~`:780`). D-133 removes it from the THIRD only — see §8 risk 5 for what that leaves.

- **`contentOf`** collects TUNABLE content for the preview timing panel and deliberately excludes
  Lottie and video. Untouched by this change; listed so a future reader does not mistake it for a
  fourth copy of the driver rule.

**Finding for golden rule 6:** there is one canonical predicate with one documented mirror, not six
copies. Nothing here needs consolidating. What DOES need care is that D-133 must not add a seventh.

### 1.6 `video-driver.ts` — confirmed verbatim

`packages/template-runtime/src/video-driver.ts:10-28` states the architecture outright:

> a Lottie is a driven-frame RENDERER — its driver computes the frame each tick and pushes
> `goToAndStop` … A `<video>` is the opposite: it **ADVANCES ITSELF** on the media element's own
> `currentTime`, which the page cannot tick. So this driver does NOT paint a frame per rAF; it lets
> the element play and, off the SAME injected clock, keeps it in lockstep.

Confirmed: **there is no stepped or deterministic frame driver in this engine.** Also confirmed:
`LottieDriver` advances with `goToAndStop(frame)` once per tick (`lottie-driver.ts:6`) — it is
already a positioned renderer, which is why the Lottie half of D-135 is cheap and the video half
is not.

### 1.7 `holdBehavior: 'freeze'` — the precedent that makes §5 affordable

Confirmed: `freeze` is the one shipped state where a `<video>` legitimately sits **paused and
positioned by `currentTime`**. It is not a curiosity — it is the existence proof that this engine
already supports a positioned `<video>`, which is what §5 generalises.

### 1.8 SESSION I's `live()` resolver — read, and it constrains this design

`runtime.ts:1031`, added for B-137:

```ts
const live = (): HTMLVideoElement => {
  if (media.isConnected) return media;
  // re-resolve by data-cg-element-id across the document, then re-point `media`
};
```

**The lesson this design inherits: the node the driver commands must be the node the viewer sees.**
B-137 was a healthy driver commanding an orphan after the Preview pooled and transplanted a
`<video>` across a rebuild. The canvas is a **second host that reparents nodes** — `CanvasArea`
posts a full `scene-replace` on every scene mutation, rAF-throttled — so any per-frame positioning
this change adds **MUST go through `live()`**, never through a captured node reference. That is a
hard constraint on §5's implementation, recorded here so it is not rediscovered as a bug.

---

## 2. The two items, restated as one question

> **What does the playhead drive, and what follows it?**

D-135 answers the first half: the playhead drives the frame-mapped media. D-133 answers the second
half, and answers it partly in the negative: **at a loop seam the playhead wraps and the content
drivers do NOT follow it**. Both halves are properties of `tick(frame)`.

---

## 3. D-133 — mapping "loop" onto the SHIPPED lifecycle

> 🔴 The item's own instruction: _"map 'loop' onto the SHIPPED lifecycle (`outPoint` + optional
> `contentStart`, content-driven repeat). Do NOT invent a new lifecycle mode casually."_ If the
> shipped lifecycle genuinely cannot express the seam-continuation rule, that is a **finding**,
> stated with evidence — not a licence to add a mode.

### 3.1 What the shipped lifecycle actually is

`LifecycleSchema` (`shared-schema/src/scene.ts:29`) is two frame markers:

- **`outPoint`** — the single marker (Loopic's model). IN = `[activeRange.in, outPoint]`,
  **HOLD = the held `outPoint`**, OUT = `[outPoint, activeRange.out]`.
- **`contentStart`** — optional, constrained to `[activeRange.in, outPoint]`. "The frame where this
  composition's CONTENT begins", the designer's explicit override of the runtime's
  `entranceSettleFrame()` heuristic.

And `holdSource: 'content-driven'` means: **hold until the scope's content drivers signal
completion.** During that hold the timeline is parked on one frame — `outPoint` — while the drivers
run on their own clocks.

### 3.2 ⭐ THE MAPPING — and it is an exact fit, not an approximation

**The loop range IS `[contentStart → outPoint]`, and looping is a RENDERING OF THE HOLD.**

Today a content-driven hold freezes the furniture on the `outPoint` frame while the ticker runs.
D-133 asks for the furniture to **replay `[contentStart → outPoint]`** while the ticker runs. The
hold's START condition, its END condition, and the OUT phase after it are all unchanged. Only what
the held interval _renders_ changes: one frozen frame becomes a repeating range.

Line by line against the item's acceptance:

| D-133 acceptance                                           | The shipped lifecycle                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| loop range with start/end markers, present by default      | `contentStart` and `outPoint` — both already exist, both already stored      |
| playhead wraps at the loop end                             | the hold repeats `[contentStart → outPoint]` instead of parking on one frame |
| markers extend the full timeline height                    | pure timeline rendering; no model change                                     |
| driver's content DOES NOT RESET across the seam            | **falls out for free — see §3.3**                                            |
| after N repeats, playback passes the loop end and OUT runs | the content-driven hold's existing end condition, verbatim                   |
| non-content-driven hold ⇒ the range is INERT               | a `timed` hold ignores it; the markers stay authorable — **but see §9.1**    |

**Conclusion: no new lifecycle mode is needed, and none is proposed.** The finding the item invited
("say so explicitly if it genuinely cannot") is not triggered.

### 3.3 🔴 Why the seam rule is free — the part that must not be re-engineered

**The content drivers were never part of the held range.**

`holdSource: 'content-driven'` holds _because_ the drivers are running on their own clocks,
independently of the composition frame. The composition frame is what the furniture is animated
against; the ticker's crawl position is not a function of it. So a wrap that repaints the furniture
at `contentStart` **cannot** reset the ticker — there is nothing connecting them to reset.

Stated as the invariant a reviewer should check:

> 🔴 **The loop wrap is a re-render of the composition frame ONLY. It MUST NOT call `reset()`,
> `start()`, or any lifecycle transition on any content driver.** A wrap that touches a driver has
> re-implemented `loop-cycle` (§3.4) under a different name, and it does not satisfy D-133 even if
> the playhead behaviour looks identical.

The item warns that "a design that restarts the driver at the seam does not satisfy this item even
if the playhead behaviour matches". The mapping above is chosen precisely because it makes the
restart **unreachable** rather than merely forbidden — the same move as making a bad call
unrepresentable instead of guarded against.

### 3.4 ⚠ The naming collision: two different loops

`mode: 'loop-cycle'` already exists and already means "loop". It is **not** this loop:

|                 | `loop-cycle` (shipped)          | The D-133 loop range (this change)          |
| --------------- | ------------------------------- | ------------------------------------------- |
| What repeats    | the whole IN → HOLD → OUT cycle | the frame range `[contentStart → outPoint]` |
| The intro       | **re-runs every cycle**         | runs once                                   |
| Content drivers | restarted per cycle             | **run continuously across every seam**      |
| Counted by      | `playout.repeat`                | not counted — ends when the DRIVER ends     |
| Applies during  | the whole composition           | the HOLD only                               |

**They can coexist on one composition and mean different things simultaneously.** Any UI that
offers both must not call both "loop". Naming is deferred to implementation, but the requirement
that they be distinguishable is a spec requirement, not a preference.

### 3.5 Unconditional authoring

`PlayoutSection.tsx` gates "Pin content start" on `lifecycle !== undefined && hasContent`
(~`:780`). D-133 removes the `hasContent` half outright.

⚠ **This is NOT also a bug fix, and an earlier revision of this section said it was.** That claim
rested on §1.5's false "no Lottie, no video" reading of `hasContentElement`: a composition held by
an opted-in Lottie can pin its content start **today**, because `hasContentElement` counts opted-in
media. Removing the gate changes nothing for that case. The genuine divergence between the two
predicates (`drivesHold` on ticker/sequence/clock, and D-112 `holdOverrides`) is described in §1.5
and its residue after this change in §8 risk 5.

The `lifecycle !== undefined` half is **KEPT** — see §9.2, now answered. `contentStart` is
schema-constrained to `[activeRange.in, outPoint]`, so it cannot exist without an `outPoint`; the
explicit, already-shipped "Add out point" button is the path to one, and authoring a loop range
never creates one as a side effect.

**No backward compatibility is owed** to the conditional UI: the item records that nothing has been
delivered to the client, so the compatibility floor is unset ([[P-031]]).

---

## 4. D-135 — the Lottie half (cheap, and it goes first) — ✅ BUILT 2026-08-12

`LottieDriver` is already a positioned renderer: `goToAndStop(frame)` per tick. Extending
`tick(frame)` to map composition frame → clip frame through the element's phase mapping and call
`goToAndStop` is the whole of it. No new architecture, no timing risk, no decoder.

It was called out to land **first and alone**: it makes the acceptance demonstrable on one element
kind while §9.5's video question is open, and it validates the frame↔time mapping the video half
then reuses.

### 4.1 Recon inside the runtime — the three questions asked before any code, and their answers

**(a) Who calls `runtime.tick(frame)`, and can this fight the real `LottieDriver`?**
`tick` has exactly FOUR call sites, all in `apps/designer/src/platform/preview.ts` — the host page
BOTH surfaces run: the boot tick after `applyScene`, the `update` handler (already guarded
`!playing`, D-106), the `scrub` handler, and the `reset` handler. The senders are `CanvasArea.tsx`
(scrub per frame change) and `PreviewModal.tsx` (ONE `scrub` to frame 0, in its `cg-preview-ready`
seed). **The canvas never sends `play`/`stop`/`pause`/`resume` at all** — its whole vocabulary is
`scene-replace`, `asset-urls`, `lottie-assets`, `editing-text`, `scrub` — so on the canvas the
drivers sit at their poster and nothing else is driving them.

That is TODAY's answer, and it is not the one to build on. The Preview modal plays on the same host
page, and `reset` (unlike `update`) re-ticks without a `!playing` guard. So the guard is placed
where it cannot be bypassed by a future message: **`positionAt` is a no-op while the driver is
running its own lifecycle or holding a frame it drove to.** The driver knows whether it owns the
frame; the host would have to be asked, and remembered, and kept correct.

**(b) The phase mapping — reused, not re-derived.** `tick` converts the playhead to elapsed TIME
(from `activeRange.in` for IN/HOLD, from `lifecycle.outPoint` for OUT) and the DRIVER resolves it
to a clip frame. The arithmetic was extracted out of `LottieDriver.tick()` into one pure
`clipPositionAt(elapsedMs, mode)`, which both the driver's own clock and the playhead now call. No
second mapping exists to drift — §1.5's standing warning about a seventh derivation applies here
literally, and a test asserts the singularity by spying on that one function rather than by
comparing frames (a fork would produce identical frames today and diverge later).

**(c) Does a Lottie player handle survive `scene-replace`? — NO STALENESS IS POSSIBLE, and here is
why, so the next reader does not re-ask.** B-137's shape needs a node that OUTLIVES a rebuild and
is re-parented into it. That is exactly what `preview.ts`'s `videoPool` does — it transplants the
live `<video>` across `applyScene` so the media does not re-download and re-decode, which is why
`VideoDriver` needs `live()`. **There is no Lottie pool.** `scene-replace` runs `applyScene` →
`runtime.remove()` + `createRuntime()`, and every `LottieDriver` is rebuilt with a fresh
`createLottiePlayer(container, …)` over the freshly built container; the old drivers are destroyed
with their runtime. A captured handle therefore dies with the thing that captured it, and cannot be
commanded detached.

⚠ The asymmetry is worth stating as the RULE rather than the observation: **a `live()`-style
re-resolution is owed exactly where a HOST pools and transplants nodes.** If a Lottie is ever
pooled for the same reason a `<video>` is (mount cost), this changes on that day — and §5.5's
constraint on the video half stands regardless.

### 4.2 What landed

`tick(frame)` positions EVERY Lottie — `drivesHold` is not read on this path (§9.4 (a)) — at the
mapped clip frame via the driver's `goToFrame`. It never calls `play()` on a canvas Lottie and
never starts a clock: the playhead is the only clock, and a paint is all the path is entitled to.
Outside the element's lifespan the resting state is unchanged (the gate still hides it), and INSIDE
the span the clip is anchored on the composition's active in-point rather than the trim — because
on air `play()` starts every Lottie regardless of a start-trimmed lifespan, and the canvas must
agree with what goes on air.

⚠ **A visible consequence, recorded because it will be noticed:** a Lottie no longer sits on its
D-125 POSTER frame on the canvas. At the composition's in-point it now shows the clip's FIRST
frame, which for a furniture clip that animates on from nothing is legitimately blank. That is not
a regression of the poster decision but the removal of its premise: the poster existed because "the
editor canvas is a static design surface that never plays" (`lottie-driver.ts`), and it is not one
any more. It is also the behaviour keyframed elements have always had — an element animating in
from opacity 0 is invisible at frame 0 on the canvas today — so this makes the two kinds agree
rather than making the Lottie special.

---

## 5. 🔴 D-135's architecture question — ANSWERED

> The question, in the hand-off's words: driving video frames on the canvas is either **"let it
> play and re-anchor"** or **"position by `currentTime` per frame"**, and those are different
> architectures. Say which, and why, with the cost of each.

### 5.1 THE ANSWER: position by `currentTime`

**The canvas positions each `<video>` by `currentTime`, paused, from `tick(frame)`. It does not
play the element and re-anchor it.**

This is not a preference between two viable options. Three facts make play-and-re-anchor
**structurally inexpressible on this surface**, and they are ordered by how conclusive they are:

**(a) There is no clock to re-anchor to — the playhead is an authoring cursor, and it runs
backward.** §1.4: the transport plays backward (J) and bounces. `playbackRate` must be positive in
every shipping browser, so a `<video>` **cannot follow two of the three shipped transport modes**.
Play-and-re-anchor would work for forward-1× play and would have no answer at all for the others.
That alone settles it.

**(b) Scrub and play are the same call (§1.3).** They both arrive as `tick(frame)`. Giving play a
different mechanism would fork the one function whose singularity is what guarantees the two halves
of D-135's acceptance agree. The item asks for them to agree; the cheapest way to guarantee that is
for there to be nothing to reconcile.

**(c) The precedent already exists and is shipped.** `holdBehavior: 'freeze'` (§1.7) is a paused
`<video>` positioned by `currentTime`. This design generalises a supported state to an arbitrary
frame; it does not introduce a state the engine has never been in.

### 5.2 The cost of the answer, stated plainly

**Position-by-`currentTime` means a SEEK per frame, and this codebase has already measured that as
harmful.** `video-driver.ts:26` records it in its own words:

> **SEEK-IN-FLIGHT GUARD.** A corrective/wrap seek is NEVER stacked on top of a seek the element is
> still settling (`handle.seeking()`). This kills the **per-frame seek-storm** that used to hammer
> the decoder into a wedge (and painted the half-decoded frames that read as a fringe).

So the cost is real and it is documented. Three things make it affordable now, and this design
depends on all three:

1. **The mitigation already exists.** The seek-in-flight guard is shipped. A tick that finds
   `seeking()` true must **skip**, not queue — the canvas then shows the nearest decodable frame
   rather than every frame. That is exactly what an NLE does while scrubbing, and it is the
   behaviour to specify rather than an unfortunate degradation to apologise for.
2. **The canvas is not the frame-true surface.** The Preview keeps the real `play()` path with the
   real drivers and remains the rendition the operator judges final timing against. The canvas is
   an authoring surface, and "the nearest decoded frame, promptly" is the right contract for it.
3. **Keyframe interval dominates, and it is known — but the number this note first quoted was
   STALE by 5×, and one of its recommendations does not exist on this engine.** Both corrections
   were made on 2026-08-12 and both matter:
   - 🔴 **The GOP is ONE SECOND, not ~5 s.** `video-driver.ts` records "~5 s keyframes on this
     project's assets" and a RESUME GRACE window justified by it. That describes the pre-
     `2026-07-24.3` era. Every video imported since is converted with **`-g 25 -keyint_min 25`** —
     a FIXED 1-second GOP at 25 fps, colour and alpha keyframing together since `2026-07-25.5`
     (`apps/designer/src/renderer/features/assets/video-convert-args.ts`, whose own comment reads
     "every seek decodes ≤1s instead of ≤5s"). A canvas seek therefore decodes **≤25 frames, not
     ~125**. `video-driver.ts`'s comment is annotated at its own site so this premise is not
     re-derived from the stale number.
   - 🔴 **`fastSeek()` is NOT available here — the recommendation is removed, not deferred.** An
     earlier revision of this note said canvas seeking "should prefer `fastSeek()` where
     available". `fastSeek` appears **nowhere** in this repo's source (only in `node_modules`
     typings), and it is **not implemented in Chromium** — measured `typeof video.fastSeek ===
'undefined'` on Chrome 151. On this engine the recommendation is a no-op, so it comes out of
     the spec rather than being carried as a "where available" hedge that will never fire. It
     stays worth re-verifying only if this app is ever hosted on a non-Chromium engine.

   With those two corrected, the per-frame behaviour of the canvas **has now been measured** —
   see §9.3, which answers what this note used to defer.

### 5.3 What the canvas gives up, in one sentence

**Canvas video will not be frame-accurate during playback at 25/50 fps; it will show the nearest
decoded frame and will visibly drop frames under decoder pressure, especially with two or more
video elements.** That is the deal, it is the right deal for an authoring surface, and it must be
written into the spec so it is not later filed as a bug.

**And it now carries a NUMBER (§9.3, measured 2026-08-12):** roughly **one new frame every ~94 ms —
every 2nd–3rd frame at 25 fps** — with ~56 % of ticks skipped by the seek-in-flight guard. The
conditions travel with the number, always: ONE 1920×1080 VP8+alpha element, 1 s GOP, Chrome 151,
driven at 25 fps. The "two or more video elements" clause above remains **qualitative and
unmeasured**, and 1080p VP8+alpha is software-decoded twice over in Chromium, so the number is a
conservative floor rather than a typical case.

### 5.4 The cost of the rejected option, for the record

Play-and-re-anchor would give smooth, decoder-friendly forward playback at 1× — genuinely better,
in the one mode where it works. It would cost: a second code path that scrub does not share; no
answer for backward play or bounce; divergence between the scrub frame and the play frame at every
drift correction; and a re-import of the whole drift/re-base/resume-grace machine onto a surface
that has no wall clock of its own. **It is rejected on (a) alone**; the rest is why it would not be
worth reaching back for later.

🔴 **RE-OPENED IN PART, 2026-08-12 — see §9.5.** This section conceded that play-and-re-anchor would
be "genuinely better, in the one mode where it works" while not knowing how much better. §9.3's
measurement says: ~10 fps against 25 fps. That does not revive play-and-re-anchor as the whole
answer — (a) still stands, and backward and bounce still have no expression in it — but it does put
a **HYBRID** on the table that this section never considered: forward-1× play through the shipped
`VideoDriver`, everything else positioned. It is filed as **§9.5, OPEN**, and it gates `tasks.md`
§5. Note that this section's own objection — that a re-anchoring path would "re-import the whole
drift/re-base/resume-grace machine" — is weaker than written: that machine is shipped, and the
Preview uses it.

### 5.5 The hard constraint from §1.8

Any per-frame positioning **MUST resolve the node through `live()`**, never through a reference
captured at build time. The canvas reparents nodes across `scene-replace`, which is precisely
B-137's shape. A design that captures the node will reproduce B-137 on a second host.

---

## 6. The carve-out — ticker / sequence / clock, VERBATIM

> **PRESERVED WORD FOR WORD FROM D-135:** _"ticker / sequence / clock remain deliberately
> time-driven and do not follow the playhead."_

The schema's own comment says "scrubbing never moves it", and this change extends that promise to
PLAY without weakening it. It is specified as its own requirement (`specs/designer-animation-timeline/spec.md`)
rather than left as a note, because it is the kind of rule that erodes: a future reader extending
`tick(frame)` to "all content elements" would break it in one line while believing they were
completing this feature.

**Why the carve-out is correct and not an inconsistency:** a Lottie and a video have a
**deterministic frame↔time mapping** — frame N of the clip is a fact. A ticker's crawl position, a
sequence's step and a wall clock's time are functions of REAL time, not of composition frame; there
is no frame N to show. Positioning them by the playhead would require inventing a mapping that does
not exist, and the invented one would disagree with what goes on air.

---

## 7. Where the work lands

| Concern                                    | Location                                                           |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `tick(frame)` reaching Lottie + video      | `packages/template-runtime/src/runtime.ts` (+ the two drivers)     |
| the frame↔time / phase mapping             | `@cg/template-runtime` (reuse the drivers' existing phase tables)  |
| loop-range rendering (full-height markers) | `apps/designer/src/renderer/features/timeline/`                    |
| unconditional loop authoring               | `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx` |
| the hold's looping render                  | `@cg/template-runtime` — the HOLD phase only                       |
| schema                                     | **none expected** — `outPoint` + `contentStart` already exist      |

⚠ **Engine doc-sync is owed** if `tick(frame)`'s contract changes:
`packages/template-runtime/README.md`, `apps/designer/src/renderer/features/timeline/README.md`,
and `docs/engines/overview.md`.

---

## 8. Risks

1. **The seam rule is easy to satisfy accidentally and easy to break accidentally.** §3.3's
   invariant must be a TEST, not a comment: assert that a wrap issues no driver lifecycle call.
2. **Decoder pressure is MEASURED as of 2026-08-12** (§9.3) — one 1080p VP8+alpha element yields
   ~10 distinct frames/s in every transport direction. What remains unmeasured is the multi-element
   case (§5.3), which is still stated qualitatively.
3. **Two loops, one word** (§3.4).
4. **The canvas is a second host that reparents `<video>` nodes** (§1.8 / §5.5) — B-137's exact
   shape, one surface over.
5. 🔴 **`hasContentElement` vs `hasEffectiveHoldDrivers` — the RESIDUAL divergence, stated exactly.**
   An earlier revision of this risk claimed removing the gate "silently fixes a discrepancy". It is
   void: it rested on §1.5's false reading, and the two predicates agree on media. The real risk is
   what this change LEAVES BEHIND. `hasContentElement` genuinely diverges from the canonical
   predicate on (i) `drivesHold` for ticker / sequence / countdown clock and (ii) D-112
   `holdOverrides` — in both directions (§1.5). Removing the gate at **"Pin content start"** removes
   that divergence **at that one affordance**; the **Hold-source select** and the
   **`ContentHoldChecklist`** keep it, because they keep the gate.

   **This change does NOT fix those two, deliberately** — they are a different item's worth of work
   (the Hold-source select is where a wrong answer changes on-air timing, so it deserves its own
   scenarios rather than a drive-by edit). The residual is recorded here so it is not mistaken for
   something this change closed. It is a candidate for an item; **no number is minted for it here**
   — that is the owner's to file.

---

## 9. OWNER DECISIONS — §9.1–§9.4 ANSWERED (2026-08-12), §9.5 newly OPEN

Each names both candidate answers and what each costs. They are recorded here rather than left in
the prompt that raised them, because a prompt is ephemeral and the spec is the memory. **The
candidates and their costs are KEPT after the answer** — the record of why a decision went the way
it did is worth more than the decision restated alone.

> **Status.** §9.1, §9.2, §9.3 and §9.4 are ANSWERED. Answering §9.3 opened a NEW question — §9.5,
> the forward-1× hybrid — which gates `tasks.md` §5 (the video half) and NOTHING else. §4 (the
> Lottie half) and all of D-133's tasks are unblocked.

### 9.1 What does a loop range MEAN under a `timed` hold? — GATED tasks 2.x — ✅ ANSWERED: (a) INERT

**(a) INERT, exactly as filed — AND the surface MUST say why.** A non-content-driven hold keeps
parking on `outPoint`; an authored loop range has no playback effect. The mitigation floated below
as "a UI answer to a model question" is now **a requirement, not a mitigation**: an inert control
with no explanation is what made this a question in the first place, so the surface states that the
range is inert and what would make it active. `hasDrivers` (`hasEffectiveHoldDrivers`) is already
computed in `PlayoutSection` (~`:630`), so that text can be EXACT — it can name the missing
condition rather than saying something generic.

The two candidates, kept as the record of why:

- **(a) INERT, exactly as filed.** The markers draw; a `timed` hold still parks on `outPoint`.
  **Cost:** an operator who authors a loop range on a shape-only scene sees nothing happen — which
  the explanation requirement above is what answers.
- **(b) A `timed` hold LOOPS the range for `holdMs`.** The furniture repeats for the hold duration,
  then the OUT phase runs. **Cost:** a behaviour change to `timed` holds, which are the DEFAULT. It
  also makes the loop range meaningful in two different ways depending on `holdSource`.

**Why (a), in four parts — three of which CORRECT this question's own cost statement:**

1. **D-133's acceptance says INERT verbatim.** (b) would contradict the filed item, which is a
   thing to do deliberately or not at all.
2. 🔴 **CORRECTION — (b)'s stated cost was measured against an EMPTY SET.** This question claimed
   the cost falls on "every existing shape-only composition carrying a `contentStart`". **There are
   none, and there cannot be:** a shapes-only composition cannot have a `contentStart` today,
   because the `hasContent` gate this very change removes (`PlayoutSection.tsx` ~`:780`) is exactly
   what withholds the button that would set one.
3. 🔴 **CORRECTION — the REAL exposure of (b) is larger, and in the other direction.** `holdSource`
   defaults to `timed` **even when drivers are present** (`PlayoutObjectSchema`: "Absent ⇒
   'timed'"; `playoutOf` resolves it). So (b) would change the behaviour of every composition that
   HAS a ticker and simply never touched the hold select — not of a nonexistent shapes-only set.
   That is a much bigger blast radius than the one this question weighed.
4. 🔴 **CORRECTION — there are THREE hold states, not two.** This question named `timed` and
   `content-driven`. Under `manual` and `static` the `holdSource` is ignored ENTIRELY
   (`HoldSourceSchema`'s own comment: "Ignored by `manual` (the operator ends the hold)"), so (b)
   has **no defined duration at all** in those states — there is no `holdMs` to loop for. That is
   the same structural hole that decided §5: an option with no defined behaviour in a shipped state
   is not the smaller decision.

### 9.2 Does an UNCONDITIONAL loop range imply an unconditional OUT-POINT? — GATED tasks 1.x — ✅ ANSWERED: (b), minimal form

**ANSWER: remove ONLY the `hasContent` half of the gate; KEEP `lifecycle !== undefined`.** No
implicit promotion out of `static`, no new compound verb, and **no new UI to offer one** — the
existing "Add out point" button IS the first step, already on the same panel, already named for
what it does. This is the minimal change that satisfies the item.

The two candidates, kept as the record of why:

- **(a) Offering the loop range implies creating an out-point.** Authoring a loop range on a
  composition that has none silently promotes it out of `static`.
- **(b) The loop range still requires an out-point; the UI offers to add one, explicitly.** Two
  visible steps. **Cost:** "ALWAYS offered" becomes "always offered, sometimes after one more
  click", which is arguably not what D-133 asked for.

**Why (b):**

1. **Creating an out-point is not a marker edit — it changes what the composition does ON AIR at
   stop time.** `playoutOf` resolves a composition with no out-point and `manual`/absent mode to
   `static` (`scene.ts` `playoutOf`), and `PlayoutSection`'s mode select DISABLES `static` once a
   lifecycle exists. So seeding an out-point moves the composition from "hard cut on stop" to
   `manual` with a real animated OUT segment `[outPoint, activeRange.out]`. An authoring action
   named "loop" must not make that change silently.
2. 🔴 **CORRECTION — this question's "compound verb" argument was overstated.** It claimed the
   codebase uniformly refuses compound verbs; the counter-example is in the SAME FILE.
   `changeMode()` already seeds an out-point implicitly — picking `auto-out` or `loop-cycle` with
   no lifecycle calls `setLifecycle(defaultMarker())`. So the precedent exists and (a) would not be
   unprecedented. **The distinction that actually decides it is ANNOUNCEMENT, not principle:**
   choosing `auto-out` ANNOUNCES that you want an exit segment — the mode's own label reads "outro
   after hold" — so seeding the out-point it requires completes the stated intent. Authoring a loop
   range announces nothing of the kind.

⚠ **CONSEQUENCE — `tasks.md` §3 becomes LOAD-BEARING for D-133's acceptance.** With this answer the
loop range is offered only where an out-point exists, so what discharges the item's "the
conditional affordance is at most a shortcut, **never the only path**" is §3's "**present by
default** for a composition that loops or holds". §3 is therefore part of the item's acceptance,
not decoration: it MUST NOT be dropped, deferred out of this change, or reduced to an opt-in
affordance.

### 9.3 Canvas video under BACKWARD play and BOUNCE — GATED tasks 3.x — ✅ ANSWERED: (a), and the question's PREMISE was FALSE

**ANSWER: (a) — position backward and bounce exactly as forward. Every transport mode drives every
element the same way, and there is no special case for direction anywhere in the implementation.**

#### The measurement (2026-08-12)

Chrome 151, one 1920×1080 VP8+alpha element (1 s fixed GOP, per the converter — see below), 200
ticks driven at 25 fps over 8.0 s:

| pass     | distinct frames/s | seeks issued | ticks skipped |
| -------- | ----------------- | ------------ | ------------- |
| FORWARD  | 10.2              | 83           | 117           |
| BACKWARD | **10.6**          | 88           | 112           |
| BOUNCE   | 8.2               | 79           | 121           |

Seek latency median 50 ms, p95 125 ms. 85 of the 88 backward seeks yielded a distinct frame.

#### 🔴 The premise was false, and the REASON outlives the number

**Backward is not worse than forward. It is 4 % FASTER — i.e. equal within noise.** This question
was built on "backward seeking is the worst case for inter-frame codecs", which is **true of
PLAYBACK and false of POSITIONING**:

> Under position-by-`currentTime`, EVERY tick is a random seek that decodes from the nearest
> preceding keyframe. **Direction does not enter the computation at all.** A backward step and a
> forward step are the same operation on the same decoder path; only the target timestamp differs.

That is why the reason is worth more than the number: a future reader re-measuring on a different
asset will get different frames-per-second, and the same conclusion.

**(b) and (c) are therefore rejected ON EVIDENCE, not on preference.** Each invents a special case
— a freeze-and-badge, or a defer-until-pause — for a direction that is measurably not special.
Their costs (the canvas ceasing to be a true rendition in two transport modes; a fourth behaviour
to explain) would be paid for nothing.

#### What this lets the spec SAY, and the conditions it must carry

§5.3's warning can now carry a NUMBER: roughly **one new frame every ~94 ms — every 2nd–3rd frame
at 25 fps** — with ~56 % of ticks skipped by the seek-in-flight guard (the BACKWARD pass, the one
this question was about; forward is equivalent within noise). **State the conditions with it every
time**: ONE 1920×1080 VP8+alpha element, 1 s GOP, Chrome 151, driven at 25 fps. A bare number with
no conditions invites the next reader to treat it as a guarantee.

Two honest limits, recorded so nobody over-reads the table:

- **It measured ONE element.** §5.3's "especially with two or more video elements" claim remains
  UNMEASURED, and is retained as a qualitative statement only.
- **1080p VP8+alpha is software-decoded twice over in Chromium** (the colour stream and the alpha
  side stream, neither hardware-accelerated). So this is a **conservative floor**, not a typical
  case.

#### 🔴 CORRECTION — the keyframe-interval premise under this question was STALE by 5×

This question, and §5.2 note 3, both rest on `video-driver.ts`'s "~5 s keyframe interval on this
project's assets", and this question called that "a measurement, not a guess". **It is a
measurement of an era that ended in July.**

- `apps/designer/src/renderer/features/assets/video-convert-args.ts` converts every imported video
  to VP8+alpha (`libvpx`, `yuva420p`, `-crf 4` / `-qmax 16`) with **`-g 25 -keyint_min 25`** — a
  **FIXED 1-second GOP at 25 fps** — with the colour and alpha streams keyframing TOGETHER since
  converter revision `2026-07-25.5`. The arg's own comment says it: "every seek decodes ≤1s instead
  of ≤5s".
- So the canvas's worst-case seek — in EITHER direction — decodes **≤25 frames, not ~125**. The
  design's stated cost was overstated by 5× for any asset imported under `2026-07-24.3` or later.
- `video-driver.ts`'s comment describes the pre-`.3` era and is now misleading **at its own site**;
  it is annotated there so the next reader does not re-derive this premise from the stale number.

**What the element on the canvas actually IS — the fact that invalidated the first measurement
attempt:** always the CONVERTED `.webm`, never the imported source. A source AVI / MOV / MXF is not
decodable by Chromium at all, so it cannot be measured and must never be used as the measurement
subject.

#### A FOURTH answer this question never considered — recorded as an option, NOT chosen

**The GOP is a knob this project OWNS.** It is versioned by `CONVERTER_REVISION` with an existing
re-import prompt, and going from ~5 s to 1 s cost only **+3.5 % file size** by
`video-convert-args.ts`'s own measurement. Shortening it further is therefore plausibly cheap and
would raise the frames-per-second above, at the cost of a `CONVERTER_REVISION` bump and a re-import
of the client's library. Had the measurement landed SHORT of (a), this was the option to weigh
before accepting (b).

It is **not chosen here**, and it is **not a licence to re-litigate** the `-crf 4` / `-qmax 16`
broadcast-quality decision, which is the owner's and is settled. Recorded as a follow-up option
with its cost; no item number is minted for it here.

### 9.4 Does a Lottie/video that is NOT a hold driver follow the playhead? — GATED tasks 3.x, 4.x — ✅ ANSWERED: (a)

**ANSWER: (a) — EVERY Lottie and EVERY video follows the playhead, regardless of `drivesHold`.**

- **(a) EVERY Lottie/video follows the playhead**, regardless of `drivesHold`. `drivesHold` answers
  "does this gate the HOLD", which is a different question from "does the canvas show its frame".
- **(b) Only opted-in drivers follow it.** **Cost:** a Lottie logo animation that is deliberately
  not a hold driver would sit frozen on the canvas while the composition plays — which is the exact
  misrepresentation D-135 exists to remove.

**The two flags are ORTHOGONAL, and that is now stated IN THE SPEC**, not only here. The inverse
default for media (`drivesHold === true` opt-in, against ticker/sequence/clock's `!== false`) is
load-bearing elsewhere, so a later reader who saw `drivesHold` and assumed it governs
playhead-following would not be being unreasonable — which is precisely why the spec says it out
loud rather than leaving it to be inferred from an implementation that simply never reads the flag
on this path.

### 9.5 🔴 NEW — OPEN: does forward-1× PLAY drive a canvas video through the shipped `VideoDriver`? — GATES tasks 5.x ONLY

**Opened by §9.3's measurement, 2026-08-12. NOT decided.** It gates `tasks.md` §5 (the video half)
together with §9.4. It does **NOT** gate §4 (the Lottie half), and it does not gate anything in
D-133.

§5.4 rejected play-and-re-anchor and conceded it would be "genuinely better, in the one mode where
it works" — **without knowing the size of the gap.** The measurement supplies it: the gap is
**~10 fps against 25 fps**, and forward-1× play is precisely the operation D-135's own "Why" names
as the one the operator uses to judge the composition. That re-opens something §5.4 closed under an
unknown.

So a HYBRID that §5 never considered is on the table: **forward-1× play drives the element through
the shipped `VideoDriver` (a real `play()`, real drift correction); scrub, backward play and bounce
position it by `currentTime`.**

- **FOR:** it recovers frame-true motion in the DOMINANT mode. And §5.4's objection that it would
  "re-import the whole drift/re-base/resume-grace machine" is **weaker than it was written**: that
  machine EXISTS, is SHIPPED, and is what the Preview already uses. The hybrid would reuse it, not
  re-import it.
- **AGAINST:** it is exactly the fork §5.1(b) warns about — two mechanisms, where the SINGULARITY
  of one call is what guarantees scrub and play agree — plus a hand-off at every ENTRY to and EXIT
  from forward-1× play, on a surface that reparents nodes (B-137's shape, §1.8).

**Not decided here.** Answering it means weighing frame-true forward play against the one-call
guarantee D-135's acceptance rests on.

## 10. What was expected and NOT found

Recorded so the next reader does not go looking:

- **No stepped/deterministic frame driver anywhere in the engine** — confirmed, as the hand-off
  said. There is nothing to reuse for a frame-exact canvas video, and building one would mean
  demuxing in the page.
- **No existing loop-range UI on the timeline to extend.** `TransportBar`'s `loop`/`bounce` are
  TRANSPORT modes (an authoring convenience over `activeRange`), entirely separate from the
  composition's playout loop. That is a **third** thing called "loop" in this codebase (§3.4),
  and the one most likely to be confused with D-133's, because it is the one on screen next to the
  playhead.
- **No `play` message reaching the canvas.** The canvas iframe implements the `play`/`stop`/`out`
  actions but `CanvasArea` never sends them; only the Preview does. Anyone assuming the canvas has
  a playback path to extend will not find one.
