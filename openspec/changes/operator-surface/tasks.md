# Tasks — the operator surface, as ONE surface

🔴 **DESIGN ONLY. Section 0 is the ONLY section that may be completed in this change as it
stands.** Every task in sections 1–6 carries a `⟨GATE: §x⟩` naming the `design.md` section that
blocks it, and MUST NOT be started until the owner has answered that section. A task whose gate
is unanswered is not "ready with an assumption" — the whole point of the gate is that guessing
produces work that gets undone.

**Assert the CLAIM, not the presence.** Every test below is written to assert the PROPOSITION —
that the head sits above the control it names, that the two gates resolve identically, that the
refusal reached the operator — never merely that an element, an attribute or a call exists. A
test that asserts presence passes on a broken implementation that still renders the thing.

**Extend the list, forget the mutator.** Phase 6 of `live-source-multibox` hit this three times
running. For every capability added below, the task also names its INVERSE — the revert, the
re-enable, the un-refuse — so a capability cannot ship with only its constructive half.

---

## 0. RECON — COMPLETE

Established against the tree at **`ec65480`** — `HEAD == origin/dev` verified, working tree clean,
pulled 2026-08-15 — cited to the file that decides each claim, located by SYMBOL not by line.
Nothing here is a proposal. Each item is marked against the abandoned earlier pass (`15d6754`,
branch `ai-stale`, never landed): **CONFIRMED** / **CHANGED** / **CANNOT VERIFY**.

- [x] 0.1 **CONFIRMED — R-031's eight points are ALL TRUE at `ec65480`.** `design.md` `§0.3`, one citation per
      point. The Library PANEL is deleted (`LibraryPanel` / `StackPanel` / `StackRow` /
      `FixedLayersPanel` / `FixedRow` are absent from the tree); the template REGISTRY survives
      with six working consumers, enumerated; R-005's remove-a-template was re-homed into the
      picker rather than lost. **The Library's cost is PAID, not pending** — which was the recon
      question that expected hidden dependencies.
- [x] 0.2 **CONFIRMED — R-032's every acceptance bullet is TRUE at `ec65480`.** `design.md` `§0.4`. The tab badge
      fires on `kind === 'producer'` only and is masked by `linkDown`, so an `unknown` never
      raises it. The R-028 `§5.3` reversal is quoted VERBATIM in two places in the tree
      (`PlayoutPanel.tsx` and `packages/shared-ipc/src/channels/playoutLayers.ts`), owner's
      reasoning intact, honest limit included.
- [x] 0.3 **CONFIRMED — R-033: ten of twelve TRUE, two SUPERSEDED, two GAPS.** `design.md` `§0.5`,
      with the table of citations. The supersessions (the LAYER and DESCRIPTION columns, removed
      by a later owner decision recorded in `layerTable.ts`) are `§2`; the gaps are the missing
      table SEMANTICS (`§0.5` G1) and the PLAYOUT tab's own grid (G2 → `§3`).
- [x] 0.4 **CONFIRMED — R-017 is UNBUILT, all three halves**, and the finding survives the move
      off the deleted `StackRow.tsx`. `design.md` `§0.6`: `layerRowActions.ts` declares REMOVE with
      `disabled: false` (only the centrally OR-ed `linkDown || awaiting` apply);
      `LayersPanel.tsx` disables REMOVE ALL on `linkDown || items.length === 0` with no
      `onAirCount` term though `onAirCount` is computed four lines above; `stack.remove` answers
      `{ accepted }` and `stack.remove-all` answers `{ ok, removed }`, so neither has anywhere
      to put a reason. Re-read rather than assumed — all three live in files the 68-commit span
      touched.
- [x] 0.5 **CONFIRMED BY TREE HASH — the verb block's real constraints.** `design.md` `§0.7`: `VERB_COUNT = 6`,
      `VERBS_WIDTH_PX = 348`, `VERBS_GRID` shared by the header's word row and the row's button
      row, `VERB_HEADS` exactly six entries whose ORDER must match the button emission order.
      This is the wall session AH's audio control met.
