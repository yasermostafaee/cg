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

## Managed layout transport and command recovery

The .16 installer provides the owner, receipt and layout contracts. The .22 API publishes the
corresponding command request model. The executor accepts a complete layout with prepared
templates for an explicitly configured group. Each API origin uses its own operator session.
It selects one self-confirmed owner after checking the configured member mappings, lease and
fence and checking for conflicting observations. The lowest allowed layer anchors the layout.
Template preparation checks version, Engine identity and bundle hash across configured members.

Before posting, the executor persists the command ID, original member, local channel and exact
serialized body. A pending command blocks further writes in the group after restart or owner
transfer. The executor looks up the same ID on configured members and reconciles a verified
non-terminal receipt on the original Engine. A matching applied or rolled-back decision closes
the reservation. Timeouts, conflicting results and absent receipts keep the reservation.

The test fixture serves two independent HTTP origins with different channel codes and physical
numbers. The isolated Bridge pilot uses a separate state directory, a fixed logical channel
and one operator session per Engine. Control's Play, Update, Stop and Clear use the existing
Bridge routes. The executor builds a full layout from the applied snapshot, preserving layers
and template identities outside the selected row. Raw AMCP is restricted to observation at
the transport, including reconnect and restart.

Static, self-contained HTML exports declare absolute resume support. The renderer applies the
full field state, loads fonts and images, and shows the settled graphic. On restart Bridge
reconciles any pending command and reads the applied layout before restoring confirmed row
data, visibility and page. A finite authored sequence can make one manual pass with cuts
between pages. Its HTML marker carries the page count. Bridge checks the expected current
page against the applied layout, journals the requested absolute page and restores only a
matching applied row. An eligible picture book may have one Sequence Folder field whose
ordered default matches the bundled pictures. Previous and Go to page use the same absolute
layout operation as Next. The row reports the applied page under its book field. Replacement
pictures, timed scenes, live layouts and media have separate integration steps.
The licensed .26 test pair applied one owner-only Play to A and rendered the same graphic on
B. A handoff preserved the instance and the visible caption. Control sent Update to B, recovered
the updated row after a Bridge restart and removed it on both members through Stop and Clear.
The test read raw AMCP for observation from B and captured the two Engines' own PGM feeds.
The same pair verified an authored manual Cut sequence. Initial Play, Next and Update went
to A. Both members showed page 1 after Next and kept it through a field edit, Bridge restart
and ownership transfer to B. The two Cores confirmed Clear. A later reserve Core restart restored the same sequence page
and edited text to B's PGM under a fresh generation, with no new Bridge layout command.
The real pair also rendered all three pages of a bundled picture VCG with owner-only Play,
Go and Previous. A held managed book keeps its exact template metadata and the operator
clears that book before publishing a replacement under the same ID.

Play requires the expected template hash on every mapped Engine before submission. Update
uses the prepared template and can reach a valid owner when the Bridge alone cannot contact
B. Playout catches up a lagging reserve from the committed layout. If two-member Playout
quorum is lost, the existing output is retained and new writes are blocked.

Launch the isolated Bridge with `--managed-cg-pilot <group.json> --state-home <directory>`.
The profile contains `groupId`, the Control `channel`, and a list of `members` with
`origin`, `engineId`, `channelCode`, `nativeChannel` and `operatorTokenEnv`. Set each named
variable to that member's operator session before launch. The profile uses the bank in
`<directory>/external-cg-pilot/<groupId>/.cg-runtime/bridge-fixed-layers.json` when present.
Choose a visible row within the lab group's permitted HTML layers. Use a template server
address each Engine can reach and a fresh static export from Designer.

## DualReady pilot for Playout .37

The owner requires continued Play, Update, Stop and Clear during a long reserve outage.
Playout .37 provides an explicit availability-first mode for two Engines. It reports
`globallyExclusiveOwner: false` even while both Engines are healthy. Each Engine checks its
local fence. A partition prevents the old Engine from receiving a newer selection, so a
single Bridge with its durable state coordinates all graphics writes. Playout's ordinary
Programme and Playlist authority remain separate.

