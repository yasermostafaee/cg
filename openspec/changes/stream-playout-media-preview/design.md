# Design

## Typed preview lifecycle

`sourcePreviews.mediaOpen` accepts the declared channel and a known source ID. Its
response identifies an unsupported, unavailable, preparing, ready or error state.
A ready response carries a preview ID, expiry, resource URLs and the serving Engine.
`sourcePreviews.mediaClose` closes only a preview owned by the calling socket session.

The renderer requests the existing sampled preview when the new capability is
unsupported. Compatible servers use the native video element and the existing
Play, Pause, Stop and seek controls, with an explicit listening control. Audio starts
muted. Playback intent and seek position belong to the local preview.

## Verified source resolution

`MediaPreviewService` uses the registered source catalogue. Verified Playout topology
selects the read-only A/B preview target. B uses its independent authentication,
physical channel mapping and a media ID found by the verified fingerprint in B's
library. A cached catalogue identity can resolve that B copy while A is unavailable.

The manifest must identify the requested media. Resource URLs must resolve to the
exact media-preview paths on the selected Engine, with the verified fingerprint
revision on the file and proxy. Manifest reads are bounded. Proxy preparation uses
the manifest's verified preparation endpoint and Playout's bounded job service.

## Streaming and authorization

The Bridge issues separate file, proxy and poster tickets bound to the preview.
The Engine bearer stays in the Bridge. The HTTP relay forwards GET or HEAD, Range
and If-Range, status codes, Content-Type, Content-Length, Content-Range, Accept-Ranges,
ETag and Last-Modified. `openPlayoutResponse` and a stream pipeline preserve
backpressure and propagate cancellation.

The preview renews its 30-second tickets while its owner remains authorized. The
Bridge rechecks the current source, channel scope, lock and session during active
streams. Closing, expiry, logout or disconnect revokes the resources and aborts
upstream work. Generation checks prevent a late open from recreating a dropped
preview. A changed target or fingerprint closes the prior preview.

## Player behavior and compatibility

The native player keeps the library poster while preparing a proxy and after Stop.
Stop resets the local position and closes the lease. A covered or closed dialog
pauses the video and releases its lease. Returning to the dialog can acquire a fresh
lease at the retained local position. Permanent proxy errors retain the poster and
wait for an explicit retry.

The Runtime page permits HTTP(S) media for the configured Bridge relay. Exported
template frames retain their own media policy. The existing data-video PVW test
continues to verify that path in a real browser.

## Verification

Bridge integration tests cover streamed Range and HEAD responses, invalid ranges,
resource identity, permissions, renewal, cancellation, stale opens and independent
B authentication after A becomes unavailable. Renderer DOM tests cover preview
intent, proxy state, posters and cleanup. Browser tests decode a real HTTP video,
seek it, operate its local controls, retain the poster, and verify that selection
and programme commands stay independent.
