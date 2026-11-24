## ADDED Requirements

### Requirement: Load a complete program list from the chosen source

CG Control SHALL support Prepared, Manual and Playout sources for Upcoming Programs. Prepared SHALL
load the Designer-approved list and its selected assets from the template. Manual SHALL let the
operator build an independent list or start from a copy of prepared content and edit its count,
order, display title, airtime and selected media. Playout SHALL use the active playlist and
program-occurrence overrides. CG Control SHALL identify the active source and its readiness in
Preview. The source SHALL resolve to validated ordered rows consumed by the same graphic. A
missing Prepared list or unavailable Playout source SHALL use the configured fallback and SHALL
keep private Designer rehearsal data off air.

#### Scenario: Use Designer Prepared, operator Manual or the active Playout list

- **WHEN** the operator chooses a source for Upcoming Programs in CG Control
- **THEN** Prepared supplies the published Designer rows and Manual accepts the operator's complete
  authored list or edits based on a prepared copy
- **AND** Playout supplies eligible future program occurrences with their presentation overrides
  and media readiness
- **AND** Preview identifies its actual source and handles missing or unusable data through the
  configured fallback

### Requirement: Prepare a manual program list per CG Control stack row

CG Control SHALL let an operator prepare an ordered list of programs for a stack row containing
Upcoming Programs without a Playout connection. The initial list for a stack row SHALL be a copy
of its published Designer Prepared rows when available and an empty list otherwise. The operator
SHALL be able to add, remove and reorder programs and independently edit each program's
display title, optional display airtime and optional photo or video. The row's programs SHALL
use the authored layout and lifecycle, with the number of editable entries independent of the
number of visible cards. CG Control SHALL keep edits scoped to the selected stack row and preserve
the published Designer content.

#### Scenario: Edit one stack row starting with the Designer Prepared list

- **WHEN** two stack rows use the same template with published Designer rows and the operator edits
  one row's titles, airtimes, image and video selections and changes the program order
- **THEN** the edited stack row has its own ordered program list
- **AND** the other stack row and the packaged Designer list keep their original rows and media

#### Scenario: Build an empty stack row without Playout

- **WHEN** a stack row has no published Designer list and the operator prepares programs without
  a Playout connection
- **THEN** the editor starts empty and the operator can add, remove and reorder programs
- **AND** the operator can edit every program even when there are more entries than visible cards
- **AND** private Designer rehearsal rows and media do not appear in CG Control

### Requirement: Preview and confirm a manual program draft before Take

CG Control SHALL render the selected stack row's current draft in its browser preview using the
authored layout, media frames and playback focus rules. A canceled edit or unsuccessful
preparation SHALL keep the last confirmed list. A late preview result for a different row or
draft SHALL leave the current preview intact. Confirming a valid draft with the Inspector's Update
while the row is off air SHALL prepare a list for its next Take. The console SHALL require
confirmation before it accepts Take with local program edits still staged. Draft edits, preview and confirmation SHALL leave
program output unchanged. The normal explicit Take SHALL use the confirmed list and its media
for the selected stack row.

#### Scenario: Preview and confirm the draft without changing program output

- **WHEN** the operator previews a draft with a revised title, airtime, photo and video
- **THEN** CG Control shows the revised content in the authored layout with motion limited to the
  active or focused card
- **AND** canceling or failing to prepare a draft preserves the last confirmed list
- **AND WHEN** the operator confirms a valid draft
- **THEN** the confirmed list is ready for the selected row and program output remains unchanged
- **AND WHEN** the operator uses the normal Take for that stack row
- **THEN** Take uses only that row's confirmed list and media

### Requirement: Prepare an operator's video for the program output decoder

CG Control SHALL conform an operator-selected MP4 to WebM with VP8 video and Opus audio when
audio is present. It SHALL load the FFmpeg preparation assets only as needed from the CG Control
origin and perform the conversion locally. A ready WebM SHALL keep its video bytes. The original
source file SHALL remain unchanged. CG Control SHALL validate the prepared video and derive its
poster before uploading the video and poster. Preview and Take SHALL use the same prepared media
references. A failure SHALL preserve the last confirmed list and its playable attachments. A
legacy stored MP4 that cannot decode on the output SHALL use its existing poster or text fallback.
The operator SHALL be able to reselect the original file or choose a compatible replacement to
prepare a new attachment.

#### Scenario: Use an operator-selected MP4 in Preview and stock CasparCG

- **WHEN** the operator selects an H.264/AAC MP4 for a program card
- **THEN** the console prepares VP8/Opus WebM locally, creates a poster from the prepared video
  and uploads those assets while preserving the source file
- **AND** Preview plays the prepared clip and explicit Take uses the same asset on stock CasparCG 2.5
- **AND** the current focus controls which card plays the clip

#### Scenario: Keep ready media after preparation failure and replace a legacy MP4

- **WHEN** the operator selects a ready WebM
- **THEN** the original video bytes are uploaded and its poster is prepared
- **AND WHEN** conversion or video preparation fails
- **THEN** the last confirmed list and media stay available for Take
- **AND** a legacy MP4 that fails to decode on the output shows its existing poster or text
- **AND** selecting the original file again or a compatible replacement can prepare new playable media

