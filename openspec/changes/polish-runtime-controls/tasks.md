# Tasks — Runtime control styling + interaction feedback (R-007)

## 1. Tokens + mechanism foundation

- [x] Extend `apps/runtime/src/renderer/theme.ts` — semantic color roles
      (accent/caution/danger/success/dirty + kept air-state), spacing scale,
      radii, type scale, borders/elevation, motion durations. Keep
      `airStateVisual` + the sacred colors; add a badge-tone mapping.
- [x] `apps/runtime/src/renderer/ui/controls.css` — `:root` `--r-*` custom
      properties mirroring `theme.ts`; component classes (`.cg-btn` + variants,
      `.cg-field`, `.cg-badge`, `.cg-chip`, `.cg-pill`, spinner keyframes, focus
      rings) with hover/active/focus-visible/disabled/`[aria-busy]` states and a
      `prefers-reduced-motion` block. Import it in `main.tsx`.
- [x] Token-parity unit test (`theme.ts` values == `controls.css` `--r-*`).

## 2. Primitives (`renderer/ui/`)

- [x] `Button.tsx` (variants: play/primary, update/secondary, caution, danger,
      ghost/icon) — plain hover/press/focus, no async.
- [x] `AsyncButton.tsx` — the async-feedback state machine (150ms→spinner,
      ≥300ms floor, success-flash, inline `role="alert"` error, double-fire
      guard, `aria-busy`; injectable clock; reduced-motion static affordance).
- [x] `StatusBadge.tsx` (from `airStateVisual`, all states incl. UNCONFIRMED),
      `DraftChip.tsx`, `usePrefersReducedMotion.ts`. Field styling is the shared
      `.cg-field` class applied directly to the existing controlled elements (NO
      wrapper component — the safest realization; see design.md "Input
      primitives"), so R-003's `NumberField` raw-string behavior is untouched.

## 3. Vertical slice — Stack row (STOP after this)

- [x] Rework `StackRow.tsx`: PLAY (rename from TAKE, label + aria) / Update / Out
      / Remove as `AsyncButton`s with the deliberate hierarchy; the badge via
      `StatusBadge` (style every state incl. UNCONFIRMED); the row `● draft` chip
      via `DraftChip`; row hover/selected/focus.
- [x] `StackPanel.tsx` + `applyDraft.ts`: return the round-trip promises so the
      buttons track their own in-flight state (clear-on-accepted preserved).
- [x] Update the `TAKE`→`PLAY` selectors in `stack-badge-settle.spec.ts` and
      `stage-inspector-edits.spec.ts` (Take row buttons).
- [x] STOP: operator browser checklist (hover/press/focus every control; Update
      busy→success while the badge settles separately; bridge-down error state;
      CasparCG-stop UNCONFIRMED; Tab focus rings; PLAY reads correctly). Iterate
      to approval BEFORE touching other surfaces.

## 4. Rollout (after operator approval of the slice)

- [x] Inspector + ListFieldEditor: header Update (`AsyncButton`) / Discard
      (`Button` ghost), controlled fields → `.cg-field` (+ `is-dirty`), dirty-dot + `● draft` via `DraftChip`, list ↑/↓/× + Add item as ghost/secondary
      `Button`s. Deleted the dead inline button/input `const styles`.
- [x] Library: Import (`Button` — opens the file picker) + Load (`AsyncButton`).
      StatusBar + LinkIndicator: pills via `.cg-pill`, Failover (`AsyncButton`),
      Audit + Lock (`Button` — Lock prompts). FailoverBanner (Dismiss `Button`),
      AuditPanel (Refresh `AsyncButton`, Close `Button`, filters `.cg-field`),
      LockOverlay (Unlock `Button` — bespoke attempt-count error UX; PIN
      `.cg-field`). Deleted dead inline button/input styles as each converted.

## 5. Gate

- [x] Full green gate UNCACHED (`turbo --force`) for `@cg/runtime` + repo
      `format:check`; `pnpm test:e2e` (with the PLAY selector updates).
- [x] `pnpm openspec validate polish-runtime-controls --strict`.
- [x] Confirm no bridge/schema/behavior change (state it in the report).

## 6. Live validation (operator) + wrap-up

- [ ] Final STOP: one full-browser pass by the operator.
- [ ] After PASS: tick tasks, flip R-007 → `[x]` (build 2.5.0 `69e8ad5`),
      archive per the workflow, push, compare URL, report.
