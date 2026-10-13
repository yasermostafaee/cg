# Session AK — the hand-run plant probes, re-measured

**Read at `ee9ae108d823f20ea8c6b8baa2dc69d85172e44d`, pulled 2026-08-15** (`git pull --ff-only`
first, before a file was opened; `HEAD == origin/dev`, tree clean). Work landed on `dev` in two
commits on top of it.

**Build every hardware answer below was taken on: `2.5.0 69e8ad5 Stable`, CEF Chromium 142.**
Asserted by a validity gate before every reading, not assumed — the harness refuses to measure
anything that does not report `2.5.0`, so the retired 2.3.2 install at `D:\programs\CasparCG` cannot
be mistaken for production.

---

## 🔴 THE HEADLINE: the owner's reading for mechanism B is CONTRADICTED. B WORKS.

**And the reason is that the probe's own mask was a no-op**, so B was never actually tested.

`punch-probe.html`'s `maskUri()` builds mechanism B's mask as an SVG whose own comment reads
_"white keeps, black punches"_ — a white full-frame rect with **black** rects at the plates. That is
**LUMINANCE** masking. CSS `mask-image` masks by **ALPHA** by default, and `#fff` and `#000` are
_both_ fully opaque. **The mask applied perfectly and punched nothing.**

A no-op mask and a mask that never applied have the _same_ signature — "no visible effect at all" —
which is exactly the ambiguity the result form flagged and could not resolve.

