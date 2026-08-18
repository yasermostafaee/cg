# Design — the multi-box layout switch

**Evidence gathered 2026-08-17 against `dev` @ `f6c7329`** (`git pull --ff-only` first;
`HEAD == origin/dev`). Every `file:line` is as the file reads on that commit.

**Hardware readings were taken against the plant at `192.168.21.50:5250`, build
`2.5.0 69e8ad5 Stable`, channel 1 `1080i5000`** — asserted by a validity gate before every reading,
never assumed. 🔴 The retired 2.3.2 install at `D:\programs\CasparCG` was never contacted.
Instrument, controls and raw numbers are in §9.

**A convention used throughout.** Wherever this document asserts something **does not exist**, the
assertion carries a `SEARCH:` line giving the command and result.

**Status: RECON + DESIGN. Still no product code.** §0 is settled, and **as of 2026-08-18 seven of the
eight owner gates are ANSWERED** — §12.1, §12.2, §12.4, §12.5, §12.6, §12.7 and §12.8 are recorded in
§12 as DECIDED with their reasoning, and the `⟨GATE: §x⟩` tasks that named them are unblocked in
`tasks.md`. **§12.9 — how per-layout geometry and per-layout DESIGN are authored — remains open** and
was WIDENED rather than settled. Two things here are **this design's own decisions with their
reasoning**, not owner gates: §0.5 (the plate identity model) and §2b (the v1 animation refusal).

⚠ **Anchor drift.** The `file:line` anchors above were read at `f6c7329`. Anything re-cited on
2026-08-18 was re-read at `fc663dc` and any drift is called out **at the citation** — the claim is
re-verified, not the line number trusted.

---

## 0. Already settled — do not relitigate

### 0.1 The client's requirement (owner, 2026-08-17)

> The operator is on a 3-box layout and must be able to switch to 2-box or 1-box, and back. There
> must be **a switch between the multi-box layouts, with exactly ONE active at a time, so the
> operator cannot make a mistake.**

### 0.2 ⭐ FAMILY 1 IS THE ARCHITECTURE (owner, 2026-08-17). The family question is CLOSED.

Asked whether the transition is a cut or animated, the owner answered:

> "Definitely — if it is optional and changeable, that is the best case."

**Family 1** — one template, the layouts as states of a single scene — **is the architecture.**
Family 2 (three templates in an exclusive group) is withdrawn.

- **A cut is a transition of duration zero.** Family 1 delivers both halves; Family 2 delivers only
  the cut and would then require Family 1 anyway — two implementations of one capability.
- **Exclusivity is structural in Family 1.** §8 shows the tree has NO mutual-exclusion primitive to
  build Family 2's rule out of, and that two multi-box templates on air together is reachable today.
- **Assignment survival is FREE in Family 1 and IMPOSSIBLE in Family 2** — an independent, code-level
  argument (§3).

**The fair counter-case, recorded with why it fails.** Family 2 _can_ produce a crude animated switch:
`CG STOP` on the outgoing template runs its outro while `CG PLAY` on the incoming one runs its intro.
It fails twice over: during the overlap **both templates are on air**, which is exactly the crosstalk
condition of §1; and **it cannot rearrange** — a box travelling from its 3-box position to its 2-box
position is not expressible across two independent pages.

### 0.3 Source assignment must survive the switch

Answered from the code in §3.

### 0.4 What is NOT decided here

No behaviour change ships. The crosstalk (§1) is recorded as measured evidence of a state the switch
makes unreachable, **not** as a bug to fix here.

### 0.5 ⭐ THE PLATE IDENTITY MODEL — this design's decision, with the evidence

> **A layout is a set of GEOMETRIES and VISIBILITIES over the SAME plate set.**
> 3-box declares `guest-1..3`; 2-box is `guest-1..2` at new rects with `guest-3` hidden; 1-box is
> `guest-1` at full frame.

**Not** three sets of plate elements, one per layout. That alternative is refused, and the reason is
not a preference:

1. 🔴 **`live-source-overlap` is a SHIPPED, EXPORT-BLOCKING preflight error.**
   `apps/designer/src/renderer/state/live-source-preflight.ts:293-312`, `severity: 'error'`, reported
   against both elements: _"overlapping holes put two live sources over the same pixels and which one
   shows is a z-order accident."_ Two layouts of the same screen area necessarily overlap.
   ⚠ **Precisely:** the overlap loop sits inside the per-document loop, so plates in _different
   compositions_ are not compared — a three-composition model would slip past the check on a
   technicality. **But its reason applies with full force at runtime**, and combined with fact 2
   below, that model reproduces §1's crosstalk _inside a single template_. Evading a check by scoping
   is not the same as satisfying it.
2. **Every declared plate is seated at take** (§4), so three layouts' worth of plates would all go
   live at once — N producers for one source. A `route://` tolerates that; a **physical DeckLink
   cannot be opened three times**. §12.4.
3. **It cannot reach the animated case at all.** You cannot tween a box from one element to a
   different element. Building the separate-sets model for the cut and then needing this model for
   the animation is the same "two implementations of one capability" failure that closed §0.2.

**Three independent ways this model fits the tree** (each verified, not asserted):

- **Assignments are keyed by plate id**, so assignment survives the switch for free — §3.
- **Plates keep their layers**, so `live-source-multibox` `tasks.md` 6.0's _"A RE-TAKE LANDS ON THE
  SAME LAYERS"_ stays true and the ledger stays coherent. `#planLiveSeating`'s own comment
  (`caspar-runtime.ts:2971-2979`) says moving a plate "would leave the old layer's producer running
  with nobody's name on it".
- **`§9a-Z` already says the punch follows the plate's own VISIBILITY**, not its assignment — _"a
  condition belongs in the mask ONLY IF it can be evaluated from the SCENE ALONE: visibility,
  lifecycle range, geometry and z-order qualify"_ (`packages/shared-schema/src/scene-flatten.ts:326-330`).

🔴 **The cost this model carries, stated plainly:** the switch **IS a plate move**, so per-layout
geometry must reach both the page and the bridge. Nothing today can express it — see §7 and §2.3.

### 0.6 The plate-identity fact, read from the code

Asked directly: **what does `collectLiveSources` emit for two elements sharing a `routeKey`, and what
does the preflight say?**

- `collectLiveSources` emits **one declaration per ELEMENT**
  (`packages/vcg-format/src/live-sources.ts:96-110`), each carrying its own `elementId` and `rect`
  and the _same_ `sourceId: el.routeKey`. Nothing dedupes.
- **The preflight says NOTHING.** `liveSourceIssues` has exactly four checks — device-shaped id,
  off-frame, geometry-keyframe/rotation, overlap (`live-source-preflight.ts:159-317`). None is a
  duplicate-id check. `SEARCH:` `git grep -rni "duplicate" -- apps/designer/src/renderer/state/live-source-preflight.ts packages/vcg-format/src`
  → 0 hits in the preflight (the only hits are `.vcg`/`.cgproj` path checks in `pack.ts`).
- `LiveSourceIdSchema` (`packages/shared-schema/src/elements.ts:1083-1092`) carries **no uniqueness
  refinement** — it is a format regex only.
- Downstream, `resolvePlateAssignments` resolves **per declaration** through a `Map` keyed by plate id
  (`live-plate-assignment.ts:96-129`), so duplicates all resolve to the same source **and all are
  seated**; `#planLiveSeating`'s `held` map is keyed by `record.sourceId`
  (`caspar-runtime.ts:2982`), so duplicates collapse and `preferred` names one layer N times.

**Under §0.5's model this is all moot** — one element per id at a time. It is recorded because it is
exactly why the separate-sets model's identity story is fragile, and because the Designer explicitly
_permits_ duplicates (`CanvasOverlay.tsx:105-107`: _"nothing forbids a deliberate duplicate"_), so
nothing would have warned an author who tried it.

---

## 1. The measured crosstalk — evidence, not a defect to fix here

The owner played all three layouts at once and stopped the top one to reveal the next. Measured on
the plant, 2026-08-17: `INFO 1` showed live sources on layers **10–14** and templates on
**93, 94, 95, 97**; layer 95's template took plates 10/11/12 while 13/14 belonged to a second
template.

**There is no layer collision — allocation works correctly.** Live sources sit in a declared band,
suggested `10–59` (`packages/shared-ipc/src/channels/sources.ts:295`), below the operator's template
rows. A hole punched by the template on 95 opens onto **the whole stack beneath it** and reveals
whatever live layer is topmost at that pixel — which may belong to a **different** template. Both
reported symptoms follow at once: one layout appearing under another, and boxes that look cropped
because you are seeing another template's plate through this template's window.

⚠ The band's bounds are only `0..MAX` with `end >= start` (`sources.ts:286-292`); **nothing forces
the band below the template rows.** The z-order that produces the crosstalk is a convention of the
suggested band, not an invariant.

---

## 2. 🔴 The feasibility verdict

### 2.1 What already exists — no new machinery

| Capability                                                       | Where                                                                                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggling an element's visibility from template data              | a `boolean` field → a `visible` target (`apps/designer/src/renderer/features/fields/bind-resolver.ts:100`); the runtime writes `el.style.display` (`packages/template-runtime/src/bindings.ts:184`) |
| Re-applying every binding on a `CG UPDATE`                       | `update()` re-runs the binding walk (`packages/template-runtime/src/runtime.ts:2177`)                                                                                                               |
| One assignment shared across layouts                             | assignment is keyed `(templateId, plateId)` — §3                                                                                                                                                    |
| Substituting a live source on a RUNNING row, with the fit redone | `swapLiveSource` (`tools/caspar-bridge/src/caspar-runtime.ts:3200+`) — shipped and working                                                                                                          |
| The punch following a plate's own visibility                     | `§9a-Z` already specifies it; `sceneMaskHoles` already filters on `visible`                                                                                                                         |
| A server-side tween on `MIXER FILL`                              | measured accepted on 2.5.0, 20 easings — §9.3                                                                                                                                                       |

### 2.2 What is a SMALL addition

- **Seat only the ACTIVE layout's plates** and release the rest — §4's one mechanism.
- **A refusal (or confirmation) on the Inspector's assignment edit while a row is on air** — §5.
- **Telling the operator which layout is active** — §10.

### 2.3 🔴 What is a GENUINE ARCHITECTURAL CHANGE

1. **Per-layout geometry has no carrier and no authoring surface.** The declaration the bridge fits
   from is a single static rect per plate, computed at export from the authored rect
   (`collectLiveSources` → `flat.rect`). For a plate to sit at a different rect per layout, the
   declaration must carry **per-layout geometry**, and the Designer must be able to author it.
   Neither exists. `SEARCH:` `git grep -n "z.literal('transform')" -A3 -- packages/shared-schema/src/bindings.ts`
   → the bindable property enum is exactly `['opacity','x','y','scale','rotation']`
   (`bindings.ts:40`); **`width`/`height` are not binding targets at any level of the schema**, and
   the only production `transform` constructor hardcodes `'opacity'` (`bind-resolver.ts:105`).
   ⇒ A 2-box layout whose boxes are _larger_ than the 3-box ones cannot be expressed by any existing
   mechanism.

