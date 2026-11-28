## 1. Media availability

- [x] Set an explicit by-ID limit and establish absence only from complete replies.
- [x] Refresh bound clips from search, preserve binding and playback settings, and order
      overlapping observations per bound ID.
- [x] Verify local HTTP and Bridge regressions for complete and incomplete reads, Recent recovery
      and concurrent observations. All 41 tests passed.
- [x] Verify current exact-ID Media matches take precedence over a saved unavailable status in
      CG Control. All 30 focused DOM tests passed.
- [ ] Verify Recent and bound-media availability against the target Playout.
- [x] Verify layout import, catalogue and Programme Take through the WebSocket Bridge and AMCP mock for picker selection, exact by-ID import and a previously saved layout. Confirm unselected media stay transient and older observations cannot replace a newer clip path.
