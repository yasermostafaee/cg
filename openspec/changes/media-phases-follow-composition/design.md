# Design — media phases follow the composition

## 1. The decision (owner, 2026-08-12)

**A third phase source: `'composition'`.** The element stores the RELATIONSHIP, not the numbers:
its intro ends at the composition's effective content start; its outro fits the composition's OUT
segment. Values are DERIVED wherever phases are resolved, so dragging `outPoint` / `contentStart`
moves them with no re-sync step.

### 1.1 A one-shot snap button was considered and REJECTED

A "snap to composition" button writing the currently-correct values into manual phases would be a
STALE COPY: correct at the click, silently wrong after the next marker drag. That is the same
stale-second-derivation family this codebase has now catalogued four instances of (the D-149
intrinsic-size field rejection, the B-100 twice-read boolean, the P-012 second lock copy, the
`lottieClipMidpoint` extraction rationale — a second copy of one rule is how the two come to
disagree). The snap GESTURE survives as **Detach**: bake the currently-derived values into
`source: 'manual'` and edit from there — an explicit, operator-invoked transition OUT of the
relationship, not a shadow of it.

### 1.2 Deferred, not rejected

Dragging element phase markers on the timeline in comp space — revisit after D-133's timeline
marker work exists. Recorded here so the idea is not re-invented from scratch; no item number is
minted (PRD registration is the owner's).

## 2. The model — a CONTINUOUS WINDOW through the clip, anchored at the HOLD TIME `H`

Settled after the owner's decisive case (5 s clip, hold look at clip-second 3, 2 s composition):
anchoring the intro at the clip's START cannot express "be on second 3 when the content shows"
inside a short entrance — reaching second 3 at 1× takes 3 seconds. The anchor must be the hold
time.

Anchors, comp side: `active.in`, effective content start, `lifecycle.outPoint`, `active.out`.
Spans: entrance span ms = `(contentStartEff − active.in) × 1000 / compFps`; OUT span ms =
`(active.out − outPoint) × 1000 / compFps`.

- **`H` — the clip time whose look the composition HOLDS — is authorable under follow** (`holdAt`,
  clip-native units: Lottie animation frames, video ms). Absent ⇒ `H = clip start + entrance
span`, which degenerates exactly to "play the clip from its head" — the simple case costs
  nothing and is the general rule at `H = entranceSpan`, not a separate branch.
- **intro** = `[max(clipStart, H − entranceSpan) → H]`. The clip reaches its hold look EXACTLY at
  the effective content start, skipping as much of the clip's head as the entrance cannot fit.
  This is a NEW driver capability — an intro that starts at an OFFSET, not at the clip start — and
  it lands in the ONE mapping function per kind (`LottieDriver.clipPositionAt`,
  `VideoDriver.expectedClipMs`), never beside it.
- **hold** = freeze at `H`. An authored `idle` range keeps working and composes with `H`; `idle`
  is NOT derived — absent means freeze. (For a video whose `holdBehavior` is `loop` with NO
  authored idle range, the hold under follow is a freeze at `H`: looping the whole clip would
  abandon `H`'s look, which is the one thing follow promises to keep. The stored `holdBehavior`
  is untouched; only the resolved hold under follow reads this way, and the Playout checklist's
  `infinite` mirror says the same — see §8.)
- **outro** = `[H → min(H + outSpan, clipEnd)]` — CONTINUOUS from the held frame, so there is no
  hold→outro pop by construction, and the cut at stage-clear is covered by the composition's own
  exit animation.
- `speed` is NEVER touched — §D1.1 (archived Lottie design). The window changes WHICH frames
  play, never the rate.

### 2.1 Rejected alternative: anchor the outro to the clip's END

`[clipEnd − outSpan → clipEnd]` would show an authored build-off tail — and was REJECTED because
the held frame would cut to a distant frame at the OUT boundary, the exact discontinuity follow
exists to remove. An operator who wants the clip's authored ending uses markers/manual phases.

### 2.2 The owner's case — the motivating example (tested verbatim, both kinds)

5 s clip, hold look at clip-second 3, composition 2 s, content start at 1 s, OUT segment 0.5 s.
Under follow + `holdAt = 3 s`: the intro plays clip `[2 s → 3 s]` during the 1 s entrance; the
clip sits on second-3's look from the moment the ticker shows, through the entire hold; the outro
plays clip `[3 s → 3.5 s]` inside the OUT segment. Head `[0 → 2 s]` and tail `[3.5 s → 5 s]`
deliberately unplayed. Nothing rescaled, nothing pops.

### 2.3 Consequences, stated so they are not later filed as bugs

- **A clip LONGER than the composition always fits**: both spans are ≤ the comp's length, so no
  clamp fires. The unplayed parts are the head before the window and the tail after it —
  deliberate; do not file "follow skips part of my clip".
- **The 2 s timeline is not the on-air duration**: the HOLD stretches real time, so a long clip's
  hold look survives arbitrarily long holds by freezing (or idle-looping), never by having to fit.
- **On air, the element outro and the background OUT segment are SEQUENCED (content-first,
  shipped D-105/D-125 ordering), while the canvas scrub overlays them across the OUT segment.**
  The window's outro LENGTH equals the OUT span in both, which is the decision this change makes;
  the exit ordering is shipped behaviour this change does not touch.
- **D-151's open question is ANSWERED by this change's existence** (owner: sharpened Candidate A —
  the third add-time choice becomes "Add as backdrop — follow the composition", which CONFIGURES
  the deliberate pattern rather than dismissing a warning). Recorded in the D-151 PRD item; the
  dialog is a later session. A follow-source element never triggers D-151's warning on any later
  re-check — absorbing the length mismatch is what follow means.

### 2.4 Clamps — surfaced through the EXISTING hint machinery, no second warning surface

- `H < entranceSpan` ⇒ the intro starts at the clip start and is SHORTER than the entrance — the
  clip freezes early; hint flags it (`introShort`).
- `H + outSpan > clipEnd` ⇒ the outro clamps at the clip end; hint flags it (`outroClamped`).
- `H > clipEnd` (stale `holdAt` after swapping the asset) ⇒ clamp to `clipEnd`, flag
  (`holdPastEnd`).
- Clip shorter than the entrance with default `H` ⇒ the short-clip clamp: `H` clamps to the clip
  end and the intro is shorter than the entrance — both flags above fire.

## 3. Schema (all additive; stored scenes round-trip unchanged)

- Lottie: `source: z.enum(['markers', 'manual'])` grows `'composition'`.
- Video: `VideoPhasesSchema` had NO source field; it gains `source` (optional) with absent ⇒
  `'manual'`-equivalent. The two schemas' shapes are otherwise untouched — units are NOT unified.
- Under `'composition'`, stored `introEnd`/`outroStart` values are IGNORED (the schema comment
  says so); they stay REQUIRED-present so a Detach has somewhere to land without a shape change,
  and so a `markers` clip that follows and detaches keeps parsing everywhere.
- `holdAt` — optional, clip-native units per kind (Lottie animation frames, video ms), meaningful
  ONLY under `source: 'composition'` (ignored otherwise; the comment says so).

## 4. ONE derivation, time-space, one thin unit adapter

The comp-side arithmetic exists ONCE: `followWindowMs` in `@cg/shared-schema/follow-window.ts`
(the package every consumer — runtime, designer, exporters — already depends on, and the package
that already carries scene derivations: `activeRangeOf`, `playoutOf`, `hasEffectiveHoldDrivers`).
It works in MILLISECONDS — video's native unit — so the video "adapter" is the identity: the
runtime and `VideoSections` consume it directly. The ONE real unit adapter is
`lottieFollowWindow` in `@cg/lottie-bridge/timing.ts` — the module whose charter is already "the
ONE place a Lottie's phase frames are converted between frame spaces" — converting animation
frames ↔ clip ms through `fr × speed` at the edges and delegating every comp-side decision to
`followWindowMs`. The `followsComposition(phases)` predicate also lives beside the core helper,
so "is this element a follower" is spelled once (golden rule 6).

## 5. Resolution runs where phases are resolved — no baked copies

Derivation runs in `createRuntime` (driver construction), so the canvas re-derives on every
`scene-replace` (marker drags included), and preview/export/air run the SAME code on the same
scene. Verified before building: `buildPlayoutMetadata` bakes NO element phases (comp-level
playout only), and both exporters inline the scene whole — the relationship travels, not numbers.
The scene-builder's `data-cg-poster-ms` is the one pre-resolution surface: it falls back to
`holdAt ?? midpoint` for a follower, and the runtime OVERWRITES it with the exact derived `H` at
driver construction (anchors exist only there).

### 5.1 The runtime reorder this required

The effective content start (`holdEntry` = marker ?? `entranceSettleFrame(...)`) was computed
AFTER the media driver loops; a follower's window needs it AT driver construction. The settle
aggregation is therefore hoisted into a PRE-PASS over `scope.lotties` (same visible gate, same
`lottieTiming`, same null rule) and `holdEntry` is computed once, before the driver loops, and
reused below — one read, one derivation, no second copy (golden rule 7's spirit).

## 6. No circularity — a follower contributes `settleOffset: null`

When `lifecycle.contentStart` is absent, the effective content start is the entrance-settle
heuristic, which aggregates Lottie `settleOffset`s. A follower derives FROM that value, so it must
not vote on it: a `source: 'composition'` element is fed to `lottieTiming` with `phases:
undefined`, which is EXACTLY the existing marker-less rule ("the ABSENCE of information, not an
authored claim") — the null path is reused, no new branch in the aggregation. The PlayoutSection
mirror (`contentStartDefault`) walks keyframes only (verified), so it needs no change.

## 7. No-lifecycle case

A composition with no `lifecycle` gives a follower no anchors. The runtime behaves as marker-less
(the shipped fallback — whole-clip intro, hold per kind, degenerate outro), and the Inspector SAYS
why the mode is doing nothing — the §9.1 rule, now settled twice: an inert control that does not
explain itself is a defect. The option is not silently disabled.

## 8. The Playout checklist's `infinite` mirror — kept truthful (and a found-beside fix)

`mediaHoldItem` must answer "does this element's hold ever complete" the way the DRIVERS answer
it, or the never-closes alert lies (the session-R class). Under follow: infinite ⇔ an authored
idle range is present AND the hold behaviour loops it (absent idle ⇒ freeze at `H` ⇒ completes).
Found beside it and fixed with tests: a marker-less (or degenerate-idle-span) `idle-loop` Lottie
was listed infinite, but `clipPositionAt` falls back to FREEZE on a zero idle span
(`idleOut > idleIn` fails) and RESOLVES `whenComplete` — the graphic auto-closes. A video `loop`
hold stays infinite regardless of span (its loop branch never resolves). The predicate now spells
these driver facts exactly, per kind.

## 9. Inspector

- The phase-source control gains "Follow composition" for both media kinds — same presentation in
  `LottieSections` and `VideoSections`. **The affordances are BUTTONS, not a select** (the brief's
  shorthand said "select", but the shipped phase-source control is state+buttons — Add phase
  markers / Clear phase marks / a "from markers" row the E2E asserts by text — and the follow
  transitions are ONE-WAY gestures a select would misrepresent: `markers` is not re-enterable
  after a Detach bakes over it, and leaving follow is a bake, not a toggle). Every state gains a
  "Follow composition" button; the follow state carries "Detach — edit as manual".
- Detach bakes the derived HOLD into the manual model: `introEnd = outroStart = H`, `source:
'manual'`, `holdAt` KEPT (re-attaching restores the same hold time). The offset intro and
  bounded outro are FOLLOW-ONLY capabilities the manual model cannot express — leaving follow
  returns to `[ip → introEnd]` / `[outroStart → op]` — so the hold, the load-bearing look, is
  what lands. A following ex-`markers` clip still carries its stored marker values until a
  Detach bakes over them (one-way, by design: the markers were a claim about the clip, the bake
  is a claim about this composition).
- Under follow: the derived window is shown READ-ONLY with comp equivalents (the existing hint
  machinery), plus ONE editable input — "hold at" (`holdAt`, clip time). First set seeds it from
  the SHARED poster/midpoint helper (`lottieClipMidpoint` / `posterTimeMs` midpoint — the
  project's definition of "the representative settled look"); clearing it reverts to default `H`.
- The settle/clear hint lines keep working under follow, reading derived values and showing the
  window's clip times. When the content-start marker is absent, the hint derives the entrance
  span from the SAME keyframes-only default the Playout section's pin uses (extracted, not
  copied), labelled as derived; the runtime's richer heuristic (which also folds in OTHER
  Lotties' settles) remains authoritative on air — a known, pre-existing display limitation of
  the keyframes-only mirror, unchanged by this feature.

## 10. Session V (2026-08-13) — the frozen follow-outro, instrumented to one field

**Owner-observed:** a follow video played its intro, froze at the right `H`, and past the out
point never played its outro — canvas AND preview — while manual phase marks on the same scene
played both halves. **Instrumented cause (not reasoned from source): `outroEndMs === holdMs`,**
because `outSpanMs = (activeRange.out − outPoint) × frameMs` derives **0** when the out point
sits AT the end of the active range while the operator-visible "room after it" lives only in the
frameRange — the ruler's tail, which neither the OUT segment nor air ever plays (the unique
configuration reproducing the FIRST report; see §10.1 for the sharpened second report and its
measurement). Manual phases diverge because
they never consult the anchors; their outro window is stored clip time.

How real authoring produces the shape (store-probed, all four):

- shrink-then-regrow of the total duration PINS `activeRange.out` at the short value while the
  ruler regrows — nothing announces it;
- the out-marker drag CLAMPS silently at `activeRange.out`, so "drag it toward the visible end"
  lands it exactly there;
- and two mutations could STRAND the markers entirely: `setSceneDurationFrames` (shrink) and
  `setSceneActiveOut` re-sized the window without re-clamping the lifecycle, leaving
  `outPoint > activeRange.out` — a scene `refineLifecycle` REJECTS, i.e. a save that cannot
  re-load.

**What changed (the rule did NOT):**

- `followWindowMs` clamps gain `noOutSegment` (`outSpanMs <= 0`), surfaced through the ONE
  existing hint surface for both kinds — the §9.1 rule: inert behaviour explains itself.
- The lifecycle-clamp invariant now has ONE rule in ONE place (`clampLifecycleTo`,
  `state/slices/document.ts`), applied by `setLifecycle` AND by both window-movers. The
  instrumented cause was precisely this rule living in one writer and not the others — the
  one-rule-twice family (B-100/P-012): a clamp that exists only where the MARKER moves is a lie
  wherever the WINDOW moves.
- Runtime-level exit coverage for follow media now exists at all (`follow-outro.test.ts`): the
  recon found NO test drove a follow element through `out()`/`stop()` — the derivation, registry
  and ledger were each unit-tested and their COMPOSITION never was.

**Raised to the owner — and ✅ ANSWERED (2026-08-13): a follower's outro room STAYS
`[outPoint → activeRange.out]`; the ruler-room (`frameRange.out`) alternative is REJECTED.**
Both candidates, kept as the reasoning:

- **Active-range room (CHOSEN):** the OUT segment is `[outPoint → activeRange.out]` everywhere —
  air, preview lifecycle, canvas mapping, follow derivation — so the markers stay READABLE (what
  you see between the out point and the active end is what plays) and the exit stays PREDICTABLE
  (the composition never animates through frames playback will not reach). The silent-zero case
  this consistency can produce is covered by the `noOutSegment` clamp + hint, which names the
  remedy.
- **Ruler room (REJECTED):** deriving the outro from `frameRange.out` would let a follower play
  through frames the composition itself never plays — the canvas and air would disagree about
  the exit, and the out marker would stop meaning "where the OUT begins" for followers alone.

### 10.1 The sharpened report — "the outro starts LATE" — MEASURED, and it does not reproduce

The owner re-observed and sharpened the report: the outro is DELAYED, not absent — by roughly the
composition's own `[active.in → outPoint]` span — with the expectation (the shipped design's own
statement) that the element's outro begins exactly AT the out point. **Measured at HEAD, per the
brief's step 0, the delay does not exist and does not track `(outPoint − activeIn)`:**

- CANVAS, seven variants (holdAt set/absent, contentStart set/absent, `activeIn > 0`, authored
  idle, and the out point at 60/100/140 as a tracking test): `t(outPoint) == H` exactly and first
  motion at `outPoint + 1` frame, every variant; moving the out point moves first motion WITH it.
- PREVIEW, both exit mechanisms: `out()` → first clip motion within one 20 ms step; AUTO-OUT
  (timed hold, comp intro 2.8 s + hold 400 ms) → outro first motion at 3240 ms against 3200
  expected — hold-timer granularity, not a comp-anchored offset.
- No subtraction in the outro path CAN produce a comp-intro-sized offset: the drivers receive
  only clip-side ms; the comp-side pair is anchored once (`scrubActiveIn` / `scrubOutPoint`) and
  the outro mapping is `outroStart + elapsed` from the out point.

The runtime positioning paths are IDENTICAL at `a553f79d` (the report's read state) — the session
V fix touched schema/designer only — so the measurement covers the reported build too. Both
observations are consistent with §10's family: the FIRST (permanent freeze) is the silent
zero-OUT-segment; the SECOND (motion "later than the out point" after pulling it earlier) fits a
SHORT clamped outro window on a pinned active range — brief motion, then the held clamp, read as
lateness. **What this session adds against a recurrence: exact one-frame boundary pins** on both
kinds and both surfaces, plus the out-point tracking pin and the first auto-out follow coverage
(`follow-outro.test.ts`) — a wrong-anchor regression now fails one frame past the out point, not
"eventually". If the owner reproduces the delay again, the scene FILE is the decisive artifact —
these pins prove the shape they pin cannot be the one failing.

### 10.2 Session X (2026-08-13) — the owner's FILE, and what each hypothesis measured

The owner re-tested at `2f2d6221` and supplied `videotickeroutrobug.cgproj`: root scene with NO
lifecycle and NO layers; everything — the video (`durationMs` 14 320, follow source), the
repeat-2 drain ticker (`lifespan {251 → 525}`), and `lifecycle {outPoint: 525, contentStart:
251}` + `playout {auto-out, content-driven}` — on `compositions[0]`. Derived window: `H` 5020 ms,
outro `[5020 → 8840]`, `hasOutro` true. The document shape no session-V fixture had.

**Hypothesis 1 (the scene-level scrub anchors go blind on this shape) — REFUTED, empirically.**
The question "what does the Designer hand `applyScene`" was logged on the real file, not
guessed: BOTH surfaces hand the runtime the active composition PROMOTED to the scene root —
`editSceneOf` for the canvas, `scopeSceneToComposition` (which builds on it) for the preview —
lifecycle, frameRange and layers included. The runtime never receives the raw document, so
`scrubOutPoint = scene.lifecycle?.outPoint` IS the scope's own out point for everything the
canvas shows, and the boundary on the owner's real file measures EXACT: `t(524) = t(525) =
5.020` (H), `t(526) = 5.040`, `t(600) = 6.520`. The scene-level anchors and `followAnchors`
coincide BY the projection contract, which is now pinned as such
(`apps/designer/tests/follow-document-shape.test.ts` — the real store load, the real projection,
the runtime, the one-frame boundary, on the owner's numbers). No canvas fix is owed; a
failing-first canvas fixture for this shape cannot be honestly written at this tree.

**Hypothesis 2 (the preview delay) — CONFIRMED as (a): the CONTENT-DRIVEN hold, working as
specified.** Measured on the real projection (fake clock, harness text metrics): the intro
FrameDriver reaches the out point at 10 500 ms wall; the ticker's two-pass drain crawl (started
at content start, 5 020 ms) completes at ≈ 15 440 ms; the video leaves `H` at 15 440 ms —
**4 940 ms after the out point, exactly the crawl's remainder** — and then plays its follow
outro to the derived end (8 840 ms clip time) correctly. Under `holdSource: 'content-driven'`,
`outPoint` is where the HOLD begins and the hold's length is the content's remaining run — the
outro CANNOT begin at the out point by construction. (Real browser glyph metrics change the
absolute number, not the mechanism.) Pinned with a TIMED-hold control proving the delay is the
hold source and nothing else (`follow-outro.test.ts`, session-X describes).

🔴 **The owner's decision, OPEN — not "fixed" silently:** with a content-driven hold, which
behaviour does he want on this scene?

- keep content-driven and accept that the outro starts when the ticker drains (the crawl is the
  clock — the current, specified behaviour);
- switch the composition to a TIMED hold (the outro then starts at `outPoint + holdMs` — the
  control test shows this exact);
- shorten the content (fewer repeats / faster crawl) so it drains by the out point;
- or a DESIGN change (e.g. "the OUT phase interrupts unfinished content") — a rule change with
  on-air consequences, priced separately.

**Input for session W, measured:** the ticker's `lifespan {in: 251, out: 525}` does NOT end the
crawl — during the hold the held frame is the out point itself, the gate keeps the ticker
visible and crawling, and trimming `lifespan.out` to the out point leaves the hold's length
unchanged (pinned: the trimmed and untrimmed scenes leave `H` within one tick of each other).
The lifespan gate is VISIBILITY-only; it neither completes a content driver nor detaches it
from the hold aggregation.
