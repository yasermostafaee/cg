# Tasks — retiring the self-declared operator name

## 1. The sweep (§1), measured before anything was touched

- [x] **STRING axis** (`self-declared`, case-insensitive): **39 hits / 24 files** tracked at
      HEAD `0c76cd95`, against **19 / 16** at the recorded baseline `546258d3` — which
      reproduced exactly.
- [x] **SYMBOL axis** (`operatorName`): **51 hits / 26 files** at HEAD, against **41 / 21** at
      the baseline. ⚠ `R-066`'s note says "44 files"; that does not reproduce and is most likely
      HITS mislabelled as files (41 ≈ 44). Recorded rather than quietly corrected.
- [x] **MULTI-LINE pass** adds **5 files neither per-line pass sees**, including
      `AuditPanel.tsx` — the source of the caveat — exactly as `R-066` predicted.
- [x] **Persisted key** `cg.runtime.operatorName`: 1 writer, 1 census consumer, 4 doc mentions.
- [x] **Both counts went UP** since the baseline (+20 / +10 hits). Every added site is a
      reference written BY the auth work — comments explaining that the caveat is now false, and
      the new `channels/auth.ts`. Nothing had silently retired part of this.
- [x] 🔴 **A THIRD AXIS, AND A FIFTH NOBODY NAMED.** The two prescribed axes structurally miss.
      The **class/token axis** found `controls.css`'s strip stylesheet, two `theme.ts` geometry
      tokens and a stale radius-ladder comment — none carries either token. It also found **two
      E2E specs** (`library-audit-geometry`, `audit-legibility`) that pin the strip and the
      sentence while carrying NEITHER token: a red Playwright run no local gate would catch
      (golden rule 12). And the **ticket-id axis** (`B-143`) found four more stale comments that
      all four other passes missed.
- [x] ⚠ **The symbol axis cannot be widened naively.** Case-insensitive `operatorName` adds 24
      files of which 23 are golden rule 11's ROW naming (`operatorRowName`, `useOperatorNames`) —
      a different feature sharing a noun. `LayerRow` even takes a prop literally called
      `operatorName`, meaning the row's name. The permanent guard therefore matches the retired
      IDENTIFIERS, never the bare word.

## 2. The retirement (§2)

- [x] `platform/operatorName.ts` deleted; `cg.runtime.operatorName` gone
- [x] `audit.operatorName` / `audit.setOperatorName` removed from the `RuntimeBridge` CONTRACT
- [x] The console sends no `actor`; `MockRuntime` writes `UNATTRIBUTED_ACTOR` deliberately
- [x] The Audit panel's strip, its state, its effect read and the column `title` — retired or
      rewritten; the ACTOR COLUMN and the actor FILTER survive untouched
- [x] `controls.css` block + `theme.ts` tokens removed **together** (`tokenHome` catches a token
      read-but-undeclared, never one declared with no reader)
- [x] 🔴 eslint `cg/raw-control` ratchet `AuditPanel.tsx` **3 → 2** in the same commit — the rule
      refuses movement in BOTH directions, so a paid debt left unrecorded is red
- [x] `ws-frame.ts`'s `actor` docblock requalified; `R-054`'s bullet corrected

## 3. The two filed surfaces (§3)

- [x] **(a)** `AuthStateChangedChannel` + a second `configChanged` subscription in
      `wirePublishes`, and `authStateFor` extracted so the READ and the PUBLISH are one
      composition. ⚠ `PLAYOUT-AUTHZ-01` filed this as "a new per-socket publish path, not one
      more `subscribe` line" — **that was a misreading**: `wirePublishes` already runs per
      connection with that socket's `AuthSession` in scope.
- [x] **(b)** `SetupField` gains `readOnlyValue`; below `station-admin` the five server/serve
      fields render as values through `Tag` (whose type makes `onClick` inexpressible), with a
      declared `.cg-setup-field__value` rule — a class the stylesheet never declares is the
      silent form of the same defect

## 4. Tests (§4)

- [x] `operatorNameRetired.test.ts` — the permanent two-axis guard, multi-line, 6 cases
- [x] **Proved to FAIL on both forms**: planting `setOperatorName` reds axis 1; planting the
      caveat SPLIT ACROSS THREE LINES reds axis 2. Both reverted.
- [x] `authz-strip-freshness.integration.test.ts` (§3a) · `stationSetupReadOnly.dom.test.ts` (§3b)
- [x] Two e2e specs rewritten to assert the absence **with controls**
- [x] Five tests OF the retired feature deleted; two census GUARDS updated as consumers

## 5. Records (§5)

- [x] `R-066` bullet 5 ticked · `R-054`'s contradicting bullet corrected
- [x] `docs/integration/playout/README.md` open item 11 **closed**, with the auth-OFF answer
- [x] `B-141`'s dated resolution ANNOTATED, never rewritten
- [x] Operator guide: the actor filter now says what it filters on each kind of station
- [x] 🔴 **Three unarchived spec deltas superseded IN PLACE** —
      `audit-actor-console-name`, `runtime-redesign-programme`, `take-refusal-surfaces`. Left
      alone, archiving any of them would have written the retired caveat into the LIVING spec,
      on a day the product had just removed it, with no guard to catch it.

## 6. Gate and discharge (§6)

- [x] Gate green — ⚠ recorded by `BRIDGE-TRUTH-01` from CI, not from a local `pnpm gate` it
      witnessed: the whole-tree `Lint • Typecheck • Test • Build` job is `success` on both runs
      below
- [x] Commits + push to `dev` (`9a64d5db` · `95e09ce3` · `65e2ad0f` · `f07ddf10`), remote head
      verified — `git ls-remote origin dev` = `f07ddf10` at the start of `BRIDGE-TRUTH-01`
- [x] 🔴 **Linux `e2e` discharged for `65e2ad0f`, which carries `9a64d5db` and `95e09ce3`** —
      https://github.com/yasermostafaee/cg/actions/runs/35787066436 · `conclusion: success`,
      and the `E2E (Playwright)` job **RAN**: read back from the API at step level, the `E2E`
      step itself `completed · success` (not skipped). Neither code commit got a run of its own —
      a burst of pushes — and the jobs are whole-tree, so the later HEAD discharges them.
- [x] 🔴 **And for `f07ddf10`, the HEAD** —
      https://github.com/yasermostafaee/cg/actions/runs/35787683141 · `conclusion: success`, the
      `E2E (Playwright)` job's `E2E` step `completed · success`, read back the same way.

## 7. 🔴 Named, not done

- [ ] **`unattributed` now means two things on an auth-OFF station** — "no console caused this"
      (boot adoption, OSC reconciliation) and "an operator did this". They cannot be told apart
      in the actor column, and nothing reds. Accepted here as the cost of not letting a console
      assert an identity it cannot prove; if the distinction is wanted, it needs a second value,
      which is a schema decision and not a rider on this change.