2. **The punch mask is computed once and never recomputed** — one production call site, inside
   `buildScene` (`packages/template-runtime/src/scene-builder.ts:172`).
   `SEARCH:` `git grep -n "sceneMaskHoles" -- packages apps tools` → one production call site, one
   definition, the rest tests. **This is UNIT B′, and under this design it is a PREREQUISITE rather
   than latent cleanup** — §6b.

3. **The mask reads the SCENE's authored `visible`, not resolved visibility.** `sceneMaskHoles`
   filters `f.element.type === 'video-placeholder' && f.element.visible`
   (`packages/shared-schema/src/scene-flatten.ts:352-354`); a `visible` **binding** writes
   `style.display` and never touches that field. So re-running the function unchanged would not help —
   its input must change shape.

4. **The hole and the FILL must agree while moving** — extended in §3b, not re-derived.

### 2.4 The honest one-line verdict

> **Neither the cut nor the animation is free, and the difference between them is smaller than it
> looks.** Under §0.5's model even a CUT moves plates, so both need per-layout geometry (a new
> carrier and a new authoring concept) and a mask that recomputes (UNIT B′). What the animation adds
> on top is only the _tween_ and its curve contract — which §9.3 measured and which is satisfiable,
> with `linear`, exactly.

**The good news, and it is substantial:** the two facts that could have killed the feature did not.
The cut's command sequence completes in **0.20 frames** (§9.4), so the absence of an atomic
multi-plate `COMMIT` costs nothing visible; and a CasparCG tween **can** be matched to a CSS curve
exactly, provided both sides use `linear` (§9.3).

---

## 2b. ⭐ THE v1 ANIMATION REFUSAL — this design's decision, not an owner gate

`live-source-multibox` `design.md` §6 _"Animation — refused in v1, with the reason"_ makes **any
geometry keyframe on a Live Source — or anywhere in its ANCESTOR CHAIN — a preflight `error` that
blocks export**, because _"a static `FILL` behind an animated hole desyncs, and the hole is
transparent, so the failure mode is a live face sliding out from behind its frame on air."_
Verified shipped: `hasGeometryKeyframe` + `animatedAncestor` at `live-source-preflight.ts:225-256`.

**DECISION: (a) — the transition is a RUNTIME STATE CHANGE, not an authored animation. v1's refusal
stands untouched.**

**The reasoning, which is the distinction that matters.** The refusal exists because an authored
keyframe moves the hole **with nothing telling the bridge**: the page animates on its own clock and
the declared rect the bridge fitted from never changes. A layout switch is the opposite by
construction — **it is the mechanism that moves the FILL.** The same reconcile (§4) that repositions
the hole issues the `MIXER FILL`/`CLIP` for the new geometry. Hole and picture move because one
authority moved both, which is precisely what the refused case lacks.

**What stops an author ALSO keyframing a plate and re-entering the refused case: nothing changes,
and that is the point.** The preflight reads `el.animation?.tracks`
(`live-source-preflight.ts:147-153`) — **authored keyframes in the scene.** A runtime layout state is
not in `animation.tracks` and is invisible to it. So the two are distinguishable **by construction,
not by a new rule**: authored keyframes remain refused; the layout switch is not one. An author who
keyframes a plate still gets the blocking error, correctly, because that case still has no
bridge-side counterpart.

⚠ **The one thing this decision does NOT buy.** It removes the _refusal_ as an obstacle; it does not
remove the _risk the refusal was pointing at_. A moving hole still needs the FILL to move with it in
time — which is §3b's sync problem, now owned by the switch rather than by the author. `tasks.md` 7.4
is therefore withdrawn as written (there is nothing to relax) and replaced by a task to keep the
refusal and pin it with a test that a runtime layout change does **not** trip it.

---

## 3. 🔴 Assignment survival — answered from the code

Assignment is keyed **`(templateId, plateId)`**:

```
export const TemplateSourceAssignmentSchema = z.object({
  templateId: IdSchema,
  plateId: LiveSourceIdSchema,
  sourceId: SourceDefinitionIdSchema,
});
```

`packages/shared-ipc/src/channels/sources.ts:322-326`. The element's field is
`routeKey: LiveSourceIdSchema` (`elements.ts:1129`) and `collectLiveSources` emits it verbatim as
`sourceId` (`live-sources.ts:106`). **No element id, no plate index, nothing layout-local.**

⇒ **Under §0.5's model a plate keeps its identity across layouts, so the tuple never changes and the
assignment never changes. Nothing needs building.** In Family 2, three `.vcg` files are three
`templateId`s and share nothing — an independent proof that Family 2 could not have met the
requirement.

⇒ **And §0.6's duplicate-id collisions never arise**, because there is one element per id. That is a
real simplification the model buys, and it is why §0.5 is worth its cost.

---

## 3b. The hole and the FILL over time — EXTENDING `live-source-multibox` §6, not re-deriving it

`live-source-multibox` `design.md` §6 _"The v2 path, recorded as a SHAPE rather than as a plan"_
already records the whole sync problem and is the authority: the CEF `requestAnimationFrame` clock
against the server's `MIXER` tween clock — _"Two independent timelines, no shared origin, no shared
tick, and no feedback from either to the other"_ — per-frame `MIXER FILL` named as the brute-force
alternative with its cost, and the 44-easing `Tween` vocabulary from
`docs/recon/ciab-client-tools.json` flagged as _"a lead to verify on the server, not a settled server
capability."_ **This section adds only what is new. Read §6 first.**

**NEW 1 — the vocabulary is now VERIFIED on the server, and it is narrower than the lead.** §9.3:
20 Penner names accepted on 2.5.0; **`ease`, `ease-in-out` and `cubic-bezier` rejected `403`.** The
two vocabularies share no name, and only `linear` is exactly matchable (0.0 px).

**NEW 2 — `DEFER`/`COMMIT` is unusable, and it costs less than feared.** `MIXER <ch> COMMIT` is
**CHANNEL-scoped** (`live-source-multibox` §3b:825-833), so on this shared plant a `COMMIT` we send
could apply **another controller's** deferred changes. It was therefore deliberately **not
exercised** in §9.4. ⇒ **A switch that moves N plates cannot commit atomically; its N `MIXER FILL`
commands land one at a time.**
**Is that visible? Measured: no.** A full 3-box → 2-box cut — one `CG STOP` plus two
`MIXER FILL`+`CLIP` pairs — spans **6.9–17.9 ms, median 8.2 ms = 0.20 frames** at 25 fps (§9.4).
**What bounds it:** the command span is a fifth of a frame, so at most it can straddle **one** frame
boundary; the worst case is a single frame showing a partially-applied geometry, and the probability
is bounded by span ÷ frame ≈ 20 %. That is the bound — not a proof of zero, and §9.5 records what
would prove it.

**NEW 3 — a 1-box layout changes each box's ASPECT, so the fit must be re-derived per layout.**
`MIXER FILL` **survives a producer swap** (session AK), so a fit that is not re-derived yields a
**wrong crop rather than an obvious break** — the failure mode that does not announce itself.
⚠ Related observation from the plant trace, recorded as a lead rather than a finding: `FILL` and
`CLIP` are identical for a 1280×536 `AMB.mkv`, i.e. crop-to-fill is not being applied. Whether a
single-box layout would therefore **letterbox** is `tasks.md` 9.2 — unmeasured here.

---

## 4. 🔴 The layout switch and the live-source change are ONE mechanism

- A **layout switch** changes _which plates are visible and where_.
- A **source change** changes _what one plate shows_.

Both are: **reconcile the seated live-plate set of a RUNNING row against a freshly-resolved desired
set.** The desired set is a function of (declarations × active layout × assignments × overrides).

The tree holds **two halves of this one function**, and neither is the whole:

| Existing path                                | Desired set from            | Re-issues live? | Scope       |
| -------------------------------------------- | --------------------------- | --------------- | ----------- |
| `#seatLiveLayers` (`caspar-runtime.ts:3068`) | ALL declarations            | take only       | every plate |
| `swapLiveSource` (`caspar-runtime.ts:3200+`) | one plate, via THE resolver | **yes**         | one plate   |

`swapLiveSource` already argues its own case: resolving "through the ONE resolver … A swap that
resolved plates its own way would be a second spelling of 'which producer is behind this hole'"
(`caspar-runtime.ts:3272-3275`). **The same argument, one level up, says the switch must not be a
third path.**

⇒ **ONE `reconcileLivePlates(itemId, desired)`**, called by the take, by the layout switch, and by
`swapLiveSource` — which becomes a _caller_, not a peer. 🔴 **Do not build a second mechanism beside
R-048's swap.**

**Extend the list, forget the mutator — the inverse audit:**

| Mutated              | Forward                            | Inverse                                                                    |
| -------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| the plate SET        | seat (take only)                   | release on `stopItem` / `out` / `remove` only — **not** per-plate          |
| the MASK             | built once in `buildScene`         | **no inverse at all** — nothing un-punches a hole (§6, UNIT B′)            |
| the FIT              | `mixerFit` at seat and in the swap | `MIXER … CLEAR` exists as a verb; not driven by a visibility change        |
| the LAYER allocation | `allocateLiveLayers`               | freed only via the three teardown paths; **none on disconnect or restart** |

---

## 5. The Inspector defect — a MISSING REFUSAL ⟨MINT⟩

**Established, not investigated.** R-048 is implemented and shipped: `swapLiveSource` re-issues live
as a producer **replace**, resolving through the same resolver a take uses and re-deriving the fit
(`caspar-runtime.ts:3286-3320`). The row's SOURCE swap already does the live thing.

The owner used the **Inspector**, which writes the **template-scoped** assignment. That path is
specified to reach nothing on air, and three independent sources say so:

- `specs/runtime-live-source-routing/spec.md`: _"an assignment is read at the TAKE and never
  re-composites the graphic already on the channel."_
- `apps/runtime/src/renderer/features/inspector/applyDraft.ts:36-38`: _"the assignment reaches
  NOTHING on air (it is read at the next take)"_, and `:51`: _"⚠ TEMPLATE-LEVEL"_.
- `setSourceAssignments` (`caspar-runtime.ts:4776-4785`) validates, assigns, emits, returns — and
  🔴 **is not `async`**, so it is structurally incapable of sending an AMCP command.

`resolvePlateAssignments` filters `a.templateId === input.templateId` (`live-plate-assignment.ts:95`)
with no item id anywhere, so **the assignment is shared by every row carrying that template.**