- [x] 0.5a **…and the collision is ALREADY RESOLVED — by precedent rather than by a written
      rule** (`design.md` `§0.2`). Sessions AG and AH shipped both controls the collision was
      about — R-048's SOURCE swap (`bee6ba3`) and C-015 6.5f's plate AUDIO (`6c56217`) — and
      solved it the same way twice: `surface: 'menu'`, conditionally spread on `hasLivePlates`,
      verb block untouched. `layerTable.ts` and `LayerTableHeader.tsx` are byte-identical across
      the whole span. So `§4` is no longer a placement gate; it is a rule to WRITE DOWN.
- [x] 0.5b **CHANGED — R-021 stage 4 and R-028 `§§6–7` are LANDED**, with every task box ticked
      (`e326a96`, `25c2142`). An earlier pass of this recon reported otherwise; it was reading a
      checkout 68 commits behind `origin/dev`. See `design.md` `§0.2a` — recorded because the
      failure mode is silent, and a recon is the one kind of work whose whole value is that it
      read the real tree.
- [x] 0.6 **CONFIRMED — the three ownership classes checked, not assumed.** `design.md` `§0.8`: the PLAYOUT
      tab reads `playoutLayers.state`, which is the declared RESERVED set only, so it does NOT
      list Live Source layers today. There is no `liveLayers()` accessor in the tree. The
      exposure is FUTURE and its mechanism is named: declaring Live Source layers by adding them
      to `reservedLayers` would put class three into class two's surface.
- [x] 0.7 **CHANGED — R-017's gap has WIDENED since the item was filed.** R-021 stage 4 added a fifth verb
      gate, `blocked` (`restoreBlocked`), and wired it into PLAY, NEXT, SOURCE and AUDIO. REMOVE
      did not get it either. Re-counted at `ec65480`, **REMOVE is the only verb on the row with
      no state condition whatsoever** — and the only irreversible one (`design.md` `§0.6`).
- [x] 0.8 **CONFIRMED — the seven collisions between R-031, R-032 and R-033 named and resolved**
      (`design.md` `§0.9`) — five resolved, four of those already resolved in code, two live
      (`§2`, `§3`). C6's boundary — the ONE place the present-disabled / absent / never-enabled
      rule lives — is `PlayoutPanel.tsx`'s own module comment; this design points at it and does
      NOT restate it as a second rule.

- [x] 0.9 🔴 **CHANGED, MATERIALLY — `§5`'s answer.** R-017 directs "read the EXISTING shared
      `isOnAir`". `onAir.ts` is one of the four files the span touched: its BODY is byte-identical,
      but **`B-122` rewrote its CONTRACT** — _"THIS IS NO LONGER CLEAR-ALL'S PREDICATE … it must
      never gate a clear path again, on either side of the bridge seam."_ In the same span the
      bridge grew its own canonical `isOnAirStatus(status, pending)` (`caspar-runtime.ts`),
      extracted under CLAUDE.md golden rule 6, four consumers. **Neither is a superset of the
      other** — the renderer's never reads `pending`; the bridge's omits `unverified` / `error` /
      `disconnected`. `§5` now carries four candidates and no longer recommends the item's own
      written answer.
- [x] 0.10 **The list of what CHANGED versus `ai-stale` — six claims, one materially**
      (`design.md` `§0.10`), plus the blast-radius table (`§0.0`) that decided where to look hard.
      **Nothing recorded as already BUILT turned out to be unbuilt, and nothing recorded as
      UNBUILT turned out to be built** — stated as a result rather than assumed, since each was
      re-read.

---

## 1. R-017 — the refusal ⟨GATE: §5, §6⟩

Wave 1 of the landing order. Independent of every other section here.

