## ADDED Requirements

### Requirement: Load a complete programme list from the chosen source

CG Control SHALL support Prepared, Manual and Playout sources for Upcoming Programs. Prepared SHALL
load the Designer-approved list and its selected assets from the template. Manual SHALL let the
operator build an independent list or start from a copy of prepared content and edit its count,
order, display title, airtime and selected media. Playout SHALL use the active playlist and
programme-occurrence overrides. CG Control SHALL identify the active source and its readiness in
Preview. The source SHALL resolve to validated ordered rows consumed by the same graphic. A
missing Prepared list or unavailable Playout source SHALL use the configured fallback and SHALL
keep private Designer rehearsal data off air.

#### Scenario: Use Designer Prepared, operator Manual or the active Playout list

- **WHEN** the operator chooses a source for Upcoming Programs in CG Control
- **THEN** Prepared supplies the published Designer rows and Manual accepts the operator's complete
  authored list or edits based on a prepared copy
- **AND** Playout supplies eligible future programme occurrences with their presentation overrides
  and media readiness
- **AND** Preview identifies its actual source and handles missing or unusable data through the
  configured fallback

### Requirement: Apply approved operator edits to the active graphic

CG Control SHALL let the operator prepare replacement rows or override display fields and media for
the current show. Draft edits SHALL remain staged until explicitly applied. An authorised update
with valid, prepared assets SHALL replace the data revision of the currently taken graphic without
restarting it or taking a stopped row. Operator edits SHALL retain separately sourced programme or
package values as their base. A failed preparation SHALL leave the active graphic on its last safe
revision. Editing SHALL remain independent of the event window and the current playlist position.

#### Scenario: Update prepared content live and stage a stopped row for its next Take

- **WHEN** the operator edits the title, airtime or media on a prepared row or supplies a replacement list
- **THEN** the changes are available in Preview while PGM keeps its current data revision
- **AND WHEN** the operator explicitly applies the ready changes to an active graphic
- **THEN** that graphic shows the new revision without replaying its entrance or advancing Playout
- **AND** a stopped row keeps the changes staged until its next Take

### Requirement: Select upcoming programme occurrences from Playout

In Playout mode CG Control SHALL use eligible future programme occurrences in the selected channel
and active playlist. It SHALL look after the relevant playlist anchor and preserve the order provided by
Playout. Commercials, bumpers, graphics, cancelled or skipped items, and further segments of the
programme being counted SHALL be excluded. Distinct occurrences SHALL keep separate identities even
when they use the same title or asset. The desired selection count SHALL be an operator-set positive
integer independent of layout capacity, page and carousel focus. The UI SHALL report when fewer
eligible programmes are available and present only the eligible occurrences it found. Overflow in a
grouped presentation SHALL be available in subsequent pages. Single SHALL display one card.

#### Scenario: Select a programme count independently of layout

- **WHEN** the operator requests five future programmes with a card capacity of two and the playlist
  contains programme segments, an advertisement, a cancelled entry and a graphics event
- **THEN** the resulting selection contains the next five distinct eligible programme occurrences in
  Playout order, skipping the listed ineligible entries
- **AND** a multi-card paged layout can reach all five while rendering at most two at once
- **AND** a shortage shows only the available programmes and states the shortfall

### Requirement: Override the presentation title and airtime per programme occurrence

CG Control SHALL let the operator see the source title and airtime and edit each corresponding display
value independently. Title resolution SHALL prefer the operator's title, then a programme's editorial
short title, then its source title. Airtime SHALL support the source time, a literal custom label such
as `ساعت ۲`, or hiding the time for that occurrence. A display override SHALL follow the stable occurrence across reorder, refresh
or updated start time. Clearing a display override SHALL resume the source value if available.
Presentation edits SHALL be stored through the app's local persistence boundary and SHALL leave the
source schedule unchanged. Preview SHALL show a newly received start time alongside a custom
label retained from the earlier schedule. Unusable or absent title and time SHALL be editable before take. The
graphic SHALL follow the authored text fit when a long title remains and SHALL omit untrusted airtime.

