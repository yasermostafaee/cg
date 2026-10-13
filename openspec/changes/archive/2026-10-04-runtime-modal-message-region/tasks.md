# Tasks

## 1. Audit

- [x] 1.1 Find the reference implementation (`FixedBankConfigModal`) and read how it renders
      its message.
- [x] 1.2 Check EVERY Runtime dialog against it — including the ones that look fine — and
      record region-vs-local and the measured contrast for each.
- [x] 1.3 Establish whether the Designer shares the primitive. **It does not**: it has its own
      `features/shell/Modal.tsx` with no message region at all. Out of scope, reported.

## 2. Adopt

- [x] 2.1 `Modal.message` takes `ModalMessage | ModalMessage[]` (`{ role, text, detail? }`,
      string fields) instead of `ReactNode`.
- [x] 2.2 `ui/Notice.tsx` — the one spelling of the two treatments, with the measured ratios
      recorded beside the values.
- [x] 2.3 `FixedBankConfigModal` — local amber box → `refusal` role (appearance unchanged).
- [x] 2.4 `SourceMappingsModal` — local `colors.error` → `refusal` role (2.13:1 → 11.21:1).
- [x] 2.5 `DelimitersModal` — moved OUT of the scrolling body into the region, → `refusal`.
- [x] 2.6 `ServerSettingsPanel` — four local spellings → `refusal` ×3 + `notice`; the in-body
      LAN note keeps its placement and loses its private copy of the amber box.
- [x] 2.7 No new colour introduced; the three red spellings deleted rather than replaced.

## 3. Enforce

- [x] 3.1 Type-level: `message` accepts no markup — verified by a probe that fails `tsc`.
- [x] 3.2 Lint: `no-restricted-syntax` bans `role="alert"` inside a `<Modal>` subtree in
      `src/renderer/**/*.tsx` outside `ui/` — verified by a probe that fails `eslint`.

## 4. The owed in-viewport E2E

- [x] 4.1 `apps/runtime/tests/e2e/modal-message-in-viewport.spec.ts` — a genuinely scrolling
      body, a real validator refusal, `toBeInViewport({ ratio: 1 })`, and a negative control.
      Verified RED against the reintroduced in-body placement.
- [x] 4.2 Debt marked discharged in `DEBT.md` and `DEBT-SWEEP.md`.
- [x] 4.3 **Linux `gate:e2e` — DISCHARGED 2026-08-11.** A green Windows run is not a discharge;
      this one is a COMPLETED, GREEN `e2e` job on `ubuntu-latest`:
      <https://github.com/yasermostafaee/cg/actions/runs/31414808016> — commit `bd88ede`, a later
      `dev` HEAD that CONTAINS this change's `e1e2d03` (verified with
      `git merge-base --is-ancestor`, not inferred from dates). Run `status: completed` /
      `conclusion: success`; the `E2E (Playwright)` job's OWN conclusion is `success` and its
      `E2E` step actually executed (~10 min) — a `skipped` job would have discharged nothing
      (P-029). `pnpm test:e2e` is not diff-scoped, so the run exercised the whole Playwright
      suite at that SHA, `modal-message-in-viewport.spec.ts` included.

## 5. Prose

- [x] 5.1 `Live sources`: three paragraphs → the one fact that changes what the operator does;
      the band rule becomes a hint on the band control. No wording rewritten for the new
      sources model (that is `TASK A5`).

## 6. Tests and gate

- [x] 6.1 `tests/modalMessageRegion.dom.test.ts` — the census: every dialog that can speak
      renders through the region. Asserts the MECHANISM, never a colour.
- [x] 6.2 Persian/RTL asserted (`dir="auto"` in the unit spec; an RTL label beside the message
      in the E2E).
- [x] 6.3 Full green gate (`pnpm gate`, uncached).