Measured in-page (red sheet masked over green sheet, so CasparCG's compositor cannot confound it):

| mode                                       | left plate | right plate | outside   |
| ------------------------------------------ | ---------- | ----------- | --------- |
| the probe's exact SVG, default mask-mode   | `#d00000`  | `#d00000`   | `#d00000` |
| the SAME SVG + `mask-mode: luminance`      | `#00c000`  | `#00c000`   | `#d00000` |
| holes as `fill-opacity="0"`, alpha masking | `#d00000`  | `#d00000`   | `#d00000` |

Row 1 reproduces the null result exactly. Row 2 punches both plates. (Row 3 fails correctly: the SVG
composites internally, so a transparent rect over an opaque white one is still opaque — the fix is
the mask **mode**, not the hole's colour.)

**And the punch reaches ROOT ALPHA** — the property mechanism A could not deliver. Transparent page,
masked backdrop, flat colour producer on a lower CasparCG layer:

| sample         | measured  | meaning                                          |
| -------------- | --------- | ------------------------------------------------ |
| left plate     | `#00ffff` | **the lower CasparCG layer, composited through** |
| right plate    | `#00ffff` | same                                             |
| outside plates | `#d00000` | the backdrop, intact                             |

### What it changes

- **"Neither mechanism passes" is WITHDRAWN.** A fails (decisively, for the scope reason §9a
  predicted). **B passes criterion 1**, and passes criterion 2 by construction — it never erases the
  plate's own paint.
- **The punch IS a CSS problem and it is solved.** `design.md` **§9b is NOT forced**; §9b.5's
  promotion to "live option" is **withdrawn** and it reverts to a gated fallback.
- **1.5c is unblocked with its mechanism chosen by measurement**; **1.5h is alive again**; 1.5d's
  blocker reverts to 1.5c.
- `punch-probe.html` is **fixed**, and a test now pins the luminance/mask-mode pairing.

🔴 **The near-miss is the lesson, and it is worth more than the fix.** For a few hours the design had
adopted a whole second-channel architecture — with its two-artifact coupling, its export-format
consequence, and its "a single-channel plant has no answer at all" gap — on the strength of a null
reading that was a bug in the measuring instrument. **A null result is the one kind of result that
looks identical whether the mechanism failed or the probe did.** §9b.5's trigger was phrased as a
NEGATIVE observation ("IF the measurement shows that…"), which is what made it so easy to fire.
**When a fallback's trigger is a negative observation, that observation needs a positive control
before it counts.**

---

## Per item: CONFIRMED / CONTRADICTED / CANNOT MEASURE

| #      | item                                                        | verdict             | the assertion that carries it                                                                                                                                               |
| ------ | ----------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⑦      | 1.5b — mechanism **A**                                      | **CONFIRMED**       | A's failure stands; not re-measured directly, and the in-page evidence is consistent with the owner's diagnosis (erase happens, result is opaque, never reaches root alpha) |
| ⑦      | 1.5b — mechanism **B**                                      | 🔴 **CONTRADICTED** | `#00c000` in both plates with `mask-mode: luminance` vs `#d00000` without; `#00ffff` (lower layer) through the holes over a transparent page                                |
| ⑦      | 1.5b — "the mask never applied" ambiguity                   | **RESOLVED**        | The mask _applied_; it was a no-op. Both halves of the fork are now distinguished by measurement                                                                            |
| —      | html producer can deliver alpha CasparCG composites through | **CONFIRMED**       | the mode-4 capture is itself the proof: lower layer visible through the holes                                                                                               |
| ⑤③②①④⑥ | UNITs C, D, E                                               | **NOT RUN**         | see below — stated plainly rather than left to look like an omission                                                                                                        |

---

## What I did NOT get to, and why

**UNITs C, D and E were not run.** The mechanism-B fork consumed the session: it was the item the
brief called "the one ambiguity that matters most", it turned out to be a contradiction rather than
a confirmation, and chasing it properly meant building the harness, writing two diagnostic pages,
recovering from a voided reading, and then reversing the design conclusions I had committed earlier
in the day across five files.

So these remain on the owner's hand-run readings only, unchanged and un-re-measured:

- **⑤ 6.8a** `route://` delivery · **③ 6.3a(a)** `CLIP` as pure intersection · **② §3b**
  `DEFER`/`COMMIT` scope · **① 6.9a** `PLAY` substitution + surviving `MIXER FILL` · **④ 6.3a(b)**
  precision kept · **⑥ 6.8b** route latency in frames.

**The harness they need now exists and is re-runnable**, which was the expensive part. ⑥'s
frame-counter template is not built.

⚠ **Two consequences the brief asked for that are therefore still owed:** R-048's 6.9a tick, and the
`DEFER`/`COMMIT` measured-refusal write-up in 6.1. I have not written either, because writing them
from the hand-run readings would be recording an unverified prior as a measured result — which is
the exact failure this session exists to correct.

---

## UNIT A — the harness

`tools/caspar-amcp-probe/bin/live-probe-lib.mjs`, in the existing probe package rather than a new
one (`tools/spikes/amcp-poke` and `tools/caspar-amcp-probe` both already existed; adding a third
would have been the second-spelling defect).

- **One command at a time, enforced.** `busy` _throws_ rather than queueing, so a caller that
  interleaves is corrected instead of silently serialised. This is the defect that plagued the
  owner's session — a console that concatenated two commands and answered `#400`, twice scored
  before anyone noticed. Any non-`2xx` is a hard failure, not a warning.
- **`PRINT` read back and sampled.** Verified on this build: `PRINT 1` → `202 PRINT OK`, writing
  `<install>\media\<YYYYMMDDTHHMMSS>.png`. ⚠ **The filename has 1-second resolution**, so the new
  file is found by diffing the directory, never by computing the name; and its size is waited out,
  because the file appears before it is written.
- **PNG decoded with `zlib` + a defilter loop**, no dependency — this runs at a plant, where
  `node_modules` is the least available thing in the building. Deliberately narrow: 8-bit,
  non-interlaced; anything else throws with the value it found rather than guessing.
- **Median patches at normalised coordinates**, not single pixels — a pixel is hostage to ringing
  and one antialiased edge. Median rather than mean, so a bright frame clipped into the patch cannot
  report a grey that exists nowhere.
- **Validity gates that VOID.** They earned their place immediately: the first root-alpha attempt
  used a still PNG that turned out black at the plate position, and the gate voided it instead of
  letting a black plate read as a failed punch.

---

## UNIT F — the defects

1. **The punch kit's AMCP examples did not run** (verb before channel-layer; every one `#400`).
   Fixed, moved into its own titled section so it is read _before_ the recipe, and **pinned by a
   test** asserting the "Running it" recipe carries no verb-first form — scoped to the recipe
   deliberately, since the owner's verbatim result form legitimately quotes the broken ones and a
   whole-file scan would push the next author to edit the evidence.
   **The product was never wrong**: `command-builder.ts` emits `CG <target> ADD …`, hardware-
   validated under ADR 0006.
   ⚠ **Other `tools/` docs with AMCP snippets — audited, and this is a partial answer.**
   `tools/spikes/amcp-poke/README.md` and `tools/caspar-amcp-probe/README.md` were the candidates;
   the punch kit was the only one carrying verb-first `CG` forms. I did **not** execute the other
   docs' snippets, so "no other doc is broken" is _not_ claimed — only that none repeats this
   specific error.
2. **2.3.2 corrected to 2.5.0** in the kit README, `tasks.md` 1.5b, `design.md` §9a, and C-015,
   with the owner's retirement decision recorded and the "never probe `D:\programs\CasparCG`" rule
   written beside it.
3. **Answers written where their questions live** — 1.5b, 1.5c, 1.5d, 1.5h, §9a (new **§9a-R**),
   §9a.1, §9b.5, and C-015.

---

## UNIT G — the CEF baseline sweep (recon only; **no build configuration was changed**)

**One authoritative spelling, and it is already a constant:** `CEF_CHROMIUM_BASELINE = 71` in
`packages/eslint-config/src/rules/cef-compat.ts`, imported by every real consumer (the eslint
config, `single-file-export`'s CEF test, the punch-probe test, `video-convert/check-cef.mjs`). **So
the follow-up is close to a one-line change** — that is the good answer the brief hoped for.

**But the number is also RESTATED in prose in at least six places**, and prose is what a reader
believes: `eslint-config/src/configs/broadcast.ts`, `configs/cef-compat.ts`,
`rules/cef-compat.ts`'s own doc, `template-runtime/src/scene-builder.ts` (×2),
`template-runtime/src/ticker-driver.ts` ("CasparCG 2.2/2.3 ship CEF 63/71"), and
`single-file-export/src/exporter-single-file.ts:413`, which bakes `71=2.3.x, 117=2.4.x` into the
**exported HTML** — the one copy that ships to the plant.

⭐ **The most useful finding of this unit: the baseline is NOT enforced by the build target.**
`tsconfig.base.json` is `ES2022` and both vite configs are `target: 'es2022'` — already far above
Chromium 71. What bridges the gap is the **lint rule over a curated banned-built-ins list**. So
raising the baseline is mostly the constant + that list, not a build-config change — which also
means today's `es2022` targets are not evidence that anything was ever verified on 71.

**Recommendation (owner's call, own session, own `gate:e2e`):** keep `CEF_CHROMIUM_BASELINE` as the
single home, have the prose sites _cite_ it rather than restate the number, and make the exporter's
embedded comment derive from it. Raising the value is a behaviour change that ships silently and
fails on air — which is precisely what `B-066` was.

---

## Gate

`pnpm gate` green (uncached, `85 successful / 85 total`, `0 cached`);
`pnpm openspec validate live-source-multibox --strict` valid.

**`gate:e2e` rule, measured rather than assumed:** I ran the classifier over the real changed set.
`apps/designer/tests/live-source-punch-probe.test.ts` is neither a `UI_RENDER_PATTERNS` match nor a
known non-render path, so it is **unrecognised**, and `classifyChangedSet` returns
`{kind: 'code', needsE2e: true}` — fail-safe by design. `affectsRender` is `false`. **So a Linux
`e2e` is classified as owed for this diff even though nothing in the apps' render path moved**, and
CI on `dev` is what discharges it. I have not ticked any E2E debt.

## NOT in this session

No product behaviour changed. No `§9b` implementation, no operator-surface work, no minted numbers,
no archive, no merge to `main`. No build configuration touched (UNIT G is enumeration only).