#### Scenario: Keep display overrides on the right programme after a schedule change

- **WHEN** the operator shortens a title and sets a broadcast airtime for one occurrence and Playout
  reorders that occurrence among programmes with similar or identical titles
- **THEN** the new position shows the override for that occurrence without changing source metadata
- **AND** clearing either override restores only its corresponding latest source value
- **AND** the override is unavailable to a different occurrence using the same media

### Requirement: Prepare photo and video for playback

For authored visual slots CG Control SHALL support an approved poster/photo, a separate promo clip,
or a bounded excerpt of an eligible programme's media. Operators SHALL be able to preview and specify
the excerpt range before the take. The initial visible cards SHALL be preloaded before being
marked ready. Readiness for a focused clip SHALL include a decoded opening frame on the intended
output engine. Surrounding Carousel cards and every Side by side card SHALL require only a ready
still. The normal video still source SHALL be a poster generated from the selected conformed clip.
For Playout mode, resolve the asset provider and the poster or fallback before Take. Prepare motion
for the next expected focus and stills for its adjacent cards ahead of a page turn. Take SHALL use
the prepared media without converting or
transferring a clip while accepting the take. If an item cannot be decoded or is unavailable by
its readiness deadline, a prepared poster SHALL be available where possible, followed by a legible
text-only card. The graphic SHALL preserve the authored size, fitting, clipping and position of
visible media. Reusing the source file for an excerpt SHALL preserve the excerpt's audio tracks and
leave the main programme asset and its editorial marks intact.

#### Scenario: Display prepared media with a poster or text fallback

- **WHEN** the operator selects an image and a valid in/out excerpt for upcoming programme cards
- **THEN** preview shows the intended asset and segment in their authored frames
- **AND** the first page is ready only when each visible card has prepared media or its selected fallback
- **AND** a missing or unsupported clip plays no unprepared media and uses the ready poster or text

### Requirement: Keep motion and sound with the current media focus

Prepared, Manual and Playout sources SHALL share the same focus rules in CG Control and programme
output. Only the current Single or Sequential card or the focused Carousel card SHALL play video.
Other visible cards SHALL render ready stills and remain silent. An authorised focus change SHALL
pause the departing clip and silence its audio immediately, even during a simultaneous effect or
when the incoming clip still needs its fallback. Only the newly focused and ready clip SHALL play
motion and, when its mix policy permits, audio.

#### Scenario: Change media focus without overlapping motion or audio

- **WHEN** a Carousel has two successive prepared videos and a simultaneous page transition
- **THEN** the current focused card is the only moving card
- **AND WHEN** focus changes while both pages are visible
- **THEN** the departing clip freezes and becomes silent before the newly focused clip can play
- **AND** if the incoming clip is unavailable, it uses its ready fallback while other cards stay still
- **AND** Side by side shows generated posters for video sources without playing any video or promo sound
- **AND** a legacy clip without a generated poster uses a decoded fixed frame or text

### Requirement: Control the programme and promo audio independently

CG Control SHALL start Preview muted, with optional local-only listening. Secondary overlays SHALL
leave programme audio in place and SHALL start with promo audio muted. The operator SHALL be able to
select the approved promo audio and its approved mix behavior when supported. A full-screen primary
event SHALL use its configured silence or promo clip audio. With promo audio enabled, the current
focus SHALL own that sound. The outgoing clip SHALL reach silence before the incoming clip
becomes audible. The handoff SHALL restore the following item's
expected audio policy without leaving a promo mixer override active. The Bridge SHALL use the
authorised Playout contract for programme audio ownership.

#### Scenario: Audition and air a promo without leaking audio

