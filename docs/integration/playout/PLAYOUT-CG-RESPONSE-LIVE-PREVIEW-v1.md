# Playout Live Preview lease contract v1

The Playout team supplied `CG-Live-Preview-2.18.12-handoff.zip` on 2026-11-09. The
archive SHA-256 is `1a49514502d8ed6e6ccba0d616687d0beadf31b19733503445a6a7a4754d0ba2`.
The Persian contract, OpenAPI and native HTTP examples in that handoff are the wire reference.
This record documents how CG uses the contract.

## Station evidence

The team tested Engine **2.18.12** and its bundled native core on an isolated `TEST` channel
with two HTTP clients and two UDP senders. The native acceptance record shows different decoded
pictures, stereo PCM, fresh preview meter readings, a rejected stale DELETE and identical PGM and
playlist before and after the test. Physical SDI and every receiver type were outside that test.

On 2026-11-09, a read-only check of `192.168.21.32:8080` returned **2.18.14** from
`/api/v1/system/version`. The general `/openapi/v1.json` returned 200 and listed the six
Live Preview paths. The capability request without a bearer returned 401. An authenticated
preview on the installed station remains a separate acceptance test.

The same station subsequently reported **2.18.15**. Its OpenAPI still lists all six Live Preview
paths. The capability request still returned 401 without a bearer. OpenAPI lists a settings
`POST /api/v1/settings/live-inputs/probe` with a `LiveProbeInput` body, but does not document a
read-only signal status for a saved input or a programme Playlist gain operation.

## Follow-up from the 2.18.16 team

The team supplied `CG-LIVE-PREVIEW-RESPONSE-2.18.16.zip` and the matching report on
2026-11-09. The archive SHA-256 is `1083d41c7b1b5ef10551aa771f39fac654d3c9878babd1e29e9a3d50d39bc0ab`.
This is a follow-up to lease v1. Its standalone OpenAPI still has six paths and
eight operations. The team ran 158 tests against the published 2.18.16 DLLs and separately
exercised a loopback native core. These results do not establish acceptance on a deployed station.

- A program channel still has one independent saved-input check. Multiple readers share the
  same input. Clean Playlist output and D11 media are outside the lease.
- A Preview JPEG is in the Preview output raster. The engine reports no measured source raster,
  sample aspect ratio, active rectangle, rotation or source-to-JPEG transform. Catalog format and
  aspect can size the CG crop guide, but cannot map returned JPEG pixels to the source.
- The UDP fixture retained its last frame after the sender stopped. It could return a fresh meter
  and report `sourceFreshness: unknown` and `hasSignal: null` at the same time. A valid black
  frame looked like the frame returned before the sender existed. Neither image colour nor meter
  freshness establishes upstream signal status.
- 2.18.16 supplies no public channel Playlist master gain operation. The existing synthetic
  Playlist route is still a muted CG copy. Per-item gain and local monitor volume are separate.

The [revised Playout request](CG-CONTROL-REQUEST-LIVE-INPUT-PREVIEW-2026-10-26.md) asks for
an additive contract for the outstanding capabilities. The station still reported 2.18.15 in the
read-only check after receipt of this follow-up.

## Requests used by Bridge

Bridge uses the verified socket operator's exact CG bearer for every call, including cleanup.
The account needs the `operator` or `station-admin` role, an active token with `jti` and the
channel grant. D4 resolves the channel code and the Bridge catalogue resolves the saved D10
`inputs[].id`. Playlist returns and library media are outside this check.

| Operation  | Contract                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability | `GET /api/v1/channels/{code}/live-preview?capabilities=true`. Require lease contract 1, ownership required, one independent feed and a supported TTL and renew cadence.                         |
| Start      | `POST` to the same base path with `{inputId,requestId}`. A `200 ready` acknowledges the producer command. The browser still waits for a decodable JPEG.                                         |
| Reconcile  | `GET ?requestId=…` for a pending or uncertain start. A `202 pending` carries no playable feed. Retry reconciliation within the check's bounded lifetime and keep the original request identity. |
| Renew      | `POST /renew` with `{leaseId,generation}`. The contract advertises 90 s TTL and a 30 s renewal cadence.                                                                                         |
| Stop       | `DELETE ?leaseId=…&generation=…` with the original bearer. The identity is conditional even across Bridge instances and independent Playout clients.                                            |
| Media      | Authenticated `GET /{leaseId}/video.mjpeg` and `/{leaseId}/audio` under the same channel path. WAV is 48 kHz stereo PCM s16le and opens only on request.                                        |
| Meter      | Authenticated `GET /{leaseId}/meters/snapshot`. Bridge polls on behalf of the current owner and forwards only fresh matching samples. Playout also offers a meter SSE feed.                     |

The browser uses short-lived Bridge tickets for picture and sound. It receives neither the
upstream media addresses nor the lease identity. The bridge uses the configured Engine origin
and verifies the relative feed paths. An unsupported capability, unknown response shape, lost
ownership or air conflict closes the relevant check. Bridge has no legacy raw-port or
unconditional-DELETE fallback.

The meter identifies the lease, generation, core generation, logical channel code, physical
preview channel and layer. A sample is usable for at most 300 ms. An expired meter falls to floor
while a valid moving picture can continue. Playout currently reports `sourceFreshness: unknown`
and `hasSignal: null` even with fresh OSC and returned media. This contract therefore does not
establish input signal availability for automatic preset fallback. Programme Playlist gain
is a separate contract. The [2.18.17 source previews and programme gain handoff](source-previews-2.18.17-adoption.md)
records the additive APIs, deployment boundary and CG integration checks.
