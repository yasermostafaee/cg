# Design — preview-live-input-check (C-023)

## Context

CG Control already has two different visual truths:

- PVW rehearses the exported graphic page. A Live Source plate is deliberately transparent in that page, and the
  Runtime draws an unmistakable labelled placeholder over it.
- PGM relays the Playout programme channel from `9250 + n - 1`. Its optional sound and VU meter describe the final
  programme mix, not any one box or input.

Neither can show the picture and sound of an arbitrary incoming SDI, NDI, RTP, UDP or RTMP source before it is used.
The earlier C-023 proposal for a periodically refreshed thumbnail is superseded. Playout `2.12.0` now advertises a
dedicated channel-scoped `live-preview` lifecycle and serves the corresponding preview-channel MJPEG and WAV on
`9350 + n - 1`.

Read-only recon established only the following:

- `POST` and `DELETE /api/v1/channels/{code}/live-preview` are allowed; `GET` is `405`.
- release history says a saved input may be selected by its input identifier and an ad-hoc source by kind/address;
  the latter is not needed by this CG Control feature;
- starting another check replaces the preceding preview, air use has priority, and a conflicting exclusive source
  may answer `409`;
- `GET /` on `9350 + n - 1` is MJPEG and `GET /audio.wav` is PCM s16le stereo at 48 kHz in a WAV stream;
- release history says the selected input plays on preview layer 5 so a preview meter can observe it.

The exact request/response schema, bearer policy, preview-channel meter contract and safe stop ownership are not
published. The installed `/openapi/v1.json` fails with `500` while generating a `PROPFIND` operation. These unknowns
are an implementation blocker, not details for CG to infer.

## Goals

- Let an operator check exactly one catalogue input with a current moving picture before it is put on air.
- Offer the action from the PVW workflow and Source defaults without saving or mutating a binding.
- Offer sound only by explicit gesture, off again for every new check.
- Show an input meter that cannot be confused with the existing PGM meter.
- Guarantee cleanup and protect a replacement preview from a stale stop.
- Keep PGM, programme layers, rehearsal HTML and source configuration byte-for-byte unaffected by checking.

## Non-goals

- Per-row thumbnails, automatic scanning of all inputs, multiview or simultaneous preview of several inputs.
- A new CasparCG consumer or CG-owned MON/PFL channel array.
- Ad-hoc kind/address sources not present in the D10 catalogue.
- Recording, transcoding, applying a source default, taking a look or changing plate audio.
- Replacing the PGM confidence monitor or making the PGM VU meter per box.

## Decisions

### 1. One PVW check surface, two entry points

PVW gains one clearly labelled live-input check card. A `Check input` action in the normal source/PVW workflow loads
that card. The same action beside an Inputs-tab row in Source defaults targets the card while the dialog stays open.
It does not close the SourcePicker, commit its selection, save defaults or change the row under rehearsal.

The live picture is not injected into `RehearsalFrame`, the retained page or a live-plate rectangle. Keeping it in a
separate card preserves the established rule that the rehearsal page cannot masquerade as the real routed output.
The card names the source with the canonical `SourceLabel` and the target channel.

### 2. CG Bridge is the only control and media boundary

The renderer never calls the Playout API and never opens a raw `935x` LAN feed. It asks CG Bridge over its verified
socket. Bridge authenticates the request against the station/channel grant, selects only a source from its own fresh
catalogue and calls the official Playout endpoint with its server-side session.

After a successful upstream start, Bridge issues separate short-lived, resource-scoped picture and sound tickets.
The meter remains on the verified socket. A token, Playout input id, source URL or credential is never put in a media
URL or browser-visible log. The sound ticket does not open picture and the picture ticket does not open sound.

This feature adds a dedicated `previewPort(n) = 9350 + n - 1` seam. It does not weaken `pgmPort`'s existing rule:
the PGM relay still never addresses `935x`, while only the live-input-preview subsystem may do so after an accepted
preview lease. Channels outside the Playout's documented preview firewall range are refused without a connection.

### 3. One upstream preview per Playout programme channel, with an owner and generation

The Playout endpoint is a channel-scoped singleton. Bridge therefore exposes one active check per programme channel.
Every accepted start receives an opaque local `previewId` and monotonically newer generation bound to the requesting
console socket. A new accepted check atomically replaces the old one and tells the old owner `replaced`.

A stop/close/disconnect is conditional on the same owner and generation. A late cleanup for generation A is a no-op
after generation B exists. Bridge serializes its own start/replace/stop operations per channel and does not publish
`live` until both the control response and current-generation feed agree.

Local generation fencing cannot protect against the Playout client or another Bridge instance issuing an
unconditional DELETE. Production therefore remains blocked until Playout provides an owner/lease token with
conditional delete, or an equally precise server-enforced mechanism that prevents the ABA race. The response must
also define TTL, idempotency, replacement and restart behavior.

### 4. Cleanup is part of the success contract

Bridge stops the current lease and releases every upstream and downstream reader when the operator closes the card,
checks another source, changes station/channel, signs out, loses the owning socket, reaches the inactivity TTL, or
when Bridge shuts down cleanly. It also forgets the lease on Bridge restart and reports `expired` until Playout's
authoritative state proves otherwise.

If Playout revokes preview because that exclusive source is taken on air, or because a take/cue/restart has priority,
Bridge closes picture and sound immediately and reports `conflict` or `replaced`; it does not retry in a loop. A
stalled feed is closed and represented as stalled/unavailable, never by retaining the last JPEG.

