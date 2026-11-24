## Why

Viewers need a clear view of upcoming programs. The operator needs to derive that graphic from the
Playout schedule, shorten a title for broadcast, and prepare the media before it is needed. When
the same information runs over program video and as a full-screen item between programs, each
use must obey the timing of its place in the playlist.

## What Changes

- Add a native Upcoming Programs element in Designer with a dedicated Inspector and four layouts.
  Author a shared card design, independent title, airtime and media regions, Carousel focus styling
  and Next effects and repeat passes for Sequential and Carousel. The design persists through save
  and export. Authors can change the number, order and content of local rehearsal entries, using
  Project images or videos and optional separately imported sounds for local audition.
- Author separate Entrance and Exit effects. Each phase can animate the visible cards Together
  or as Staggered cards, with its own effect duration, start interval and logical order. Rehearse one
  Entrance, normal Out, finite completion and quick Stop through the composition lifecycle.
- Let authors set Next motion to Exit then enter for actual Sequential and Carousel page changes.
  Author the outgoing and incoming effects and card order independently. Start the new page once
  the last outgoing card finishes. Existing templates keep the authored Page effect.
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
- Let a CG Control operator prepare the program list for an individual stack row without
  Playout. Start with published Designer rows or build a list from empty. Edit each program's
  title, airtime and optional photo or video, preview the draft, and confirm it for an explicit Take.
- Conform operator-uploaded MP4 clips to VP8/Opus WebM locally before upload so Preview and
  stock CasparCG can use the same prepared clip. Generate its poster from the prepared video
  and retain poster playback for existing MP4 references when motion is unavailable.
- Show thumbnails for the template's authored photos and video posters in the CG Control
  media picker. Let the operator confirm deletion of the uploaded media itself. The Bridge's
  existing cleanup can collect an orphaned poster after its grace period. Protect confirmed and
  on-air attachments and keep Designer assets and local source files intact.
- In CG Control, support the Designer Prepared source, an operator-edited Manual source and a
  Playout source built from eligible future program occurrences in the selected playlist.
  Let the operator choose a program count, override display titles and airtimes, and choose or
  prepare a photo or video excerpt with a usable fallback.
- Play video only for the active or focused card. Surrounding Carousel cards and Side by side use
  stills from the same media or a ready fallback.
- Support an independently scheduled full-screen primary event and a secondary overlay over a host
  program. Share a prepared graphics payload and allow explicit program and promo audio choices.
- Support a prepared clip in the primary playlist where direct graphics event integration is unavailable.
  Verify readiness and output timing on the published plant paths.

## Capabilities

### New Capabilities

- `designer-upcoming-programs` covers authored layouts, settings, safe rehearsal and export.
- `runtime-upcoming-programs` covers manual CG Control preparation, playlist selection, editorial
  overrides, media readiness, audio and primary/secondary playout using the same authored graphic.

### Modified Capabilities

None.

## Impact

The first stage adds shared scene schema, Designer authoring and the template renderer. The standalone
CG Control stage adds per-stack-row preparation and draft preview before Take. The Playout stages
extend the typed CG Control/Bridge boundary and use the target Playout contract for event data,
media and scheduling. A full-screen graphics row participates in the Playout schedule and requires
program-output verification. The same graphic can run as an overlay after its own readiness checks.
