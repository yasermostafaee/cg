# Session BE — the "media plays at 2×" report: measured, not reproduced. What it was instead.

## THE STATE, first (read this cold)

- **Pushed SHA:** see §0. **Safe to pull.**
- **Base read:** `b8bcefa9` — exactly the expected tip, no delta.
- 🔴 **THE 2× WAS NOT REPRODUCED, and I am not going to pretend otherwise.** Everything I could
  measure runs at exactly 1×. What the hunt DID find are two real defects in 6.7's own seam
  (both mine) and one confirmed media defect that is a very plausible alternative explanation
  — all below.
- **The "I see no change" half is expected**, in one line: 6.7 aligns holes with fills _during
  a switch_, and no operator control can trigger a switch yet (phase 4). On a default look
  there is nothing new to see. That half is not a defect.

## 1. Is it a regression from LOOKS? **No — and this is evidence, not opinion**

Rather than bisect by feel, I diffed every file that can influence timing across the whole
LOOKS range (pre-LOOKS `6bfd3d75` → `b8bcefa9`):

```
frame-driver · video-driver · ticker-driver · clock-driver · sequence-driver
lottie-driver · repeater-driver · playout-controller · all of @cg/lottie-bridge
```

**The diff is EMPTY.** Not "small" — empty. The only page-side changes in the entire range are
`runtime.ts` (+88) and `types.ts` (+15), and reading them line by line they are visibility
flips, re-punches and payload stripping. **Nothing starts, stops, or rates a driver.**

That is a stronger answer than a bisect would have given, and it is why I did not burn the
session rebuilding five checkouts to confirm what the diff already proves.

## 2. What I measured (fake clock, exact arithmetic, no timing tolerance)

| measurement                                    | result                            |
| ---------------------------------------------- | --------------------------------- |
| rAF loops after build                          | **0**                             |
| after `play`, `update`, update+look, play+look | **1** each                        |
| after a **RE-PLAY** over a running scene       | **1** (the old one is not left)   |
| 500 ms of clock on a 500 px/s animation        | **250 px — exactly 1×**           |
| sampled at 200 / 400 / 500 ms                  | 100 / 200 / 250 px — **constant** |
| a **no-look-group** template                   | identical: 1 loop, 1×             |

Sampled three times on one line deliberately: that fails for an **accelerating** rate too, not
just a constant multiple — the prompt is right that those point at different causes.

🔴 **And the structural reason the symptom cannot be a duplicated driver**: every driver here
derives its playhead from **elapsed wall-time**, not a tick count. Two loops would recompute
the _same_ frame, not double it. The new tests pin that property, because a future driver that
accumulated per tick would silently give it up.

## 3. The hypotheses, each closed with evidence

| #   | hypothesis                              | verdict          | evidence                                                                                                                                                                                                                    |
| --- | --------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Runtime instantiated twice in bundle    | **KILLED**       | At the **artifact**: the generated bundle holds exactly 2 copies of a unique runtime marker = one per bundle _variant_ (`cgJs` + `cgJsIife`); each page includes one, and both HTML templates call `createRuntime` **once** |
| 2   | A driver started twice, old not stopped | **KILLED**       | Loop count = 1 on every path 6.7 touched, including re-play                                                                                                                                                                 |
| 3   | A rebuild re-enters without teardown    | **KILLED**       | Same; the re-play assertion is exactly this case                                                                                                                                                                            |
| 4   | Hidden looks still running              | **🔴 CONFIRMED** | See §4 — real, and the best alternative explanation I have                                                                                                                                                                  |
| 5   | Frame-rate mismatch                     | **KILLED**       | The repo derives only the **raster** from a channel video mode (scan type explicitly does not change it) and **no fps ever reaches the page** — it runs on `scene.frameRate` + wall clock                                   |

## 4. 🔴 The confirmed finding — a hidden look's video keeps playing, **audio and all**

`applyLook` hides a non-active look by writing `display:none` on its composition **instance**.
**Nothing pauses what is inside it.** Swept: `runtime.ts` gates exactly one media kind on
visibility (the Lottie, `l.element.visible === false`), the video driver has no such gate — and
in any case the authored `visible` flag is a _different fact_ from a look's runtime
`display:none`, so even that gate would not catch this.

**A `display:none` `<video>` does not pause. It keeps decoding and it keeps playing its audio.**

