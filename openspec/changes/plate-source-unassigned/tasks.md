# Tasks — `plate-source-unassigned` (`B-183`, `B-184`)

## 0. Measure first — the brief's own premises, tested before any edit

- [x] 0.1 **Hypothesis 1 CONFIRMED** — `defaultLiveSource(…, routeKey = 'live-1')`, and the canvas
      tool passed `nextLiveSourceId(scene)`. Nothing declared either.
- [x] 0.2 🔴 **Hypothesis 2 FALSE** — the Inspector already rendered the element's own value,
      labelled `(undeclared)`, and substituted nothing. Measured: `select.value = "live-1"`,
      `options = ["live-1|live-1 (undeclared)", "l1|l1", "l2|l2"]`. **Nothing about that is
      changed**; it is now pinned by test instead.
- [x] 0.3 The item did NOT stop there, because the brief's stop condition required BOTH hypotheses
      clean and only one was.
- [x] 0.4 ⚠ Fixture correction recorded: `editSceneOf` projects the ACTIVE COMPOSITION's
      `lookGroups`, and the preflight runs on the edit scene (`App.tsx`: `useIssues(editScene)`).
      A group parked on the project scene is out of scope and §B.1 never runs — the first version
      of the fixture did that and failed with `[]`, which reads as "the check is broken" and
      actually meant "the fixture is not the app".

## 1. `B-183` — the default is UNASSIGNED

- [x] 1.1 `VideoPlaceholderElement.routeKey` → optional, with the three-state contract in its
      docstring and both rejected alternatives recorded there
- [x] 1.2 🔴 `LookSource.routeKey` left REQUIRED — the asymmetry IS the rule
- [x] 1.3 `defaultLiveSource` drops the `routeKey` parameter entirely (not merely its default), so
      the next caller cannot reopen the door
- [x] 1.4 `nextLiveSourceId` **deleted**, with its expired argument recorded where it stood
- [x] 1.5 Ripples, all found by `tsc`: `scene-flatten.ts`, `vcg-format/live-sources.ts` (declares
      nothing for an unassigned plate), `template-runtime/scene-builder.ts` (bars read `no source`)

## 2. `B-183` — the refusal, and the remedy

- [x] 2.1 New `live-source-unset`, DOCUMENT scope, so it fires with or without a group
- [x] 2.2 `live-source-device-id` no longer claims an absent id "is not symbolic (“undefined”)"
- [x] 2.3 `look-source-undeclared` no longer claims an absent id "references source “”"
- [x] 2.4 Both messages name the panel, the row and the choice — resolved ONCE from
      `scene.lookGroups`, because which row exists differs by template
- [x] 2.5 `look-source-undeclared` names BOTH remedies (fix the plate / declare the name)
- [x] 2.6 🔴 No one-click fix button — declined by the owner, and no message repairs anything
- [x] 2.7 The declared list is kept in the message

## 3. `B-183` — the Inspector

- [x] 3.1 The unassigned state is selectable, via a `''` sentinel that cannot collide
      (`LiveSourceIdSchema` is `.min(1)`) and is converted back at the single commit point
- [x] 3.2 Clearing the free-text box unassigns rather than failing validation
- [x] 3.3 The `(undeclared)` rendering left EXACTLY as it was — verified correct first (0.2)
- [x] 3.4 Rendering the Inspector performs no write; existing data is not repaired

## 4. `B-184` — one fact, one colour

- [x] 4.1 `issue` → `colors.danger`; new `issueSummary` style for the heading
- [x] 4.2 `groupLabel` left alone — it is every other group's neutral heading in this panel
- [x] 4.3 Checked first that this panel does not reserve red for something else: `danger` appears
      nowhere in `LooksSection.css.ts`. The theme's own tokens decide it — `caution` is documented
      as "not an error", `danger` as reserved for "real errors"

## 5. Not weakened, not widened

- [x] 5.1 No tolerance, no severity downgrade, no suppression in the root scope
- [x] 5.2 `look-source-undeclared` keeps its reasoning and its `error` severity
- [x] 5.3 The check is NOT extended into look compositions — filed as a note, not implemented
- [x] 5.4 🔴 `live-source-unset` added to the Looks panel's filter, so the split did not
      silently shrink that panel's coverage

## 6. Tests

- [x] 6.1 `plate-source-unassigned.dom.test.ts` — 9 tests. The DISCRIMINATING fixture is a plate
      whose `routeKey` is not in its group's declared list; a fixture of all-declared plates cannot
      see any of this, which is how it shipped
- [x] 6.2 Scene · preflight · Inspector asserted **by value, in one test**, including the
      declared list and both remedies
- [x] 6.3 The unassigned round trip: pick a declared source → refusal clears; pick "no source" →
      `routeKey` is `undefined` (never `''`) and the refusal returns
- [x] 6.4 `B-184` asserted against the STYLE IDENTITY, not a hex — vanilla-extract compiles the
      token away, so a colour string would assert the bundler's output
