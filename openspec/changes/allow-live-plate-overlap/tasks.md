## 1. Designer

- [x] Add and persist the composition's **Allow live plate overlap** option.
- [x] Carry authored paint order for nested frames and each preset through Preview and export.
- [x] Verify default refusal, nested stacking, the preset boundary and existing linked Reveal.
      The focused Designer unit suite passed 68 cases. Windows Chromium verified opt-in,
      authored reorder and VCG export, and the existing linked mask editor.
- [x] Expose the same open composition setting in the single-plate and multi-plate **CG Control**
      Inspector section. Focused tests verify corner overlap, the parent composition's own setting
      and exclusion of unrelated compositions.

## 2. CG Bridge

- [x] Plan producer layers in the authored order for Take and preset changes.
- [x] Refuse unsatisfied order and capacity constraints before changing programme.
- [x] Verify supported, conflicting and undersized plans, including existing masks and producer ownership.
      The seven focused Bridge cases passed.

## 3. Output verification

- [x] Windows Chromium verified a real test Bridge places two opted-in live producers in the
      authored paint order on Take.
- [ ] Verify actual overlap pixels and safe preset changes on CasparCG.
- [ ] Record carrying Linux Playwright verification.