⇒ **The defect is a MISSING REFUSAL, not a missing mutator.** Silently re-issuing would repoint every
other row carrying that template, on air, with nobody told. The Inspector should **refuse — or
require explicit confirmation — while any row carrying that template is on air, and name the row's
SOURCE swap as the live path.** **A control that silently does nothing is the worst of the three
outcomes, and it is what ships today.**

⟨MINT⟩ **a bug item for this**, gated on §12.5. No number is minted here.

⚠ **A second, related defect found during verification.** The Inspector's picker is
**override-blind**: `appliedPlateSources` (`features/inspector/livePlates.ts:19-29`) resolves via the
TEMPLATE assignment and `effectivePlateSource` (`features/inspector/draftStore.ts:177-184`) returns
`staged ?? applied ?? ''`. Neither consults `item.sourceOverride`.
`SEARCH:` `git grep -rn "sourceOverride" -- apps/runtime/src/renderer` → **exactly one hit**,
`features/layers/LiveSourceSwapDialog.tsx:80`. So an active override is invisible everywhere except
the dialog that set it, and the Inspector confidently shows a source that is not on air. Same
confusion, other side. ⟨MINT⟩ with the above.

---

## 6. The mask — the core blocker

**Nothing recomputes the mask after build** (§2.3.2). Two corrections to session AO's framing, both
of which make the job _easier_:

- **Not a baked string** — the mask is inline CSS on a live DOM node, and both exporters ship the
  scene plus the runtime and compute the mask at boot. A re-punch is a **reassignment**, not a
  re-export. **No `.vcg` change is implied.**
- **A runtime mask path already exists** — `STAMPED_SCOPE_MASKS` is spread inside `buildRepeaterRows`
  (`scene-builder.ts:1164`) and `buildSequenceCompositionItem` (`:1017`), both invoked from
  `runtime.ts` (`:1622`, `:749`) long after `buildScene` returns.

**What it takes:** give `sceneMaskHoles` **resolved** visibility and **current** geometry instead of
the scene's authored values; re-punch after each `update()`; and for the animated case only, track
per frame.

⚠ **A trap that rules out the obvious alternative carrier.** `flattenElements` descends into exactly
two kinds — `container` (`scene-flatten.ts:264`) and `composition` (`:274`) — and **never into a
`sequence`**. `SEARCH:` grep for `sequence` over `packages/shared-schema/src/scene-flatten.ts` → the
word does not appear. So a Live Source plate inside a sequence composition item is invisible to
**both** `collectLiveSources` and `sceneMaskHoles`: it would declare nothing and punch nothing,
silently. **This rules out "a sequence of composition items" as the layout carrier** — otherwise the
tree's only exactly-one-of-N primitive.

⚠ **`ContainerElement` is inert**, not merely unauthorable: the runtime renders it via
`buildPlaceholder` and **discards its children** (`scene-builder.ts:297`). Session AC's finding holds
and is stronger than stated.

---

## 6b. ⭐ UNIT B′ is this feature's PREREQUISITE — filed, with its enumeration

Session AO left UNIT B′ owed as _"the mutator enumeration, derived mechanically: the mask is computed
once at build and nothing recomputes it."_ Under §0.5 the layout switch **is** a plate move, so this
stops being latent cleanup and **becomes the feature's prerequisite.** Filed here; **not implemented
in this change.**

