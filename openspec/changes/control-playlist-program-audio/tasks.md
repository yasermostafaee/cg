## 1. External contract

- [x] 1.0 Ask for the programme-gain contract in the Playout team handoff for 2.18.10.
- [x] 1.1 Obtain the Playout team's authenticated programme-gain read/set contract in 2.18.17.
- [x] 1.2 Record range, ramp, persistence, ownership, A/B and on-air-frame policy in the [handoff record](../../../docs/integration/playout/source-previews-2.18.17-adoption.md).

## 2. Implementation after contract

- [x] 2.1 Add Bridge client, IPC and authorization coverage without addressing Playout-owned layers.
- [x] 2.2 Derive whether each Playlist output is referenced by an on-air frame.
- [x] 2.3 Add the operator control and unavailable reason. On B, an acting operator session is required.
- [x] 2.4 The six focused Playlist-route integration tests confirm `VOLUME 0` through take, swap
      and reconnect, plus refusal of any AMCP write to the original Playout layer.

## 3. Verification

- [ ] 3.1 Run focused contract/DOM/integration tests and the full gate.
      Fifty focused Bridge tests passed, including an authenticated WebSocket round trip to the
      simulated Engine and the station-fence, permission and lock censuses.
      Both package typechecks and scoped lint passed. Seven Runtime DOM and parity tests passed.
      Chromium on a fresh build verified the no-frame control, numeric bounds, staging unity,
      a single explicit Apply, pending-to-applied acknowledgement and the backup sign-in refusal.
- [ ] 3.2 Verify gain and duplicate-path behaviour with the real Playout plant.
