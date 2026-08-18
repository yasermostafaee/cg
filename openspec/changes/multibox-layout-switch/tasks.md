# Tasks — the multi-box layout switch

> **STATUS 2026-08-18 — seven of the eight owner gates are ANSWERED, so most of this file is now
> UNBLOCKED.** `design.md` §12 records §12.1, §12.2, §12.4, §12.5, §12.6, §12.7 and §12.8 as DECIDED
> with their reasoning.
>
> - `⟨READY — §x decided⟩` marks a task whose gate is answered. **Ready is not started and not done.**
> - 🔴 `⟨GATE: §12.9⟩` is the ONE remaining block. Everything it holds is the per-layout GEOMETRY and
>   per-layout DESIGN carrier, which §12.9 widened rather than settled.
> - Section 0 is complete; section 0b records the 2026-08-18 recon.

## 0. Recon and design — COMPLETE

- [x] 0.1 Read the tree at `dev` @ `f6c7329` (`git pull --ff-only` first; `HEAD == origin/dev`).
- [x] 0.2 Can a scene carry more than one layout today? **Compositions are the working nesting
      mechanism and a boolean field bound to an instance toggles a sub-tree. `container` exists in
      the schema but nothing constructs one and the runtime DISCARDS its children, so session AC's
      finding holds and is stronger than stated.** (`design.md` §7, §6)
- [x] 0.3 What triggers live-source allocation and release? **Allocation is TAKE-ONLY
      (`#planLiveSeating` → `#seatLiveLayers`, one command before `CG … PLAY 0`); a
      loaded-but-not-playing template holds ZERO live layers; release exists on `stopItem` / `out` /
      `remove` and NOT on disconnect or bridge restart.** (`design.md` §4, §12.7)
- [x] 0.4 Does anything recompute the mask after build? **NO — one production call site inside
      `buildScene`. But it is inline CSS on a live node, not a baked string, and a runtime mask path
      already exists for stamped scopes, so a re-punch is a reassignment rather than a re-export.**
      (`design.md` §6)
- [x] 0.5 Does the bridge re-fit live sources on `CG UPDATE`? **NO — the update path emits exactly
      `CG <ch>-<layer> UPDATE 0 "<json>"`, matching the owner's wire capture. `setSourceAssignments`
      is not even `async`.** (`design.md` §5)
- [x] 0.6 Does R-028's declared-rows model have a mutually exclusive group? **NO — no radio group,
      no single-active row, no solo mode.** (`design.md` §8)
- [x] 0.7 Answer assignment survival from the code. **Keyed `(templateId, plateId)` where `plateId`
      IS the `routeKey`; survives for free under §0.5's model, impossible in Family 2.**
      (`design.md` §3)
- [x] 0.8 State whether the layout switch and the live source change are ONE mechanism. **ONE.**
      (`design.md` §4)
- [x] 0.9 Which control did the owner use, and does R-048's swap cover it? **The row's INSPECTOR,
      which writes the shared TEMPLATE-scoped assignment. R-048's swap is shipped and already does
      the live thing; the defect is a MISSING REFUSAL.** (`design.md` §5)
- [x] 0.10 **DECIDE the plate identity model, from the code.** _A layout is a set of GEOMETRIES and
      VISIBILITIES over the SAME plate set_ — with `live-source-overlap` (shipped, export-blocking)
      and the seat-every-declaration behaviour as the evidence against separate plate sets.
      (`design.md` §0.5, §0.6)
- [x] 0.11 **DECIDE the v1 animation refusal question.** _(a) — the transition is a RUNTIME state
      change; v1's refusal stands untouched_, because the preflight reads authored
      `animation.tracks` and a runtime layout state is not one. (`design.md` §2b)
- [x] 0.12 MEASURE whether `MIXER FILL x y sx sy <duration> <tween>` is accepted on 2.5.0, per name.
      **20 Penner names ACCEPTED including `linear`; `ease` / `ease-in-out` / `cubic-bezier`
      REJECTED `403`. Curves sampled numerically; only `linear` matches CSS exactly (0.0 px).**
      (`design.md` §9.2)
- [x] 0.13 MEASURE what a cut costs the live sources. **6.9–17.9 ms, median 8.16 ms = 0.20 frames at
      25 fps, so the absence of an atomic `COMMIT` costs nothing visible.** (`design.md` §9.3)
- [x] 0.14 (optional) `CG ADD` → first painted frame. **Median 70.2 ms, 33.7–157.3 ms.** Demoted:
      Family 2 is eliminated so it decides nothing. (`design.md` §9.4)
- [x] 0.15 Enumerate whether any path still allows two multi-box templates on air together.
      **YES — `take()` and `restore()`, refused by nothing.** (`design.md` §8)
- [x] 0.16 State whether `live-source-multibox` §9b competes. **It does not, and adopting it later
      would not change this design's cost.** (`design.md` §10b)