### Requirement: Show authored media thumbnails in the CG Control picker

The Upcoming Programs media picker SHALL show thumbnails for available authored photos and linked
video posters from its template. An uploaded video SHALL continue to show its prepared poster.
The picker SHALL retain a media icon and label when the thumbnail is unavailable.

#### Scenario: Identify a prepared photo and video in the media picker

- **WHEN** the operator opens the media picker for a template with a published photo and a video with
  an authored poster
- **THEN** the picker shows the packaged photo and the video's linked poster as thumbnails
- **AND** uploaded photos and videos are distinguishable by their own thumbnails
- **AND** missing thumbnails retain a usable media icon and label

### Requirement: Let an operator delete an uploaded program asset that has no protected reference

The media picker SHALL offer Delete for uploaded photos and videos in the current picker
catalog and require confirmation. A local draft outside the current editor SHALL protect its
attachments. The Bridge SHALL refuse removal of an upload referenced by a confirmed row or
on-air graphic. On successful deletion, the picker SHALL remove the item and restore affected
cards in the current draft to their confirmed or default media. A newly added card SHALL
return to no media, and titles and airtimes in the draft SHALL stay intact. Explicit deletion
SHALL target only the selected upload. A generated companion poster SHALL remain available for
other assignments. An orphaned poster SHALL be eligible for the existing Bridge sweep when its
grace period expires. The originals on disk and the authored package assets SHALL remain available.

#### Scenario: Delete a draft upload and protect media used by a graphic

- **WHEN** the operator cancels a deletion
- **THEN** the upload and the current draft stay available
- **AND WHEN** the operator confirms deletion of an upload used only in the current unconfirmed list
- **THEN** the media disappears from the picker and the affected cards restore their confirmed or
  default media while keeping their draft titles and airtimes
- **AND** a newly added card returns to no media
- **AND** the generated poster survives the explicit deletion and stays available to other
  assignments, with orphan cleanup through the Bridge sweep after the grace period
- **AND WHEN** the operator requests deletion of media used by another local draft, a confirmed row or
  an on-air graphic
- **THEN** that media stays available and the row keeps its attachment
- **AND** Designer package media and local source files remain unchanged

### Requirement: Apply approved operator updates to the active graphic

CG Control SHALL let the operator prepare replacement rows or override display fields and media for
the current show. Draft edits SHALL remain staged until explicitly applied. An authorized update
with valid, prepared assets SHALL replace the data revision of the currently taken graphic without
restarting it or taking a stopped row. Operator edits SHALL retain separately sourced program or
package values as their base. A failed preparation SHALL leave the active graphic on its last safe
revision. Editing SHALL remain independent of the event window and the current playlist position.

#### Scenario: Update prepared content live without restarting the graphic

- **WHEN** the operator edits the title, airtime or media on a prepared row or supplies a replacement list
- **THEN** the changes are available in Preview while PGM keeps its current data revision
- **AND WHEN** the operator explicitly applies the ready changes to an active graphic
- **THEN** that graphic shows the new revision without replaying its entrance or advancing Playout

### Requirement: Select upcoming program occurrences from Playout

In Playout mode CG Control SHALL use eligible future program occurrences in the selected channel
and active playlist. It SHALL look after the relevant playlist anchor and preserve the order provided by
Playout. Commercials, bumpers, graphics, canceled or skipped items, and further segments of the
program being counted SHALL be excluded. Distinct occurrences SHALL keep separate identities even
when they use the same title or asset. The desired selection count SHALL be an operator-set positive
integer independent of layout capacity, page and carousel focus. The UI SHALL report when fewer
eligible programs are available and present only the eligible occurrences it found. Overflow in a
grouped presentation SHALL be available in subsequent pages. Single SHALL display one card.

#### Scenario: Select a program count independently of layout

- **WHEN** the operator requests five future programs with a card capacity of two and the playlist
  contains program segments, an advertisement, a canceled entry and a graphics event
- **THEN** the resulting selection contains the next five distinct eligible program occurrences in
  Playout order, skipping the listed ineligible entries
- **AND** a multi-card paged layout can reach all five while rendering at most two at once
- **AND** a shortage shows only the available programs and states the shortfall

### Requirement: Override the presentation title and airtime per program occurrence

CG Control SHALL let the operator see the source title and airtime and edit each corresponding display
value independently. Title resolution SHALL prefer the operator's title, then a program's editorial
short title, then its source title. Airtime SHALL support the source time, a literal custom label such
as `ساعت ۲`, or hiding the time for that occurrence. A display override SHALL follow the stable occurrence across reorder, refresh
or updated start time. Clearing a display override SHALL resume the source value if available.
Presentation edits SHALL be stored through the app's local persistence boundary and SHALL leave the
source schedule unchanged. Preview SHALL show a newly received start time alongside a custom
label retained from the earlier schedule. Unusable or absent title and time SHALL be editable before take. The
graphic SHALL follow the authored text fit when a long title remains and SHALL omit untrusted airtime.