Add `"authorityMode": "dualReady"` to the existing isolated pilot profile and configure
exactly two Engine endpoints. The first endpoint is the initial target for a fresh, empty
.37 DualReady group and needs an authorized operator session. Bridge rejects inherited or
unrecognized checkpoints, ahead sequences and conflicting hashes. Leave the property absent
or set it to `"quorum"` for the existing default. The pilot requires the same state directory
for restarts. A missing unselected operator session can be supplied on a later restart
without losing the selected Engine. Each contacted member still needs its own operator session.

Bridge verifies the configured group and layer ranges from `/owner` and confirms the
member-local writable permit through `/availability`. It persists its controller UUID and the
target's selection UUID, epoch and reviewed sequence and hash before `availability/select`.
If peer catch-up advances the checkpoint before an unconfirmed selection, Bridge checks the
new checkpoint against its durable state and records a fresh selection epoch for that Engine.
The initial pilot requires an empty group. The vendor migration sample inherits sequence 1
and seeds sequence 2 during its first selection. Adopting that inherited checkpoint requires
a separate integration step.

Before sending a command, Bridge persists the complete semantic intent, sequence and UUIDv8.
The layout carries verified template references and absolute recovery metadata. On the
selected Engine, the availability command prepares and retains the required package. Stop
records a stopped layer, and Clear removes that layer from the complete layout. An ambiguous
command keeps its journal reservation. Bridge uses its same-ID receipt or reconciliation.
Restoring a previously committed layout to a newly selected Engine uses the same receipt
and reconciliation path before any further edit.
An expired receipt directs Bridge to the current checkpoint. Readiness and confirmation refer
to applied graphics and rendered state, with no assertion about matching video frames.

Normal writes stay on the selected Engine. A transport failure contacting a selected Engine
allows Bridge to review its configured peer, persist a newer selection epoch and recover the
same unresolved intent or last confirmed full layout. A previously persisted semantic intent
retains its sequence, command ID, original epoch, layout and graphic instance. Playout's
current local fence and selection envelope authorize the recovery and request no entrance replay.
The selection stays in effect when the peer returns. Playout catches up the returning replica
from the complete checkpoint and retained assets, including deletions and recovery across
its receipt retention horizon. Replacement provisioning belongs to the Playout setup protocol.

The vendor's .37 acceptance report records two isolated Engines and native Cores, including
checkpoint recovery, a complete reserve outage, lost acknowledgement and replacement.
The received ZIP contains the contract, captured exchanges and test evidence. Acceptance of
this Bridge pilot still requires the matching .37 binaries and a licensed, isolated Engine
pair. The installed Bridge service continues on its existing command route.

## Installed Bridge incident, 2026-11-23

The test migration enabled `cg-lab-recurring26` for `apasai` on A and `apasai-r1` on B.
Both members use native channel 1 and programme layer 5. Their only approved template
origin is the isolated lab's `http://192.168.21.93:41560`. The lab stopped both programmes
before staging and restarted the two Engines to apply the setting. This remained active
when the owner tried CG 1.2.13 build `3f5c9162` through the installed Bridge service.
The running service does not opt in to the isolated command-line pilot.

At incident inspection, both Engines reported migrated with no pending restart and an empty
managed layout at applied revision 24. B alone confirmed managed write ownership. Ordinary
programme control on both members reported phase `external-cg` with differing `playlistKey`
and `runtimeKey`. Bridge A counted one connected console and B counted none. The earlier
book proof had matching managed book pictures and different underlying PGM pictures after
Clear. Compare actual PGM inputs and ordinary programme state alongside managed revisions.

The operator's downloaded `amcp.log` independently recorded Core's exact
`403 EXTERNAL_CG_FENCE_REQUIRED` response to `MIXER 1-59 VOLUME 0` at
11:05:07 UTC and to `MIXER 1-99 VOLUME 0` at 12:36:08 UTC on November 23.
The second time matches the reported Logo Take.

