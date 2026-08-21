# Session BI — `tasks.md` 7.9 fixed at cause, and BF filed as `B-150`

> **Safe to pull.** Everything below is on `dev`; the tree is clean and `pnpm gate` is green
> uncached (`0 cached, 89 total`) on the final commit.
>
> **Handoff letter/date:** `BI`, 2026-08-21 — the next free letter after `BH` (also 2026-08-21;
> two sessions landed on the same day).

## 0. State

| Fact                     | Value                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tip read at start        | `50dd8b5d` — one commit ahead of the prompt's expected `0b6da499`, and that commit is session BH's own docs push (the `gate:e2e` discharge + the flake record). Named rather than assumed.  |
| CI verdict on `0b6da499` | ✅ run [32424237246](https://github.com/yasermostafaee/cg/actions/runs/32424237246) — `completed` + `success`, **`E2E (Playwright)` RAN** and passed. Part one was built on a verified tip. |
| Part one pushed          | `c3425891` — `fix(bridge): a refused look switch leaves nothing a later swap can act on`                                                                                                    |
| Part two pushed          | **see §7** — the final SHA and its `gate:e2e` run                                                                                                                                           |
| `@cg/template-runtime`   | **CHANGED** — so the `prebuild` bundle ships the page half, verified in §6                                                                                                                  |

## 1. Part one — `tasks.md` 7.9, fixed at cause

**The prompt's description of the mechanism was CORRECT**, verified against the code before
anything was touched: `setActiveLook` wrote `#activeLooks` before the reconcile and kept the write
through every refusal; `#desiredPlateRects` resolves from that map; `swapLiveSource` reconciles
against `#desiredPlateRects` and sends no `updateLook`. So a refused switch armed the next,
unrelated source swap to seat the new look's fills behind the old look's holes.

**The fix is upstream of where the defect surfaced.** `#activeLooks` no longer means "what the
operator asked for"; it means **"which look the page is punching"**, and the write is a SIDE
EFFECT of successfully telling the page (`#tellPageLook`) rather than a separate statement a call
site could forget. The prospective look travels as an argument (`#desiredPlateRects(itemId, look)`)
instead of through shared mutable state, so there is no rollback to remember either — the invalid
state is unrepresentable rather than cleaned up. Two writes remain, both cases with no page to
disagree (an off-air row with nothing seated; a row whose producer is gone), and both re-enter
through `#sendAdd`, which puts the look in the `CG ADD` payload unconditionally.

🔴 **`R-048` IS UNCHANGED — that is the finding, not a shortcut.** The fix the task anticipated
(make `swapLiveSource` carry an `updateLook` too) was considered and REJECTED, in a comment at that
call site so a future reader meets the argument where they would make the change:

- it treats the symptom — with the record fused to the telling, the swap reads state that can no
  longer be wrong, so resolving from it is the only thing that could be right;
- it would put a NEW failure mode on the emergency verb. R-048 is for 20:59, one input dead, one
  plate to repoint. An appended `CG UPDATE` would have to either fail a swap that succeeded or be
  ignored, and an ignored send is the seed of the next divergence.

**The refusal-path sweep (§2.4) found nothing else.** Both take-door refusals (exclusivity,
no-looks-authored), both restore-door refusals, `setPosition` and `setPlateVolume` all refuse
BEFORE mutating; `swapLiveSource` writes `#sourceOverrides` early but rolls back explicitly.
`setActiveLook` was the one deviation from a rule the file otherwise keeps everywhere.

**Superseded text replaced rather than left standing** — the test asserting "the look stands" after
a failed switch (now asserts the opposite, with the reason), `setActiveLook`'s header claiming the
page transport does not exist (6.7 landed it), the same claim in the spec file's own header, and
`LookPicker`'s re-press rationale, which becomes the stronger one: a re-press is now the REPAIR for
a switch whose `CG UPDATE` was refused, because it reconciles the fills back onto the look the
holes are on.

**Tests** — three in `live-look-reconcile.integration.test.ts`, all mutation-checked. Restoring the
old write reddens each; in the first, the swap itself fails outright with `amcp-404` because it
drags the refused look's broken plate in, which is the defect in one line.

## 2. Part two — BF, filed and fixed as `B-150`

Hidden-look content kept running: a `<video>` decoding, a Lottie computing a frame per tick, a
crawl crawling, a sequence advancing past items nobody saw. One seam now parks it —
`LookMediaPark` (`packages/template-runtime/src/look-media.ts`).

### 🔴 2a. The audio half is NOT reachable, and this correction outranks the fix

`tasks.md` 9.3 called the audio the severe part. **It cannot happen**, on two independent grounds,
each verified by sweep rather than assumed:

1. every imported video has its audio track **stripped at conversion** (`-an`, decision (h),
   `video-convert-args.ts`);
2. every `<video>` the scene builder creates is **`muted = true`** and **nothing in the tree ever
   unmutes one** — `git grep "\.muted"` over `packages`, `apps`, `tools` returns writes of `true`
   and nothing else, and there is no `.volume =` write at all.

So BF's severity is a frame-budget one, not a sound-on-air one. This also re-confirms from a second
direction that it was never the cause of the unexplained on-air "2×", which remains unexplained and
was not chased here.

**The park still silences unconditionally** — not as a fix for a reachable fault, but as the
guarantee that must survive the operator toggle (see §2c). It is a separate act from the pause for
exactly that reason.

### 2b. What else runs in a hidden look (§4.4), and what is covered

| Kind           | Found                                                               | Covered                                                                  |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `<video>`      | decodes; audio unreachable (§2a)                                    | ✅ silenced + paused, revived in place                                   |
| Lottie         | computes a frame per tick, pushes `goToAndStop`                     | ✅ paused (opt-IN hold, so parkable by default)                          |
| Ticker / crawl | treadmill runs, transform recomputed                                | ✅ paused **when it does not gate the hold**                             |
| Sequence       | advances past items nobody saw — a correctness fault, not just load | ✅ same rule                                                             |
| Repeater       | its own `pause()`/`resume()` are explicit no-ops                    | n/a — its ROWS wire through the same path and are covered by containment |
| **Clock**      | keeps ticking                                                       | 🔴 **deliberately NOT parked** — see below                               |

🔴 **Two exclusions, both correctness rather than preference:**

- **Content that gates a HOLD is never paused.** A paused driver never completes and a
  content-driven hold waits for completion, so parking one would keep the graphic on air FOREVER —
  far worse than a decoding video. ⚠ Bound: `D-112` lets a parent instance re-filter a child's hold
  participation, so a member registered parkable can still be pulled into a parent's aggregation.
  Registration reads the element's own flag, the same value every other consumer reads.
- **Clocks are not registered at all.** `ClockDriver.resume()` accrues the paused interval into
  `pausedAccumMs`, which `activeElapsedMs()` subtracts — a parked duration countdown returns
  claiming the hidden interval as time it still has, and (a countdown being an opt-OUT hold driver)
  extends the graphic's life by the time it spent hidden. A clock tracks time that passes whether
  or not anyone is looking.

### 2c. The seam, named — and the toggle NOT built

**`LookMediaPark` in `packages/template-runtime/src/look-media.ts` is the injection seam.** The
operator toggle becomes a constructor option there and governs the PAUSE half of `#park` alone.
**No policy field, config key or API was added** — an option nothing reads is the
written-but-unreachable class this repo has filed repeatedly. The toggle is recorded as
`multibox-layout-switch` `tasks.md` **7.10** (7.9 was the part-one item; **9.5 was already taken**
by the luminance-transfer measurement, so it is filed on the operator-surface section where it
belongs).

⚠ **A toggle must never reach the silence half, nor either exclusion.**

### 2d. One design point worth knowing before editing it

`#park` **re-issues `pause()` on every reassert**, and the obvious `if (already parked)` guard is a
BUG — it was written that way first and a test caught it. The class does not own the drivers:
`play()`, the hold-entry content start and a loop-cycle re-arm all `reset()` + `start()` them,
knowing nothing about looks. A guard on our own bookkeeping sees "already parked", skips the pause,
and leaves a restarted driver running inside a hidden look. Re-issuing costs nothing — every
driver's `pause()` returns immediately when it is not running.

There is **no chokepoint** every content start passes through, so `reassert()` has three callers by
necessity (each labelled `CONTENT-START CALLER n of 3` at the site). `looks-media-park.test.ts`
therefore ENUMERATES them — the same technique `live-add-mute` uses bridge-side, and for the same
reason.

## 3. Filing

- **`B-150`** in `docs/prd/bugs-runtime.md`, cross-referenced to `R-057`, `B-149`, `D-128`, `D-125`.
- **Sweep, before and after.** Before: the documented heading sweep over `docs/prd/*.md` (excluding
  `README.md` and the registry) returned a maximum of **`B-149`**; `git grep -c "B-150" -- docs`
  returned no match at all. After: `B-` stays contiguous `B-001` … `B-150`, next free `B-151`, and
  the CI bug-number audit (`tools/soak-runner`) passes.
- 🔴 **A COLLISION WAS CAUGHT BY THAT SWEEP.** The session had already written `B-148` into three
  files, on a number derived from a narrower grep that matched only list-item forms and therefore
  missed `B-148` and `B-149` — which are HEADINGS in `bugs-designer.md`. Ten occurrences were
  renumbered before the heading was written, so nothing shipped under the wrong id. Recorded in
  `b-number-registry.md`, because the lesson is the registry's own: a number is free because a
  sweep of the HEADINGS says so, and a grep that "looks like" the sweep is not the sweep.
- **9.3 closed** as a defect rather than as an owed measurement, with its audio half explicitly
  superseded and the original text kept, struck through, because half of it was wrong.

## 4. Engine doc-sync

`look-media.ts` is a new module with an extension point, so all three were updated in this change:
`docs/engines/overview.md` (the runtime bullet list), `packages/template-runtime/README.md` (the
module map **and** a new step 3b under "Add a new element type" — if the element RUNS, enrol it in
the park), and the module's own header, which carries the whole argument.

## 5. Out of scope — named untouched

BC's two deferred findings (unchecked rollback `CLEAR`s; `#activeLooks` not persisted **by the
bridge**), the AW banner, P2.DEL, and the unexplained on-air "2×". `template-http-server.ts` was
not touched. No agent scratch files were committed; every commit staged explicit paths and was
checked with `git diff --cached --stat`.

