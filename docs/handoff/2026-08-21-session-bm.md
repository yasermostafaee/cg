# Session BM — per-look input assignment: the seat becomes the INPUT

> **Safe to pull.** Everything below is on `dev` at **`2715fd07`**; the tree is clean and
> `pnpm gate` is green uncached (`0 cached, 89 total`).
>
> **Handoff letter/date:** `BM`, 2026-08-21.

## 0. State

| Fact                    | Value                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tip read at start       | `81a8d218` — exactly the expected tip, containing BL's work; no delta                                                                                                                                                                                                                                                 |
| **Pushed (fix)**        | **`84a19d1f`** — `B-154`, pushed promptly because it fixes shipped on-air behaviour                                                                                                                                                                                                                                   |
| **Pushed (Stage 1)**    | **`2715fd07`** — `git ls-remote origin dev` = local, tree clean                                                                                                                                                                                                                                                       |
| **Linux `gate:e2e`**    | ✅ **DISCHARGED for both** — `84a19d1f`: [run 32472531598](https://github.com/yasermostafaee/cg/actions/runs/32472531598); `2715fd07`: [run 32478994421](https://github.com/yasermostafaee/cg/actions/runs/32478994421). Both `success` with **`E2E (Playwright)` RUN**, not skipped. A third commit follows — see §8 |
| Filed                   | `B-154` (a held plate kept rendering); `tasks.md` 7.11 landed, 7.12 / 7.13 deferred with what they need                                                                                                                                                                                                               |
| **Stage 2 (Inspector)** | 🔴 **DEFERRED** under the prompt's own §4.3 stop rule — see §6                                                                                                                                                                                                                                                        |

## 1. 🔴 (B′) HELD — with four corrections, and one of them matters

The prompt asked for (B′) to be verified against the code **before** any of it was built. It
holds, and the two load-bearing claims are confirmed verbatim:

- **The authored `routeKey` names a HOLE, never a producer.** `live-plate-assignment.ts`:
  _"the SCENE's vocabulary for a hole in this template (`guest-1`), never a device and never a
  catalog id"_. `looks.ts`: _"the symbolic id a plate's `routeKey` references. Never a device
  string."_
- **The three-level resolution is real** and is stated where the prompt said it was.

**The four corrections:**

1. 🔴 **"The invariant in `looks.ts` survives verbatim" is WRONG.** _"the same source referenced
   in two looks is ONE declaration and ONE seat"_ is a **conjunction over a 1:1** that (B′)
   breaks in **both** directions: one declaration bound differently in two looks is TWO seats,
   and two declarations bound alike are ONE. Only the final clause — _never N producers on one
   route_ — survives. It had to be **reworded**, not merely re-derived, in all three places
   (including the author-facing preflight message).
2. **The table's "(A) = `|plates|`" row is wrong about the shipped code.** Today's seated set was
   never `|plates|`: `#planLiveSeating` fitted only the ACTIVE look's members and §12.4 HELD the
   rest, so it was already a **lazy union** that grew as looks were visited. (B′) makes that
   union **eager and deduped on the input** — a better characterisation than "no growth at all",
   which is true for the owner's template but for a different reason than the table gives.
3. **`allocateLiveLayers`'s `preferred` note had ALREADY drifted before this session.** It said
   _"one entry per plate, in declaration order"_; the caller passed one entry per **fitted**
   plate. §2.6 corrected a note that was stale, not one this session moved.
4. **`#sourceOverrides` IS persisted per row** (`swapLiveSource`'s own doc item 3, and the
   publish/restore pair). §2.1's "this run only" is true about not writing back to the TEMPLATE
   assignment and false as "ephemeral" — so the per-look map is a persisted, additive shape too.

### 1a. And one thing the prompt did not anticipate — §2.1's reshape would have broken `R-048`

§2.1 said to **re-key** the row override to `(look, plate)`. That was not built, and the reason
is `R-048`'s own: the emergency exists because **an input is DEAD**, and a dead input is dead in
every look. A per-look emergency would put the dead feed straight back on the next switch and the
operator would re-patch, live, once per look. So there are **four** levels, not three, and the
emergency moved to the OUTSIDE: catalog → template assignment → per-look composition → per-plate
emergency.

## 2. 🔴 `B-154` — a prerequisite that turned out to be a shipped on-air defect

§2.3 claimed the preset _"needs no new state — assert it rather than adding a parallel concept"_.
It needed one, and finding out why exposed a live bug.

**Six-box on air → switch to solo → the five HELD feeds appear inside the solo box.** §12.4's hold
muted the plate and stopped there, so its producer kept the `MIXER FILL`/`CLIP` of the look it
left and went on rendering into that cell — and a page's punched hole is transparent to the
**whole band**, not to one layer.

🔴 **The premise that was wrong is a sentence**, and it is why three suites missed it:
`live-plate-release.ts` said a held plate stops being visible _"because the page stops punching its
hole"_ — true about the plate's own cell, false about the frame. Because it was believed, the
phase-3 tests asserted the three axes it implies (layer, producer, volume) and **nobody asked what
a held plate RENDERS**. One regression test even pinned the defect in place.

⚠ **The predicate that catches it already existed and had never been called.** `@cg/amcp-mock`'s
`layerRenderedRect()` returns `null` exactly when a layer renders nothing, and its own doc says
_"a test asserting only on `layerState().fill` cannot catch it"_. Every look test asserted on
`clip`.

Fixed by PARKING a held seat's fill off the raster and recording what was sent. **The FILL is the
half that moves** because an off-raster box renders nothing on `FILL` alone, so a refused `CLIP`
after an acked `FILL` is safe by construction — and no in-raster rectangle is disjoint from a
full-frame fill at all.

## 3. What Stage 1 landed

**A seat is one producer per DISTINCT RESOLVED INPUT, per item**, deduped on the WIRE ARGUMENT
(`live-look-bindings.ts`). The owner's real template needs **three** producers, not six — proven
as an executable assertion, not an argument.

- **The writer** is `swapLiveSource` with an optional `lookId`: absent = the emergency (every
  look), present = the deliberate per-look composition. One verb, two scopes.
- **The preset is real.** The seat set is the union across looks, so an input bound only to an
  unshown look is seated, muted and parked — and entering that look is a `MIXER FILL` with no
  `PLAY`.
- **§6.2** (`live-source-duplicate`) and **§2.7** (`live-source-no-layer`) refuse at the
  assignment door, from a prospective plan that mutates nothing.
- **§2.9**: the take refuses only on the look being ENTERED. Its old reason was removed by 7.9.

### 3a. 🔴 Three things had to be repaired at the cause

1. **`B-126`'s window re-opened from a direction the plate-keyed code could not have.** Under
   producer identity a substitution is a seat with **no history**, so the failure path read
   "nothing of ours was on this slot" and `CLEAR`ed the operator's working picture on a repair
   that had merely been refused. The destructive step now asks about the **SLOT** — which is what
   its own comment always said it meant. Caught by a shipped test, not by review.
2. **A preset must never fail the action it was not about.** Eager seating means a take now sends
   `PLAY` for inputs no look on screen needs, so a dead input in an unshown look could refuse the
   whole take. A parked seat that will not seat is cleared and dropped, and the action continues.
3. **A plate can now label TWO ledger records** (one punched, one parked). Every by-plate lookup
   prefers the punched one; the volume update keys by slot.

### 3b. 🔴 What the session's OWN adversarial review then found

Two defects in the work above, both fixed before the follow-up push:

1. **I implemented the four-level precedence TWICE** — once in `resolveLookBindings`, once in
   the runtime's refusal path — having written a comment claiming it was decided in one place.
   They agreed, which is exactly how this defect survives: one of them gets "simplified" later
   and the two disagree about a plate that is on air. Collapsed into
   `effectiveOverridesForLook`, which both now call.
2. 🔴 **`StackRetentionStore.toRetained` silently DROPPED the new map.** It is a hand-written
   copy list, so every open-axis field must be added by hand — and **nothing asserted the list
   was complete.** Five fields ride on it (`position`, `sourceOverride`, `plateVolumes`,
   `activeLookId`, and this one) and **none of them had a test**. That is the `B-107` / `B-109`
   class at its SOURCE, still open, and it caught this session's own field.

   Closed with an anti-drift test that asserts the RULE, not five values: the carried key set
   is DERIVED from the two zod schemas, so a sixth field fails on the day it is added.
   Mutation-checked — removing the line reddens it, naming the dropped field.

   ⚠ **This one is the easiest of the five to lose**, because its loss is invisible until
   somebody SWITCHES: the look on air keeps working and the composed look silently reverts.

## 4. What the tests could NOT prove

- **Nothing about the plant.** The mock models `PLAY`-on-occupied as a replace, so these tests
  prove self-consistency and nothing about a 2.3.2 server.
- 🔴 **The parked geometry is a DERIVED application of a measured fact, not itself measured.**
  That a fill moved out from under its clip renders nothing IS measured (§3's last row). That
  `MIXER FILL` accepts an origin outside `0..1` — an ordinary transform, the basis of every
  animate-in — is **not separately measured on this plant**. Filed for the hardware session.
- **No pixels.** Everything is asserted on the AMCP wire and the mock's layer state.
- **Whether one physical input can be opened twice** is still session BN's §2.2, and §6.2's
  refusal is what stands in for the answer.

## 5. What the owner can check — the six-step walk

1. On 2-box, change `l-2` to studio-3 **and** edit a text → UPDATE → **NOT YET** (Stage 2; the
   binding half works from CG Control's swap dialog, the atomic text+binding UPDATE does not).
2. Still on 2-box, set what the SOLO will show → **nothing visible changes** ✅
3. Switch to solo → **shows the preset, with no re-seat** ✅
4. On solo, change its input → it changes; free (a `MIXER FILL`) if another look already holds it ✅
5. Switch back to 2-box → **exactly as you left it** ✅
6. Point two frames of the SAME look at one input → **refused before air**, naming both ✅

🔴 **Step 1 is the one to read carefully.** Its binding half is landed and tested; its _atomic
with the texts, on one UPDATE_ half is Stage 2 and is NOT built.

## 6. 🔴 Stage 2 is DEFERRED — deliberately, under the prompt's §4.3

The prompt: _"a half-migrated identity model on `dev` overnight is the worst available outcome …
Saying 'Stage 1 only, here is what Stage 2 needs' is a good session."_ Stage 1 is whole and green;
Stage 2 is the Inspector surface and the atomic UPDATE, written up in **`tasks.md` 7.12** with the
five pieces it needs.

🔴 **The trap 7.12 records, because it is not obvious:** the bridge's binding writer is per-call
(one `swapLiveSource` per frame), so a panel that loops over staged edits would apply them one at
a time and could land HALF of them. Stage 2 needs a batched channel or an explicit decision that
partial application is acceptable — **and on air it is not.**

**`tasks.md` 7.13** answers §7.1 as a fact: deferring the "title follows the input" feature costs
**no re-authoring** — `BindingTargetSchema` is a discriminated union, so a new arm is additive,
and `live-source-id` is the precedent for a target that resolves outside the DOM. ⚠ But per-look
binding is a **new way to make a hand-typed title wrong**, and nothing in 7.11 makes that
observable. That is a real, un-mitigated hazard until 7.13 lands.

## 7. Out of scope — named untouched

AW's banner · BC's two deferred findings · `B-151`/`B-152`/`B-153` · `tasks.md` 7.10 · P2.DEL ·
Session E · the unexplained 2× playback · confidence monitoring (BN) · cross-item input sharing.
`template-http-server.ts` not touched; no scratch files committed; every commit staged by explicit
path.

## 8. Verification

- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; 89/89 tasks, openspec 58/58).
- The SUITE, not just new specs: `@cg/caspar-bridge` 77 files / 579 tests, `@cg/runtime` 92 / 856,
  `@cg/shared-ipc` 12 / 149, `@cg/shared-schema` 24 / 483.
- **`gate:e2e`** — discharged on both pushed commits, each by a COMPLETED run whose
  `E2E (Playwright)` job actually RAN:
  - `84a19d1f` → [run 32472531598](https://github.com/yasermostafaee/cg/actions/runs/32472531598)
  - `2715fd07` → [run 32478994421](https://github.com/yasermostafaee/cg/actions/runs/32478994421)

  🔴 **The review-fix commit that carries this handoff is a THIRD push and needs its own run.**
  Its URL is not in this file, because the run did not exist when the file was written — read it
  on `dev` before calling the session verified. It touches `StackRetentionStore.ts`, so it is a
  code diff and CI will classify it as owing the suite.

## 9. If you touch this next

The thing to hold on to: **plate ↔ layer is still 1:1 WITHIN a look, and that is not luck — it is
what §6.2's refusal buys.** `swapLiveSource`, `setLivePlateVolume` and the operator's layer table
all lean on it. If anyone ever relaxes that refusal, those three break quietly, in that order.
