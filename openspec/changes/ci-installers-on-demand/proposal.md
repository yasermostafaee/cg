# ci-installers-on-demand — the Windows installers are built when asked, not on every push

Prompt: `CI-INSTALLERS-ON-DEMAND-01` (v1), the owner, 2026-10-11.

## Why

Fixes arrive as separate prompts, one after another, and every code push to `dev` (and again every merge
to `main`) ran the whole Windows pipeline: the installers, then eleven jobs on fresh runners — ~105
runner-minutes and ~951 MB of artifacts a push, half of it the engines. On 2026-10-11 the repository held
936 artifacts, 101,371 MB. None of it ships: a tag rebuilds everything from its own commit. The owner's
rule: **the installers are built when he gives a specific command, not on every push.**

## What changes

- **`installers` runs on request only** (`.github/workflows/desktop.yml`): when the event is not a push (a
  manual run), the ref is a tag, or the head commit message contains `[installers]` — the expression style
  of `guide-shots`' `[guide-shots]`. Every other job but `guide-shots` already `needs: installers`, so an
  ordinary push skips them all. No job-level condition uses `always()`, `failure()` or `!cancelled()`
  (those are step-level only). `release` keeps `if: github.ref_type == 'tag'`; a tag satisfies the new
  condition, so the tag path is unchanged.
- **Shorter artifact lives**: `installer-engines` 14 days → 2 (job to job only); the three installers 30
  days on a tag's run, 7 on any other run. Every other artifact is unchanged.
- **The rule, written down**: `CLAUDE.md` ("Commit & merge policy") and ADR 0011 §12. A change's report
  says "Desktop skipped by design" unless the prompt asked for installers.

## Impact

- Changed: `.github/workflows/desktop.yml` (one job-level `if`, four `retention-days`, comments);
  `CLAUDE.md`; `docs/adrs/0011-desktop-delivery.md`.
- Unchanged: every job's steps, `release`, `paths-ignore`, the concurrency block, `pr.yml`. What the
  installers contain. No wire, schema or persisted key.
- Branch rules: `main`'s one ruleset requires only `Lint • Typecheck • Test • Build` (`pr.yml`); `dev` has
  none. No required check is a Desktop job, so a skipped Desktop run blocks no merge.
- Spec: `desktop-delivery` — one requirement ADDED (not MODIFIED: the pending `installer-design` change
  already modifies "CI SHALL build three Windows installers…", and a second MODIFIED of that header would
  collide at archive).
