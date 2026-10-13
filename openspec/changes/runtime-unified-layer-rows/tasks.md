# Tasks — one layer surface (R-028)

**Implementation started 2026-07-29 (fast-mode session `dev-r028-a`, part A of three: config +
the bridge-owned template store). Sections 4–9 are parts B/C. See `DEBT.md` in this change dir
for what part A deliberately skipped or found un-runnable.**

## 0. BLOCKING owner calls (design.md OPEN CALLS) — ANSWERED (owner, 2026-07-29)

- [x] 0.1 **(o1) Where template files live** — DECIDED: **the BRIDGE owns the templates,
      persisted to disk** (design.md §h route 1, the recommendation, adopted). Every browser
      that connects sees the same library, and a bridge restart does not empty it.
      Implemented in part A: `TemplateRegistry` persists one JSON file per template under
      `--templates-dir` (default `~/.cg-runtime/bridge-templates`), hydrated at boot;
      `templates.changed` publishes the full catalogue to every browser on import/removal;
      `templates.list/get` are bridge-served while live (browser-local `LibraryStore` remains
      the offline fallback + reconnect re-delivery source).
- [x] 0.2 **(o2) The `CG NEXT` wire gap IS in scope** — DECIDED: yes. Part A adds the NEXT
      verb to `command-builder.ts` (`CG <ch>-<layer> NEXT 0`) so the capability the template
      already implements stops being designed out; the channel/UI wiring lands in part B with
      the rest of the verbs (5.1/5.4).

## 1. Prerequisites that must land FIRST

- [x] 1.1 **R-021 stage 4 task 3.1 — LANDED 2026-08-14 (`e326a962`), so this section is
      unblocked.** `#slotForRestore` now BRANCHES on `isFixed`: a declared row is bound
      exactly (`bindFixed`) or the item is SKIPPED (`fixed-slot-taken`), and `#allocate()` is
      unreachable for one. Verified against the code and pinned by
      `tools/caspar-bridge/tests/fixed-restore-branch.integration.test.ts` (design §d tests
      1–5 + 8), which was checked FAILING before the fix. Original text: **R-021 stage 4 task
      3.1** (`#slotForRestore`: a declared row NEVER falls through to
      `#allocate()`). Under this model every item is on a declared row, so the fall-through would
      misplace EVERY item after a bridge restart, not an edge case (design.md §l). Blocking.
- [x] 1.2 **C-015 `reservedLayers` wired to real config** — the playout split's only mechanism.
      DONE (part A): `ReservedLayersSchema` in `@cg/shared-ipc`; `reserved-layers-store.ts`
      loads it (`--reserved-layers 60-69` flag or `bridge-reserved-layers.json`;
      present-but-unusable = HARD boot failure); the SAME resolved list reaches the boot
      validator, every live `setFixedLayers` validation, AND the `LayerManager` — which now
      fences reserved layer numbers from `allocate()` and `reserve()` so no automatic path
      can put our graphic on a playout layer.
- [ ] 1.3 RECON: **does CasparCG 2.3.2 expose template identity** beyond producer kind (OSC tree
      and the `INFO` family)? `tools/caspar-amcp-probe` against real hardware, never reasoned
      from our own code (design.md §j). Blocks only the foreign-row wording (5.3).
      **UNRUN — no hardware in the part-A session, and NO LONGER LOAD-BEARING for row
      identity: with 0.1 answered, per-row identity comes from the bridge's own records +
      persisted registry, never from what CasparCG reports. See `DEBT.md`.**

## 2. Config — the fixed ceiling and per-layer visibility — DONE (part A, 2026-07-29)

- [x] 2.1 Config shape: a FIXED ceiling of candidate layers (never grows/shrinks at runtime),
      each with a visibility tick and an optional alias. Replaces R-021's mutable `count` and the
      grow/shrink/renumber rules it required. DONE: `FixedLayerBankSchema` gains
      `visibility` (per-layer, absent = visible — canonical predicate `isLayerVisible`);
      `validateFixedBankChange` refuses ANY count change (`resize-refused`); the config
      modal shows channel/start/count as read-only facts and edits ticks + aliases only.