**The enumeration** (AO's list, plus what this design adds). For each: does it move or remove a
plate, and does the mask follow today?

| Mutator                         | Moves/removes a plate? | Mask follows today? |
| ------------------------------- | ---------------------- | ------------------- |
| take                            | yes                    | 🔴 no               |
| teardown                        | yes                    | 🔴 no               |
| position override               | yes                    | 🔴 no               |
| resize                          | yes                    | 🔴 no               |
| lifecycle range                 | yes                    | 🔴 no               |
| retention restore               | yes                    | 🔴 no               |
| z-order reorder                 | changes WHO is masked  | 🔴 no               |
| **layout switch** (new)         | **yes — both**         | 🔴 no               |
| **a `visible` binding** (new)   | **removes**            | 🔴 no               |
| **a `transform` binding** (new) | **moves**              | 🔴 no               |

**Two open questions AO flagged that this design must answer rather than inherit:**

- **An INVISIBLE ANCESTOR does not suppress a punch** — the walk tests `visible` on the PLATE, not on
  its container or layer. AO left it alone deliberately because the page and the bridge still AGREE
  (both act on the hidden plate). Under a layout switch that hides a _group_, this becomes load-bearing.
- **"Declared while hidden"** — whether a hidden plate should still be declared to the bridge. §0.5's
  model makes this the central question: a hidden plate must stop punching **and** stop being seated.

---

## 7. What a scene can express today — and the gap

- **Compositions are the working nesting mechanism** (`buildComposition`, `scene-builder.ts:339`);
  `addComposition` / `addCompositionInstance` exist and are wired to UI (`App.tsx:77`,
  `CompositionsPanel.tsx:67`). Useful for grouping, **but not as three alternative plate sets** (§0.5).
- **`visible` is authorable** — a `boolean` field → a `visible` target (`bind-resolver.ts:100`).
- 🔴 **Geometry is NOT authorable.** The one production `transform` constructor hardcodes
  `'opacity'` (`bind-resolver.ts:105`); there is no `updateBinding` anywhere. And **`width`/`height`
  are not binding targets at any level** (`bindings.ts:40`).

⇒ **The gap is exactly per-layout geometry**, and it is the largest single piece of work. The carrier
shape that follows from `live-source-multibox` §1 (no `.vcg` reaches the bridge; the declaration
block on `TemplateInfo` is derived once at import, on the shipped `hasNext` precedent) is
**per-layout rects on the declaration**. Proposed as the shape; the authoring half is §12.9.

---

## 8. Can two multi-box templates still be on air together? — YES, by two doors

| Path to air                   | Second multi-box template possible?                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Operator take, `take()`       | 🔴 **YES** — `#planLiveSeating` allocates a second template's plates _around_ the first's rather than refusing |
| `restore()` on reconnect      | 🔴 **YES** — adopts every retained on-air item with no cap, and never re-registers their plates                |
| Fixed-layer load / bulk verbs | reuse the same take/out paths                                                                                  |
| Per-layer occupancy           | refuses two items on ONE layer — says nothing about two items on two layers                                    |

**No mutual-exclusion concept exists anywhere.** `SEARCH:`
`git grep -rni "exclusiv|mutually|onlyOne|singleActive|radio" -- apps/runtime/src tools/caspar-bridge/src packages/shared-ipc/src`
→ the only hits are the lucide `Radio` **icon** for the SOURCE verb (`layerRowActions.ts:662`).

⇒ A refusal, if wanted, must live **in `take()` AND in `restore()`/`#decidePendingRestores`** —
restore never passes through `take()`. Two sites, ONE canonical predicate. The tree already has
`deps.hasLivePlates` (`layerRowActions.ts:655`). §12.6.

---

## 9. Measurements

### 9.1 The instrument and its controls

A throwaway HTTP+beacon harness on `192.168.21.93:7911` (what `guessLanHost()` resolves to and what
the plant can reach), serving an instrumented page that beacons at script-eval, `DOMContentLoaded`,
first-committed-frame (double-`requestAnimationFrame`), FCP, `load`, and each CG callback. Layer 150
(free; `INFO 1` showed 10, 11, 92–95, 97 occupied), page painting essentially nothing so it could not
disturb output. Layers cleared afterwards.

**A negative observation is not a result, so both controls ran before every measurement:**

- **Positive** — the beacon endpoint records a local self-test; the harness refuses to measure
  otherwise. For §9.4, each of the three layers' `MIXER FILL` readback was asserted LIVE first.
- **Negative** — a `CG ADD` at a URL the server 404s: command **accepted (`202 CG OK`)**, the plant
  **did fetch the bad URL from us**, and **no beacon fired**. Both halves matter; without the 202 and
  the fetch, "no beacon" would have been explained by the command failing.

⚠ **Two instrument faults were found and fixed before any number below was recorded**, both of which
produced plausible-looking wrong data:

1. **The AMCP reader desynchronised on `400 ERROR`**, which is followed by an echoed command line.
   Leaving it in the buffer attributed each reply to the next command — the first syntax sweep
   reported `NaN` codes and three bogus failures.
2. **CasparCG calls `window.update()` at ADD time.** An ungated match attributed that load-time call
   to a later `CG UPDATE`, yielding a **negative** latency (−450 ms). Fixed with a `since` gate.

### 9.2 🔴 PRIORITY 1 — `MIXER FILL … <duration> <tween>` on 2.5.0: ACCEPTED, and which names

Wire-level accept/refuse, one command per name, layer 150:

**ACCEPTED (20):** `linear`, `easenone`, `easeinquad`, `easeoutquad`, `easeinoutquad`,
`easeincubic`, `easeoutcubic`, `easeinoutcubic`, `easeinsine`, `easeoutsine`, `easeinoutsine`,
`easeinexpo`, `easeinoutexpo`, `easeincirc`, `easeinoutcirc`, `easeinback`, `easeoutback`,
`easeinoutback`, `easeoutbounce`, `easeinelastic`.

**REJECTED `403` (3):** `cubic-bezier`, `ease-in-out`, `ease`.

⇒ **`live-source-multibox` §6's 44-easing lead from `ciab-client-tools.json` is now a verified
server fact** — the form `MIXER <ch>-<layer> FILL x y sx sy <frames> <tween>` is accepted, `Linear`
included. **The vocabularies are disjoint: CasparCG has no CSS name and CSS has no Penner name.**

**And the curves themselves were sampled, not assumed.** `MIXER <ch>-<layer> FILL` with no arguments
**reads the current value back** (`201 MIXER OK` + `0.000000 0.000000 1.000000 1.000000`), so a
running tween can be polled. Each sampled curve's own Penner formula came out as its best fit — the
positive control that the instrument discriminates curves at all. Measured duration ≈ 2000 ms for 50
frames confirms **25 fps** (frames, not fields).

Exact formula-to-formula deviation, as **pixels of hole-vs-picture separation on a 1920 raster**:

| CasparCG tween   | vs CSS `linear` | vs `ease-in-out` | vs `ease` | vs a fitted `cubic-bezier`    |
| ---------------- | --------------- | ---------------- | --------- | ----------------------------- |
| `linear`         | **0.0 px** ✅   | 232.8 px         | 580.6 px  | —                             |
| `easeinoutsine`  | 202.1 px        | **35.9 px**      | 647.8 px  | **3.8 px** @ `(.37,0,.63,1)`  |
| `easeinoutquad`  | 240.0 px        | **22.8 px**      | 699.3 px  | **10.1 px** @ `(.45,0,.55,1)` |
| `easeinoutcubic` | 369.5 px        | 161.3 px         | 835.2 px  | 142.0 px                      |

1. **`linear` is the only exactly-matchable pair.** The fallback named in the addendum is not a
   compromise — it is the one curve with a proof.
2. Naming "ease-in-out" on both sides separates hole from picture by **~36 px** at peak.
3. 🔴 **The trap is CSS's default.** `transition: left 2s` with no timing function gets **`ease`**,
   which is **580–835 px** from every CasparCG tween — over a third of the frame width, and exactly
   what a developer writes by accident.

### 9.3 🔴 PRIORITY 2 — what a CUT costs the live sources

The re-fit a 3-box → 2-box cut performs — one `CG STOP` plus two `MIXER FILL`+`CLIP` pairs, five
commands — over 8 runs, all three layers asserted live first:

|                    | min     | median      | max      |
| ------------------ | ------- | ----------- | -------- |
| command-side span  | 6.86 ms | **8.16 ms** | 17.93 ms |
| in frames @ 25 fps | 0.17    | **0.20**    | 0.45     |

> 🔴 **A cut's command sequence completes in ~0.20 frames — a fifth of a frame.**

⇒ **`DEFER`/`COMMIT` being unusable (§3b NEW 2) costs nothing visible.** The span can straddle at
most **one** frame boundary, so the worst case is a single frame showing partially-applied geometry,
with probability bounded by span ÷ frame ≈ 20 %.

🔴 **`MIXER DEFER` / `MIXER <ch> COMMIT` was deliberately NOT exercised.** `COMMIT` is channel-scoped,
so on this shared plant it could apply another controller's deferred changes. Recorded as a refusal
to measure, not as an absence of data.

### 9.4 Demoted to optional — `CG ADD` → first painted frame

Family 2 is eliminated, so this decides nothing. Recorded because it was taken: **median 70.2 ms,
range 33.7–157.3 ms** over 10 runs. Also `CG UPDATE` → `window.update` **2.2–8.3 ms (median ≈5 ms,
sub-frame)**, and pre-warmed `CG PLAY` → `play()` **6.0 / 6.9 / 6.8 ms**.

### 9.5 What was NOT measured

- **The VISUAL seam of a cut.** §9.3 bounds it command-side; confirming what reaches SDI needs a
  channel-side capture, and `PRINT` writes to the plant's own disk, to which this session had no
  access. `tasks.md` 9.1.
- **Whether a 1-box layout letterboxes** (§3b NEW 3's `FILL`≡`CLIP` lead). `tasks.md` 9.2.
- AK's six unrun measurements and R-048's 6.9a tick — explicitly out of scope.

---

### 9.6 🔴 THE 2026-08-18 PLANT SESSION — the readings that decide §12.9's candidate D

**Same plant, same build, asserted again before every reading: `192.168.21.50:5250`,
`2.5.0 69e8ad5 Stable`, channel `1080i5000`.** 🔴 The retired 2.3.2 install at
`D:\programs\CasparCG` was never contacted. Channel 1 was read EMPTY before the session and
verified EMPTY after (`INFO 1` → no `<layer_n>`, no `html` producer); layers **150–152** were used
and cleared.

**Instrument.** The committed AMCP harness (`tools/caspar-amcp-probe/bin/live-probe-lib.mjs` — one
command at a time, any non-`2xx` a hard failure, build asserted by `assertProductionBuild`), plus a
throwaway HTTP+beacon server on `192.168.21.93` serving instrumented pages. Each page beacons at
script-eval, at its **first committed frame** (double-`requestAnimationFrame`, the same definition
§9.1 used), **once per animation frame** as a heartbeat, and on every `window.update`. Every beacon
is timestamped **at receipt on the harness side**, so all deltas share one clock.

🔴 **The heartbeat is what makes a page's DEATH observable**, and it is why these readings can answer
a question §9's instrument could not: a page that stops beaconing has stopped being ticked.

**Controls, run before every reading that reads a silence:**

- **Negative** — a `CG ADD` at a URL the harness 404s: command **accepted (`202`)**, the plant
  **did fetch the bad URL from us**, and **no beacon fired**. Reproduced this session.
- **Positive** — before any silence is read as death, the page is proven ALIVE: a `CG UPDATE` is
  answered, and the heartbeat rate is asserted (`< 5/s` ⇒ **VOID**, never a value). Observed rate at
  rest is **50–52/s**, matching the channel's 50 field rate.

⚠ **NO PIXELS THIS SESSION, and the reason is recorded rather than worked around.** `PRINT` writes
to the plant's own disk. SMB is open on the plant (port 445) but no share is readable from here —
`\\192.168.21.50\d$`, `\c$`, `\media`, `\casparcg` all `Test-Path` **false**, and `net view` lists
nothing. So §9.5's limit still stands and every reading below is **command- and renderer-side**.

#### 9.6a 🔴 Two templates CANNOT share one video layer — the cg-layer argument is INERT

`CG <ch>-<layer> ADD <cg-layer> …` with `<cg-layer> = 1`, onto a layer already carrying a page at
cg-layer `0`:

| Observation                         | Result                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| The second `ADD`'s reply            | **`202` — ACCEPTED.** It does not refuse                                              |
| The first page's heartbeat after it | **0** beyond 400 ms, from a proven 50/s ⇒ **the first page DIED**                     |
| `CG … UPDATE 0` afterwards          | answered by the **SECOND** page, not the first                                        |
| `CG … UPDATE 1` afterwards          | answered by the **SECOND** page                                                       |
| `INFO <ch>-<layer>`                 | ONE `<foreground>`, ONE `<producer>html</producer>`, `<path>` = the second page's URL |

⇒ **A video layer carries exactly ONE html page. `CG ADD` at a different cg-layer REPLACES it, and
both cg-layer indices then route to the one surviving page.** Reproduced across three runs.

**This is what the codebase already assumes, and now it is a measured server fact rather than a
convention.** `FLASH_LAYER = 0` is a module-level constant in `tools/caspar-bridge/src/command-builder.ts:16`,
interpolated into every CG verb the product emits — `ADD` (`:59`), `PLAY` (`:64`), `UPDATE` (`:69`),
`STOP` (`:90`), `NEXT` (`:105`). There is no parameter and no caller can pass anything else.
`SEARCH:` `git grep -rn "FLASH_LAYER" -- packages apps tools` → those five emission sites and the
declaration, nothing more. The only non-zero cg-layers anywhere in the tree are in **probes**, not
production: `tools/caspar-amcp-probe` takes a configurable `flashLayer`, and `tools/soak-runner`
hardcodes `1` (`harness.ts:216-218`). Its own docstring already said so — _"HTML producers use a
single layer"_ (`command-builder.ts:13-14`) — and that sentence is now measured.

#### 9.6b The REPLACE gap — 2.95 frames, against the cut's 0.20

Replacing the page on one video layer with `CG ADD`, alternating direction, all runs with the
outgoing page's heartbeat asserted live first (n = 8):

|                                                    | min    | median     | max    |
| -------------------------------------------------- | ------ | ---------- | ------ |
| **gap** (outgoing's last frame → incoming's first) | 112 ms | **118 ms** | 125 ms |
| **in frames @ 25 fps**                             | 2.80   | **2.95**   | 3.13   |
| the outgoing page survived the `ADD` by            | 16 ms  | 22 ms      | 29 ms  |
| `ADD` → first painted frame                        | 137 ms | 140 ms     | 141 ms |

> 🔴 **A template REPLACE on one video layer costs ~3 FRAMES of empty layer — about fifteen times
> the measured cost of the cut this design already has (0.20 frames, §9.3).**

**The outgoing page does not wait for the incoming one.** It dies ~22 ms after the command, and the
incoming page paints ~118 ms later; the layer composites nothing in between, so what shows is
whatever is below it on the channel — nothing, in the case D needs.

⚠ **`ADD` → first paint reads 140 ms here against §9.4's median of 70.2 ms.** It sits inside §9.4's
range (33.7–157.3 ms), but the pages differ — §9.1's painted essentially nothing, this one paints a
full-frame backdrop and runs a heartbeat — so this is **NOT claimed as a confirming control** on
§9.4. It is recorded as its own number, for its own page.

#### 9.6c 🔴 `LOADBG` DOES pre-warm an html page — and it makes the cut gapless

The layer's `INFO` carries a `<background>` beside its `<foreground>`, and that slot is usable:

- `LOADBG <ch>-<layer> [HTML] "<url>"` → **`202 LOADBG OK`**.
- The backgrounded page **fetched its HTML, painted a first frame, and ticked at 51.7/s** — it is
  fully live while in the background slot.
- `PLAY <ch>-<layer>` then cuts to it. Across n = 6, **both pages were asserted ticking (50/s each)
  immediately before the cut**, and the incoming page **kept beaconing straight through it** (~81
  heartbeats retained) — it was already painting, so **there is no load gap at the swap**. The
  outgoing page survived the `PLAY` by 39–64 ms (median 60 ms) and was then destroyed.
- 🔴 **And the product's data channel survives that path**: `CG <ch>-<layer> UPDATE 0 "<json>"` on a
  page seated by `LOADBG` + `PLAY` answered **`202 CG OK`** and reached the page's `window.update`
  with the payload byte-exact, with the page proven alive at 50/s at that moment.

#### 9.6d 🔴 …but there is exactly ONE background slot, so only ONE alternative can be pre-warmed

Three **distinct** pages (an earlier two-page version of this reading was VOID — both pages served
the same id, so a survivor could not be told from a reload; it was rebuilt with a third page):

- foreground **A**, then `LOADBG` **B** → both ticking, **A 50/s, B 51.7/s** (positive control).
- then `LOADBG` **C** → **C 50/s, A 50/s, and B `0/s`.**
- `INFO` reports exactly **1 `<foreground>` and 1 `<background>`**, paths `["c", "a"]`.

⇒ **A second `LOADBG` DESTROYS the first pre-warm.** A layer holds two producers, never three.

⚠ **What is NOT measured, and it cannot change any verdict below.** That the background producer is
not COMPOSITED is CasparCG's defined `LOADBG` semantics and is consistent with everything observed
(`PLAY` promotes it; the old foreground is destroyed after), but it was not confirmed with pixels —
no plant disk (above), and starting the local 2.5.0 install to `PRINT` against was not available to
this session. **The verdict on candidate D holds under BOTH branches**, which is why the gap is
recorded rather than chased: if the background is not composited, D can pre-warm exactly one
alternative (§12.9's D-3); if it WERE composited, two pages would be on air at once and D would
re-enter §1's measured crosstalk — worse for D, not better.

#### 9.6e The plant's CEF is **Chromium 142**, and it INTERPOLATES a `clip-path`

Read from inside the plant's own browser (`navigator.userAgent`):
`Mozilla/5.0 (Windows NT 10.0; Win64; x64) … Chrome/142.0.0.0 Safari/537.36`. Viewport 1920×1080,
`devicePixelRatio` 1. `CSS.supports` — `clip-path: path(…)` ✅, `clip-path: polygon(evenodd, …)` ✅,
`mask-mode: luminance` ✅, `Element.animate` ✅.

**§3b.4's lead is VERIFIED**, by sampling `getComputedStyle(el).clipPath` through a 2 s `linear`
transition with the point count held stable on both sides:

| Form                                   | Distinct intermediate values        | A sampled midpoint                                        |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| `clip-path: polygon(evenodd, …)`       | **9**                               | hole corner `200px 200px` → `438px 234px` → `676px 268px` |
| `clip-path: path(evenodd, '…')`        | **9**                               | `M 200 200` → `M 438 234` → `M 676 268`                   |
| the same via `Element.animate` (WAAPI) | interpolating, `playState: running` | `522px 246px`                                             |

⇒ **The browser moves the holes itself. No per-frame JS, no SVG regeneration.**

#### 9.6f 🔴 …but interpolation is not free, and the EXPENSIVE half is not the one expected

Frame rate measured **from inside the page** (rAF count over a fixed window), 1920×1080, **a fresh
page load per mode**, each run carrying its own at-rest control **before and after** so a low number
cannot be a monotonic decline:

| Mode                                                        | at rest | **while animating** | worst frame gap | at rest after |
| ----------------------------------------------------------- | ------- | ------------------- | --------------- | ------------- |
| `none` — nothing animates (the floor)                       | 51.1    | 50.1                | 37.4 ms         | 50.1          |
| `clip` — ONE backdrop, its `clip-path` interpolating        | 50.7    | **48.7** (−4 %)     | 79.9 ms         | 50.3          |
| `fade` — TWO full-frame backdrops crossfading, masks STATIC | 50.5    | **45.6** (−10 %)    | 120 ms          | 50.6          |
| `both` — clip-path on both AND the crossfade                | 50.5    | **35.8** (−29 %)    | 120 ms          | 50.0          |

> 🔴 **Moving three interpolated holes costs ~4 % of the frame budget. Crossfading two full-frame
> backdrops costs ~10 %. The BACKGROUND transition is the expensive half, not the mask.**

⚠ Read it for what it is. The backdrops here are a `linear-gradient` and a `radial-gradient`, the
expensive kind, on an otherwise empty page and an idle channel; a real scene has more in it, and
flat colours or images would cost less. The worst frame gap under `fade` is **120 ms — three frames
at 25 fps** — so the risk this names is a visible stutter during the transition, not a steady-state
one. What this does and does not do to the owner's "a background transition is FREE" framing is
recorded with the transition requirements.

#### 9.6g `MIXER … OPACITY` takes a duration and a tween, with FILL's exact vocabulary

| Form                                   | Reply                                                           |
| -------------------------------------- | --------------------------------------------------------------- |
| `MIXER <ch>-<layer> OPACITY` (no args) | `201 MIXER OK` + the current value — it reads back, like `FILL` |
| `… OPACITY 0.5`                        | `202`                                                           |
| `… OPACITY 1 25` (duration only)       | `202`                                                           |
| `… OPACITY 0.2 50 linear`              | `202`                                                           |
| `… OPACITY 1 50 easeinoutquad`         | `202`                                                           |
| `… OPACITY 0.5 50 ease`                | 🔴 **`403 MIXER OPACITY FAILED`**                               |
| `… OPACITY 0.5 50 cubic-bezier`        | 🔴 **`403 MIXER OPACITY FAILED`**                               |

And the tween genuinely RUNS — polling the readback through `OPACITY 0 50 linear` (50 frames =
2000 ms): `0.74 → 0.56 → 0.38 → 0.20 → 0.02 → 0`, monotone, six distinct values, arriving at 0 at
about the right time.

⇒ **§9.2's disjoint-vocabulary finding is not specific to `FILL`.** OPACITY accepts the Penner names
and rejects both CSS ones, so §12.2's `linear`-only rule is the same rule here — and the transition
requirements explain why it nonetheless binds only the PLATES.

---

## 10. Where the switch control would live

Session AH's wall is confirmed at `f6c7329`: the row's verb block is a **fixed six-column grid**
whose sticky header prints a word above each glyph — stated in the code at
`apps/runtime/src/renderer/features/layers/LivePlateAudioDialog.tsx:36`, laid out by the one shared
`gridTemplateColumns(density)`. That closed grid, plus an admission rule forbidding a control whose
presence varies by row, is why AUDIO and SOURCE became **conditionally-present `RowAction`s with
`surface: 'menu'`** (`layerRowActions.ts:655-668`, gated on `deps.hasLivePlates`).

R-048's 6.9e requires the source swap to be reachable **in one or two actions from the row** and not
behind a modal chain; a layout switch has the same emergency character. The SOURCE/AUDIO menu is the
precedent and the obvious host — but a switch the operator makes _live_ deserves the owner's
judgement rather than an inherited default. §12.8.

---

## 10b. §9b — the multi-box on a channel of its own — does NOT compete

`live-source-multibox` `design.md` §9b proposes putting the multi-box on a dedicated channel; its
status is **`EVALUATED AND RECOMMENDED IN PRINCIPLE; NOT ADOPTED`**, owner-gated on its §12.5.
**It is orthogonal to this design and does not deliver a layout switch.** It moves _where the layers
live_; it does not change _what the bridge sends_. Adopting it later would **not** change this
design's cost: the reconcile (§4), the mask recompute (§6b), the per-layout geometry carrier (§7) and
the curve contract (§9.2) are all expressed in channel-relative terms and would follow the plates to
a new channel unchanged. Its one real interaction is that §9b's isolation would make §8's
two-templates-on-air crosstalk structurally impossible for plates on the dedicated channel — which
weakens the case for §12.6's refusal but does not remove it, since restore adopts items on any
channel.

⚠ Noted in passing, **not acted on**: §9b's four §12.5 measurements are written against CasparCG
**2.3.2, which is retired**, and need re-basing on 2.5.0 before anyone runs them — an owner decision.
Also `live-source-multibox` `tasks.md` has **two items numbered 6.3**.

---

## 11. Impact if this proceeds

| Area                   | Effect                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `@cg/shared-schema`    | resolved visibility + current geometry into `sceneMaskHoles`; per-layout geometry on the element |
| `@cg/shared-ipc`       | per-layout rects on the `liveSources` declaration block                                          |
| `@cg/template-runtime` | a re-punch pass after `update()` (UNIT B′)                                                       |
| `tools/caspar-bridge`  | ONE `reconcileLivePlates`; `swapLiveSource` becomes a caller; per-layout fit                     |
| `apps/runtime`         | the layout control; the Inspector refusal and override visibility                                |
| `apps/designer`        | authoring per-layout geometry; the `live-source-animated` refusal is KEPT (§2b)                  |
| `@cg/vcg-format`       | `collectLiveSources` emits per-layout rects; no format change (the mask is computed at boot)     |

---

## 12. 🔴 OWNER GATES — SEVEN OF EIGHT ARE ANSWERED (owner, 2026-08-18)

**Status.** The owner answered **§12.1, §12.2, §12.4, §12.5, §12.6, §12.7 and §12.8** on 2026-08-18.
Each is recorded below as **the decision, the owner's own reasoning, and what it unblocks or costs**.
§12.3 was already withdrawn (measured). **§12.9 is the one gate still open** — the owner's answer did
not settle it, it **widened** it: a candidate was withdrawn and a new one added. §12.9 is rewritten
below with the real candidate set.

**The candidate tables are KEPT under each decision.** They are the record of what was weighed, and a
decision whose alternatives have been deleted cannot be re-read later to check whether it still
holds.

**A decision is not an implementation.** Answering a gate unblocks the `⟨GATE: §x⟩` tasks that named
it; it does not make them done, and nothing below has been implemented.

### §12.1 — Ship the cut first, or hold for the animated switch? — ✅ **DECIDED: A, cut first**

> **DECISION (owner, 2026-08-18): CUT FIRST, ANIMATION SECOND.**
> The cut must exist as a first-class option anyway; both phases share the carrier and the mask
> work; shipping the cut kills both measured crosstalk symptoms sooner.

| Candidate                              | Cost                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⭐ **A — cut first, animation second** | Client gets exclusivity + assignment survival early. Under §0.5 both phases share the carrier and the mask work, so the second phase adds only the tween |
| **B — one release, animated**          | No intermediate behaviour. Everything in §2.3 lands at once, including §9.2's curve contract                                                             |

**Why it is the right call against this design's own evidence, not just the cheaper one.** §2.4 says
the two phases are closer than they look **because the expensive halves are shared**: under §0.5 even
a cut moves plates, so phase one must already build the per-layout geometry carrier (§7) and the mask
recompute (UNIT B′, §6b). Phase two then adds _only_ the tween and its curve contract. So "cut first"
does not defer the hard work — it defers the **only** part that is genuinely additive, and it does so
without building anything phase two throws away. That is the opposite of §0.2's rejected shape, where
Family 2 would have delivered the cut and then required Family 1 anyway.

⚠ **What it does NOT defer.** The two measured crosstalk symptoms (§1) are closed by **exclusivity**,
which is phase one's, so the client's reported defect is fixed by the cut. But §8's two doors —
`take()` and `restore()` seating a _second_ multi-box template — are a different reachability and are
closed by §12.6's refusal, not by this phasing.

**Unblocks:** `tasks.md` 1.10, 2.1, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 4.6, 7.4, 8.2.

### §12.2 — The transition curve — ✅ **DECIDED: A, `linear` on both sides**

> **DECISION (owner, 2026-08-18): `linear` ON BOTH SIDES** — the only provable option (**0.0 px**).
> A pinned cubic-bezier table is both a 4–10 px separation **and a second spelling of one rule**.
> ⚠ **A CSS transition that omits its timing function must be forbidden by lint or test** — the
> default `ease` measured **580–835 px** out.

| Candidate                                                        | Cost                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ⭐ **A — `linear` on both sides**                                | **0.0 px separation, provable.** Costs polish: a linear move looks mechanical                    |
| **B — a pinned `cubic-bezier` per tween, with a deviation test** | ~4–10 px worst case for sine/quad. Costs a contract test and a fragile table                     |
| **C — plates FADE rather than travel**                           | Sidesteps hole/fill agreement entirely (opacity needs no `FILL` tween). Costs the rearrange look |

**Why B is refused on a second ground, and it is this repo's own.** B's cost is not only the ~4–10 px
residual — it is that the curve would then be **written twice**, once as a CSS `cubic-bezier(…)` and
once as a CasparCG Penner name, with a contract test standing between them to notice when they
disagree. `CLAUDE.md` golden rule 6 and the `B-100`/`P-012` history name that shape exactly: two
spellings of one rule is how the rule comes to lie. A test that _detects_ the drift is strictly worse
than a design in which the drift is unrepresentable, and **`linear` is the one name where both
vocabularies denote the same function** (§9.2: the vocabularies are otherwise **disjoint** — CasparCG
has no CSS name and CSS has no Penner name).

🔴 **The omitted-timing-function guard is not a nicety, and it is the reason to write it as a
mechanism rather than a convention.** §9.2 measured the CSS default `ease` at **580–835 px** from
every CasparCG tween — over a third of the frame width — and `transition: left 2s` is exactly what a
developer writes by accident. The rule must be enforced by lint or test (`tasks.md` 7.3) because the
failure is invisible in the Designer, where there is no server tween to disagree with.

**Unblocks:** `tasks.md` 7.1, 7.2, 7.3.

### §12.3 — Withdrawn (measured)

The cut's cost to the live sources is measured: **0.20 frames** (§9.3). What remains is the visual
confirmation, which is `tasks.md` 8.1 rather than a gate.

### §12.4 — What happens to a source with no box in the target layout — ✅ **DECIDED: B, held**

> **DECISION (owner, 2026-08-18): HELD MUTED AND IDLE**, so switching back is instant; the band is
> **50 layers** so one or two extra is cheap.
> ⚠ **A source kind that cannot be held open falls back to teardown as a NAMED behaviour, never a
> surprise.**

| Candidate                                                   | Cost                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| **A — torn down**                                           | Frees a band layer immediately; switching back pays a re-seat |
| ⭐ **B — held muted and idle so switching back is instant** | Costs a band layer for as long as the row is up               |

**The band arithmetic checks out.** `SUGGESTED_LIVE_SOURCE_LAYER_RANGE` is `{ start: 10, end: 59 }`
(`packages/shared-ipc/src/channels/sources.ts:295`) — 50 layers inclusive. A 3-box template holding
its dropped plate while a 1-box layout is live occupies 3 of 50.

🔴 **How this answers the hardware question rather than dodging it.** The gate carried "if the id maps
to a physical DeckLink, can it be held open for a hidden layout at all?" The decision does not assume
it can. It fixes the **default** (hold) and **names the exception** (teardown), which converts an
unmeasured hardware fact from a _blocking_ gate into an _implementation input_: the code must ask
"can this source kind be held?" and take the named fallback when the answer is no. Two things follow
and both belong in `tasks.md` 4.5:

1. **The fallback must be NAMED, i.e. observable.** A plate that was torn down rather than held is a
   plate whose switch-back is not instant; the operator must be able to see that this is what
   happened, or the inconsistency reads as a bug in the switch.
2. **"Held muted" is already this product's default posture, not a new one.** Every live plate is
   created SILENT — the audio rule creates every producer muted
   (`apps/runtime/src/renderer/features/layers/layerRowActions.ts:669-676`, the AUDIO verb's own
   comment) — so "muted and idle" is the state a seated-but-unraised plate is already in. What is new
   is only that it is **not visible** while held.

⚠ **Held is NOT declared, and this is where §12.4 meets UNIT B′.** `tasks.md` 2.5 asks whether a
hidden plate is still declared to the bridge. The two halves must not be conflated: the plate stops
**punching** (§0.5 — a hidden plate must stop punching, or a hole opens onto the stack below and
§1's crosstalk returns _inside one template_), while its **producer** stays seated on its band layer.
Punch and seat are separate mutations of the same plate, and this decision separates them.

**Unblocks:** `tasks.md` 1.3, 2.5, 4.5.

### §12.5 — The Inspector's assignment edit while a row is on air — ✅ **DECIDED: C, surface only** ⟨MINT⟩

> **DECISION (owner, 2026-08-18): SURFACE ONLY.** The edit saves; the surface says **"takes effect at
> the next take"** and **names the live path — the row's SOURCE swap**. Refusing or confirming is
> friction without capability, since **neither can re-issue**. Decided together with §5's
> override-blindness, as the gate required.

| Candidate                                                                     | Cost                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A — refuse while any row carrying it is on air**                            | Safest. Costs the operator a second control for a thing they thought was one     |
| **B — allow with explicit confirmation** naming how many live rows it affects | Keeps one control. Costs a dialog on a config edit, and it still cannot re-issue |
| ⭐ **C — surface only** ("takes effect at the next take")                     | Cheapest and honest. Leaves the operator to do the right thing                   |

**The reasoning is sharper than "cheapest", and it is worth writing down.** A refusal (A) and a
confirmation (B) both spend the operator's attention at the moment of the edit, and **neither buys
any capability**: `setSourceAssignments` is not `async` and is
structurally incapable of sending an AMCP command (`tools/caspar-bridge/src/caspar-runtime.ts:5219-5229`
at `fc663dc` — re-read for this commit; §5 cites `:4776-4785`, which is where it sat at `f6c7329`.
**The anchor drifted; the claim did not** — the method is still synchronous and still returns without
sending), so after the dialog is dismissed the outcome is
identical in all three candidates — the assignment is saved and nothing on air moved. What the
operator actually lacks is **knowing that**, and **knowing where the live control is**. C spends
nothing and supplies both.

🔴 **What C must NOT become.** §5's verdict was that _"a control that silently does nothing is the
worst of the three outcomes, and it is what ships today"_. C is only a decision, not a description of
today: today's Inspector says nothing. C is C **only if the surface is built** — the "next take"
statement and the named live path are the entire content of the decision, and without them C is the
shipped defect with a name.

**And it lands with §5's second defect, by the gate's own instruction.** `sourceOverride` appears in
exactly one place in the whole renderer — `features/layers/LiveSourceSwapDialog.tsx:80` — so an
active override is invisible everywhere else and the Inspector confidently shows a source that is not
on air. Telling the operator "this takes effect at the next take" while _also_ showing them the wrong
current source would be a half-repair. `tasks.md` 6.2 and 6.3 are ONE surface change.

⟨MINT⟩ **The bug item for both halves is still unminted** — `tasks.md` 1.9. This session reports the
next free number (see §12.7) and mints nothing.

**Unblocks:** `tasks.md` 1.9, 6.2, 6.3.

### §12.6 — Should two multi-box templates on air together be REFUSED? — ✅ **DECIDED: A, refuse**

> **DECISION (owner, 2026-08-18): REFUSE**, in **`take()` AND `restore()`**, through **ONE predicate
> called from both** — two spellings of one rule is this project's most frequent failure.

| Candidate                                      | Cost                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ⭐ **A — refuse, in `take()` AND `restore()`** | Closes the crosstalk class. Costs a refusal on a legitimate-looking action, two sites for one predicate |
| **B — do not refuse**                          | Costs leaving a measured on-air failure mode reachable                                                  |

**The decision names the mechanism, not only the outcome, and that half is load-bearing.** §8
established that `restore()` **never passes through `take()`** — `#decidePendingRestores` adopts every
retained on-air item with no cap and never re-registers their plates — so the refusal has two sites by
necessity. `CLAUDE.md` golden rule 6 is written about exactly this: the second site must **call** the
one predicate, never re-derive the condition locally, because _"a second local copy is how a name
comes to lie about what it tests"_. The predicate's name must state the condition it tests.

⚠ **The predicate is not `hasLivePlates`.** `deps.hasLivePlates`
(`apps/runtime/src/renderer/features/layers/layerRowActions.ts:655`) is a _renderer_ fact about one
row's template declaring plates; the refusal is a _bridge_ fact about the on-air set — "is another
item carrying a multi-box template already on air on this channel?". §8 offers `hasLivePlates` as the
tree's nearest existing shape, not as the predicate. Reusing the name for a different condition is
the failure golden rule 6 forbids.

**Unblocks:** `tasks.md` 5.2.

### §12.7 — The un-persisted live-layer ledger — ✅ **DECIDED: it must survive a restart; filed SEPARATELY**

> **DECISION (owner, 2026-08-18): THE LEDGER MUST SURVIVE A BRIDGE RESTART.** After a restart the
> seated layers still appear in the list and are controllable, **by whatever mechanism is needed** —
> persisting the ledger, or reconciling against the server's `INFO` at boot.
> ⚠ **Filed as a SEPARATE item that must land BEFORE the switch ships.** It is not part of the
> switch's design, but the switch makes the ledger churn constantly.

**Why "separate but before" is the right shape and not a fudge.** `#liveLayers` is process memory
with release on `stopItem` / `out` / `remove` **and on no other path** — not on disconnect, not on
restart (§4's inverse audit, `tasks.md` 0.3). That is **pre-existing** and is not caused by this
feature, so folding it into the switch would misattribute it and make the switch's own diff harder to
read. But the switch **seats and releases plates continuously** rather than once per take, so it
multiplies the ledger's write rate — and a stranded producer under this feature is a _live face on
air that no code path can reach_, which is a different severity from the same bug today.

**The two named mechanisms are not equivalent, and the item should say so.** Persisting the ledger
records what _we believe_; reconciling against `INFO` at boot reads what _the server actually has_.
Only the second is self-correcting when the two disagree — and they will, because a producer can also
disappear from the server's side (a channel reset, a hand-issued `CLEAR`) with our persisted ledger
none the wiser. This design's own §12.6 predicate is a second consumer of the same truth: it must
know what is on air after a restore. **Recommendation, for the item to weigh rather than a decision
taken here: reconcile against `INFO`, and persist only if `INFO` proves insufficient to re-derive the
plate↔layer mapping.**

🔴 **THE NUMBER — reported, NOT minted.** Derived immediately before this commit, by
`docs/prd/b-number-registry.md`'s only supported method (the local sweep **and** the all-refs widening
sweep; `git stash list` is empty; the duplicate audit prints exactly `B-056` and `B-080` as it must):

| Prefix | Highest claimed (local **and** across every ref) | **Next free** |
| ------ | ------------------------------------------------ | ------------- |
| `B-`   | 144                                              | **`B-145`**   |
| `C-`   | 024                                              | `C-025`       |
| `D-`   | 151                                              | `D-152`       |
| `P-`   | 036                                              | `P-037`       |
| `R-`   | 056                                              | `R-057`       |

⇒ **Recommended: `B-145`, filed in `docs/prd/bugs-runtime.md`.** It is a defect in shipped behaviour
— a restart strands seated producers unreachable by any code path — not a new capability, and
`bugs-runtime.md` is where the bridge's defects live (`B-144` is its immediate neighbour and is the
same shape: a graphic on air that the row can no longer reach). If the owner reads it instead as new
machinery rather than a defect, the runtime space's next free is **`R-057`**. **Nothing is minted in
this change.**

**Unblocks:** `tasks.md` 1.6, and adds 1.11 (file the item) and 4.7 (the switch must not ship before
it lands).

### §12.8 — Where the switch control lives, and how many actions — ✅ **DECIDED: a segmented control on the row**

> **DECISION (owner, 2026-08-18): AN ALWAYS-VISIBLE SEGMENTED CONTROL ON THE ROW**, showing which
> layout is live. **A menu is disqualified** — the client's requirement is _"exactly one active so
> the operator cannot make a mistake"_, and **a menu hides the current state**.

**The reasoning is a direct consequence of §0.1 and it overturns §10's inherited default.** §10
proposed the SOURCE/AUDIO menu as "the precedent and the obvious host". The client's requirement is
not _reachability_, it is _unambiguity_: the operator must not be able to make a mistake, and a
control that must be opened to reveal which layout is live gives the operator no way to be sure
without opening it. A segmented control **is the state readout and the switch in one object**.

🔴 **THE COST, STATED PLAINLY: this re-opens the closed six-column verb grid, and it collides with it
twice — not once.** §10 recorded the grid as a wall; the decision goes through it, so the design must
say what breaks.

1. **The SHAPE rule.** _"Every row declares the same verbs in the same order, always"_
   (`apps/runtime/src/renderer/features/layers/layerRowActions.ts:407-409`) is why conditionally-
   present controls were pushed to `surface: 'menu'` in the first place — SOURCE and AUDIO are both
   `...(deps.hasLivePlates ? [act(…, 'menu')] : [])` (`:655-688`). A control present only on
   multi-box rows is exactly the shape that rule refuses.
2. 🔴 **The FIXED-WIDTH rule, which is the sharper collision and is NOT the same objection.** The
   whole column model is fixed px — _"Every column here is a FIXED px width (or the single flexible
   `1fr` that absorbs the slack), so a longer alias, a longer template name or a longer state word
   changes nothing but its own ellipsis"_ (`layerTable.ts:1-22`), with
   `VERB_COUNT = 6` (`:75`) driving **both** the header's word row and the row's button row from one
   `gridTemplateColumns(density)` call (`:225`, used at `LayerRow.tsx:605` and
   `LayerTableHeader.tsx:164`). A segmented control has **one segment per authored layout**, and the
   layout count is authored per template — so its width varies by row _and is unknown at design
   time_. That is not a seventh fixed column; it is a variable-width control in a model built to
   forbid exactly that. And `VERB_COUNT`'s own comment records what happened last time a button was
   added without updating it: the sixth button wrapped and **every header word from NEXT rightward
   sat above the wrong glyph** — in a product where STOP and CLEAR are inverted relative to the
   reference product.

⇒ **The gate is answered; the placement is now an implementation question with three shapes**, posed
here and not decided: **(i)** a seventh verb column (refused by both rules above as written);
**(ii)** the segmented control on a **second line of the row**, outside the verb grid, present only
on multi-box rows — the shape rule governs the verb block, and a second line is not in it;
**(iii)** a dedicated region outside the table entirely. **(ii) is the one to design first**: it
satisfies the decision (always visible, state-carrying), and it leaves `VERB_COUNT` and the header
word alignment untouched, which is the invariant with the recorded on-air failure behind it.

⚠ **And it must survive density.** `gridTemplateColumns(density)` exists because the table is
density-adaptive; a control whose segment count is authored must have a defined behaviour at the
tightest density, or it will be the thing that reintroduces wrapping.

**Unblocks:** `tasks.md` 6.1.

### §12.9 — 🔴 STILL OPEN, and WIDENED: how are per-layout GEOMETRY **and per-layout DESIGN** authored?

**The owner's 2026-08-18 answer did not settle this gate. It changed the question.**

> There may be a **4-box** too, **with different backgrounds — even a motion or video background
> built in the Designer.**

#### 12.9.0 ⛔ CANDIDATE B IS WITHDRAWN BY THE OWNER — do not re-propose it

The old candidate B was _"the system ships a fixed 1/2/3-box family with geometry computed in
code"_. It is withdrawn, and the reason is the owner's:

> 🔴 **A layout is a designed SCENE, not a set of rectangles — and computed geometry cannot carry a
> background at all.**

B's entire appeal was that it needed no Designer work. That appeal depended on a layout being
expressible as arithmetic over the frame. Once a layout carries **its own background — possibly a
motion or video background authored in the Designer** — there is nothing for arithmetic to compute:
the thing that differs between layouts is _artwork_, and artwork has no closed form. B is not "more
expensive than thought"; it is **unable to express the requirement**, which is a different kind of
refusal and the reason it must not come back when the schedule gets tight.

#### 12.9.1 The candidates now

|                                                               | Shape                                                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**                                                         | ONE template holding N layouts. A layout is a STATE controlling plate visibility, plate geometry, **and now non-plate element visibility** — each layout's own background, decorations, video |
| **D** _(the owner's, offered for investigation not adoption)_ | Layers get a TYPE — a _simple_ type and a _group_ type. For the group type, **several ordinary templates bind to one layer**, exactly one live                                                |
| **C**                                                         | Layouts authored as COMPOSITIONS, geometry derived from each instance's own transform                                                                                                         |

---

#### 12.9.2 🔴 THE VERDICT ON D — measured on the plant, and it is a refusal on the mechanism

**D was taken seriously and tested first, because if it worked it would be much the cheapest: every
layout is an ordinary template the author already knows how to build.** It does not work, and the
reason is not a cost — it is that the server does not offer the mechanism D is built on.

**D-1 — does this codebase ever address a cg-layer other than `0`? No, and it cannot.**
`FLASH_LAYER = 0` is a module-level constant interpolated into all five CG verbs the product emits
(`tools/caspar-bridge/src/command-builder.ts:16`, used at `:59`, `:64`, `:69`, `:90`, `:105`). There
is no parameter. `SEARCH:` `git grep -rn "FLASH_LAYER" -- packages apps tools` → the declaration and
those five sites, nothing else. The only non-zero cg-layers in the tree are in probes
(`tools/caspar-amcp-probe`'s configurable `flashLayer`; `tools/soak-runner/src/harness.ts:216-218`
hardcodes `1`), never in production. The reconciler emits nothing of its own — `command-builder.ts`
is the single AMCP construction seam (ADR 0006).

**D-2 — 🔴 THE QUESTION THAT DECIDES D: if two templates sit on one video layer at different
cg-layers, are BOTH rendered, and what does a hole in the upper one reveal?**

> **MEASURED (§9.6a): they cannot sit there. `CG ADD` at cg-layer 1 is ACCEPTED (`202`) and
> REPLACES the page at cg-layer 0 — the first page dies (50/s → 0), `INFO` reports ONE
> `<foreground>` with ONE `html` producer, and BOTH `UPDATE 0` and `UPDATE 1` are then answered by
> the survivor. The cg-layer argument is INERT for the HTML producer.**

⇒ **The hole question is MOOT: there is no upper page and no lower page.** D does not re-enter the
measured crosstalk condition inside a layer — because it cannot get two pages into a layer at all.
That is the strongest possible answer to the question as asked, and it is a refusal of D's premise
rather than of its cost.

⚠ **And it is worth being explicit about the branch that was not closed with pixels.** §9.6d records
that "a background producer is not composited" is CasparCG's defined semantics but was not confirmed
with a frame capture this session. **D loses under both branches**, which is why nothing here waits
on it: if the background is not composited, D can pre-warm exactly one alternative (D-3); if it
WERE, two pages would be on air together and each masks only its OWN backdrop, so a hole in the
upper one would reveal the upper page's own backdrop hole onto the lower page — which is §1's
crosstalk moved inside a single layer, and worse for D still.

**D-3 — if they REPLACE each other instead, is there a gap? YES: ~3 frames — unless the next layout
was announced in advance.**

| Path                                           | Cost, measured                                                  |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `CG ADD` a different template onto the layer   | **118 ms median = 2.95 frames** of empty layer (§9.6b)          |
| `LOADBG [HTML]` the next template, then `PLAY` | **no load gap** — the incoming page is already painting (§9.6c) |
| This design's own cut (§9.3)                   | **0.20 frames**                                                 |

🔴 **`LOADBG` genuinely rescues D's cut — and then exactly one fact takes it away again.**
§9.6d: **a video layer has ONE background slot**, and a second `LOADBG` **destroys** the first
pre-warm (a proven-live page at 51.7/s went to 0/s). With the owner's four layouts, the operator can
switch to **one** pre-announced layout gaplessly and to **any of the other three at ~3 frames of
black**. Nothing can know which the operator will pick — that is what "so the operator cannot make a
mistake" means: any layout, at any moment. A design whose cost depends on guessing the operator's
next action correctly is not a switch.

**What D would have to become to escape this is the owner's original workaround.** N layouts
pre-warmed means N video layers, one template each, stacked — and that is precisely the
configuration §1 measured producing both reported symptoms. D's escape route is the defect this
change exists to remove.

**D-4 — what does D cost §12.1's phase two? The whole of it.** §0.2 already settled this and it is
**cited, not re-derived**: Family 2's crude animated switch _"cannot rearrange — a box travelling
from its 3-box position to its 2-box position is not expressible across two independent pages."_
§9.6a strengthens it from an architectural claim to a mechanical one: the two pages are not merely
independent, they **cannot coexist on the layer at all**, so there is no interval in which a box
could travel between them. ⇒ **Under D, §12.1's phase two would require candidate A to be built
anyway** — the owner has decided on cut-then-animation, so D buys the cut and then needs the other
architecture for the animation. That is the "two implementations of one capability" failure that
closed §0.2, arrived at from a new direction.

**D-5 — where would a "group" live in R-028's declared-rows model, and what breaks?**

A row's identity is ONE template: `stack.load` is `{ itemId, templateId, fields }`
(`packages/shared-ipc/src/channels/stack.ts:31-34`), and a fixed-bank row likewise names a single
`templateId` (`channels/fixedLayers.ts:468`). A group would make `templateId` a LIST plus a current
index, at the root of the row's identity.

`SEARCH:` `git grep -rn "templateId" -- apps/runtime/src tools/caspar-bridge/src packages/shared-ipc/src`
(excluding tests) → **80 references across 38 files**. Three break in ways that are not mechanical:

1. **The layer allocator and the ledger.** `#liveLayers` is keyed by `itemId`, so the row's key
   survives a switch — but the PLATES do not. Plates come from the template, so a group switch
   replaces the whole plate set, and `live-source-multibox` `tasks.md` 6.0's _"A RE-TAKE LANDS ON
   THE SAME LAYERS"_ has nothing to hold onto.
2. 🔴 **Assignment. This is the one that cannot be repaired.** Assignment is keyed
   `(templateId, plateId)` (`channels/sources.ts:321-326`) and `resolvePlateAssignments` filters
   `a.templateId === input.templateId` (`live-plate-assignment.ts:95`). Under D each layout **is** a
   different `templateId`, so **every switch changes the key and the assignment does not survive** —
   §0.3's requirement, and §3's independent code-level proof that Family 2 could not meet it. D is
   Family 2 with a nicer surface, and it inherits the disqualification.
3. **The operator surface.** §12.8's decision is a segmented control showing which layout is live.
   Under D that control's segments are TEMPLATES, so it must show template names in a row whose
   identity is already a template — and `deps.hasLivePlates`
   (`apps/runtime/src/renderer/features/layers/layerRowActions.ts:655`) becomes a per-segment
   question.

**⇒ D IS REFUSED**, on the mechanism (D-1/D-2), on the operator model (D-3), on §12.1's phase two
(D-4), and on assignment survival (D-5.2) — four independent grounds, three of them measured.
**Recorded with respect: it was the cheapest idea on the table and it deserved the plant time it
got.**

---

#### 12.9.3 Candidate A — what the tree already has, and the two things it does not

**Is there ANY precedent for "a set of elements visible together as a state"? The closest thing is
shipped, and it excludes Live Sources by construction.**

| Candidate precedent                              | What it is                                                                                                                                                                                 | Distance from what A needs                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A `sequence` of COMPOSITION items** (D-083)    | 🔴 the tree's ONLY exactly-one-of-N primitive: an ordered list showing ONE item at a time, and an item may be a whole composition (`SequenceCompositionItemSchema`, `elements.ts:559-563`) | **Disqualified, twice.** `flattenElements` descends into `container` and `composition` ONLY (`scene-flatten.ts:264,274`) — never a `sequence` — so a plate inside one **declares nothing and punches nothing, silently**; and stamped scopes are given an EMPTY mask map on purpose (`STAMPED_SCOPE_MASKS`, `scene-builder.ts:131-134`) |
| **`layer.visible`**                              | a whole layer's children hidden together (`scene-builder.ts:192`)                                                                                                                          | A set toggled together — but AUTHORED and static, with no exclusivity and no runtime selection                                                                                                                                                                                                                                          |
| **A composition instance + a `visible` binding** | a named sub-scene, instanced with its own transform; a boolean field toggles it                                                                                                            | **The closest WORKING thing** — and it is what C and the recommendation below are built from                                                                                                                                                                                                                                            |
| **`container`**                                  | a grouping element in the schema                                                                                                                                                           | **Inert** — the runtime renders it via `buildPlaceholder` and DISCARDS its children (`scene-builder.ts:297`)                                                                                                                                                                                                                            |
| **zones**                                        | `data-cg-zone` scoping for countdowns                                                                                                                                                      | Not a visibility concept at all                                                                                                                                                                                                                                                                                                         |

⇒ **There is no precedent for a runtime-selected one-of-N sub-scene that a Live Source can live
inside.** The one-of-N primitive exists, is shipped and is wired to UI — and the flattener's refusal
to walk it is exactly what keeps plates out. A must invent the layout-state concept; it should
**model it on the sequence's item list** (an ordered set with exactly one current) while placing it
where the flattener already walks.

**Per-layout backgrounds in one page — what happens to the hidden ones.**

- **A hidden `<video>` is NOT paused, and nothing in the tree pauses it.** A `visible` binding writes
  `el.style.display` and only that (`packages/template-runtime/src/bindings.ts:180-186`); the video
  driver is driven by the LIFECYCLE, not by visibility (`runtime.ts:1079` starts every
  `scope.videos` entry at play). The authored `visible` field is consulted for hold-driver purposes
  only — _"a hidden video is never a driver"_ (B-034, `runtime.ts:303-305`) — which is about the
  HOLD, not about decoding.
  ⇒ **The MODEL needs no new concept for per-layout backgrounds**, **but
  the RUNTIME does: the layout state must reach the video driver**, or every layout's background
  video decodes for the whole time the row is up. **This needs measuring** — CEF's behaviour for a
  `display: none` media element is not something to assume — and §9.6f shows the frame budget is
  already the tight resource. `tasks.md` 9.3.
- A **static** per-layout background (colour, gradient, image) costs only its own compositing and is
  genuinely free of new machinery.

**What the carrier has to become — and it is smaller than §7 feared.**
`collectLiveSources` emits `rect: flat.rect` (`packages/vcg-format/src/live-sources.ts:88-110`), and
`flat.rect` is _"the element's own box, flattened to SCENE pixels through its full ancestor chain"_
(`scene-flatten.ts:194-195`), composition instances included **with the instance's inner scale**. So
the exporter **already** derives a rect through the ancestor chain; what it lacks is a reason to do
it more than once. Under A it must emit **one rect per layout per plate**, and the declaration block
on `TemplateInfo` must carry them (the shipped `hasNext` precedent — derived once at import, no
`.vcg` format change).

🔴 **One asymmetry found while verifying this, and it lands squarely on `tasks.md` 2.5.**
`collectLiveSources` has **no visibility filter at all** — it declares `el.type === 'video-placeholder'`
and nothing else — while `sceneMaskHoles` **does** filter (`f.element.visible`,
`scene-flatten.ts:354`). ⇒ **Today a hidden plate is DECLARED but does not PUNCH.** Under §12.4's
decision that is nearly the wanted behaviour by accident (held-but-not-visible = seated, not
punching) — but it is currently keyed off the AUTHORED `visible`, not the layout state, so it is a
coincidence rather than a mechanism. Naming it is what stops the next reader from "fixing" the
asymmetry in the wrong direction.

---

#### 12.9.4 Candidate C — better than §0.5's framing suggested, and still strictly more expensive than A

C's advantage is real and was understated: **a plate inside a nested composition instance punches
CORRECTLY, and this session verified it rather than assuming it.** `flattenElements` walks
composition instances and keys each flat element by the instance PATH (`${prefix}${el.id}`, prefix
extended per level, `scene-flatten.ts:250-292`); `scene-builder.ts` extends `maskKeyPrefix` by
exactly the same rule (`:399`) and looks the holes up with it (`:265`). The two compose the same
path from the same parts, so the hole lands in the right element's own box at any nesting depth.
The "no static scene-px rect" warning applies to **stamped** scopes — repeater rows and sequence
items — **not** to composition instances.

**But C, as "each layout is its own composition", is the separate-plate-sets model §0.5 refused**,
and this session found nothing that contradicts §0.5 — so it is **not re-opened**. Two of §0.5's
three grounds are re-confirmed by the reading above: every layout's plates would be **declared**
(`collectLiveSources` has no visibility filter), hence seated; and a box cannot tween from one
element to a different element. C therefore needs the declaration to become layout-aware **anyway**
— A's work — **plus** the overlap check made layout-aware, **plus** an identity story A gets free.

---

#### 12.9.5 The three-way comparison on the things §0.3 and §0.5 already settled

|       | Assignment survives a switch                                                                                   | Plates keep their layers               | Overlap check                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A** | ✅ **free** — one plate element per box, so `(templateId, plateId)` cannot change (§3)                         | ✅ free — same plates, same seats      | must run **per layout** rather than once; the rule is unchanged, only its input                                      |
| **D** | ❌ **impossible** — each layout is a different `templateId`, and the assignment key is `(templateId, plateId)` | ❌ whole plate set replaced per switch | per template, as today — but the sets are unrelated                                                                  |
| **C** | ❌ needs new machinery — N plate elements sharing a `routeKey` is §0.6's duplicate case                        | ⚠ needs new machinery                  | must become layout-aware **and** cross-composition; today the loop is per-document and would not fire across layouts |

**The overlap check does NOT re-open §0.5.** Under A the layouts' plates occupy the same screen area
by construction, and the shipped `live-source-overlap` error
(`apps/designer/src/renderer/state/live-source-preflight.ts:293-315`, `severity: 'error'`) compares
every pair inside one document. What changes is the INPUT — evaluate the same rule once per layout,
over that layout's own rects — not the rule. That is `tasks.md` 3.4 as already written, and it is
why §0.5 stands untouched: §0.5 refused _separate plate sets_, and A has one set.

---

#### 12.9.6 ⭐ THE RECOMMENDATION — **A, with a box authored as a nested composition and per-layout geometry carried on the INSTANCE**

Call it **A′**. It is candidate A's identity model with candidate C's authoring affordance, and every
part of it is a mechanism this session verified rather than proposed:

1. **A BOX is a nested composition** holding its plate and its title (and its frame, its lower-third,
   whatever the design wants). Compositions nest and the guard is shipped
   (`canNestCompositionInActive`, wired at `CompositionsPanel.tsx:54`, `CanvasOverlay.tsx:544,688`).
2. **A LAYOUT positions the box INSTANCES** — one transform per box per layout — and sets which
   non-plate elements (each layout's background, decorations, video) are visible.
3. **The plate keeps ONE identity**, because the composition is instanced once per box, not once per
   layout. `(templateId, plateId)` never changes ⇒ **§0.3 is satisfied for free**, which is the
   whole reason §0.5 chose this model.
4. **The hole follows the box** with no new mask concept: the instance's transform is part of the
   ancestor chain both `flattenElements` and `maskKeyPrefix` compose, so moving the instance moves
   the declared rect AND the punch together (§12.9.4).
5. **The title follows its box** — §3c.1's authoring problem dissolves, because a layout positions
   ONE instance and everything inside travels with it. Sixteen manual placements become four.

**What A′ still costs, stated plainly rather than buried:**

- **The layout-state concept itself** — an ordered set with exactly one current, and ONE authority
  for it (`tasks.md` 5.1), plus the Designer surface to author it (3.3).
- **Per-layout instance geometry.** ⚠ Worth knowing before scoping: `x`, `y` and `scale` are ALREADY
  bindable transform properties in the schema (`packages/shared-schema/src/bindings.ts:40`) — it is
  `width`/`height` that are not, and the one production `transform` constructor hardcodes
  `'opacity'` (`bind-resolver.ts:105`). A per-layout **override table** read by the layout state is
  cleaner than widening bindings, and it does not have to be a binding at all.
- **UNIT B′ regardless** (§6b) — the mask still has to recompute; A′ changes what moves, not whether
  the mask follows.
- **The declaration emitting one rect per layout** (§12.9.3).

**Why not simply A-without-the-composition.** Nothing forbids it, and it is a smaller first step.
But §3c.1's binding problem then has no answer — four layouts × four boxes is sixteen independent
title placements, and the first one that drifts puts a title under the wrong box on air. A′ buys
that for the price of a nesting level the tree already supports.

🔴 **This remains the OPEN gate.** A′ is this design's recommendation with its evidence; it is not a
decision, and `tasks.md` section 3 stays `⟨GATE: §12.9⟩` until the owner answers.