## 6. The `prebuild` bundle — verified, and HOW

`@cg/template-runtime` changed, so `tsc` is not what ships the page half: the
`prebuild` hook on `@cg/single-file-export` (`scripts/bundle-runtime.mjs`, esbuild → chrome71)
regenerates `src/generated/cg-runtime-bundles.ts`. After `pnpm --filter @cg/single-file-export
build`, that generated file contains the `LookMediaPark` class body itself — `setHiddenRoots`,
`reassert`, `parkable` and the class's private fields lowered to esbuild's
`__privateGet`/`__privateSet` for the CEF 71 target — not merely the identifier names. The
`cef-compat` bundle-artifact scan passes on the regenerated output, which is what confirms no
banned modern built-in entered the on-air page.

## 7. Verification

- `pnpm gate` — **green, uncached (`0 cached, 89 total`)**, run on the final tree of each part.
- The **SUITE**, not just the new specs: `pnpm --filter @cg/caspar-bridge test` (all look specs, 51
  tests across the two files), `pnpm --filter @cg/template-runtime test` (77 files, 1020 tests),
  `@cg/single-file-export` and `@cg/soak-runner` for the bundle scan and the number audit — plus
  `pnpm gate`, which runs everything. ⚠ Session BH's CI red was a row-count assertion in an
  existing spec that a spec-only run never touched; that is why this is stated explicitly.