- [x] 2.2 Fence the WHOLE ceiling from automatic allocation regardless of tick — visibility and
      fencing are separate (design.md §b4). DONE structurally: fencing derives from
      `start`/`count` (every validated slot goes to the LayerManager as fixed), never from
      the `visibility` record; the panel filter is the ONLY reader of the tick. Tested.
- [x] 2.3 Untick refused when the row is occupied AND when occupancy is UNKNOWN (fail closed).
      DONE: `untick-occupied` / `untick-unknown` (distinct codes + messages naming the
      layer); occupancy composed from the bridge's own records FIRST, then the OSC tap with
      the same hearing predicate the per-slot state publishes from (`#fixedSlotOccupancy`).
- [x] 2.4 Remove-template-from-config carries the row's own confirm gate, and the dialog states
      explicitly when the item is ON AIR (removal implies clear). DONE: the config modal's
      per-row "Remove…" → `useConfirm` dialog naming the template, stating ON AIR + "CLEARS
      layer N" when the stack says playing/on-air → `stack.remove` (whose CLEAR is the
      existing behaviour).
- [x] 2.5 Validation: candidate ceiling ∩ reserved playout range refused at load AND at change,
      error naming both ranges (extends the existing `validateFixedBank` checks). DONE — the
      boot path throws before the WebSocket binds; the change path re-runs the same check
      with the same resolved list; the message names the ceiling range AND the reserved
      range(s) AND the intersecting layers.
- [x] 2.6 Unit tests for 2.1–2.5, message CONTENT asserted (both ranges named; the occupied /
      unknown refusals distinguishable). DONE: `fixed-layers-store.test.ts` (message-content
      asserts per refusal), `fixed-layers-wire.integration.test.ts` S5/S10 (live resize
      refusal; fail-closed untick against REAL occupancy over the wire),
      `template-persistence.integration.test.ts` (boot refusal naming both ranges),
      `layer-manager.test.ts` (reserved fencing), `fixedBankConfigModal.dom.test.ts`
      (renderer half incl. the 2.4 gate).

## 3. Template identity across browsers (shape per 0.1) — DONE (part A, 2026-07-29)

- [x] 3.1 The bridge reports, per row, WHICH template is on it — the same answer to every browser
      (design.md §b2). DONE: `FixedSlotState.binding` gains optional `templateId` +
      `templateName`, resolved bridge-side (item → reconciler `templateId` → own registry);
      published state, so every browser reads the same answer; the row and the config modal
      display the name.
