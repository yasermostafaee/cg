## ADDED Requirements

### Requirement: The bridge never clears a whole channel's mixer and never batches with BEGIN

The bridge SHALL NOT send a channel-wide `MIXER <ch> CLEAR` on any path: every `MIXER … CLEAR` it sends
SHALL name a layer (`MIXER <ch>-<layer> CLEAR`), because a channel-wide clear resets every layer's transform to
full opacity and volume — revealing and un-muting every seated, hidden plate — and wipes the Playout's own layer
gain. The bridge SHALL NOT use AMCP `BEGIN … COMMIT` batching, which is not frame-aligned on this core; its
`MIXER … DEFER` lines and their `MIXER <ch> COMMIT` SHALL go out outside any such batch.

#### Scenario: No channel-wide mixer clear exists

- **WHEN** the bridge's source is scanned for the text of every `MIXER … CLEAR` line it can build
- **THEN** the only one is the layer-scoped `MIXER <ch>-<layer> CLEAR`
- **AND** that builder still produces `MIXER 1-80 CLEAR` for a bank row (the control)

#### Scenario: No BEGIN batch exists

- **WHEN** the bridge's source is scanned for an AMCP `BEGIN` or `DISCARD` literal
- **THEN** none is found, while the same scan finds the `MIXER <ch> COMMIT` it builds (the control)
