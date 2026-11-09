## 1. External contract

- [x] 1.0 Ask for the programme-gain contract in the Playout team handoff for 2.18.10.
- [ ] 1.1 Obtain the Playout team's authenticated programme-gain read/set contract.
- [ ] 1.2 Record range, ramp, persistence, ownership, A/B and on-air-frame policy.

## 2. Implementation after contract

- [ ] 2.1 Add Bridge client, IPC and authorization coverage without addressing Playout-owned layers.
- [ ] 2.2 Derive whether each Playlist output is referenced by an on-air frame.
- [ ] 2.3 Add the operator control and unavailable reason.
- [ ] 2.4 Prove every Playlist frame route remains `VOLUME 0` through take, swap and reconnect.

## 3. Verification

- [ ] 3.1 Run focused contract/DOM/integration tests and the full gate.
- [ ] 3.2 Verify gain and duplicate-path behaviour with the real Playout plant.