- [x] 0.17 File UNIT B′ with its enumeration as this feature's PREREQUISITE. (`design.md` §6b)
- [x] 0.18 Handoff at `docs/handoff/2026-08-17-session-aq.md`, opening with the SHA read.

## 1. Owner decisions — SEVEN ANSWERED 2026-08-18, ONE OPEN

- [x] 1.1 §12.1 — cut first, or one animated release. **ANSWERED: CUT FIRST, animation second** —
      the cut must exist as a first-class option anyway, both phases share the carrier and the mask
      work, and shipping the cut kills both measured crosstalk symptoms sooner. (`design.md` §12.1)
- [x] 1.2 §12.2 — the transition curve. **ANSWERED: `linear` on BOTH sides**, the only provable
      option (0.0 px); a pinned cubic-bezier table is both a 4–10 px separation and a second
      spelling of one rule. A CSS transition omitting its timing function must be forbidden by lint
      or test. (`design.md` §12.2)
- [x] 1.3 §12.4 — the dropped box. **ANSWERED: HELD muted and idle** so switching back is instant
      (the band is 50 layers); **a source kind that cannot be held falls back to teardown as a NAMED
      behaviour, never a surprise.** The DeckLink question becomes an implementation input rather
      than a blocking gate. (`design.md` §12.4)
