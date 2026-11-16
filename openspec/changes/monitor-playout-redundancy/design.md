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
engine and physical channel match the meter source. If the selected verified return has
no meter binding, the console measures stereo peaks from that return's authenticated PCM
stream. It reuses that stream for listening and never substitutes another engine's levels or
generates a loudness reading from the peak. Hiding the VU releases a PCM stream used only for
metering. A shown meter keeps its scale with empty bars when no source or data is available.
The console's saved visibility is separate from the speaker toggle. Footer connection
and failover labels name the CG Bridge command plane.

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

## Installed station, 2026-11-16

Both station members at `192.168.21.32` and `192.168.21.43` report
`2.19.0-externalcg.11`. For the actual channel code `apasai`, the deployed owner and state
endpoints on both members answer `404 cg.channelNotMigrated`. The command path on CG Bridge
1.2.8 is the legacy mirror. Playout reports `192.168.21.43` as the playlist owner at the same
time that Bridge reports A as its primary command target.

The reviewed v2 command request addresses one layer and defines absolute HTML or live-input state.
A live layout includes multiple input and HTML layers and can also bind local media plates.
Require a supported representation for these media plates and a synchronized state change
across the layout's layers before accepting this workflow on a migrated channel. Validate with
the Bridge adapter and mapped sources on an isolated channel before production migration.

The legacy backup-media match still needs a readable entry with the same D11 fingerprint in
the backup library. A healthy Playout redundancy status alone does not establish whether a
specific file has a matching D11 entry. The status message directs operators to the sync and index.

## External CG v2 layout contract, 2026-11-17

The Playout `2.19.0-externalcg.12` handoff includes an OpenAPI contract, actual HTTP exchanges
and captures from two and four real Core processes. It proves one coordinated Live, video and
HTML layout per Core and delivery of a newly synced media file under a different cache path
on each reserve. The documented minimum is Engine `.12` plus Core with `ApasaiCIaB-CgLayout1`
on every member. The tested return is Core PGM and the host is an isolated Kestrel harness.
Windows Service, real CG Bridge and a physical programme return remain acceptance work.

The authenticated D11 exchange uses `replica-<64 hex>` IDs on reserves. The previous CG
cap of 48 characters discarded those otherwise valid rows before checking the fingerprint.
D11 now uses its separate limit of 128 characters. The bridge still uses only an exact
fingerprint match and sends the reserve's own clip path. D10 input IDs keep their prior limit.
The new optional D11 frame rate is available to a future managed video layout command.
The real station records for the two reported clips have replica IDs, but no authenticated
D11 response for those clips was captured there. Their exact station outcome remains open.

A managed layout replaces the entire set of external layers on the channel. It uses
`operation: "layout"`, the lowest configured allowed layer as its target anchor, no `state`
property, and complete absolute state for each layer. The bridge will need a whole-channel
ledger and station-approved layer allocations before using it. Native reserves resolve Live
by logical input ID and video by verified D11 fingerprint and frame range. Verify a clean
Playlist output source explicitly. The current managed media operation covers video.

For each new command, require a fresh self-confirmed active owner at that member's configured
endpoint and use its own operator session, revision, physical channel and unmodified fence.
Service and monitoring tokens do not authorize writes. Persist the exact request and its ID
before sending. After transport ambiguity, inspect the original result and reconcile its
native receipt; the original command ID must never be reused with a new payload or fence.
An unresolved result holds new writes. On migrated channels there is no raw AMCP fallback.

Each member prepares the same hashed manifest. To resume an HTML producer at the applied
state without replaying its entrance, the exported page needs an absolute `APASAI_STATE`
handler. The overall layout must preserve the authored behavior needed by the migrated
channel, including title and field state, absolute sequence page, masking and stable
instance identity. Managed effects need explicit equivalence to the existing PVW and PGM
behavior before use on air.

The `.12` rollback test preserves the previous picture but leaves the command unresolved.
Terminal recovery with evidence of the applied or restored revision remains an Engine
dependency for unattended on-air use. A Bridge may report and hold the unresolved
command while testing; an operator may not bypass it by issuing a new ID or clearing the
journal. Replica readiness is per member and per applied revision. A successful result
on the owner does not imply every reserve is ready to take control.
