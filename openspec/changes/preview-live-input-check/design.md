# Design — preview-live-input-check (C-023)

## Scope

An operator can check one saved Playout input before using it. The check has its own picture,
optional speaker and `PVW INPUT` meter. The retained-page rehearsal, its live placeholders,
programme output and PGM meter keep their own data paths. Per-input thumbnails, automatic scanning,
multiple simultaneous sources on the same programme channel and direct producer-health monitoring
are outside this design.

## Playout authority

The [2.18.12 handoff](../../../docs/integration/playout/PLAYOUT-CG-RESPONSE-LIVE-PREVIEW-v1.md)
provides the versioned contract. The Bridge resolves the programme channel's D4 code and translates
the resolved CG catalogue id to the saved D10 input id. It verifies the socket's permission and
lock state and uses the verified operator bearer from that socket. The Bridge service's own bearer
has a different ownership scope.

The capability request must advertise lease v1 before any POST. A start is sent once with a UUID.
A pending or uncertain start is reconciled by that request id, within a bounded deadline. A ready
lease must match the exact request and input, expected relative URLs and identity. The engine can
replace it from another client and enforces the owner and conditional stop. The Bridge does not
fall back to legacy start/stop, preview ports or AMCP.

## Bridge ownership and delivery

`LivePreviewService` holds one check per socket and one active check per logical programme channel.
It serializes lifecycle writes per channel. A replacement retires the old picture, sound and meter.
A late callback is fenced by the check handle and the server's lease. Loss of the owning socket,
token, channel grant, catalogue availability, inactivity or a local close ends the check. Clean
shutdown attempts the same conditional stop. After a crash, Playout's 90-second lease timeout
provides recovery. The Bridge cannot assume ownership of a lease found after restart.

Short-lived, one-use HTTP tickets scope picture and sound independently by channel and preview id.
Bridge parses the authenticated multipart picture and relays bounded JPEGs with a four-byte big-endian
length. It only opens the WAV when the operator explicitly requests a sound ticket. The WAV reader
reuses the PGM PCM scheduling implementation with a separate audio context and without reconnecting
a failed preview stream. The relays close when the response, lease or owning check ends.

Socket status polls read the input-only meter snapshot. Bridge checks lease, generation, core
generation, logical channel code, preview channel and layer. The viewer ages the accepted meter
to floor within the remaining 300 ms budget. Meter expiry alone leaves valid moving picture visible.
Each start, replacement and attempted stop has a scoped audit entry.

## Operator surface

PVW offers `Check input`. Each eligible input row in Source defaults offers the same explicit
check action beside the normal selection. The modal hosts the same card for checks launched there
and the picker returns focus to the field. The chosen source, draft, save state and rehearsal are
independent of the check. No browser state persists the check or its speaker.

The card shows a live picture only after the browser decodes a frame, and clears it when frames
stall or the check ends. The speaker starts off on each check. The meter's label identifies the
input even when the speaker is muted. Playout's current transport and OSC cannot distinguish
healthy video from repeated fallback frames, so source-signal fallback requires other evidence.

## Verification

Use a signed fake Playout fixture with the native HTTP shapes, independent PGM, and a real Bridge
and browser to exercise the two doors, lease ownership, picture, optional sound and meter.
Confirm hardware behavior separately on an approved off-air 2.18.14 channel with PGM observed
independently. The active tasks track the station matrix and Linux browser run.