- [x] 1.1 ⟨GATE: §5⟩ Write the chosen on-air predicate into `design.md` as the answer, then use
      it on BOTH sides. **ONE import, never two mirrored definitions** — the bridge's
      `isOnAirStatus` is module-private in `caspar-runtime.ts` today, so "share it" means MOVING
      it into a package both sides can import. A second local derivation of the state list is the
      `B-100` / `P-012` failure and is prohibited.
      ⚠ **Do NOT default to `isOnAir` because R-017's note says so.** `B-122` rewrote that
      predicate's contract — _"it must never gate a clear path again, on either side of the bridge
      seam"_ — and REMOVE clears the layer before dropping the row. `§5` sets out why the item's
      written answer is no longer the recommended one.
- [x] 1.2 ⟨GATE: §5⟩ Add the gate to the row's SINGLE `RowAction` declaration
      (`layerRowActions.ts`, the REMOVE half of `load-remove`), so the button and the
      context-menu item inherit it structurally. Title names the remedy: STOP or CLEAR.
      **INVERSE:** assert REMOVE returns to enabled after a STOP settles the item to `loaded`
      and after a CLEAR settles it to `idle` — a gate with no measured way back is a trap.
- [x] 1.3 ⟨GATE: §5⟩ Extend `stack.remove`'s response shape to carry a refusal
      (`packages/shared-ipc/src/channels/stack.ts`), following `B-070`'s `errorCode` precedent
      rather than inventing a third vocabulary. Refuse bridge-side. **Assert on the WIRE that
      nothing was sent**, not that the call returned `accepted: false`.
- [x] 1.4 ⟨GATE: §5⟩ Same for `stack.remove-all`, which has a DIFFERENT response shape
      (`{ ok, removed }`). Two shapes, one refusal vocabulary. **INVERSE:** with nothing on air,
      `remove-all` behaves exactly as today — confirm and all — and that is a test, not an
      assumption.
- [x] 1.5 ⟨GATE: §5⟩ `LayersPanel.tsx` — add the `onAirCount` term to REMOVE ALL's `disabled`,
      keeping it RENDERED and titled. Do NOT harmonise it with Clear-All's genuine absence; the
      two are deliberately different and `design.md` `§0.9` C6 says why.
- [x] 1.6 ⟨GATE: §5⟩ **The agreement test.** Enumerate every `StackItemStatus` and assert the UI
      gate and the bridge refusal resolve IDENTICALLY for each. This is the test that would have
      caught the failure R-017's notes were written to prevent, and it asserts the CLAIM (they
      agree) rather than the presence of either gate.
- [x] 1.7 ⟨GATE: §5⟩ Only four idle rows of five are individually removable while the fifth is
      on air — the bulk action is withheld, the per-row ones are not. Assert both halves.
- [x] 1.8 ⟨GATE: §6⟩ The remedy copy ripple, all four sites plus the assertion:
      `ServerSettingsPanel.tsx`, `MockRuntime.ts`, `caspar-runtime.ts`'s own message, and the
      literal-string assertion in `serverSettingsPanel.dom.test.ts`.
- [x] 1.9 ⟨GATE: §6⟩ Rewrite `apps/runtime/tests/e2e/server-settings.spec.ts` step 2: it clicks
      Remove-All to unblock Apply and then asserts "No items loaded". After Clear-All the rows
      correctly REMAIN, idle — so the assertion changes SHAPE. Assert the CLAIM (Apply became
      available AND the rows survived), which is strictly more than the old test checked.
      🔴 **DONE FOR PART 1 ONLY, AND TICKED ANYWAY — this is where the red `e2e` came from.**
      That file holds TWO tests. Part 1 was rewritten and now asserts Remove-All is DISABLED;
      part 2, nine lines below, went on clicking it to unblock Apply, so the click waited the
      full 30 s on a control that could never enable. `pnpm gate` does not run Playwright
      (`P-028`), so nothing local could see it and the tick was taken on a green gate. Closed
      2026-09-06 by `RESTART-NOTICE-01` ([[B-228]]): part 2 now uses Clear-All **plus** an
      added assertion pinning the exemption count. ⚠ The lesson is the tick, not the miss — a
      task naming ONE spec file must be verified against every test in it.
