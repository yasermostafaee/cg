# Tasks — Runtime control styling + interaction feedback (R-007)

## 1. Tokens + mechanism foundation

- [ ] Extend `apps/runtime/src/renderer/theme.ts` — semantic color roles
      (accent/caution/danger/success/dirty + kept air-state), spacing scale,
      radii, type scale, borders/elevation, motion durations. Keep
      `airStateVisual` + the sacred colors; add a badge-tone mapping.
- [ ] `apps/runtime/src/renderer/ui/controls.css` — `:root` `--r-*` custom
      properties mirroring `theme.ts`; component classes (`.cg-btn` + variants,
      `.cg-field`, `.cg-badge`, `.cg-chip`, `.cg-pill`, spinner keyframes, focus
      rings) with hover/active/focus-visible/disabled/`[aria-busy]` states and a
      `prefers-reduced-motion` block. Import it in `main.tsx`.
- [ ] Token-parity unit test (`theme.ts` values == `controls.css` `--r-*`).

## 2. Primitives (`renderer/ui/`)

- [ ] `Button.tsx` (variants: play/primary, update/secondary, caution, danger,
      ghost/icon) — plain hover/press/focus, no async.
- [ ] `AsyncButton.tsx` — the async-feedback state machine (150ms→spinner,
      ≥300ms floor, success-flash, inline `role="alert"` error, double-fire
      guard, `aria-busy`; injectable clock; reduced-motion static affordance).
- [ ] `StatusBadge.tsx` (from `airStateVisual`, all states incl. UNCONFIRMED),
      `DraftChip.tsx`, `Spinner.tsx`, and `TextInput`/`TextArea`/`NumberField`
      class wrappers (NumberField preserves R-003 raw-string behavior verbatim).

## 3. Vertical slice — Stack row (STOP after this)

- [ ] Rework `StackRow.tsx`: PLAY (rename from TAKE, label + aria) / Update / Out
      / Remove as `AsyncButton`s with the deliberate hierarchy; the badge via
      `StatusBadge` (style every state incl. UNCONFIRMED); the row `● draft` chip
      via `DraftChip`; row hover/selected/focus.
- [ ] `StackPanel.tsx` + `applyDraft.ts`: return the round-trip promises so the
      buttons track their own in-flight state (clear-on-accepted preserved).
- [ ] Update the `TAKE`→`PLAY` selectors in `stack-badge-settle.spec.ts` and
      `stage-inspector-edits.spec.ts` (Take row buttons).
- [ ] STOP: operator browser checklist (hover/press/focus every control; Update
      busy→success while the badge settles separately; bridge-down error state;
      CasparCG-stop UNCONFIRMED; Tab focus rings; PLAY reads correctly). Iterate
      to approval BEFORE touching other surfaces.

## 4. Rollout (after operator approval of the slice)

- [ ] Inspector + ListFieldEditor: header Update (`AsyncButton`) / Discard
      (`Button`), controlled fields → `TextInput`/`TextArea`/`NumberField`,
      dirty-dot + `● draft` via the shared tokens, list ↑/↓/×/Add as ghost
      `Button`s. Delete the inline `const styles`.
- [ ] Library: Import (`AsyncButton`) + Load (`AsyncButton`), rows/error via
      classes. StatusBar + LinkIndicator: pills via `.cg-pill`, Failover/Lock
      (`AsyncButton`), Audit (`Button`). FailoverBanner, AuditPanel (Refresh
      `AsyncButton`, Close/filters `Button`/`.cg-field`), LockOverlay (Unlock
      `AsyncButton`, PIN `TextInput`), App shell. Delete dead inline styles as
      each is converted.

## 5. Gate

- [ ] Full green gate UNCACHED (`turbo --force`) for `@cg/runtime` + repo
      `format:check`; `pnpm test:e2e` (with the PLAY selector updates).
- [ ] `pnpm openspec validate polish-runtime-controls --strict`.
- [ ] Confirm no bridge/schema/behavior change (state it in the report).

## 6. Live validation (operator) + wrap-up

- [ ] Final STOP: one full-browser pass by the operator.
- [ ] After PASS: tick tasks, flip R-007 → `[x]` (build 2.5.0 `69e8ad5`),
      archive per the workflow, push, compare URL, report.