- **`gate:e2e` is OWED** — part two changes `@cg/template-runtime`, i.e. what renders. The run URL
  and conclusion are in §0 once CI completes; a green run predating the last fix does not discharge
  it.

## 8. What the tests do NOT cover

**happy-dom has no decoder**, so the decode LOAD — the thing that makes `B-150` worth fixing — is
unmeasurable in the suite and is NOT measured. The tests assert the API facts the claim rests on
(`paused`, `muted`, `currentTime` not rewound); the step from "the element is paused" to "the
decoder stopped spending frames" is the browser's contract. A real number belongs on the plant's
CEF beside §9.6f's own.

Also stated in the suite rather than quietly counted: the mute-restore test is a **floor, not a
proof** — `muted` is `true` on both sides today, so it also passes with the park removed. It exists
to fail the day somebody adds an unmute path and reaches for `= false` on the revive.

## 9. What the owner can check

**Part one: nothing visual.** The proof is a command sequence, and it is asserted as one. The
on-air proof — fills and holes moving together — needs a plant capture and is a later measurement.

**Part two: NOT an ear test.** The obvious check ("switch away from a look and listen for its audio
stopping") is one you cannot perform, and it would prove nothing if you could: §2a shows there is
no audio in the tree to hear. Two things you CAN do:

1. **The one you can run today**, on a template with a video background in one look and something
   else in another: switch away, wait, switch back — the clip continues from where it was rather
   than snapping to its first frame. That is the resume-in-place half, visible.
2. **The one that needs the plant**, and is the real measurement: put a multi-look template with a
   video in each look on the CEF and read the frame rate before and after this commit. `§9.6f`'s
   numbers (−4 %, −10 %) are the scale to compare against. Until then the decode claim rests on the
   API facts above.