- [x] 1.10 ⟨GATE: §5⟩ Refusals reach the operator through the command toast, worded identically
      however issued. Assert the WORDING is one string from one place, not two that match today.

### 1b. Wave 1's ripple, found while landing it — OWED, not done

`R017-ONE-AUTHORITY-01` swept for §6's real site list and found `1.8`'s four short. These are the
sites the sweep found that wave 1 could NOT close from inside section 1, recorded here so they
travel with the work rather than being rediscovered.

- [x] 1b.1 `packages/shared-ipc/src/channels/templates.ts` and `caspar-runtime.ts`'s
      `templateRemove` docstring both closed their remedy sentence with _"the same unblock path
      R-010 uses"_. **DELETED rather than reworded** — after §6(A) the two paths genuinely
      differ: Clear-All leaves every row on the stack, so every reference survives it and R-005's
      refusal would repeat forever. Both now name the per-item remedy only.
- [x] 1b.2 **DONE 2026-09-07 (`STALE-CLAIMS-02` §2) — the delta is
      `specs/runtime-caspar-bridge/spec.md`, and the verdict is AGAINST THE SPEC.**
      _"Refused while on air, accepted after Remove-All"_ describes a press wave 1 refuses
      bridge-side, and the paragraph above it calls Remove-All _"the sanctioned path to unblock
      reconfiguration"_. The code is not merely different, it is the DECIDED behaviour: the owner
      answered `§6` with (A), for a stated reason (Apply gates on the on-air COUNT, not on an
      empty list), and naming a control disabled precisely by the condition being reported is the
      defect `§6` exists to remove. The delta replaces both, names CLEAR-ALL, and adds a third
      bullet asserting Remove-All is refused so it cannot be the unblock path.
      ⚠ **`pnpm openspec validate --all --strict` passed on the false text throughout** — it
      validates SHAPE, not TRUTH. That is why this survived, and it is the reason the sweep had to
      be done by reading rather than by running the validator.
- [x] 1b.3 **DONE 2026-09-07 (`STALE-CLAIMS-02` §2) — the delta is
      `specs/runtime-template-library/spec.md`, verdict AGAINST THE SPEC again.** Two independent
      decisions had already falsified _"per-item Remove, or Remove-All … is the unblock path"_:
      `B-212` (2026-09-04) rebuilt the refusal so Remove-All is **not mentioned at all**, with a
      per-reference remedy (`Show <row>` / `Remove item`) built from `describeTemplateReferences`;
      and wave 1 refuses Remove-All while anything is on air. The delta states the per-ITEM,
      per-REFERENCE remedy and forbids naming a BULK control — including Clear-All, which is
      useless here because it leaves every row and therefore every reference standing (the reason
      `1b.1` deleted the shared-remedy sentence).
      ⚠ **One clause of the delta was drafted WRONG and corrected before landing:** it first said
      an on-air item must always be taken off air before removal. `#removeRefusal` exempts an item
      on a layer OUTSIDE the declared bank — no row, so no STOP and no CLEAR to press — which is
      `B-212`'s own measured case and precisely the path the picker's `Remove item` uses. The
      delta now states the exemption as part of the rule.
- [ ] 1b.4 The PRD's own copies of the same vocabulary — `docs/prd/runtime.md`'s `R-005` body,
      `R-010` entry, and `R-017`'s RIPPLE bullet (which is where `1.8`'s four-site list and the
      false _"No items loaded"_ claim originate). Rides the PRD status flip in `6.3`, not this
      wave.

## 2. The PLAYOUT tab's column model, and the table's semantics ⟨GATE: §3⟩

