# Tasks — the reuse guard accepts `push` runs only (P-030)

## 1. The rule, in the pure function

- [x] 1.1 `decideReuse` (`tools/gate-hook/src/reuse-decision.mjs`): candidates gain ONE
      additional condition, `event === 'push'`. The three existing conditions
      (not-this-run, `completed` + `success`, both `REQUIRED_JOB_NAMES` jobs actually RAN)
      are unchanged, and `REQUIRED_JOB_NAMES` is not touched.
- [x] 1.2 🔴 **The check is POSITIVE.** Written as `r?.event === 'push'`, never as
      `event !== 'pull_request'`, and a missing/empty/unrecognised `event` is NOT defaulted
      to allowed — it is an uncertainty, and uncertainties run everything.
- [x] 1.3 The non-`push` rejection gets its OWN reason string, distinct from the
      "no COMPLETED, SUCCESSFUL prior run" one, naming how many runs were seen and how many
      were dropped as non-`push` — so a human reading a merge run that DID work understands
      why. Follows the honesty of the existing reason strings.
- [x] 1.4 Module docstring: it currently explains why "green is not enough". It must also
      explain why green on the right KIND of run is part of the match — a `push` run tests
      that commit's tree; a `pull_request` run tests the merge ref.

## 2. Defence in depth, not the guard

- [x] 2.1 `.github/workflows/pr.yml`: narrow the Actions API query to `event=push`. Record
      IN THE WORKFLOW that this is defence in depth and that the pure function enforces the
      rule on its own — a later reader must not delete the function's check because "the
      query already filters".

## 3. Types

- [x] 3.1 `tools/gate-hook/types/reuse-decision.d.ts`: the run shape is consumed as
      `unknown` today, so document the `event` field on `ReuseInput.runs` in the same spirit
      as the existing comments (anything else fails safe).

## 4. Tests — real payloads stay real

- [x] 4.1 The existing `runs-*.json` fixtures already carry `"event": "push"`. VERIFY that
      value is what GitHub actually returns for those three runs, by reading the API back
      rather than assuming — then the existing green cases stay green for the right reason.
- [x] 4.2 🔴 **The case this change exists for:** a run that is `completed` + `success` and
      DID run both required jobs, but whose `event` is `pull_request`, returns
      `reuse: false` with a reason naming the non-`push` rejection. Built by overriding
      `event` on the REAL `both-ran` fixture, so the ONLY difference from the reusing case is
      the event.
- [x] 4.3 A missing `event` and an unrecognised `event` each return `reuse: false`.
- [x] 4.4 A mixed list — a non-`push` green run beside a `push` green run that ran both jobs
      — still reuses the `push` one, so the filter drops candidates rather than aborting.

## 5. Docs

- [x] 5.1 `docs/prd/platform.md`, P-030: the "⚠ One qualification on same SHA ⇒ same tree"
      paragraph records this as "the assumption to re-check" if the base ever advanced
      independently of `dev`. REPLACE that sentence with the fact that it can no longer
      happen, and why. Supersede it — do not leave the old text beside the new.
- [x] 5.2 P-030's item state per `docs/prd/README.md`, noting this change dir.

## 6. Gate

- [x] 6.1 `pnpm openspec validate platform-reuse-guard-push-only --strict`.
- [x] 6.2 Full green gate (`pnpm gate`, uncached) — this touches `.github/` and
      `tools/gate-hook/`, so the docs-only carve-out does NOT apply.
      **Green 2026-08-11.** Turbo reported `85 successful, 85 total` and
      `0 cached, 85 total` — the `--force` lives inside the script, so this IS the
      uncached run. `pnpm format:check` then reported every matched file clean, and
      `pnpm openspec validate --all --strict` reported `45 passed, 0 failed`.
- [x] 6.3 No Linux `gate:e2e` debt is owed. **MEASURED, not asserted:** the repo's own
      classifier was run over this change's exact changed set —
      `classifyChangedSet([...]) → {kind: 'code', needsE2e: false}` — and every path returns
      `owesE2e: false` individually (`.github/workflows/pr.yml`,
      `tools/gate-hook/src/reuse-decision.mjs`, its `types/` and `tests/` files,
      `docs/prd/platform.md`, `openspec/**`). None matches `UI_RENDER_PATTERNS`.
      **OBSERVED, not predicted.** Run
      <https://github.com/yasermostafaee/cg/actions/runs/31475639919> — commit `d693fa35`,
      `event: push`, `conclusion: success`. Docs check ✓ · Detect changed paths ✓ ·
      Lint • Typecheck • Test • Build ✓ · E2E (Playwright) **skipped** · required ✓.
      Classifier: `{kind: 'code', needsE2e: false}` — the prediction and the observation
      agree.

      🔴 **Two consequences, so a later reader cannot misread that green:**

      **(a) The skipped `e2e` job discharges NO e2e debt.** A `skipped` job is a statement
      about the DIFF, not evidence about the suite (P-029). This run says nothing whatsoever
      about what the tree renders, and must never be cited as though it did.

      **(b) This run is NOT reusable by the merge run** — and that is the correct outcome,
      not a shortcoming. `e2e` did not RUN, so `decideReuse` returns the backstop reason
      (`prior run … was green but did not RUN: E2E (Playwright) … this run is the
      completeness backstop for it`). The `dev` -> `main` merge will therefore classify the
      whole span and do the work. Note the rejection here comes from the THIRD condition, not
      the new fourth one: the run is a `push` run and passes the `event` check.
