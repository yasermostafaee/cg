## Implementation

- [x] Add local panel positions and named UI profiles without station writes.
- [x] Keep retained panels and resize direction correct when positions change.
- [x] Consolidate New live layout under Templates and update affected browser fixtures.
- [x] Windows unit and DOM tests cover legacy shell records, local profile restoration and independent session monitor visibility (23 tests across three files).
- [x] Windows Chromium verified the physical default and rearranged panel positions at RTL, including opposite pointer drags on the Inspector dividers, resizing the lower monitor strip, and the narrow Inspector overlay. The preview pane and selected row stayed mounted. Save, load, delete, and reload restored the expected UI profiles and panel sizes.
- [x] Windows Chromium verified New live layout through Templates and exercised layout authoring, Focus, PVW input audio without programme commands, and existing layer-profile safe guide save and load.
- [ ] Record carrying Linux Playwright verification.

- [x] Windows Chromium verified that the reset is available in General, is disabled at the shipped default, is absent from the Layers header, and restores the default panel layout.