Wave 2. **These land in ONE commit.** Splitting them means the ARIA roles are written for one
table and immediately need extending, or written twice — the exact drift `§3` exists to close.

- [ ] 2.1 ⟨GATE: §3⟩ Give `layerTable.ts` a named COLUMN SET per surface, keeping the density
      arithmetic, the gaps and the row geometry shared. **Guard against the failure mode this
      invites:** it must not become a configuration language. Two named sets, not an engine.
- [ ] 2.2 ⟨GATE: §3⟩ `PlayoutPanel.tsx` drops its local `gridTemplateColumns: 'auto 1fr auto'`
      and renders through the model. Assert the CLAIM — a longer occupant name moves nothing on
      any other row — by measurement, the way `layerTable.ts`'s own note was measured.
- [ ] 2.3 ⟨GATE: §3.1⟩ The PLAYOUT tab's sticky header, if the owner wants one. Its rows have no
      icon-only verbs, so the header's SAFETY argument does not transfer; its column-NAMING
      argument does.
- [ ] 2.4 ⟨GATE: §3⟩ Table semantics for BOTH surfaces (`design.md` `§0.5` G1): a table role over
      header and body, header cells as column headers, body rows as rows.
      **`LayerTableHeader.tsx`'s `role="row"` is currently an ORPHAN** — no table-role ancestor —
      and body rows carry `role="button"`. Making the row operable must not cost it its row
      semantics; resolve that rather than trading one for the other.
- [ ] 2.5 ⟨GATE: §3⟩ Assert no `row` role exists anywhere without a table-role ancestor. A
      lint-style invariant, not a snapshot.
- [ ] 2.6 ⟨GATE: §3⟩ Assert all THREE channels survive for every icon-only verb: visible column
      header, accessible name, tooltip on hover AND on keyboard focus. The existing
      `data-verb-head` hook already pins one-head-per-button-in-order; extend rather than
      duplicate it.

## 3. R-033 points 1 and 2 ⟨GATE: §2⟩

Wave 3. Alone. **If the owner answers (A), this section is a DOCS change, not a code change.**

- [x] 3.1 ⟨GATE: §2⟩ **DONE 2026-09-07 (`STALE-CLAIMS-02` §4). (A) was the answer, so this was the
      deliverable and not a side effect.** `docs/prd/runtime.md`'s bullet is amended IN PLACE (it
      is a living document) with the original quoted inside it, and the 🔴 unmet-criterion block
      below it now records the resolution: the LAYER column does not return; the number lives in
      the row's `title`/`aria-label` and the Inspector.
      ⭐ **The amendment is TWO clauses, not one weakened clause.** It concedes the table and
      keeps the other half explicitly: wherever a row is named in a SENTENCE — the audit log, the
      emptied-air notice, the orphan banner — the coordinate stays VISIBLE (`operatorRowName`
      returns it; `EmptiedAirNotice` renders it), because a notice is read once under pressure
      and a hover needs a working pointer and a dwell. The cost the original bullet named is
      recorded rather than dropped.
      ⚠ **Two places MISCITED this gate's answer and were corrected in the same act:**
      `operatorNaming.ts` and CLAUDE.md's golden rule 11 both said `§2` _"declined to hide the
      number behind a tooltip"_, which is the opposite of (A). The RULE each states is right and
      is unchanged; the borrowed authority was false, and false in the direction that would make a
      later reader re-open a settled decision.
- [ ] 3.2 ⟨GATE: §2⟩ If (B) — restore the layer number as a fixed-width secondary at `full` and
      `compact`, dropped at `tight`. `minWidthFor` and `gridTemplateColumns` both change and both
      are unit-tested; extend the density tests rather than adding a parallel set. **INVERSE:**
      assert the column DROPS at `tight` and that dropping it does not clip the verb block.
- [ ] 3.3 ⟨GATE: §2.1⟩ The same call for the DESCRIPTION column, where it is weaker. Default
      answer is that the supersession stands.