- [x] 3.2 The bridge's `TemplateRegistry` gains persistence + a catalogue channel every browser
      reads (0.1's route 1). DONE: one JSON file per template (atomic tmp+rename), hydrated
      at boot before the WS binds; corrupt entries warned + skipped, never fatal;
      `templates.changed` publish carries the full catalogue; `templates.list/get`
      bridge-served while live. The RESTART path is tested explicitly
      (`template-persistence.integration.test.ts`, `template-registry.test.ts`).
- [x] 3.3 Row state after a BRIDGE restart reports template identity as unknown honestly, rather
      than guessing (§b2's only carve-out). DONE + tested: after a restart with the producer
      still on air and the registry fully persisted, `binding` is `null` (the observed
      producer kind is all the row claims) — identity is never inferred from what happens to
      be on disk.

## 4. The row surface — DONE (part B, 2026-07-29)

- [x] 4.1 ONE row list replacing the Stack and Library panels; DESCENDING layer order. DONE:
      `features/layers/LayersPanel.tsx`; `LibraryPanel`, `StackPanel`, `StackRow`,
      `FixedLayersPanel`, `FixedRow` and `fixedRowActions` DELETED; the 240px library grid
      column removed from `layout.ts`.
- [x] 4.2 Row content: alias · REAL layer number (always) · template name · description · state
      indicator. DONE (`LayerRow.tsx`): layer number + alias in their own cell, `StatusBadge`
      (carrying R-006's SIM treatment and B-087's link-down mask), the resolved template label,
      and the honest occupancy line. An empty row says "Empty — load a template".
- [x] 4.3 ONE Load button running the whole chain — reuses #419's shipped
      `importVcgFile` → `fixedLayers.load` → `bindFixed` path. DONE, unchanged and promoted to
      the primary path; the already-imported variant is menu-placed beside it.
- [x] 4.4 Keep the Inspector, driven by row selection. DONE — the row's body click reports the
      bound item id up to `App`, exactly as the stack row did; the Inspector is untouched.
- [x] 4.5 Settings: the candidate-layer table. DONE via the existing bank config modal
      (per-layer visibility tick + alias, ceiling read-only), reached from the Layers header.

## 5. Verbs — DONE (part B, 2026-07-29), with 5.3 REVERSED by owner decision

- [x] 5.1 Verb set LOAD · PLAY · NEXT · UPDATE · STOP · CLEAR · REMOVE with OUR C-012 semantics.
      DONE (`layerRowActions.ts`) — STOP stays the graceful exit and CLEAR the hard kill; the
      reference product's inverted vocabulary is not adopted.
- [x] 5.2 `RowAction` gains a PLACEMENT hint (`surface?: 'button' | 'menu'`, default button) and
      `buttonActions()` is the ONE reader of it; `toMenuItems` still receives the whole list. No
      second array. UPDATE, REMOVE and LOAD-FROM-LIBRARY are menu-placed.
- [x] 5.3 **REVERSED — see R-032.** The owner decided that declared playout layers SHOULD be
      clearable from a deliberate surface. The main Layers list still offers playout rows no
      verbs; a separate PLAYOUT TAB lists them with a yellow tab indicator and clears them,
      individually and all at once, gated: html-only, unknown-never-empty, confirm-gated
      clear-all, and part A's automatic-path exclusions (orphan sweep, `layers.clear`) UNCHANGED.
      Foreign-row wording: task 1.3's recon was RUN this session (see `DEBT.md`) — producer kind
      IS legible for layers we did not create, so the tab names the observed kind.
- [x] 5.4 `hasNext` derived at IMPORT via `produceTemplateDelivery`, by the new canonical
      `hasNextStep` predicate in `@cg/shared-schema` (the Designer's duplicate now delegates to
      it). It rides `TemplateInfo` rather than a browser-local store — so it is persisted with
      the bridge registry and identical in every browser — and NEXT is withheld entirely without
      it. `stack.next` channel → `nextItem` → `CG … NEXT`, wire-tested.
- [x] 5.5 DOM tests: `layerRow.dom.test.ts` (19) asserts the verb split per row state and
      COMPARES the button surface against the menu surface (menu is a superset; every menu item
      disabled exactly when its declaration is; link-down disables both);
      `playoutPanel.dom.test.ts` (13) covers the tab's three occupant cases (html · non-html ·
      unknown) plus empty, the gated clear-all, and the pure gate without a DOM.

## 6. Retiring the dynamic path (design.md §k — each piece keeps its recorded reason)

- [x] 6.1 **DONE 2026-08-14 — and it is TWO tests on purpose, because the claim has two
      halves and either alone is misleading.**
      `apps/runtime/tests/noOperatorAllocation.test.ts` asserts the OPERATOR half by SOURCE
      SCAN: no renderer module reaches `stack.load` (the one bridge verb that allocates), and
      — the guard on the guard — the exact-slot row load is still present, so the absence
      cannot be satisfied by deleting the feature instead of redirecting it. A source scan
      rather than a behavioural test because the claim is about what EXISTS: a behavioural
      test can only say "this button did not allocate", never "no button can".
      `packages/caspar-client/tests/layer-manager.test.ts` asserts the PERMITTED half in the
      same breath: a declared, non-operator caller still allocates across the freed 10–59
      span, and the two fences above it (reserved 60–69, bank 70+) still hold. That is the
      half this task was rewritten to protect — written as "no caller at all", 6.1 would have
      been a silently correct-looking fixture forbidding C-015's third ownership class.
      Original text: **REWRITTEN 2026-08-08** (`live-source-multibox` §7.2 — see 6.5 below).
      `LayerManager.allocate()` keeps existing but MUST have no caller that puts an **operator
      graphic** on air. Assert that in a test, rather than deleting code other items may need.
      ⚠ **The test asserts the absence of an OPERATOR-graphic caller, NOT the absence of every
      caller.** A **declared, non-operator** allocation is PERMITTED and the test must be written so
      it passes — C-015's Live Source layers are exactly that: allocated by the bridge, on a declared
      range, recorded in a bridge-owned ledger, and never an operator's graphic. Written as "no
      caller at all", this test is a **silently correct-looking** fixture that forbids the third
      ownership class, and nothing in review would flag it.
- [x] 6.2 **DONE 2026-08-14.** The sweep now reads the ONE class list (`#declaredLayerClass`,
      6.5) instead of two hand-written membership tests, and behaviour is unchanged.
      ✅ **THE THREE DOOR TESTS WERE RUN AND ARE GREEN, BY NAME**, not merely "the suite
      passed": DOOR 1 ("a ledgered Live Source layer is never an orphan — its unledgered
      NEIGHBOUR still is") · DOOR 1 boundary ("releasing the ledger hands the layer BACK to
      the sweep") · DOOR 2 · DOOR 2 ordering · DOOR 3 · DOOR 3 boundary · the ledger/slot-map
      separation. None was rewritten; the `for (const key of this.#liveLayerKeys()) owned.add(key)`
      line is untouched.
      ⚠ **ONE DIVERGENCE FROM THIS TASK'S WORDING, STATED RATHER THAN CODED AROUND.** "Candidates
      become layers nobody declared" would exclude the OPERATOR BANK too, and that is wrong:
      DECLARED and OWNED are different facts. A row declares the layer is the operator's to
      USE; it says nothing about what is on it. A bank layer carrying an item WE bound is
      already owned via `#slots`, so what remains is exactly "a producer on the operator's own
      layer that we did not put there" — an orphan by the definition, and since an unbound row
      now reads EMPTY unconditionally, excluding it here would report it NOWHERE. That
      reversal was already made deliberately (the sweep's own note) and is preserved, not
      re-litigated. New coverage:
      `tools/caspar-bridge/tests/declared-layer-classes.integration.test.ts` — all three
      classes declared at once, three different correct answers from ONE tick, with an
      undeclared layer as the control so the assertions cannot pass on a dead sweep.
      Original text: R-009 orphan sweep NARROWED, still running: candidates become layers nobody declared —
      **against all THREE declared classes** (6.5), not two. Requires 1.2 first — otherwise it flags
      healthy playout graphics as orphans (§i) — and requires 6.5, or it flags live guest boxes as
      orphans, which is an operator being invited to clear a face off air.

      🔴 **STOP — THE THIRD CLASS IS ALREADY IMPLEMENTED, AND A TEST IS WATCHING THIS TASK.**
      `live-source-multibox` **phase 5 LANDED on 2026-08-12** (`95ef840c`), ahead of this section
      and with the owner's confirmation. So this is no longer a narrowing you get to design from a
      clean sheet: the sweep you are about to rewrite **already excludes** bridge-owned Live Source
      layers, at `caspar-runtime.ts`'s `owned` set —
      `for (const key of this.#liveLayerKeys()) owned.add(key);` — and that line is load-bearing.

      **THE CONDITION ON THIS TASK: your rewrite must keep these tests PASSING. Do not rewrite them
      to fit a new sweep.** They live in
      `tools/caspar-bridge/tests/live-source-ownership.integration.test.ts`:
      - **DOOR 1** — "a ledgered Live Source layer is never an orphan — its unledgered NEIGHBOUR
        still is", and its boundary case "releasing the ledger hands the layer BACK to the sweep".
        **These two are specifically YOURS**: they are the sweep's tests, and they fail the moment
        a rewrite drops the third class.
      - **DOOR 2** (the C-014 quarantine) and **DOOR 3** (`clearLayer`'s `live-source` refusal) —
        the other two doors phase 5 wired, listed so a change here that touches them is recognised
        as touching them.

      **Why the test and not just this note.** Each door test was verified to fail without its own
      line, so a two-class rewrite does not produce a quietly-passing suite — it produces a red one
      naming the door it broke. That is the whole reason phase 5 was allowed to land first: an
      ordering only protects you if you remember it, and a failing test protects you whether you
      remember or not. **If one of these goes red, the sweep is wrong — not the test.**

- [x] 6.3 **DONE 2026-08-14.** Asserted by REASON and not merely by refusal — all of these
      are refused, so a test checking only `ok: false` would pass with every reason scrambled,
      and the reason is the whole operator-facing content (`foreign` means "provably not
      ours", which is a false statement about a layer the bridge seated a producer on).
      `declared-layer-classes.integration.test.ts` walks all four cases in one boot:
      `live-source` · `reserved` · an undeclared layer refused `foreign` (R-015 unchanged) ·
      an unbound bank layer, also `foreign` through `layers.clear` — b1 widened the operator's
      own bank-scoped door (`clearBankLayer`) and never loosened this one, which R-021 stage
      4's `clear-bank-scoped` boundary test pins from the other side.
      Original text: R-015's foreign refusal unchanged outside declared ranges; regression-test the boundary.
      **The Live Source range is INSIDE a declared range under 6.5**, so the refusal does not reach
      it — and it is refused there for a different, distinct reason (`live-source`), never as
      `foreign`. See `live-source-multibox` design.md §4 (C5): granting C-015's exemption as
      originally worded would have made those layers operator-CLEARABLE, inverting the protection.
- [x] 6.4 **DONE 2026-08-14** — recorded in BOTH places the misreading could happen, and made
      executable. Beside `DEFAULT_LAYER_POLICY` (`layer-manager.ts`): the ranges are
      descriptive, `allocate()` is NOT deprecated (deleting the map to "finish" 6.1 would break
      the third ownership class while looking like tidying), and the freed residue is 10–59.
      Beside `TemplateTypeSchema` (`scene.ts`): the type is descriptive metadata that travels
      in every `.vcg` and does NOT go with its range — `logo-bug` is the one to watch, since
      its range already moved 90–99 → 40–49. Pinned by a test asserting the key still exists
      with that range, and by the fence test proving 10–59 is the residue.
      Original text: `LayerPolicy` ranges become DESCRIPTIVE. Record that `logo-bug` remains a `templateType`
      in the scene schema (`scene.ts:123`) even when its 90–99 RANGE is freed — the type does not
      go with the range (§c).
      ✅ **CONFIRMED 2026-08-08 that this frees 10–59** — `live-source-multibox` §7.3, and checked
      against the CODE rather than against §c's prose. `DEFAULT_LAYER_POLICY`
      (`packages/caspar-client/src/layers/layer-manager.ts:49-56`) is today `lower-third` 10–19 ·
      `ticker` 20–29 · `breaking-news` 30–39 · `logo-bug` 40–49 · `fullscreen` 50–59 · `custom`
      60–69. Making these descriptive releases **10–69**; `custom`'s 60–69 is the reserved playout
      range, which stays fenced by `reservedLayers`. **The residue is exactly 10–59** — fifty layers,
      directly below the 70–99 operator bank, which is the range C-015 needs (sources must sit BELOW
      the template's layer). Note `logo-bug` has since MOVED from 90–99 to 40–49, inside the freed
      span, so §c's "90–99" wording is about the bank and this confirmation does not rest on it.
- [x] 6.5 **DONE 2026-08-14 — the three classes now have ONE SPELLING, and it returns a CLASS,
      not a boolean.** `CasparRuntime#declaredLayerClass(channel, layer)` →
      `'playout' | 'live-source' | 'operator-row' | null`, each arm DELEGATING to that class's
      existing single source (`#reservedSet` · `#liveLayerKeys` · `LayerManager.isFixed`) and
      re-deriving none of them. The danger this task named was never that a class was
      implemented wrongly — each had one source already — it was that **nothing enumerated the
      LIST**, so a narrowing could be written against two of three and look correct. The list
      is now load-bearing: the sweep reads it.
      🔴 **RETURNING A BOOLEAN WOULD HAVE BEEN THE BUG.** The three classes make three
      DIFFERENT claims and get three different answers (see 6.2's divergence note); an
      `isDeclared()` would have collapsed them into the strongest one and silently excluded the
      operator bank from the sweep. Original text: 🔴 **AMEND SECTION 6 TO A THREE-CLASS
      DECLARED MODEL — BEFORE 6.1–6.3 ARE
      IMPLEMENTED.** Added 2026-08-08 as `live-source-multibox`'s cross-change obligation (§7.1
      there; the full argument is that change's design.md §4). Section 6 as originally written
      cements a **TWO**-class model — fixed operator rows and the reserved playout range — with no
      room for a **bridge-owned non-html layer**. The declared classes are **three**: 1. **fixed operator rows** (the candidate bank, 70–99) — declared config, today; 2. **the reserved playout range** (60–69) — declared config, wired by 1.2; 3. **bridge-owned Live Source layers** (10–59, freed by 6.4) — declared config PLUS a
      bridge-owned ledger (`#liveLayers`), which is what makes them ownable at all.
      **Why this order, and why the reverse does not work.** Section 6 is a NARROWING: it removes
      candidates from a sweep and asserts an ABSENCE in a test. A narrowing written against an
      incomplete class list is not a bug that shows up in review — it is a silently correct-looking
      test that forbids the third class. Landing Live Sources first instead would leave a window in
      which R-009's sweep flags live guest boxes as orphans. The doctrine being extended is R-028's
      OWN — **"Declared, never detected"** (design.md §i): OSC carries producer KIND, not identity,
      so a bridge-owned non-html layer is the same problem one step further out and gets the same
      answer. This adds a third member to an existing set; it invents no mechanism.
      ⚠ **The third class is NOT `reservedLayers`** — that is a fence AWAY from a foreign owner, the
      exact inverse of a record of layers we own. A Live Source placed there would be unplaceable
      (`layer-manager.ts:210`), unreservable (`:246`) and unclearable
      (`caspar-runtime.ts:2679-2681`) through every existing door. 1.2's `[x]` tags calling
      `reservedLayers` "the C-015 Live Source seam" are misleading and are corrected by
      `live-source-multibox` phase 2.6; 1.2 satisfied C-015's **disjointness** half and none of its
      **ownership** half.

      ⭐ **SUPERSEDED IN PART, 2026-08-12 — the third class is no longer a thing to REMEMBER, it is
      a thing that EXISTS.** This task's premise was that section 6 must be amended *before* Live
      Sources are built, so the narrowing would be written against a complete class list.
      `live-source-multibox` **phase 5 landed first instead** (`95ef840c`), with the owner's
      confirmation — the argument is in that change's design.md §4 under the 2026-08-12 amendment.

      What that changes for this task: the ledger (`#liveLayers`), the R-009 sweep exclusion, the
      C-014 quarantine skip and `clearLayer`'s distinct `live-source` refusal are **already in the
      code**. So 6.5 is no longer "amend the plan so nobody forgets the third class" — the third
      class is present and pinned, and this task's remaining job is to make sure section 6's
      implementation **preserves** it.

      **The teeth are in 6.2** — its three door tests must stay passing rather than be rewritten.
      That is the whole condition the owner attached to letting phase 5 land early, and it is
      recorded at 6.2 because that is the task whose rewrite can break it.

## 7. Migration

- [x] 7.1 **DONE 2026-08-14** — asserted as a BEHAVIOUR rather than trusted to the absence of
      migration code (`declared-layer-classes.integration.test.ts`): with all three classes
      declared, an item retained on an old dynamic layer restores onto THAT layer and no
      declared row acquires it. Both halves matter — a relocation is a CLEAR on the old layer
      plus a fresh `CG ADD` on the new one, so a live graphic would blink off and back at
      whatever moment the bridge happened to restart, with nobody watching; and a row that
      silently gained an item the operator never put there is the same lie from the other
      direction. R-021 stage 4's restored exact-slot `reserve()` is what makes the first half
      true rather than accidental.
- [x] 7.2 **DONE 2026-08-14** — "Upgrading from the old dynamic stack" in
      `docs/operator-guide/README.md`: nothing is moved for you and why, the three steps at a
      safe moment (play out or CLEAR → REMOVE → LOAD onto the row, with an alias), and that
      there is no deadline. Two adjacent falsehoods the same section was still carrying were
      fixed in passing rather than left beside a new note: the bridge-restart warning ("an
      item can come back on an ordinary stack layer") — retired by R-021 stage 4 and replaced
      with what now happens, including the BLOCKED row and its two exits — and "the slot count
      can GROW", which part A's `resize-refused` made false.
      ⚠ **STILL OWED under 8.1:** the section describes a "FIXED LAYERS panel above the stack",
      and part B deleted that panel in favour of the one Layers list. That is a wider rewrite
      of the guide's structure and belongs to the doc-sync task, not to a migration note.

## 8. Docs + PRD

- [ ] 8.1 Engine doc-sync where contracts changed.
- [ ] 8.2 `docs/prd/runtime.md` R-028 → `[~]` with an honest status note (on-air behaviour
      throughout; hardware verification owed).
- [ ] 8.3 Cross-refs: R-021 (plumbing + stage 4), R-023 (per-row shortcuts bind to 5.2's
      declaration point), R-024/C-002 (rundowns/presets reference rows), C-015 — **BOTH halves,
      extended 2026-08-08** (`live-source-multibox` §7.4): (a) `reservedLayers`, the playout fence
      1.2 wired, and (b) the **OWNERSHIP CLASS** — C-015's bridge-owned Live Source layers are the
      THIRD declared class 6.5 adds, on 10–59 freed by 6.4, recorded in a bridge-owned ledger rather
      than inferred from producer kind. Naming only (a) is what let 1.2 read as "C-015 is handled"
      while the ownership half was untouched.

## 9. Gate

- [ ] 9.1 `pnpm openspec validate runtime-unified-layer-rows --strict`.
- [ ] 9.2 Full green gate (uncached) + `gate:e2e`; Linux `gate:e2e` debt recorded honestly
      (see [B-078] — the local E2E gate is a known flake surface).
      **STILL OPEN as a whole** — §8 and §9.3 are not done, so this box stays unticked.
      ✅ **But the §6/§7 slice's Linux `e2e` IS discharged** — https://github.com/yasermostafaee/cg/actions/runs/31760214543
      (run 31760214543, `dev` HEAD `6ee4c5d4`, which contains `25c21420`):
      `conclusion: success`, `status: completed`, and the **E2E (Playwright) job RAN**
      (its own `conclusion: success`, not a SKIP — a skipped `e2e` would prove nothing about
      the suite, P-029). `pnpm gate` was green uncached locally beforehand: 85/85, `0 cached`.
- [ ] 9.3 Real-hardware pass on CasparCG 2.3.2 before archive — on-air behaviour throughout.
