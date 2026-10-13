## 1. Part A — the pipeline on request

- [x] 1.1 `installers` gets a job-level `if`: not a push, or `github.ref_type == 'tag'`, or
      `contains(github.event.head_commit.message, '[installers]')`; the header says what runs when —
      `94c0b91e`
- [x] 1.2 Read, not assumed: every other job but `guide-shots` `needs: installers`; no job-level
      `always()` / `failure()` / `!cancelled()`; `release` unchanged
- [x] 1.3 Branch rules read through `gh api`: `main` requires only `Lint • Typecheck • Test • Build`; `dev`
      has no rule

## 2. Part B — artifact lives

- [x] 2.1 `installer-engines` 14 → 2 days; the three installers `${{ github.ref_type == 'tag' && 30 || 7 }}`
      — `dfed7b9b`

## 3. Part D — the rule, written down

- [x] 3.1 `CLAUDE.md` "Commit & merge policy"; ADR 0011 §12; this change's ADDED requirement

## 4. Part E — proved on GitHub

- [x] 4.1 A push without the marker: Desktop run
      https://github.com/yasermostafaee/cg/actions/runs/38158607451 on `dfed7b9b` — all 13 job entries
      `skipped` (`Installers (Windows)` included), 0 artifacts
- [x] 4.2 Does an EMPTY push reach the workflow? **No — measured.** The empty probe `e9094b4d` (no marker,
      no file) got its `pr.yml` run https://github.com/yasermostafaee/cg/actions/runs/38160319450 (the
      positive control: the push event fired) and **no Desktop run at all**: `paths-ignore` treats a push
      that changes no file as all-ignored. So an empty marker commit builds nothing; the marker works only on
      the head of a push that changes a non-docs path, and otherwise installers are asked for by a manual
      run. `CLAUDE.md` and this change's spec say so
- [x] 4.3 A manual run (`gh workflow run Desktop --ref dev`) end to end, green: Desktop run
      https://github.com/yasermostafaee/cg/actions/runs/38160390947 on `e9094b4d` — `completed/success`,
      all 13 build and test jobs RAN and passed (`Draft release` skipped: not a tag). Its artifacts: the
      three installers 220.4 / 228.9 / 24.5 MB, each expiring 7.0 days on; `installer-engines` 471.3 MB, 2.0
      days on — so `upload-artifact@v7` takes the expression; every other artifact unchanged (14 or 30 days)
- [x] 4.4 The tag path, by reading only (no tag cut): on a tag push `github.event_name` is `push` and
      `github.ref_type` is `tag`, so the second clause makes the new `if` true; the workflow's diff from
      `6a49e8a8` to `dfed7b9b` is the header comment, the one `if`, and four `retention-days` —
      `release` and every step byte-identical. A tag's installers still live 30 days; its engines now 2
      (read only by the same run's smokes)
