# Session AU — Stage C1: the arrangement carrier and UNIT B′ (schema + runtime, no Designer UI)

**Read at `f0ebeff178cdda2ddaf2bbf83e955a7fbd8f3163`, pulled 2026-08-19** (`git pull --ff-only` →
"Already up to date"; `HEAD == origin/dev`).

⚠ **It did NOT match the expected tip `c0cb9c4c`.** The delta is exactly one commit — `f0ebeff1`,
session AT's own docs-only commit recording the Linux `gate:e2e` discharge for stage B (`tasks.md` +
that session's handoff, no code). Nothing in this session's scope was affected. `session-au` was
free, so this is `session-au`.

⚠ **The owner's uncommitted `tools/caspar-bridge/src/template-http-server.ts` was not touched, not
staged and not committed.** Every commit staged explicit file paths and `git diff --cached --stat`
was read before each.

**Gate: green and uncached — `89 successful, 89 total` / `0 cached, 89 total`.**
**Classifier: `{kind: 'code', needsE2e: true}` — a Linux `gate:e2e` is OWED and undischarged.**

---

## 0. `B-145` went back to `[~]` — it was ticked with half of acceptance 1 unmet

Acceptance 1 reads _"those layers **appear in the layer list** and are controllable"_. Session AT
proved the control half and traced the display half to a gap; the item was ticked anyway.

**No new number was minted.** The blocking relation to `R-057` is already recorded on `B-145`, and
splitting one acceptance list across two items is the churn `docs/prd/b-number-registry.md` exists to
avoid. The remaining half stays tracked as `tasks.md` 2.8.

⏱ **2.8 is now dated: due before STAGE E, and not before that.** Stage E is where the band's state
becomes something the operator is EXPECTED to read, so an invisible seated layer stops being a
diagnostic gap there and becomes a lie on the surface they act from. Stages C and D touch neither the
list nor the band's visibility. **2.8 was not implemented here** — it is IPC and UI, the opposite of
this session's shape.

---

## 1. What C1 is, and where the split falls

**C1 = everything in stage C that is schema or runtime.** C2 is the Designer's authoring surface
(5.3, 5.6, and the CONTROLS for 5.4 and 5.5).

🔴 **The split runs THROUGH 5.4 and 5.5, not around them.** Their FIELDS had to land here because
4.1 cannot read a `hideDuringTransition` flag that does not exist; their CONTROLS belong to C2
because a UI built on a schema that is still moving is a UI built twice.

**Order executed:** 5.1 → 4.1 → 5.2 → 4.2 → 4.3 → 4.5 + 4.6 → 4.4.

---

## 2. The three decisions worth carrying forward

### 🔴 A `cut` is refused by the TYPE and NORMALISED by the parser — deliberately not a parse error

The transition is a **discriminated union**, so §13.5's and §12.2's measured rules are
**unrepresentable to violate** rather than detectable afterwards. But `{mode:'cut', durationMs:400}`
**parses**, with the duration stripped. That was found by a red test and the SCHEMA COMMENT was
corrected, not the behaviour: an author switching move→cut can leave a stale duration in the file,
and refusing the whole template over a field nothing reads would take a working graphic off air to
correct nothing. What matters is that it cannot REACH the runtime, and it cannot.

⚠ **`easing` is REQUIRED on every arm that has one.** That is §12.2's omitted-timing-function guard
expressed structurally — the CSS default `ease` measured **580–835 px** from every CasparCG tween.

### 🔴 Resolved visibility is a PRECEDENCE, not a boolean AND

The obvious implementation is a conjunction and it is wrong. The three inputs are statements at
different scopes and the more specific one must WIN:

1. **the transition veto is absolute** — temporal, says nothing about belonging on screen;
2. **the arrangement's opinion beats the authored value, in BOTH directions** — this is what makes a
   per-arrangement background authorable at all, instead of costing the author one hide in every
   other arrangement whose first miss puts two backdrops on air;
3. **otherwise the authored `visible` stands** — so the function is a no-op for every template that
   predates the feature.

`undefined` is **not** `false`: an arrangement with no opinion does not get a vote.

### 🔴 The carrier ships CELLS + a box fraction, NOT "one rect per arrangement per plate"

5.2's literal wording names a shape that **is not derivable at import**, and it looks derivable,
which is why the reason is written at the mechanism as well as here. Cell order is **the order LIT
sources are seated into cells** — with four boxes declared and sources 1 and 3 lit, the count is 2
and those two take cells 0 and 1 — so which plate lands in which cell depends on the **operator's
toggles**. A per-plate rect would freeze one guess about which sources will be lit and be silently
wrong for every other combination.

What IS import-time knowable is split in two, and the two compose to exactly the missing rect:

- **the arrangement's CELLS** — where each box instance sits;
- **`LiveSourceDeclaration.boxRelativeRect`** — where the plate's hole sits inside its own box, as
  fractions. Arrangement-independent **by construction**, because that is what authoring a box as a
  nested composition MEANS.

