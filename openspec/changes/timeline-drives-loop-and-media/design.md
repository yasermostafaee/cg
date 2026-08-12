# Design — the playhead drives the canvas, and the loop range is authorable

> **DESIGN-FIRST.** This document is the deliverable. `tasks.md` carries no task that is ready to
> start; §9's open questions gate all of them.

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
| `PlayoutSection.tsx:45` `hasContentElement`                      | a genuinely SEPARATE, NARROWER predicate — see below                     |
| `PreviewScopeTiming.tsx:112` `contentOf`                         | a third, different set again — TUNABLE content, not hold drivers         |

Two of these are not the driving set at all, and D-133 collides with both:

- **`hasContentElement`** (ticker / sequence / countdown clock only — **no Lottie, no video**) is
  what gates the "Pin content start" affordance. It is NARROWER than
  `hasEffectiveHoldDrivers`, which also counts an opted-in Lottie or video. So today a composition
  whose only hold driver is an opted-in Lottie **has a content-driven hold and no way to pin its
  content start**. D-133's "offer the loop option ALWAYS" deletes that gate, which removes the
  discrepancy as a side effect rather than by fixing it — worth knowing, because it means the
  gate's removal is a bug fix as well as a feature.
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

`PlayoutSection.tsx:621` gates "Pin content start" on `lifecycle !== undefined && hasContent`.
D-133 removes the `hasContent` half outright. Note from §1.5 that this also fixes an existing
discrepancy: a composition held by an opted-in Lottie has a content-driven hold today and no way to
pin its content start.

The `lifecycle !== undefined` half is a **separate question** — see §9.2. `contentStart` is
schema-constrained to `[activeRange.in, outPoint]`, so it cannot exist without an `outPoint`; an
unconditional loop range therefore implies an unconditional out-point, which is a bigger change
than it looks. That is the owner's call, not this design's.

**No backward compatibility is owed** to the conditional UI: the item records that nothing has been
delivered to the client, so the compatibility floor is unset ([[P-031]]).

---

## 4. D-135 — the Lottie half (cheap, and it goes first)

`LottieDriver` is already a positioned renderer: `goToAndStop(frame)` per tick. Extending
`tick(frame)` to map composition frame → clip frame through the element's phase mapping and call
`goToAndStop` is the whole of it. No new architecture, no timing risk, no decoder.

It is called out separately because it should land **first and alone**: it makes the acceptance
demonstrable on one element kind while §5's video question is still open, and it validates the
frame↔time mapping that the video half then reuses.

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
3. **Keyframe interval dominates, and it is known.** `video-driver.ts` records ~5 s keyframes on
   this project's assets and a "RESUME GRACE" window because "a seek at our ~5 s keyframe interval
   decodes seconds of video in one burst". Canvas seeking should therefore prefer `fastSeek()`
   where available. **This is a measurement, not a guess — but the measurement was taken for a
   different path, and the canvas's per-frame behaviour has NOT been measured. See §9.3.**

### 5.3 What the canvas gives up, in one sentence

**Canvas video will not be frame-accurate during playback at 25/50 fps; it will show the nearest
decoded frame and will visibly drop frames under decoder pressure, especially with two or more
video elements.** That is the deal, it is the right deal for an authoring surface, and it must be
written into the spec so it is not later filed as a bug.

### 5.4 The cost of the rejected option, for the record

Play-and-re-anchor would give smooth, decoder-friendly forward playback at 1× — genuinely better,
in the one mode where it works. It would cost: a second code path that scrub does not share; no
answer for backward play or bounce; divergence between the scrub frame and the play frame at every
drift correction; and a re-import of the whole drift/re-base/resume-grace machine onto a surface
that has no wall clock of its own. **It is rejected on (a) alone**; the rest is why it would not be
worth reaching back for later.

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
2. **Decoder pressure is unmeasured on this path** (§5.2 note 3) — see §9.3.
3. **Two loops, one word** (§3.4).
4. **The canvas is a second host that reparents `<video>` nodes** (§1.8 / §5.5) — B-137's exact
   shape, one surface over.
5. **`hasContentElement` vs `hasEffectiveHoldDrivers`** (§1.5): removing the gate silently fixes a
   discrepancy. If the gate is kept in any form, the discrepancy must be fixed explicitly instead.

---

## 9. OPEN QUESTIONS — owner decisions, NOT guessed

Each names both candidate answers and what each costs. They are recorded here rather than left in
the prompt that raised them, because a prompt is ephemeral and the spec is the memory. **Every task
in `tasks.md` is gated on at least one of these.**

### 9.1 What does a loop range MEAN under a `timed` hold? — GATES tasks 2.x