## 4. The verb-block admission rule ⟨GATE: §4.1, §4.2⟩

Wave 4, and CHEAP. **The placement this section would have gated is already shipped** — SOURCE
and AUDIO went to the context menu, twice, correctly, by two sessions that each rediscovered the
constraint from the same module comment. What is left is writing the constraint down so the
FOURTH control does not rediscover it, and answering the one question the collision never raised.

🔴 **4.1, 4.2 AND `specs/runtime-ui/spec.md` 43-44 WERE SETTLED AS ONE ACT, 2026-09-07
(`STALE-CLAIMS-02` §3), and they could not have been settled apart.** Those two lines are an
ADDED requirement — text that archives into `openspec/specs/` — and they said a control whose
PRESENCE varies by row SHALL be reached through the **Inspector**. The shipped answer is the
CONTEXT MENU, twice. Whichever of the three was edited first would have made the other two read
as the error: confirming 4.1/4.2 alone archives a normative requirement forbidding what the
product does, and editing 43-44 alone leaves the rule stated nowhere a violating change is
authored. One commit, one reasoning.

- [x] 4.1 ⟨GATE: §4.1⟩ **DONE.** The admission rule is written into `layerTable.ts`'s `VERB_COUNT`
      note and `LayerTableHeader.tsx`'s `VERB_HEADS` — the two places a violation is actually
      made. Each states the STATE-vs-PRESENCE distinction and sends anything conditional to the
      context menu, and each points at the OTHER rule's home rather than restating it.
- [x] 4.2 ⟨GATE: §4.2⟩ **DONE — as a third case beside the C6 boundary, which has MOVED.** The
      boundary now lives in `StationLayersPanel.tsx`: `PlayoutPanel.tsx` no longer exists (R-055
      renamed the surface, as this document's own `PREMISE CORRECTED` block records), so the task
      as written named a file that is gone. The block-vs-menu rule sits there as a third case,
      with its spatial reason and the `menuLast` residual cost.
      ✅ **The CLAIM test already exists and was verified rather than duplicated:**
      `layerRow.dom.test.ts` asserts the resolved action set over the FULL matrix
      (`item.status` × `hasNext` × `linkDown` × `hasLivePlates`) equals `WITH_PLATES` or `BASE`,
      and `liveSourceSwap.dom.test.ts` / `livePlateAudio.dom.test.ts` each assert absence on a row
      without plates. That is the proposition, not the presence of a string.
- [x] 4.3 ⟨GATE: §4.1⟩ **DONE, both ways.** `live-source-multibox` 6.9e now points at the rule's
      three homes and records that the C6 boundary's file was renamed; the rule's own comments
      point back at 6.9e as the argued decision.

## 5. The picker's fate ⟨GATE: §1⟩

Wave 5. **A no-op if the owner answers (A).**

- [ ] 5.1 ⟨GATE: §1⟩ If (B) — remove the picker, and FIRST re-home R-005's remove-a-template,
      which has no other surface. Losing a shipped capability silently is what the picker move
      was created to avoid the first time.
- [ ] 5.2 ⟨GATE: §1.1⟩ Confirm or name a second entry point to the picker. Today there is
      exactly one, deliberately.

## 6. PRD, docs, cross-references

- [x] 6.1 ⟨GATE: §7⟩ **CLOSED 2026-09-07 (`STALE-CLAIMS-02` §4) — by writing what is true, not by
      ticking.** The RESERVATION half is real and closes: `MonitorStrip` renders both in their
      final positions, height persisted through `ShellDivider`, fullscreen via `Panel`. The LABEL
      half of `§7` — _"labelled NOT CONNECTED"_ — **was never true, in both halves**: PROGRAM
      reads `No program return`, and PREVIEW is not an empty box at all since `R-022` made it
      `PreviewPanel`, a local browser render. `MonitorPanel`'s own header calls labelling PREVIEW
      "not connected" a CATEGORY ERROR — it has no link to be down. The stale `App.tsx` comment
      that carried the phrase is corrected in place; `§7` carries a dated closure block above the
      gate text, which is left verbatim.
- [x] 6.2 ⟨GATE: §8⟩ **CLOSED 2026-09-07 (`STALE-CLAIMS-02` §4) — THERE IS NO ASYMMETRY TO
      RECORD.** `§8` asks the owner to confirm that the row's CLEAR is _"not confirm-gated at
      all"_. It is: `LayerRow.tsx` wraps it in `withConfirm` with three occupancy-dependent
      bodies, every branch naming the layer number. Verified at `ec65480` too
      (`git show ec65480:…/LayerRow.tsx`), so this is a RECON ERROR and not drift — re-reading a
      later tree would not have caught it.
      🔴 **Recording the asymmetry as asked would have been actively dangerous**, which is why
      this is a rewrite and not a tick: the task says to record it _"where a later reader would
      try to harmonise it"_, so a reader who found that note, checked the row's CLEAR and saw a
      confirm would conclude the CODE had drifted — and delete a confirm from a destructive
      on-air verb.
      **What is genuinely open is re-pointed rather than dropped:** whether the row's CLEAR should
      KEEP its confirm. `§8`'s escape-hatch argument (a confirm on a remedy is a delay on a
      graphic stuck on air) is real and unanswered, and is now stated as a question.