- [x] 6.5 `live-source-preflight.test.ts`'s default-factory block INVERTED and rewritten: a fresh
      plate now IS exactly one error. The old "a fresh element must not itself be a preflight
      error" is false by design and was replaced, not relaxed
- [x] 6.6 Two stale `defaultLiveSource(id, x, y, 'guest-1')` call sites fixed — found by `git grep`,
      NOT by `tsc` (see 8.1)
- [x] 6.7 🔴 **Discrimination proved by reverting.** Whole mechanism reverted ⇒ **9 of 68 RED**
      (7/9 new file, 2/42 preflight). The 2 still-green in the new file are both positive controls;
      `looks-issues.dom.test.ts` (5) and `look-preflight.test.ts` (12) stayed entirely green
- [x] 6.8 🔴 **The E2E fallout — SEVEN specs; six found by `git grep`, the seventh only by
      running the suite (6.11).** Not one of them could redden a local gate. This is
      golden rule 9 exactly: the deliverable was partly a STRING and a DEFAULT, so nothing local
      could redden (`pnpm gate` does not run Playwright, `P-028`). Two asserted the old contract
      outright — `toHaveValue('live-1')` with _"a freshly drawn hole is exportable"_, and
      `['live-1','live-2']` — and are rewritten to the new one. Four more drew a plate, never set
      an id, and asserted no error pill; each gets one explicit `setLiveSourceId` with its reason
- [x] 6.9 ⚠ **Deliberately NOT fixed by teaching the `addLiveSource` fixture to assign an id.**
      One edit instead of six, and it would make the helper stop mirroring what the real tool
      does — a fixture that quietly differs from the product is how a suite stops being evidence
- [x] 6.10 Checked and unaffected: `looks.spec.ts` assigns through the `source` picker with
      DECLARED ids (`selectOption` matches by value, and the new "no source" entry is merely an
      extra option); `arrangements.spec.ts` makes no export or issue assertion at all
- [x] 6.11 🔴 **THE GREP WAS NECESSARY AND NOT SUFFICIENT — a SEVENTH spec broke, and only
      RUNNING the suite found it.** The grep predicate was "asserts no error pill", and
      `D-157 — overlapping boxes are MARKED … and the marks clear when fixed` asserts neither a
      pill nor a string: it undoes back to one plate and expects **zero** marks. With both
      plates unassigned the survivor still carried its own error, so it failed
      `expected 0, received 1`. The real predicate was never "mentions the old string" but
      **"depends on the SET of preflight issues"**, which a grep cannot express.
      ⭐ **The lesson is not that the grep was wrong — it caught six the run would have found
      one at a time — but that a non-authoritative Windows run STILL EARNS ITS KEEP.** It
      discharges nothing (that rule is unchanged), and it is not evidence about Linux; it is
      the cheapest way to learn that a predicate was too narrow
- [x] 6.12 That test is fixed WITHOUT touching undo granularity: only the FIRST plate is given a
      source. Assigning the second would insert a history entry between the two the test relies
      on, so its single `undo()` would revert an id instead of removing a plate — and the test
      would silently become an assertion about undo rather than about the marks
- [x] 6.13 The rewritten first spec asserts the refusal on the PILL only. Opening the Issues
      modal to read the message DESELECTS the plate — measured, the next `setLiveSourceId`
      timed out on an Inspector input that is not rendered for an empty selection — and the
      message is already pinned by value at unit level

## 7. Gate

- [x] 7.1 `pnpm gate` — see the commit message for the count; `openspec validate --strict` clean
- [x] 7.2 ✅ **Linux `gate:e2e` DISCHARGED** —
      <https://github.com/yasermostafaee/cg/actions/runs/33246214343> on `9a6e0eff`, the commit
      that carries this change. `completed` + `success`, with **`E2E (Playwright)` CONFIRMED RAN**
      (`success`, not skipped) alongside `Lint • Typecheck • Test • Build`. The classifier
      correctly read the diff as render-affecting — this change alters the plate's bars label and
      the Looks panel's colours — so both heavy jobs ran rather than being skipped under `P-029`.
      ⚠ The local Windows `gate:e2e` (23/23 tasks, designer 275 + 12 skipped, runtime 93) is a
      useful signal and by the rule discharges nothing; the URL above is the discharge.

## 8. Found on the way, filed not fixed

- [x] 8.1 `B-186` — `apps/designer/tsconfig.json` includes `src/**/*` only, so the designer's
      **tests are never typechecked**. Two call sites kept a removed 4th argument and the whole
      typecheck task stayed green. Mirror image of the `tools/caspar-bridge` notch CLAUDE.md records
- [x] 8.2 `B-185` — the locked-resize handle anchoring (`EDGE-DRAG-AUDIT-01`), filed with three
      costed options and nothing implemented; the owner chooses
