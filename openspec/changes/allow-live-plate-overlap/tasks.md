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

## 4. Default-on and authored restriction

- [x] Apply authored paint order by default and preserve explicit off across save and export.
      Focused Designer, schema and VCG tests passed for the new default and explicit restriction.
- [x] Export the owner's updated `3ghab.cgproj` with the masked foreground intact.
      Windows Chromium downloaded the VCG from Designer and verified `plate-4` above `plate-2`
      with its unchanged window in presets 2 and 3.
- [x] Import that VCG through CG Control and take it on the isolated Bridge and AMCP stand-in.
      Both presets used layer 60 for `plate-2` and layer 62 for `plate-4`, applied the appropriate
      CLIP, and switched presets without replaying the inputs.
- [ ] Record the carrying Linux Playwright result.
