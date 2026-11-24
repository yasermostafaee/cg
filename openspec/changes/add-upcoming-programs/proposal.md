## Why

Viewers need a clear view of upcoming programmes. The operator needs to derive that graphic from the
Playout schedule, shorten a title for broadcast, and prepare the media before it is needed. When
the same information runs over programme video and as a full-screen item between programmes, each
use must obey the timing of its place in the playlist.

## What Changes

- Add a native Upcoming Programs element in Designer with a dedicated Inspector and four layouts.
  Author a shared card design, independent title, airtime and media regions, Carousel focus styling
  and Next effects and repeat passes for Sequential and Carousel. The design persists through save
  and export. Authors can change the number, order and content of local rehearsal entries, using
  Project images or videos and optional separately imported sounds for local audition.
- Author separate Entrance and Exit effects and durations for the visible card group. Rehearse Out,
  finite completion and quick Stop through the normal composition lifecycle.
- Seed new elements with an updated broadcast card design and editable English examples. Preserve
  existing project designs and rows. Provide independent text directions and digit sets for title
  and airtime, focused role overrides, and fixed or moving Carousel focus with optional overlap.
- Pick existing Project images and videos for a test entry using the shared modal picker. The empty
  picker directs the author to the normal Project Assets import workflow. Video thumbnails use their
  linked generated poster.
- Author an independent media-frame border and letterbox background. Set automatic spacing or a
  fixed scene-pixel gap between Side by side and Carousel cards, and align cards vertically per row.
- Let authors opt Upcoming Programs into the composition's existing Content-driven Hold. Finite
  content can start the whole graphic's authored Outro through the normal lifecycle. Infinite
  presentation awaits Out or the scheduled boundary.
- Keep authoring rows private by default. Let the author explicitly publish a curated Prepared
  list and its selected Project media for shows built ahead of time.
- In CG Control, support the Designer Prepared source, an operator-edited Manual source and a
  Playout source built from eligible future programme occurrences in the selected playlist.
  Let the operator choose a programme count, override display titles and airtimes, and choose or
  prepare a photo or video excerpt with a usable fallback.
- Play video only for the active or focused card. Surrounding Carousel cards and Side by side use
  stills from the same media or a ready fallback.
- Support an independently scheduled full-screen primary event and a secondary overlay over a host
  programme. Share a prepared graphics payload and allow explicit programme and promo audio choices.
- Support a prepared clip in the primary playlist where direct graphics event integration is unavailable.
  Verify readiness and output timing on the published plant paths.

## Capabilities

### New Capabilities

- `designer-upcoming-programs` covers authored layouts, settings, safe rehearsal and export.
- `runtime-upcoming-programs` covers playlist selection, editorial overrides, media readiness, audio and
  primary/secondary playout using the same authored graphic.

### Modified Capabilities

None.

## Impact

The first stage adds shared scene schema, Designer authoring and the template renderer. Further stages
extend the typed CG Control/Bridge boundary and use the target Playout contract for event data, media
and scheduling. A full-screen graphics row participates in the Playout schedule and requires
programme-output verification. The same graphic can run as an overlay after its own readiness checks.
