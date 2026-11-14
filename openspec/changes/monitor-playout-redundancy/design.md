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
The Playout team's `cg-redundancy-contract-2.19.0.fa.md` reports 125 passing scoped tests and
control transfer probes with two and four logical HTTP hosts. After transfer, the old owner's
Transport endpoint rejected a write while its CG Update still accepted it into a local
in-memory store. The new owner had no CG state, and no native command executed in the probe.
The current mirror covers Playlist and Transport and can target only the selected peer after
takeover. The report names the reviewed binaries and distinguishes these tests from an
isolated test containing native engines and live PGM.

## External CG v2, 2026-11-15

The Playout team's external-cg-v2-implementation.fa.md describes an opt-in Engine/Core
candidate based on 2.19.0. Its isolated tests use two or four real Core processes, real
HTML and recorded programme output. They exercise replica state and stale-owner rejection.
The full Windows Service, physical outputs and the real CG Bridge/Control pair remain
acceptance work.

On opted-in channels, Bridge commands must use the authoritative self-confirmed owner
from the External CG v2 API and send the returned fence unchanged. Programme monitor
ownership stays a display signal. The write path sends one durable command ID for an
absolute graphics state, queries its result after ambiguity and never retries that
state at a second owner. Raw AMCP writes are refused on migrated channels. Legacy
stations retain the existing Bridge command route.

The API prepares a hashed template bundle on every member. Warm takeover uses an applied
replica. Cold recovery needs an absolute applyState adapter that resumes without replay.
The v2 mask is a normalized rectangle and Stop cuts picture and sound. Current multiple
mask fragments, coordinated preset effects and authored outros require an explicit
contract and matching acceptance tests. Two members both have to vote for a new owner.
A four-member group has quorum with three members, and auto-acquire is disabled by default.