So a template whose looks each carry media puts **every look's audio on the channel at once**,
offset from one another. That is a thoroughly plausible plain-language _"the media playback is
not normal"_ — and it is worth ruling out before anything exotic.

⚠ **It is NOT a 2× on a single visible element** (§2 shows why), so I am offering it as a
candidate, not declaring it the answer.

**Filed at `tasks.md` 9.3 rather than fixed**, deliberately: pausing a look's media on exit and
resuming on re-entry is §12.4's "held" shape applied to media, and it has to answer whether a
returning clip **resumes or restarts**. That is a policy decision belonging with the operator
surface, not something to fold silently into a bug hunt.

## 5. What I did fix — two real defects, both mine from 6.7

`play()` handled the control payload **not at all**:

1. It **merged the reserved key into `currentValues`**, where `isFieldNamespace` reads
   `{look: …}` as a nested-composition namespace. It matched no scope so nothing visibly broke
   — but it _persisted_ in the value map and was re-walked by every later apply. Control data
   living permanently in the field state is exactly what the strip rule exists to prevent.
2. It **dropped the look entirely.** 6.7's re-take fix depends on the `CG ADD` payload being
   honoured: a re-take rebuilds the page into the authored default, and only that payload moves
   it to the look the bridge actually seated. Read on `update()` alone, **that fix was inert on
   any host that delivers load data through `play` — i.e. the fix I claimed in BD may never have
   worked on air.**

Both now go through the same one `enterLook`. The look is entered **last** in `play()`, after
`restoreContent()` — which writes `display` back onto content nodes and would otherwise un-hide
the instances the look just hid.

**Red-then-green, rebuilt between runs:** reverting either half turns the two new play-path
tests red on the exact assertion (`expected 'look-six' to be 'look-solo'`); the other 17 stay
green either way.

**Verified in the shipped artifact**, not just in tests (BD's lesson — the bundle comes from a
`prebuild` hook, not `tsc`): I regenerated `cg-runtime-bundles.ts` and searched it for the
control-key codec, which is present.

## 6. ⭐ The plant check — a number you can verify, not "it looks normal"

**Please run this; it is the one thing I cannot do from here, and it decides the rest.**

### Check A — is anything actually at 2×? (the decisive measurement)

Take **any template with a lifecycle**, on air, and time it with a stopwatch or a phone camera:

- A composition authored **50 frames long at 50 fps must take exactly 1.0 s** from `CG PLAY` to
  its hold.
- **If it takes ~0.5 s, that is the 2×** — and it is real.
- If it takes 1.0 s, the animation clock is fine and the symptom is media-specific → go to B.

Report the number, not an impression: **0.5 s and 0.7 s point at different causes.**

### Check B — is it only video, or everything?

On the same take, watch a **ticker/crawl** or any moving animation _at the same time_ as the
video.

- **Everything fast** ⇒ a page-clock problem (and Check A will have shown ~0.5 s).
- **Only the video fast, animation normal** ⇒ media-specific, and §4 is the first suspect.

### Check C — the §4 candidate, in ten seconds

Take a template on air whose **looks each contain a video**, and **listen**. If you hear more
than one clip at once — or one clip echoing itself slightly offset — that is §4, confirmed on
your plant, and I can fix it as soon as you tell me whether a returning clip should **resume**
or **restart**.

### Check D — does a plain template show it?

Take a **single-plate template with no multi-frame group at all**. If media is normal there and
2× on a LOOKS template, that contradicts my §2 measurements and I want to know immediately.

## 7. What I could NOT reproduce — said, not swallowed

**The 2× itself.** In-process, on every path, with an injected clock: one loop, exactly 1×,
constant. I could not make it happen, and I did not want to "fix" it by halving a rate, which
would have hidden whatever is really going on. The video path specifically cannot be measured
in-process at all — happy-dom has no real decoder, so a `<video>`'s true rate on the plant is
outside what any test here can reach. That is the honest gap, and Check A/B is what closes it.

## 8. Out of scope — named, untouched

`tasks.md` 2.8 · phase 4 (the operator surface) · BC's two deferred findings (unchecked
rollback `CLEAR`s, `#activeLooks` not persisted) · the AW banner · P2.DEL.

## 9. Gate

`pnpm gate` green **uncached** — `0 cached, 89 total`, 89 successful. Chain rebuilt:
`shared-schema` → `template-runtime` → `single-file-export` (bundle regenerated **and searched**
for the fix) → `designer`.