- [x] 1.4 §12.5 — the Inspector's assignment edit while a row is on air. **ANSWERED: SURFACE ONLY** —
      the edit saves, the surface says "takes effect at the next take" and names the live path (the
      row's SOURCE swap). Refusing or confirming is friction without capability. Decided together
      with §5's override-blindness. (`design.md` §12.5)
- [x] 1.5 §12.6 — two multi-box templates on air together. **ANSWERED: REFUSE**, in `take()` AND
      `restore()`, through ONE predicate CALLED from both. (`design.md` §12.6)
- [x] 1.6 §12.7 — the un-persisted live-layer ledger. **ANSWERED: it must survive a bridge restart**
      — after a restart the seated layers still appear in the list and are controllable, by
      persistence or by reconciling against the server's `INFO` at boot. **Filed as a SEPARATE item
      that must land BEFORE the switch ships** (1.11). (`design.md` §12.7)
- [x] 1.7 §12.8 — where the switch control lives. **ANSWERED: an always-visible SEGMENTED CONTROL on
      the row** showing which layout is live; a menu is disqualified because it hides the current
      state. 🔴 Re-opens the six-column verb grid — see §12.8's two collisions. (`design.md` §12.8)
- [ ] 1.8 Answer §12.9 — **how per-layout GEOMETRY and per-layout DESIGN are authored.** The largest
      piece, with no precedent in the tree. **WIDENED 2026-08-18**, not settled: candidate B is
      withdrawn by the owner and candidate D added. `design.md` §12.9 carries the real candidate set
      and this design's recommendation. ⟨GATE: §12.9⟩
- [ ] 1.9 ⟨MINT⟩ a bug item for the Inspector's silent no-op assignment edit and its
      override-blindness, filed in `docs/prd/bugs-runtime.md` (a Runtime-app defect, not
      cross-cutting). **Next free `B-` is reported in `design.md` §12.7; no number is minted in this
      change.** ⟨READY — §12.5 decided⟩
- [ ] 1.10 ⟨MINT⟩ a PRD item for this feature itself — none was minted here. ⟨READY — §12.1 decided⟩
- [ ] 1.11 ⟨MINT⟩ **the live-layer ledger item**, per §12.7 — the ledger survives a bridge restart.
      Next free `B-` reported in `design.md` §12.7; recommended home `docs/prd/bugs-runtime.md`.
      **No number is minted in this change.** ⟨READY — §12.7 decided⟩

## 2. UNIT B′ — the mask mutator enumeration (PREREQUISITE, not cleanup)

- [ ] 2.1 Give `sceneMaskHoles` **resolved** visibility instead of the scene's authored `visible`
      (`packages/shared-schema/src/scene-flatten.ts:352-354`). ⟨READY — §12.1 decided⟩
- [ ] 2.2 Give it **current** geometry, so a moved plate takes its hole with it. ⟨GATE: §12.9⟩
- [ ] 2.3 A re-punch pass after `update()` in `@cg/template-runtime`, reassigning the mask
      properties on the existing nodes. ⟨READY — §12.1 decided⟩
- [ ] 2.4 Cover every mutator in `design.md` §6b's table with a test: take, teardown, position
      override, resize, lifecycle range, retention restore, z-order reorder, layout switch, a
      `visible` binding, a `transform` binding. ⟨READY — §12.1 decided⟩
- [ ] 2.5 Answer AO's two inherited questions deliberately: whether an **invisible ancestor**
      suppresses a punch, and whether a hidden plate is **declared while hidden**. Under §0.5 a
      hidden plate must stop punching AND stop being seated. ⟨READY — §12.4 decided⟩
- [ ] 2.6 Refuse a Live Source plate inside a `sequence` — `flattenElements` never descends into
      one, so such a plate declares nothing and punches nothing, silently. ⟨GATE: §12.9⟩

## 3. Per-layout geometry — the carrier and the authoring surface

- [ ] 3.1 Per-layout geometry on the element, in `@cg/shared-schema`. ⟨GATE: §12.9⟩
- [ ] 3.2 `collectLiveSources` emits per-layout rects onto the declaration block, following
      `live-source-multibox` §1's carrier (derived once at import, the `hasNext` precedent). No
      `.vcg` format change. ⟨GATE: §12.9⟩
- [ ] 3.3 The Designer surface for authoring it. ⟨GATE: §12.9⟩
- [ ] 3.4 Preflight: exactly one layout active at author time; **the overlap check applies WITHIN a
      layout, not across layouts** — today it is per-document and would not fire across them.
      ⟨GATE: §12.9⟩

## 4. The one mechanism — reconcile a running row's live plates

- [ ] 4.1 `reconcileLivePlates(itemId, desired)` in `tools/caspar-bridge/src/caspar-runtime.ts`:
      seat / re-fit / release as a DELTA against `#liveLayers`, reusing `resolvePlateAssignments` as
      the ONE resolver. ⟨READY — §12.1 decided⟩
- [ ] 4.2 Route the take's `#seatLiveLayers` through it, preserving the all-or-nothing rollback and
      the "record before the send is awaited" rule. ⟨READY — §12.1 decided⟩
- [ ] 4.3 Make `swapLiveSource` a CALLER of it. 🔴 **Do not build a second mechanism beside R-048's
      swap.** ⟨READY — §12.1 decided⟩
- [ ] 4.4 Re-derive the fit **per layout** — a 1-box layout changes each box's aspect, and because
      `MIXER FILL` survives a producer swap, getting this wrong is a wrong crop rather than an
      obvious break. ⟨READY — §12.1 decided⟩
- [ ] 4.5 Implement the release policy for a plate with no box in the target layout. ⟨READY — §12.4 decided⟩
- [ ] 4.6 A test per inverse in `design.md` §4's audit table. ⟨READY — §12.1 decided⟩
- [ ] 4.7 🔴 **The switch does not ship until 1.11's ledger item has landed** — §12.7's decision is
      "separate item, BEFORE the switch". The switch seats and releases plates continuously rather
      than once per take, so a stranded producer under this feature is a live face on air that no
      code path can reach. ⟨READY — §12.7 decided⟩

## 5. Exclusivity

- [ ] 5.1 ONE authority for the layout state, read by the switch, the mask and the reconcile.
      ⟨GATE: §12.9⟩
- [ ] 5.2 (If §12.6 is A) one canonical predicate refusing a second multi-box template, enforced in
      BOTH `take()` and `restore()`/`#decidePendingRestores` — restore never passes through
      `take()`. ⟨READY — §12.6 decided⟩

## 6. The operator surface

- [ ] 6.1 The layout switch control, showing which layout is active. ⟨READY — §12.8 decided⟩
- [ ] 6.2 The Inspector's on-air behaviour for an assignment edit, per §12.5. ⟨READY — §12.5 decided⟩
- [ ] 6.3 Make an active `sourceOverride` VISIBLE outside the swap dialog — today it appears nowhere
      else, so the Inspector confidently shows a source that is not on air. ⟨READY — §12.5 decided⟩

## 7. The transition

- [ ] 7.1 Implement the chosen curve on both sides, per §12.2. ⟨READY — §12.2 decided⟩
- [ ] 7.2 A contract test computing the MAX DEVIATION between the page's curve and the server's
      tween, in pixels on the target raster — asserting the CLAIM, not the presence of a name.
      ⟨READY — §12.2 decided⟩
- [ ] 7.3 Forbid a CSS transition that omits its timing function: the default `ease` is 580–835 px
      from every CasparCG tween. ⟨READY — §12.2 decided⟩
- [ ] 7.4 **KEEP the v1 `live-source-animated` refusal** and pin with a test that a runtime layout
      change does NOT trip it, while an authored keyframe still does. (Replaces the earlier "relax
      the refusal" item, withdrawn by `design.md` §2b.) ⟨READY — §12.1 decided⟩

## 8. Still owed — measurements

- [ ] 8.1 The VISUAL seam of a cut. §9.3 bounds it command-side at 0.20 frames; confirming what
      reaches SDI needs a channel-side capture, and `PRINT` writes to the plant's own disk.
      ⟨READY — §12.3 decided⟩
- [ ] 8.2 Whether a 1-box layout LETTERBOXES — the plant trace shows `FILL` ≡ `CLIP` for a 1280×536
      `AMB.mkv`, i.e. crop-to-fill is not being applied. ⟨READY — §12.1 decided⟩