#### Scenario: Keep display overrides on the right program after a schedule change

- **WHEN** the operator shortens a title and sets a broadcast airtime for one occurrence and Playout
  reorders that occurrence among programs with similar or identical titles
- **THEN** the new position shows the override for that occurrence without changing source metadata
- **AND** clearing either override restores only its corresponding latest source value
- **AND** the override is unavailable to a different occurrence using the same media

### Requirement: Prepare photo and video for playback

For authored visual slots CG Control SHALL support an approved poster/photo, a separate promo clip,
or a bounded excerpt of an eligible program's media. Operators SHALL be able to preview and specify
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
leave the main program asset and its editorial marks intact.

#### Scenario: Display prepared media with a poster or text fallback

- **WHEN** the operator selects an image and a valid in/out excerpt for upcoming program cards
- **THEN** preview shows the intended asset and segment in their authored frames
- **AND** the first page is ready only when each visible card has prepared media or its selected fallback
- **AND** a missing or unsupported clip plays no unprepared media and uses the ready poster or text

### Requirement: Keep motion and sound with the current media focus

Prepared, Manual and Playout sources SHALL share the same focus rules in CG Control and program
output. Only the current Single or Sequential card or the focused Carousel card SHALL play video.
Other visible cards SHALL render ready stills and remain silent. An authorized focus change SHALL
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

### Requirement: Control the program and promo audio independently

CG Control SHALL start Preview muted, with optional local-only listening. Secondary overlays SHALL
leave program audio in place and SHALL start with promo audio muted. The operator SHALL be able to
select the approved promo audio and its approved mix behavior when supported. A full-screen primary
event SHALL use its configured silence or promo clip audio. With promo audio enabled, the current
focus SHALL own that sound. The outgoing clip SHALL reach silence before the incoming clip
becomes audible. The handoff SHALL restore the following item's
expected audio policy without leaving a promo mixer override active. The Bridge SHALL use the
authorized Playout contract for program audio ownership.

#### Scenario: Audition and air a promo without leaking audio

- **WHEN** the operator enables local Preview listening on a video promo
- **THEN** only the Preview sound changes and program mixer gain remains unchanged
- **AND WHEN** an overlay is taken with default settings
- **THEN** the program keeps its sound and promo media stays muted
- **AND WHEN** an approved audio choice is taken and the graphic ends or is skipped
- **THEN** playback follows that choice during the graphic, keeps non-focused clips silent and hands over
  with the expected program sound

### Requirement: Play a secondary graphic over a host program

A secondary Upcoming Programs event SHALL reference a host occurrence and stay within its permitted
window. It SHALL support operator Preview and explicit Take, or a configured Playout trigger. It
SHALL layer over the existing program on CG-owned output. An authorized page change SHALL affect
the running graphic only. PVW pages, configuration edits and asset preparation alone SHALL leave PGM
untouched. Stop or scheduled out SHALL remove the graphic's own resources within the host window.

#### Scenario: Display the graphic on the current program picture

- **WHEN** the operator previews and takes an overlay during the host program
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

- **WHEN** a full-screen Upcoming Programs row is scheduled between two programs
- **THEN** it plays as an independent primary for its own allotted duration
- **AND** manual page navigation advances cards without starting the next playlist item
- **AND** an early Content-driven Outro keeps the next program's scheduled boundary intact
- **AND** the next scheduled item starts at its boundary even when pages remain or Repeat is infinite
- **AND WHEN** the station accepts only file-based media primaries
- **THEN** the prepared clip can occupy that same duration and has predictable encoded progression

### Requirement: Validate schedule revision and output readiness before take

The operator SHALL be able to inspect the program order, overrides, media fallback state, feed
freshness and readiness of each configured output in Preview. Changed input SHALL produce a new
prepared revision for the next take. An authorized take SHALL use one coherent ready snapshot.
Automatic feed refreshes SHALL apply to future takes. The currently aired revision can change
through an explicit validated operator update. Unavailable, invalid or stale input SHALL activate
the configured fallback. An unsafe secondary SHALL stay off or finish its already taken safe
content. An unsafe primary SHALL follow Playout's configured skip or safe filler policy and
preserve the schedule boundary. Private authoring data SHALL stay off air. The target engine SHALL
report the actual role/readiness and the As-Run result for verification.

#### Scenario: Handle a changed or unavailable schedule at the take boundary

- **WHEN** Playout reorders the upcoming programs or an asset fails before the next take
- **THEN** the next preparation shows the changed revision, readiness and valid fallback
- **AND** once taken, the graphic keeps its prepared selection while automatic refreshes prepare
  independently and an operator can explicitly apply a ready revision
- **AND WHEN** a fresh, safe take is unavailable
- **THEN** overlay handling leaves program picture and sound in place, and primary handling
  gives Playout its configured filler or skip with a timely handoff
- **AND** no fallback airs private rehearsal or stale schedule data, an undefined picture or unintended audio
