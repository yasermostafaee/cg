## Ownership boundary

`playlistOf` identifies a source as the output of a Playout programme channel. Its Live Source copy
is a second route on a CG-owned layer and remains at zero under contract v1.3. Programme gain belongs
to the original Playout path, so the control requires a Playout endpoint; it is not implemented as
`MIXER ... VOLUME` against the Playout-owned playlist layer.

The [2.18.17 handoff](../../../docs/integration/playout/source-previews-2.18.17-adoption.md)
defines GET and PUT `/api/v1/channels/{code}/programme-gain` on the Engine that owns the output.
Use the acting operator's bearer and the current D4 code. Send the expected revision, a gain
from −60 to +12 dB and an optional ramp from 0 to 5000 ms. A 202 means the setting was saved
and native confirmation is pending. Re-read after a conflict or uncertain reply.

The original Playout path is adjustable while its CG frame copy is muted. Peer replication is
asynchronous. CG reads the new owning Engine after failover and needs an operator session
authorized on that Engine before writing. Disable the control when the owner, capability or
session cannot be verified.

The Bridge reads the active owner's state with the acting console session. An edit ticket binds
the revision to that socket, logical channel, owner mapping and bearer. A new owner or expired
ticket requires a fresh read. Both IPC channels are optional for older Bridge versions.

The active Live Source ledger reports whether a visible frame currently uses the Playlist output.
It compares the recorded route to the current catalogue and reports unknown when an adopted or
old-epoch record cannot confirm that match. The operator opens **Playlist gain** in **Live plates**.
The control applies to the original output even when a frame uses it. **0 dB** stages unity and
**Apply** sends it. A saved change awaiting native acknowledgement is shown as pending and read again.

The current console session is issued by Engine A. While B is the active owner the control displays
the need for a B-authorized operator session. The backup's station service session remains scoped to
its existing duties.