The exact TTL and whether Bridge may safely clean a pre-restart upstream lease are contract questions. No blind
DELETE is permitted during boot or recovery.

### 5. Sound is opt-in and session-local

Every check starts muted, including after reload and even when the PGM speaker preference is on. One user gesture may
request the sound ticket and start playback with the existing browser-safe streaming approach. Closing, replacement,
expiry or source conflict stops playback, closes the sound relay and resets the button to off. This state is not
persisted.

The picture and meter may remain visible while sound is off. If Playout can expose preview levels only by consuming
the PCM stream, that cost and privacy implication must be stated in the contract and measured before implementation;
CG will not silently pull and decode sound merely because the picture is open.

### 6. `PVW INPUT` and `PGM` meters are separate truths

The existing PGM meter remains sourced from the programme channel and stays next to PGM. It continues to describe
the final programme mix for a one-to-four-box look, including playlist sound and every audible plate. It is not
hidden, relabelled, filtered or attributed to an individual box when playlist is absent from the picture.

The check card has a separate meter headed `PVW INPUT · <source name>`. It accepts only an officially identified
preview-channel meter stream for the current lease/generation. On stop, replacement or stale data it falls to the
floor and carries the same non-live state as the picture. It is never called PGM and never appears as an on-air
per-box meter.

The Playout response must define how preview-channel meter events are addressed and correlated to the preview lease.
Release notes saying that preview layer 5 is meter-visible are evidence of intent, not a wire contract.

### 7. Checking does not bind, save, rehearse or take

Only the catalogue `sourceId` and target channel are inputs to the check request. Bridge resolves the source from its
own current D10 view. A removed, unusable, channel-incompatible or currently unavailable source is refused with its
canonical name and reason. Checking a usable source changes none of:

- Source defaults or row/look bindings;
- dirty/applied state in the inspector or Source defaults dialog;
- rehearsal selection, live-plate placeholders or template fields;
- on-air rows, active looks, page state, mixer geometry or plate audio;
- the PGM monitor, its sound preference or its meter.

The bridge preview path sends no AMCP command. The only permitted upstream mutation is the contracted preview-only
API operation on the Playout preview channel. If Playout cannot guarantee that separation, the feature stays blocked.

### 8. State and errors are explicit

The card distinguishes `connecting`, `live`, `stalled`, `unavailable`, `conflict`, `replaced`, `expired` and
`forbidden`. A refusal names the source and Playout reason without exposing its id or address. `401/403` prompts no
automatic credential downgrade; a `409` is a source-in-use conflict; unknown responses fail closed and are logged
with a scrubbed request correlation.

Bridge audits start, replace and stop at their actual outcome, naming actor, console, channel and source label but no
URL/token. Routine media connects are not separate operator actions.

## Sequence

1. A permitted console sends `liveInputPreview.start(channel, sourceId)` to Bridge.
2. Bridge resolves and validates the source from its catalogue, serializes the channel and calls the contracted
   Playout POST with its server-side authorization.
3. Playout returns the exact lease/owner token, expiry and preview-stream identity required by the pending contract.
4. Bridge installs the new generation, retires the prior generation safely, returns state and issues a picture ticket.
5. The Runtime opens Bridge's ticketed MJPEG relay and subscribes to the generation's state and INPUT meter.
6. An explicit speaker press obtains a separate sound ticket; otherwise no audible sound starts.
7. Close/replacement/disconnect/expiry makes Bridge conditionally stop that same lease and close every relay.

No step addresses a programme layer, changes PGM or writes a source binding.

## Contract blocker

The Playout team must answer the request document before task 1 begins. At minimum CG needs exact schemas and examples
for saved-input POST, successful response, conditional DELETE and every error; accepted authentication and role/scope;
lease/owner/generation/TTL and concurrency behavior; preview port/index and feed formats; preview meter endpoint and
correlation; and restart, air-priority and multi-client semantics. A repaired/exported OpenAPI document is preferred.

## Risks and controls

- **Wrong output on air:** a test spy proves zero AMCP/programme writes for every preview state, and live hardware
  proves PGM remains byte-identical while checks start, replace, fail and stop.
- **Stale DELETE kills a new preview:** conditional upstream ownership plus local generation fencing; no implementation
  while upstream semantics are ambiguous.
- **Picture lies after a stall:** remove the last frame and show the state after the stale threshold.
- **Sound surprises the operator:** session-local off-by-default control; no reuse of the PGM preference.
- **Meters are misread:** fixed `PVW INPUT` versus `PGM` labels and separately keyed data paths.
- **Two clients fight:** per-channel serialization, explicit replacement notification and server-enforced ownership.
- **Raw feed/token exposure:** Bridge-only upstream access, scoped tickets and log scrubbing.

## Verification strategy

- Contract fixtures generated from the accepted Playout examples, including malformed and forward-compatible fields.
- Bridge integration tests with a fake control API, MJPEG/WAV servers and preview-meter stream; deterministic races for
  start/start, start/late-stop, disconnect/replacement and restart.
- Runtime DOM/e2e coverage for both entry points, modal preservation, sound default, labels, honest stale states and
  zero changes to bindings.
- Live-system acceptance on a non-air channel, then on a production-equivalent route with independent PGM observation;
  never use a programme-changing request as a test shortcut.