- **WHEN** the operator enables local Preview listening on a video promo
- **THEN** only the Preview sound changes and programme mixer gain remains unchanged
- **AND WHEN** an overlay is taken with default settings
- **THEN** the programme keeps its sound and promo media stays muted
- **AND WHEN** an approved audio choice is taken and the graphic ends or is skipped
- **THEN** playback follows that choice during the graphic, keeps non-focused clips silent and hands over
  with the expected programme sound

### Requirement: Play a secondary graphic over a host programme

A secondary Upcoming Programs event SHALL reference a host occurrence and stay within its permitted
window. It SHALL support operator Preview and explicit Take, or a configured Playout trigger. It
SHALL layer over the existing programme on CG-owned output. An authorised page change SHALL affect
the running graphic only. PVW pages, configuration edits and asset preparation alone SHALL leave PGM
untouched. Stop or scheduled out SHALL remove the graphic's own resources within the host window.

#### Scenario: Display the graphic on the current programme picture

- **WHEN** the operator previews and takes an overlay during the host programme
- **THEN** the same host picture continues behind the graphic until the overlay finishes
- **AND** paging in Preview leaves PGM unaffected and paging the on-air overlay changes only its graphic
- **AND** the overlay exits within the host window without advancing the main playlist

### Requirement: Schedule Upcoming Programs as a full-screen primary event

Playout SHALL be able to assign the graphic a standalone playlist occurrence with a start and
duration. During the occurrence, the graphic SHALL own the full picture using an authored opaque
background or approved full-screen output. It SHALL follow the same authored cards and prepared data
as the overlay. Internal page changes SHALL fit within the allotted duration. Playout SHALL advance
to its next scheduled item at the boundary even if pages remain or the graphic repeats indefinitely.
Early content completion SHALL run the authored Outro and give the remaining slot to the approved
Playout handoff or filler policy. Completion of the graphic SHALL leave the scheduled advance under
Playout control.
When a Playout integration can schedule regular media rows but cannot schedule a dynamic graphics
primary, CG SHALL provide a pre-rendered media asset with the confirmed content revision, output
format, audio and event duration.

#### Scenario: Play a full-screen playlist row and hand over on time

- **WHEN** a full-screen Upcoming Programs row is scheduled between two programmes
- **THEN** it plays as an independent primary for its own allotted duration
- **AND** manual page navigation advances cards without starting the next playlist item
- **AND** an early Content-driven Outro keeps the next programme's scheduled boundary intact
- **AND** the next scheduled item starts at its boundary even when pages remain or Repeat is infinite
- **AND WHEN** the station accepts only file-based media primaries
- **THEN** the prepared clip can occupy that same duration and has predictable encoded progression

### Requirement: Validate schedule revision and output readiness before take

The operator SHALL be able to inspect the programme order, overrides, media fallback state, feed
freshness and readiness of each configured output in Preview. Changed input SHALL produce a new
prepared revision for the next take. An authorised take SHALL use one coherent ready snapshot.
Automatic feed refreshes SHALL apply to future takes. The currently aired revision can change
through an explicit validated operator update. Unavailable, invalid or stale input SHALL activate
the configured fallback. An unsafe secondary SHALL stay off or finish its already taken safe
content. An unsafe primary SHALL follow Playout's configured skip or safe filler policy and
preserve the schedule boundary. Private authoring data SHALL stay off air. The target engine SHALL
report the actual role/readiness and the As-Run result for verification.

#### Scenario: Handle a changed or unavailable schedule at the take boundary

- **WHEN** Playout reorders the upcoming programmes or an asset fails before the next take
- **THEN** the next preparation shows the changed revision, readiness and valid fallback
- **AND** once taken, the graphic keeps its prepared selection while automatic refreshes prepare
  independently and an operator can explicitly apply a ready revision
- **AND WHEN** a fresh, safe take is unavailable
- **THEN** overlay handling leaves programme picture and sound in place, and primary handling
  gives Playout its configured filler or skip with a timely handoff
- **AND** no fallback airs private rehearsal or stale schedule data, an undefined picture or unintended audio