D-133 says: _"with a non-content-driven hold the loop range is INERT"_. Taken literally the markers
are authorable and do nothing, which is a control that teaches the operator nothing when they use
it. But the alternative changes playback.

- **(a) INERT, exactly as filed.** The markers draw; a `timed` hold still parks on `outPoint`.
  **Cost:** an operator who authors a loop range on a shape-only scene sees nothing happen, with no
  explanation. Mitigable with an inline note ("this range loops once a content driver is added"),
  which is a UI answer to a model question.
- **(b) A `timed` hold LOOPS the range for `holdMs`.** The furniture repeats for the hold duration,
  then the OUT phase runs. **Cost:** it is a behaviour change to `timed` holds, which are the
  DEFAULT, so every existing shape-only composition with a `contentStart` changes what it does.
  It also makes the loop range meaningful in two different ways depending on `holdSource`.

**Design's read:** (a) is what the item says, and this design assumes it. (b) is the more useful
product and the more expensive decision. **Not decided here.**

### 9.2 Does an UNCONDITIONAL loop range imply an unconditional OUT-POINT? — GATES tasks 1.x

`contentStart` is schema-constrained to `[activeRange.in, outPoint]` and so cannot exist without an
`outPoint`. Today an out-point exists only via the "Add out point" button, and a composition with
none resolves to `mode: 'static'` (D-114).

- **(a) Offering the loop range implies creating an out-point.** Authoring a loop range on a
  composition that has none silently promotes it out of `static`. **Cost:** an authoring action
  named "loop" changes the composition's PLAYOUT MODE as a side effect — exactly the kind of
  compound verb this codebase refuses elsewhere (the row's re-bind, the rehearse interlock).
- **(b) The loop range still requires an out-point; the UI offers to add one, explicitly.** Two
  visible steps. **Cost:** "ALWAYS offered" becomes "always offered, sometimes after one more
  click", which is arguably not what D-133 asked for.

**Design's read:** (b) is consistent with how this codebase treats compound verbs, and the item's
own words are that the conditional affordance is "at most a shortcut" — which implies a path, not
an absence of steps. **Not decided here.**

### 9.3 Canvas video under BACKWARD play and BOUNCE — GATES tasks 3.x, and it changes SHAPE

§5 establishes that a `<video>` cannot play backward. Under position-by-`currentTime` it _can_ be
positioned backward — one seek per frame, against the decoder's grain (backward seeking is the
worst case for inter-frame codecs). Three answers, and this one changes the implementation's shape
rather than a constant in it:

- **(a) Position backward too, accepting whatever the decoder gives.** Consistent: every transport
  mode drives every element the same way. **Cost:** backward play with video on the canvas may be a
  slideshow. Unmeasured (§5.2 note 3).
- **(b) Video freezes on the last forward frame during backward/bounce play**, and the canvas says
  so (a small badge on the element). **Cost:** the canvas stops being a true rendition in two
  transport modes, and it must SAY so or it lies.
- **(c) Backward play positions video only on PAUSE** — during backward playback the element holds,
  and it re-positions when the transport stops. **Cost:** the most complex of the three, and it
  introduces a fourth behaviour to explain.

**Not observed — needs the owner at the machine.** How bad backward-seeking actually is on this
project's assets (~5 s keyframe interval, per `video-driver.ts`) can only be established by
watching it. That measurement should be taken BEFORE choosing, and it is cheap: scrub a video
element backward on the canvas today, at speed, and watch.

**Design's read:** (a) if the measurement is tolerable, (b) if it is not. (c) only if the owner
wants backward play to remain smooth with video present.

### 9.4 Does a Lottie/video that is NOT a hold driver follow the playhead? — GATES tasks 3.x, 4.x

`drivesHold` is an OPT-IN for media (`=== true`, the inverse of ticker/sequence/clock). A Lottie
with `drivesHold` absent is furniture: it does not gate the hold.

- **(a) EVERY Lottie/video follows the playhead**, regardless of `drivesHold`. `drivesHold` answers
  "does this gate the HOLD", which is a different question from "does the canvas show its frame".
- **(b) Only opted-in drivers follow it.** **Cost:** a Lottie logo animation that is deliberately
  not a hold driver would sit frozen on the canvas while the composition plays — which is the exact
  misrepresentation D-135 exists to remove.

**Design's read: (a), strongly.** They are orthogonal questions and conflating them would defeat
the item. Recorded as an open question anyway because it is a product-visible choice and the
inverse-default of `drivesHold` is load-bearing elsewhere — a reader who saw `drivesHold` and
assumed it governs this would not be being unreasonable.

---

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
