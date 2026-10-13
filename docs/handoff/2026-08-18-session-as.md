# Session AS — D1–D4 recorded, `tasks.md` made executable, the Designer spec added, and `B-145` implemented

**Read at `7ed8eb976254405710ab661c6749163a528a6ee8`, pulled 2026-08-18** (`git pull --ff-only` →
"Already up to date"; `git ls-remote origin dev` matched local HEAD). **It matched the expected tip
`7ed8eb97`.** `docs/handoff/2026-08-18-session-as.md` was free, so this is `session-as`.

⚠ **The owner's uncommitted `tools/caspar-bridge/src/template-http-server.ts` was not touched, not
staged and not committed.** Every commit staged explicit file paths and `git diff --cached --stat`
was read before each.

**Phases 1–3 are docs-only. Phase 4 is product code**, so the full gate applies — and it ran green
and uncached: **`89 successful, 89 total` / `0 cached, 89 total`**.

---

## 1. The four decisions (phase 1)

### 🔴 D1 — the operator's primitive is a TOGGLE PER SOURCE, and it supersedes what landed at `056ffdd5`

**One toggle per declared source; which toggles are lit IS what is on air; the COUNT is DERIVED.**
The segmented-control-over-counts DESCRIPTION is withdrawn from `design.md` §12.8,
`specs/runtime-multibox-layout/spec.md` and `R-057`. **The decision it implemented is not** —
always-visible, state-carrying, no menu.

**Both verb-grid collisions are kept, and the second is re-sized rather than waved away.** The toggle
set has one element per declared **plate** rather than per authored count, so it is bounded by a
quantity the surface already carries (`deps.hasLivePlates`, the plate list, the AUDIO and SOURCE
dialogs) instead of by an independent authored dimension. Still a variable-width control in a
fixed-px model. **Placement (ii) — a second line outside the verb block — stands and is
strengthened:** a list of same-sized toggles is exactly what a free-flowing line accommodates and
exactly what a fixed-px column grid does not.

### 🔴 The ALL-OFF case (count 0) — decided, in the refusal family

D1 introduces a state the count primitive could not reach. **Count 0 is an ordinary count:** the
authored 0-cell arrangement if there is one (background alone, expressible under A′ because an
arrangement is an ordered list of cell rects and the empty list is valid), else **the same refusal**
as any other absent count.

**Two things in the tree back that rather than an ad-hoc rule, and both were checked:**

1. `resolvePlateAssignments` is deliberately **all-or-nothing** and already distinguishes "declares
   nothing" (`{ ok: true, plates: [] }` — _"a real and common answer"_) from "declares something
   unsatisfied" (refused — _"a designed layout with a hole in it, on air"_),
   `tools/caspar-bridge/src/live-plate-assignment.ts:54-72`. **All-off is the second case**, since
   the template still declares its plates.
2. 🔴 **Reading all-off as "take the row off air" would be a SECOND SPELLING OF STOP** — in a product
   that deliberately inverts STOP and CLEAR relative to the reference product
   (`layerTable.ts:62-73`). It would be the quietest possible route to off-air, reached by unlighting
   the last box under time pressure.

The refusal family stays **ONE family, now three triggers**, re-expressed against toggles.

### D2 / D3 / D4 — §13.6 and §13.7.2 now hold no open question

- **D2** — mode and duration are **per-ARRANGEMENT** (the one being ENTERED). **Per-template is
  refused**: it cannot express the difference between arrangements, and no later change can widen it
  without discarding what was authored. **Per-pair is deferred, not refused**, because
  per-arrangement is a **strict subset** of it — a later item adds a _from_ dimension to entries that
  already exist, so no authored format breaks. The owner's motivating example (_1-box→2-box move but
  3-box→1-box cut_) is recorded beside it as the case that item would serve.
- **D3** — the operator does **not** pick a mode per switch in v1; the escape is an immediate CUT,
  **one action, not a mode picker**, designed WITH the toggle set because they share one surface and
  one collision.
- **D4** — the hide-while-transitioning option lives **beside the element**. 🔴 The constraint §13.7.2
  already stated is now **binding and a task**: it is a THIRD per-element visibility notion, so
  **resolved visibility comes from ONE function** and this flag is its **third input, never a fourth
  boolean read elsewhere**. Called out as the constraint a well-meaning implementation breaches
  without noticing, since a local `if (el.hideDuringTransition)` looks obviously correct in isolation.

---

## 2. `tasks.md` is now a plan (phase 2)

Sections 0 and 0b are untouched — verified byte-identical apart from one trailing blank line prettier
normalised. Everything from section 1 down is replaced, and **section 1 states the order with
`design.md`'s own words beside each stage**: `B-145` → exclusivity → UNIT B′ + carrier → the
reconcile → the operator surface → **THE CUT SHIPS** → the transition modes.

🔴 **Two corrections to the reading that follows section numbering**, both written into the file:

1. **Exclusivity (§12.6) depends on nothing else.** §12.1 says §8's two doors — `take()` and
   `restore()` seating a second multi-box template — _"are a different reachability and are closed by
   §12.6's refusal, **not by this phasing**"_. It is a predicate at two call sites, so it can land the
   day `B-145` does, and it is the cheapest closure of a measured on-air failure mode in the plan.
2. **UNIT B′ and the carrier are ONE stage, not two.** §12.1 says phase one must build both; 4.1
   (resolved visibility) needs no carrier, while 4.2 (current geometry) cannot be written until the
   carrier exists to be read. Sequencing them apart would be wrong in both directions.

Every task names its files (anchors verified), its done-state, and whether it is visually checkable —
including which three actually are.