- [ ] 6.3 ⟨GATE: §2, §3, §4⟩ Flip the PRD items to their true state once their gates resolve.
      R-031 and R-032 are candidates for `[x]` on the recon alone; R-033 is `[ ]` and is mostly
      built. **Not this session** — status flips ride the change that implements the gate.
- [ ] 6.4 Engine doc-sync where a contract changed. **Nothing owed as this change stands** — no
      engine structure, contract or extension point moves in a docs-only change.

## 7. Gate

- [x] 7.1 `pnpm openspec validate operator-surface --strict`.
- [x] 7.2 Full `pnpm gate` (uncached). **Docs-only in this change as it stands.**
- [x] 7.3 **No Linux `gate:e2e` is owed for THIS change.** No file matching `UI_RENDER_PATTERNS`
      in `tools/gate-hook/src/gate-decision.mjs` is touched: the diff is `openspec/**` and
      `docs/**` only. **Every section 1–5 task above owes its own**, and none may be ticked on a
      Windows run.
- [ ] 7.4 Real-hardware pass: **OWED BY SECTION 1, which has now landed.** R-017's refusal is on an
      on-air path: with a row on air the operator must see REMOVE held with its reason, REMOVE ALL
      withheld, and a blocked Apply naming Clear-All. Not dischargeable on the mock.
- [x] 7.5 **Linux `gate:e2e` OWED for section 1's commit — DISCHARGED 2026-09-06.** It alters UI
      and rendering (the row's verb state, the header button, the settings copy) and rewrites
      `apps/runtime/tests/e2e/server-settings.spec.ts`. Only a COMPLETED, GREEN `e2e` job on
      GitHub Actions for the carrying commit discharges it; a Windows pass does not.
      <https://github.com/yasermostafaee/cg/actions/runs/34000690814> — `c4477d1c`, conclusion
      `success`; **`E2E (Playwright)` RAN, 626 s** (00:12:56 → 00:23:22 Z) and
      **`Lint • Typecheck • Test • Build` RAN, 523 s** (00:12:56 → 00:21:39 Z), both `success`.
      ⚠ `b07d2fad` — section 1's own commit — is an ANCESTOR of `c4477d1c` (verified with
      `git merge-base --is-ancestor`), so the run carries this change; section 1's OWN run
      (<https://github.com/yasermostafaee/cg/actions/runs/33992738274>) was RED on `1.9` above
      and discharges nothing.
      🔴 **7.4 is still OPEN and is NOT discharged by this** — the hardware pass is a different
      debt on a different instrument, and a green mock suite says nothing about it.
