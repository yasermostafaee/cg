# Tasks — timing-setting-ownership

## 1. Record the decision

- [x] 1.1 ADR 0009 `docs/adrs/0009-timing-setting-ownership.md` — the rule, the sentence, the
      example, the two ownership lists, what each of the three surfaces shows, and the deferred
      delay with every decision it inherits.
- [x] 1.2 Golden rule 13 in `CLAUDE.md`, pointing at the ADR so both apps' authors meet it.

## 2. Apply it — the Designer's preview

- [x] 2.1 Remove `mode` and `holdSource` from `TimingOverride`
      (`PreviewTimingControls.tsx`) — the CHANNEL, not just the control.
- [x] 2.2 Replace the two selects with `Tag` facts (`t.fact`: no border, no background, full text
      colour), each with a `data-testid` and an `aria-label`.
- [x] 2.3 Add the one-line hint saying where the values are authored.
- [x] 2.4 `effectiveMode(source)` — one argument; documented as the single canonical answer to
      "what mode will this scope run in".
- [x] 2.5 `PreviewScopeTiming` gates nested scopes on the stored mode.
- [x] 2.6 `PreviewTimingControls.css.ts` — the `fact` style, with the reason a fact carries no
      control chrome written beside it.

## 3. Chase the ripples

- [x] 3.1 `tests/preview-scope-timing.test.ts` — the stale two-arg `effectiveMode` assertion
      replaced. ⚠ The Designer's `tsconfig.json` includes only `src/**/*`, so the stale call
      would NOT have failed typecheck and the test would have gone on passing while asserting
      gone behaviour. Found by hand, not by the compiler.
- [x] 3.2 New test pinning the arity and that a would-be override cannot change the answer.
- [x] 3.3 `e2e/fixtures/designer.ts` — `setPreviewTiming` loses its `mode` option (the method had
      zero callers; pathspec proven live at 1 file / 1 hit before trusting that zero).
- [x] 3.4 `e2e/content-less-timed-hold.spec.ts` — mode authored in the inspector; the out-point
      test now asserts NO select exists and the fact states `Static`.
- [x] 3.5 `e2e/nested-content-drives-parent-hold.spec.ts` — asserts the hold FACT, same subject
      (the per-scope content check recurses into the nested composition).
- [x] 3.6 `e2e/video-preview-rebuild.spec.ts` — mode authored before the modal opens; the hold
      knob is the rebuild trigger, preserving the experiment's variable.

## 4. Spec

- [x] 4.1 `specs/designer-playout-lifecycle/spec.md` — ADDED the ownership requirement; MODIFIED
      "No-code playout timing modes" (the preview-matches-inspector scenario is superseded) and
      "Preview timing overrides are per-scope and session-only" (`mode` removed from the override
      list; nested relevance reads the stored mode).
- [x] 4.2 `pnpm openspec validate timing-setting-ownership --strict` — valid.

## 5. Gate

- [x] 5.1 `pnpm gate` green, uncached (`cache bypass, force executing`), BOTH apps — Designer
      1422 tests / 144 files, Runtime 160 files, 80/80 openspec items.
- [x] 5.2 🔴 Linux `e2e` on GitHub Actions — DISCHARGED. Both commits carrying this change have a
      COMPLETED, `success` run whose `E2E (Playwright)` job actually RAN (conclusion `success`,
      not `skipped`):
  - `4e8052b1` (the change) — https://github.com/yasermostafaee/cg/actions/runs/34903938272
  - `3ca52a93` (the `hold source` label fix, = `dev` HEAD) —
    https://github.com/yasermostafaee/cg/actions/runs/34905101660

## 6. Found while doing this — NOT fixed here, each needs its own commit

- [ ] 6.1 `hasAnyContentIn` (`PreviewScopeTiming.tsx`) has NO media branch — 0 hits for
      `video` / `lottie` / `drivesHold` where `PlayoutSection.tsx` scores 14 / 10 / 29. It is a
      second local copy of a canonical predicate (golden rule 6), so a scope whose only hold
      driver is a media element is content-driven in the inspector and in the runtime while the
      preview shows no hold row at all. Pre-existing, but it matters more now the preview
      ASSERTS rather than offers. Should reuse `hasEffectiveHoldDrivers`.
- [ ] 6.2 The Designer's `tsconfig.json` includes only `src/**/*`, so `typecheck` never sees
      `tests/` — the Runtime's DOES include `tests/**/*`. A stale call signature in a Designer
      test passes silently (task 3.1 was exactly that). Fixing it means widening that task's
      turbo `inputs` in the SAME commit, or the green means nothing under a cache hit.
- [ ] 6.3 The per-element row labels compose operator data as `{name} — passes` with no `<bdi>`
      isolation (golden rule 11). Element names can be Persian; the separator is a neutral.

## Out of scope

- [ ] The between-passes delay — SCHEMA STOP. See `proposal.md` and ADR 0009. Build nothing until
      the owner rules on the schema change.