The bridge multiplies them at reconcile time (6.4). **No `.vcg` format change.**

---

## 3. AO's two inherited questions — answered in the mechanism

- **Q1 — an invisible ANCESTOR now suppresses the punch.** It did not before: the filter tested
  `visible` on the PLATE alone, so a plate on a hidden LAYER, in a hidden container, or inside a
  hidden box punched regardless. `FlatElement.ancestry` now carries the layer plus every container
  and composition instance, each resolved through the same one function. AO left it alone because the
  page and the bridge still AGREED; an arrangement that hides a whole BOX is exactly where they stop.
- **Q2 — a hidden plate IS still declared**, and it is a decision now rather than the coincidence
  §12.9.7 recorded. Written at `collectLiveSources`: **visibility governs the PUNCH, never the
  DECLARATION.** A declaration is the plate SET that `(templateId, plateId)` is keyed to, so making
  it depend on visibility would lose the operator's assignment on the next switch — the exact thing
  A′ was chosen to prevent — and would make §12.4's HELD state unreachable, since an undeclared plate
  cannot be held, only torn down.

---

## 4. The matrix (4.4) — eleven rows, sixteen tests

`packages/template-runtime/tests/unit-b-prime-mutators.test.ts`. **All eleven rows were testable at
this layer**, but two are not testable where the naive reading expects:

⚠ **Rows 3 (position override) and 4 (resize) are answered on the OUTPUT side, via `liveSourceFit`,
and that is the row's FINDING rather than a shortcut.** A position override moves the whole GRAPHIC
on the output frame and changes nothing INSIDE the page — so the page's mask must **not** follow (a
mask that "followed" would double-count the move) and the bridge's FILL/CLIP must. Both halves are
asserted in the same test.

⭐ **The file opens with a POSITIVE CONTROL and the ordering is not decoration.** Six tests assert a
hole is ABSENT or has MOVED, and a mask that never applied would satisfy every one of them. Skipping
exactly this control is what let a no-op mask read as "mechanism B fails" at the plant.

**One expectation was wrong and the CODE was right:** a hidden backdrop still receives its mask,
because `sceneMaskHoles` filters visibility on the PLATE and never on the element being masked. That
is the SAFE direction — it means the incoming backdrop of a crossfade arrives already punched instead
of having a one-frame window where it is visible and unmasked — so the test now pins that property,
with a negative control beside it.

---

## 5. What to check

**Nothing.** No UI, no Designer control, no layer-list change, no rendering difference for any
template that has no arrangements. Verify by the eleven-row matrix and the `sequence` refusal test.

**The first visually checkable thing in this whole feature is C2's Designer authoring surface**,
which is the next session.

---

## 6. Flags

- 🔴 **A Linux `gate:e2e` is OWED and undischarged.** `{kind: 'code', needsE2e: true}`, and rightly:
  `@cg/template-runtime` IS the render engine and both `scene-builder.ts` and `runtime.ts` changed.
  Discharge it with a COMPLETED, GREEN `e2e` job on this commit and write the run URL into
  `tasks.md`.
- ⚠ **Two `apps/` edits, against the session's packages-only instruction, both minimal and both
  unavoidable.** Said out loud rather than buried:
  1. `templateDelivery.ts` — the unpacked scene is in hand at exactly one point in the product, and
     leaving the carrier unwired would have shipped a written-but-unreachable mechanism, which is the
     `autoSqueeze` / `B-147` class this repo has just finished paying for twice. The LOGIC moved into
     `packages/` as `buildTemplateLiveSources`, so the app edit is one line.
  2. `live-source-preflight.ts` — the export preflight is the gate 4.6's refusal has to reach. The
     DETECTION lives in `packages/` beside the non-descent that causes it.
  3. (`apps/runtime/tests/template-delivery.test.ts` — a ripple, not a choice: that fixture's plate
     really is inside a root-level composition instance, so it correctly gained `boxRelativeRect`.)
- ⚠ **`liveArrangementView` reads the ROOT scope only**, and that is a stated limit rather than an
  oversight: `currentVisible` and `geometry` are keyed by ELEMENT ID, and the same authored element
  inside a composition instanced twice has two DOM copies that can legitimately differ. Root-level is
  where every plate and box instance sits under A′; a per-instance override needs a per-instance key,
  which is a carrier change.
- ⚠ **`scale` and `rotation` transform bindings are deliberately not read** into the view. The
  binding layer's own comment says it OVERRIDES the baseline transform rather than composing with it
  (`bindings.ts`, "M3.2-β will multiply"), and a mask derived from a half-applied transform would be
  worse than one derived from none.
- **No anchor drifted.** `bindings.ts:40` (the transform enum, no `width`/`height`),
  `scene-flatten.ts:354` (the authored-`visible` filter) and `scene-flatten.ts:264,274` (container
  and composition descent, no `sequence` branch) all read exactly as the tasks describe.