For legacy preparation, the migration-specific message requires Core's exact vendor 403
reply. Other denials retain their existing reasons. A preparation failure keeps allocated
sound muted and prevents fallback writes. The isolated pilot has confirmed replay-free
recovery for static HTML and the supported bundled books. Installed-service activation,
additional animated layouts, live and media replication, and operation with a missing
voter remain open.

The vendor setup contract stages initial migration and has no published reversal operation.
Each test Engine has a local settings backup from before migration. Preserve the current
settings on each member before an authorized restoration and compare the change locally.
After restoring the original settings and restarting the Engine services, read back both
members' migration status and verify legacy Play and both Programme returns. Programme
state also needs its own readback because the lab sent ordinary Stop before migration.

Both channels must return to the ordinary topology before comparing owner, readiness,
playlist and runtime keys. Restart the Windows `ApasaiEngine` service on each member
to reload Engine configuration. The two Playout restart API routes in .26 restart the
local Core only. Keep a copy of each current settings file and remove the one pilot
group. The before-pilot backup on B differs in Cache settings as well.

With A confirmed as Programme owner, inspection of B's playlist mirror reconciliation
can identify a different playlist. A same-clip seek through Sync Engines requires the
same ready playback item on both. If B has a different playlist, use the supported
playlist mirror reconciliation on B after safeguarding its local playlist and checking
both revisions, then verify the current playing item and both PGM returns.

After the coordinated Windows service restart on both .34 Engines, both setup
responses reported `migrated:false`, no pending restart, and the managed owner
endpoint returned 404. With the installed Control, the Logo on layer 99 and the
Live layout on layer 59 played on A and returned to Ready with Stop. The second
Live preset also appeared on A. The installed console reported a backup input
limitation and B's programme return sometimes went black or disappeared.

A remained the configured Master and B became the ordinary Programme controller
during failover. A had 10 playlist items and B had 9. The supported
mirror-reconciliation POST on halted B returned HTTP 409 with
`Only the active shared-playlist lease holder may change this playlist.`
Both local-playlist endpoints report `usesSharedStorage:false`. B was resumed,
both state endpoints reported the same current and next item IDs, and the start
times still differed by about 17 minutes. The two original playlist revisions
were preserved. The two engines require a supported authority recovery before a
synchronized return to A can be verified.

## Legacy reserve observations after the D11 fix

The operator confirmed both files now render on B with CG 1.2.10. Their A/B programme
images show a different point in the media, and B has a blank clean Playlist plate.
The remaining issues are in the legacy command path on Playout `.11`.

The existing media command names a local file separately on each engine. File opening
and decoding take place after dispatch on independent cores. The programme pictures use
separate MJPEG feeds with no shared capture timestamp. Comparing two pictures in the
console does not measure native phase. Test source alignment with fresh producer
playheads or a frame-number clip on an isolated pair, and record return delay separately.

For fresh hidden media seats, a verified and idle mirror pair first prepares each
engine's own file and starts both prepared producers after both acknowledgements.
Other seats retain the explicit self-contained start command. Eligible preset and
Focus transitions follow the active phases on the mapped, verified reserve page.
Reserve stage and recovery commands remain bound to that session and queue. The
active engine does not wait for the reserve before advancing its effect.

Legacy clean Playlist routing uses A's D10 and its generation. A route names an
engine-local channel/layer. B needs its own authenticated D10 and a unique ready
Playlist entry for the validated B channel, with a current local epoch. The `.12`
example advertises different A and B route coordinates. It does not prove that either
station member currently has the expected ready source. The legacy Take reads B's
readiness passively and logs the result. B-local Playlist seating remains pending
verification of the source and the holder and recovery lifecycle.

The PGM monitor uses an independent meter stream for each engine, keyed by verified
engine/channel. A verified return without that meter binding can use stereo PCM peaks
from its own audio stream. The LUFS badge shows the selected source; the separate dBFS
bars in all-engine mode show each engine's measured programme. The six Chromium
programme/monitor cases passed with distinct readings and correct B/Follow routing.
On the station, programme-gain reads require the corresponding engine's authenticated
session. Compare equal gain, per-source audio and aligned source material before
diagnosing level parity on a real output.
