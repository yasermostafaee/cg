# Programme returns for linked engines

Join the signed-in channel catalogue (D4) to the station's configured engine and logical
channel. Match its code in the configured API's `GET /api/v1/channels` and verify the physical
channel number there. Read only linked peers advertised by engine discovery. A reserve's own
channel row must confirm the original channel through `mirrorOf`. Use that row's
`primaryOutput.channelNumber` for the programme feed; the master's cached number is a hint.
A linked engine without a verified return remains visible with no signal.

Each control response belongs to its own engine and channel. An active designation is shown
only for a coherent observation across all linked members. A shared transfer ID can correlate
those observations when their engine-local epochs differ.
An authenticated ticket binds the selected logical channel, physical member, stream kind and
the verified mapping's resource key. Mapping changes close old viewers and retire old tickets.
Return picture and WAV reuse the bridge's separate, demand-driven relays.

The display uses the existing local monitor sound selector. Follow is silent when no active
owner can be verified. Existing A/B meter streams stay visible when the return's verified
engine and physical channel match the meter source. Each verified return also has independent
programme sound. Footer connection and failover labels name the CG Bridge command plane.

## Observed contract, 2026-11-14

Playout 2.18.28 returned linked members in `slaves`, their reverse links in `mirrorOf`, engine
names in `/api/v1/discovery/peers` and ownership in `/api/v1/channels/{code}/redundancy/control`.
The test station had one confirmed reserve. We observed ownership on each side across an actual
station transfer. Both responses named the same owner and transfer ID with engine-local epochs.
The public OpenAPI describes playlist/runtime sync and Playout's own preset
verbs. Before routing external CG writes, establish the command fence on the former owner and
synchronization of direct AMCP changes in the CG banks.

Read-only checks on both linked engines confirmed the ownership observations on Playout 2.19.0.
Its OpenAPI describes a preset ID and string overrides for its own CG Take. Synchronization of
external AMCP graphics, ownership fencing during transfer and reconciliation after a timeout
remain open. The monitoring owner serves as a display signal. The Playout repository review and
an isolated test are the next steps for routing external CG commands.
