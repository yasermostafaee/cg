# Session AL — 1.5c UNIT A: the punch mask, built in ONE place

**Read at `4712de2f42f976e272c547c2010cba04ff2c4743`, pulled 2026-08-15** (`git pull --ff-only`
before a file was opened; `HEAD == origin/dev`, tree clean).

🔴 **SCOPE CUT, agreed with the owner mid-session: UNIT A only.** UNITs B, C and D — the punch wired
into the product, the export assertion, and 1.5f/1.5h — are **not started**. I was low on context
and the brief's own rule applies: _do not start one you cannot finish_. A half-changed render path
would have been worse than none.

**No product behaviour changed**, so **no `gate:e2e` is owed for this commit**. The brief's "a Linux
`gate:e2e` IS owed" holds for UNIT B when it lands; it does not apply to what shipped here.

---

## What landed

### The mask has ONE spelling — `liveSourceMask` in `@cg/shared-schema/src/scene.ts`

Beside `positionQuery` and `resolveDefaultPosition`, for the reason those already live there: it is
the only package every side depends on, and this repo has already paid for two spellings of one
geometry in this exact code path.

Takes the holes and the scene size, returns `{ image, size, repeat, mode }` or **`null` when there
are no holes** — an element nothing punches carries no mask property at all, so nothing has to
reason about whether a full-white mask is equivalent to absence.

🔴 **`mode: 'luminance'` is returned as part of the value, never separately.** The mask says "white
keeps, black punches", which is luminance semantics, while CSS `mask-image` defaults to
`mask-mode: alpha` where `#fff` and `#000` are _both_ fully opaque. Under the default this mask
applies perfectly and punches nothing — the no-op that shipped in the probe, read as "mechanism B
fails", and briefly promoted `§9b` to the live architecture.

### The probe and the product cannot drift

`packages/shared-schema/tests/live-source-mask.test.ts` extracts the **real `maskUri()` and plate
table out of the shipping `punch-probe.html`**, runs them, and requires the result to be
**byte-identical** to the shared builder's for the same rects.

The probe is a static, no-build, self-contained file — its own test forbids `<script src>` and
`fetch` — so it genuinely **cannot import the builder at runtime**. That is the brief's "if sharing
is impossible, say why" case, and equivalence-by-test is the only other way to enforce it. The new
test also guards the **shipping builder's** luminance mode, which is what the brief asked for; AK's
probe-side guard is kept and now says so in its own comment, because it guards the artifact the
owner physically carries to the plant.

### 1.5d's seam is built and not exposed

`MaskHole.cornerRadius`, read with an explicit `> 0` test — **zero is falsy** — and asserted both
ways: radius `0` renders byte-identically to no radius, and a non-zero radius emits `rx`/`ry`. No
control anywhere in the UI. A rounded frame with a square hole disagrees at the corners, so carrying
the parameter now makes 1.5d a value change rather than a redesign.

### §9a-Z — which element carries the holes, settled by the owner

The brief said "the backdrop the client authored is masked". **The scene model has no backdrop
concept**, so I put it to the owner, who rejected both options I offered and gave a better one,
recorded verbatim in `design.md` §9a-Z:

> **Mask by Z-ORDER, not by a declared role.** Each element is masked with the union of the rects of
> the plates above it in the scene's existing element order. Elements above all plates are not
> masked. **Only plates that actually have a live source punch** — an unassigned plate punches
> nothing, which composes with 6.7's named refusal instead of putting black on air.

It needs no new schema concept and no Designer control (_"a declared-backdrop flag that someone
forgets to set is a silent black plate on air"_), and it fixes a real bug in the naive
mask-everything-below reading: **a caption authored above a guest box survives**, because it is
above the plate in z-order. Name supers over a live guest are ordinary broadcast.

⚠ Two things recorded for the build, deliberately unanswered: whether the stage's own background
(if that is a stage property rather than an element) falls inside the rule, and whether N per-element
masks cost anything measurable against one.

---

## What UNIT B now has to do — the enumeration is NOT done

The brief asked for the mutator enumeration ("take, teardown, a position override, a resize, a
source swap, a plate declared but unassigned — say which ones you found had no mask update").
**I did not run it**, and I am not going to assert a list I have not checked against the code —
phase 6 hit this three times running and a guessed enumeration is worse than none.

Still owed, in full: UNIT B (the punch in `buildLiveSource` + the z-order masking + the mutator
sweep + the sourceless plate), UNIT C (assert the punch in the **exported** artifact, not the
preview — `cgCss`'s `*{box-sizing:border-box}` has invalidated a premise in this project before),
UNIT D (1.5f and 1.5h — B erasing nothing may discharge more of 1.5f than it looks), and the Linux
`gate:e2e` that UNIT B will owe.

**Also still owed from AK**, unchanged: route:// delivery, CLIP intersection, DEFER/COMMIT scope,
PLAY substitution, precision kept, frame latency — and R-048's 6.9a tick with them.

---

## §9b's promotion

Already demoted in AK (`design.md` §9b.5 carries the withdrawal, and §9a-R the measurement that
caused it). I re-checked and found nothing left promoting it; this session added no new claim in
either direction.

## Gate

`pnpm gate` green, uncached (`85 successful / 85 total`, `0 cached`);
`pnpm openspec validate live-source-multibox --strict` valid.
**No `gate:e2e` owed** — no render path changed. One lint error of my own (`no-regex-spaces`) was
caught by the gate and fixed rather than suppressed.
