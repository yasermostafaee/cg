## Implementation

- [x] Carry the optional per-preset destinations and effects into Designer documents and the exported live-source carrier.
- [x] Author the settings in the Designer composition Inspector and exercise the normal export entry point.
- [x] Reuse the numbered Focus, direct effects and Return in CG Control and CG Bridge.
- [x] Windows Chromium verified the Designer settings, switching the selected preset, the saved `.cgproj` and the exported `.vcg`.
- [x] Windows Chromium verified numbered Focus in CG Control PVW using a generated Designer page.
      The direct Fade showed both planes, Return restored the exact origin, and the PGM preset stayed unchanged.
- [ ] Verify the carrying Linux E2E step and target station.

## Bridge verification

- [x] Local Bridge integration (2 cases) passed on mapped mock engines A/B. Designer-authored Focus
      and Return use the 240 ms motion. Direct Focus uses the authored 320 ms Fade or Push. Both
      engines retain their video seats. Return restores the originating geometry and input bindings.