**Incidental, verified then fixed:** `live-source-multibox/tasks.md` did carry two items numbered
`6.3` (lines 1232 and 1261). The **first** is renumbered `6.2c` — `6.3a`/`6.3b` are children of the
**second** (6.3a says the code _"now DEPENDS on the intersection reading"_, which is the crop-to-fill
item's geometry), and the first is the aspect-resolution work `6.2`/`6.2a`/`6.2b` already group. No
live cross-reference pointed at either number.

---

## 3. The Designer spec (phase 3)

`D-152` had no spec capability. Added **`designer-multibox-arrangements`**, named per this repo's own
convention — the sibling two-halves split in `live-source-multibox` is `designer-live-source` +
`runtime-live-source-routing`, so this change is `runtime-multibox-layout` +
`designer-multibox-arrangements`. Eight requirements with scenarios, covering all nine points asked
for, including that **the Designer must surface the per-arrangement background's measured cost
(−10 % frame budget, 120 ms worst gap) at the point of authoring**, and that the text fit is decided
from the **rendered box after shaping**.

---

## 4. 🔴 `B-145` implemented (phase 4)

### The `INFO` finding — measured, with controls in both directions

Empty channel → no `<stage>` at all. Two producers seated → both listed. **`CLEAR` one → it
disappears from the reply.** `INFO 1-10` answers `201`.

| `INFO <channel>` DOES expose                                                                                | `INFO` does NOT expose                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| every occupied layer number, the producer KIND, that producer's own parameters, `<paused>`, the fg/bg split | 🔴 the **`itemId`** — CasparCG has no concept of our stack items                                                                     |
| …and `MIXER … FILL` / `CLIP` / `VOLUME` read back exactly, so the geometry half IS recoverable              | 🔴 the symbolic **`sourceId`** — only the RESOLVED producer is on the wire, and reverse-mapping through the catalog is not injective |
|                                                                                                             | 🔴 the fill/key **`role`**                                                                                                           |

### The shape chosen: **A + B, the item's named fallback**

`INFO` is insufficient alone, so **persist (A) plus a boot reconcile against the server (B)**. The
file knows the NAMES, the server knows the TRUTH, and **the reconciliation of the two IS the ledger**
— one authority, with the file an input to it rather than a second answer consulted later.

**Three-valued rule:** `occupied` → adopt; `empty` → **drop**; `unknown` → **adopt, marked
unverified**. Dropping an unverifiable record would strand exactly the producer this item exists to
stop stranding — the same failure reached from the other side (R-015, B-101).

### What landed

`live-layers.ts` (schema + `reconcileLiveLayers()`, with `observe` **injected** so the rule is
testable without a server), `live-layers-store.ts` (atomic temp-file + rename), `adoptLiveLayers()` +
a `liveLayersChanged` emitter fired from the ONE write path (the runtime emits, `bridge.ts` writes —
the seam `sourceCatalogChanged` already uses), and the `liveLayersPath` wiring.

⚠ **The store fails SOFT where its siblings fail hard, deliberately.** An empty ledger is exactly the
pre-`B-145` behaviour, so refusing to boot over a malformed bookkeeping file would take the whole
console off air to avoid a degradation it lived with for months. The reason is written at the site,
because the asymmetry is the kind a later reader tidies into consistency.

### 🔴 A stale claim found and corrected

`packages/caspar-client/src/osc/occupancy-tap.ts:31-34` asserted _"`INFO <channel>` returns no
per-layer data on the 2.3+ lineage"_, **citing a live capture on 2.5.0 `69e8ad5` — the exact build
re-measured here, where it is false.** It is the kind of false that costs: it says AMCP cannot answer
a question AMCP answers, and this item's boot adoption is precisely the one-shot occupancy reading
that would have gone without. The tap's own justification (passive, costs no commands) is untouched
and is now what the comment says.

### Tests

Ten in `tools/caspar-bridge/tests/live-layers-restart.test.ts` — one per acceptance line plus the
store's failure modes and the atomic write. **The drop rule is mutation-tested:** making `empty` keep
the record instead of dropping it reddens three; restoring it returns 10/10. Vitest transpiles from
source per run, so no dist could go stale between the two.

---

## 5. What to check

🔴 **The bridge-restart repro is the one thing to open.** Take a row whose template declares Live
Source plates, restart the bridge, and look at the **layer list**: the seated layers must still be
listed and still be controllable (clear / repoint) instead of vanishing while the producers stay lit.

**What I ran, and what I did not.** I drove the repro end to end through the **built `dist`** — the
shipped code — rather than through the SPA:

```
BEFORE RESTART   layers seated: 10, 11, 12
AFTER RESTART    layer list shows: 1-10 (guest-1), 1-12 (guest-3)
                 controllable?    true
DROPPED (server contradicted the file): 1-11 — server-says-empty
```

`1-11` was cleared server-side while the bridge was "down" and is correctly **not** asserted as
seated. ⚠ **I did not run this against a live Runtime SPA + CasparCG**, so the UI half of the repro
is named for the owner rather than claimed as verified.

Nothing else is visual — phases 1–3 are docs.

---

## 6. Flags

- **No Linux `gate:e2e` is owed.** The product change is bridge-side bookkeeping: no UI, no layout,
  no rendering. `apps/runtime` and `apps/designer` are untouched.
- **`R-057` is UNBLOCKED** — its `BLOCKED ON B-145` line now records that the blocker landed. Stage B
  (exclusivity) is the next cheapest thing and depends on nothing.
- ⚠ **`liveLayersPath` is opt-in.** Omitted, the bridge behaves exactly as before (no persistence).
  A deployment that wants `B-145`'s fix must configure the path — worth saying, because the tests
  pass either way and a station that never sets it will still lose the ledger.
- **`CLAUDE.md` still documents the retired worktree/PR model.** It did not get in the way this
  session; the work was branchless on `dev` as instructed.
