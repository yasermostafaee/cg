# Playout 2.18.17 source previews and programme gain

Reviewed 2026-11-10 from `CG-SOURCE-PREVIEW-2.18.17.zip` and the accompanying
`PLAYOUT-CG-RESPONSE-SOURCE-PREVIEWS-v1.md`. The archive SHA-256 is
`0ea5b477420f9c35bd7e661af75e30a7eebb3f5d997b9f1c3a03b93d28325506`.
All 28 files listed in its manifest matched the recorded size and SHA-256. The archive contains
standalone OpenAPI exports, examples and acceptance evidence. The deployed Engine at
`192.168.21.32:8080` reported 2.18.15. Its OpenAPI listed the six legacy preview paths and did
not list `source-previews` or `programme-gain`. This handoff is a wire reference for CG integration.

## Independent images and picker thumbnails

- Discover `GET /api/v1/channels/{code}/source-previews` using the configured Engine and logical
  D4 channel code. The 2.18.17 Engine and its matching native core are both required. Verify the
  advertised capability. The request uses the signed-in, licensed CG operator or station admin
  with a current channel grant. The internal Bridge service account does not have this access.
- Resolve selectors inside Bridge from canonical D10/D11 records. Live uses the saved D10
  input ID. Clean Playlist uses the exact D10 `playlistOf` pair and also needs a grant for the
  source channel. Media uses a verified D11 ID or fingerprint and an optional seek position.
  Keep the bearer, file path and upstream URLs in Bridge.
- For visible picker rows, `POST /snapshots` returns up to eight independently identified items
  without a subscription. Share a one-batch-per-second budget per owner. Keep static library
  posters for Media and the separate one-input Check and sound workflow.
- For PVW plates, the start, frame, renew and DELETE endpoints use owner-bound subscriptions.
  The key is origin, channel, subscription ID, generation and owner. There are four per channel
  and eight per Engine. Read up to twice per second per subscription with one in flight. The TTL
  is 90 seconds capped by bearer expiry, with renewal recommended at 30 seconds. Close by exact
  generation, drop old responses on an identity change, and observe the shared response budget.
- Validate the bounded response and JPEG before forwarding. Each JPEG is at most 128 KiB and
  640×640. Source previews are silent snapshots. A live read uses an already-open, supported
  receiver and never opens one. Closed receivers and unsupported producers report unknown.
  `signal:absent` can coexist with a cached JPEG. Use the decoder signal for freshness and retain
  a valid black frame when the signal is present. Playlist reports programme image scope.
  D11 provides a selected frame with decoder-seek accuracy and no actual PTS.

## PVW composition and measured Pan

Place the JPEG in the corresponding plate's authored stacking and clipping context. Preserve
the fallback under the picture, text and shapes above it, and all mask windows. Keep the status
overlay separate. An opaque overlay above the entire template would cover authored foregrounds.

Use each JPEG with its own geometry. Undo CSS scaling, then invert the delivered transform and
clamp to the visible source rectangle. Validate sample aspect ratio, active and visible rectangles,
full coverage and rotation before enabling precise crop saving. A change of source, producer or
geometry invalidates a gesture based on the old frame. A saved Pan draft must agree with the
canonical Take fit before the first FILL. The image is captured before filters and mixer. The
legacy MJPEG has no mapping of its own, and the new transform does not apply to it.

## Programme gain

The authenticated `GET` and `PUT /api/v1/channels/{code}/programme-gain` control Playout's
original configured programme producer. PUT sends `gainDb` from −60 through +12,
`expectedRevision` from the current read, and optional `rampMs` from 0 through 5000.
An HTTP 200 can still be ramping. A 202 saves the desired value and awaits native confirmation.
Read again on a revision conflict or uncertain reply. Keep the frame copy at `VOLUME 0`.

Peer replication is asynchronous. Target the authorized owning Engine and re-read after
failover. A's operator bearer and B's internal service bearer cannot substitute for an authorized
operator on B. Do not dual-write or call the private mirror endpoint. Display a disabled state
when a verified owner, capability or authorized session is unavailable.

## Acceptance still owed

The handoff reports 2,134 Engine and 626 Client tests. The isolated native station demonstrated
four independent sources, decoded UDP loss and black recovery, anamorphic geometry, and
approximately −6 dB on a measured PGM WAV with the frame copy muted. It used fixture
authentication and catalogues. Verify CG against an upgraded target with a signed-in operator,
including authorized channel scope, the exact retained-page composition and Take fit, receiver
compatibility, and the programme gain owner path. Treat live pictures in PVW and gain on air as
separate acceptance checks.
