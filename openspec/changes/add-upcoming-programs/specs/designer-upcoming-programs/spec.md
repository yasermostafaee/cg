## ADDED Requirements

### Requirement: Author Upcoming Programs as a native element

Designer SHALL add Upcoming Programs through its normal element tools and SHALL expose the selected
element's settings in a dedicated Inspector section. It SHALL support Single, Side by side, Sequential
and Carousel. Single shows one card. Side by side shows equally weighted cards together within the
authored visible capacity. Sequential shows one card at a time. Carousel shows several cards where
available and gives exactly one card focus. The Inspector SHALL provide the airtime toggle, visible
card capacity for Side by side and Carousel, and advance mode for Sequential and Carousel. Automatic
advance SHALL offer a positive dwell time.

#### Scenario: Author all four layouts from the Inspector

- **WHEN** the author adds and selects an Upcoming Programs element
- **THEN** the dedicated Inspector shows its Layout and Show airtime settings
- **AND** selecting Single renders one card, selecting Side by side renders multiple equal cards,
  selecting Sequential renders one card from a longer selection, and selecting Carousel renders
  multiple cards with one visually focused
- **AND** Visible cards is available for Side by side and Carousel
- **AND** Side by side with capacity seven fits the seven default cards inside the authored bounds
- **AND** Advance is available for Sequential and Carousel, with Dwell available when Automatic is selected
- **AND** turning Show airtime off hides airtime while keeping titles visible

### Requirement: Author a shared card design with independently placed content regions

Designer SHALL let the author set automatic or fixed dimensions, background, border color, border
width and radius in the dedicated Upcoming Programs Inspector. All cards in that element SHALL
use the same authored design. In Carousel, the current card SHALL use the authored focused
background and border color. The title and airtime SHALL each have independent positions, sizes,
font sizes, colors and alignments. The optional photo/video region SHALL have its own position,
size and fitting choice. Designer SHALL visualize an enabled region with a preview-only placeholder
even without a media feed and keep disabled media frames absent. Saved projects and exported
templates SHALL preserve the authored design. The programme output SHALL never render the Designer
placeholder. Previously authored card and text values SHALL remain in force on older elements.

#### Scenario: Style the cards and align title, airtime and media independently

- **WHEN** the author changes card size, background, border, the Carousel focus appearance and
  the placement and typography of the title and airtime
- **THEN** the shared appearance is visible on each card in that element and the focus styling
  follows the active card as focus changes
- **AND** repositioning or resizing one content region leaves the other regions at their authored geometry
- **AND** enabling the media frame shows a placeholder at its authored position and size in Designer
  Preview, and disabling it hides the placeholder
- **AND** saving and reopening the project retains the design and exported playback leaves the
  placeholder hidden

### Requirement: Style the media frame border and letterbox independently

Designer SHALL let the author set an enabled Media frame's border color, width and radius, and its
background. A border width of zero SHALL show the frame without a border. The frame's authored
position, outer dimensions and Contain or Cover choice SHALL remain in force when its appearance
changes. Media SHALL clip to the frame's radius and Contain SHALL show the frame background where
the image or video leaves gaps. The general Card border and background SHALL retain their authored
values. The authored media frame appearance SHALL persist in the saved project and exported template.

#### Scenario: Adjust the media border and letterbox while keeping the card appearance

- **WHEN** the author sets a separate Media frame border color, width, radius and background and
  plays a test photo or video using Contain
- **THEN** the media frame shows its own border and rounded corners, with its background in the letterbox
- **AND** the card keeps its own border and the frame keeps its authored position, outer size and fit
- **AND** changing the Media frame border width to zero hides only that border
- **AND** saving, reopening and exporting preserves the aperture's settings independently of the card

### Requirement: Adjust spacing between cards without overflowing the graphic

Designer SHALL offer Auto and Fixed gap for Side by side and Carousel. Auto SHALL fit spacing to
the available space and slot layout. Fixed gap SHALL accept a nonnegative scene-pixel value. Side by
side and Fixed Carousel with overlap disabled SHALL separate adjacent rendered card edges by that
gap when the cards fit, including when Carousel card scales differ. Across cards and Carousel
with overlap enabled SHALL apply the gap between stationary layout slots. When size or count limits
the available space, the renderer SHALL fit the layout and cap the gap where needed to preserve the
graphic bounds. Saved projects and exported templates SHALL keep the authored setting, including zero.

#### Scenario: Use an automatic or fixed card gap and preserve the bounds

- **WHEN** the author switches Side by side or a Fixed Carousel with overlap disabled from Auto
  to a Fixed gap and there is enough room for the cards
- **THEN** adjacent card edges have the authored scene-pixel separation
- **AND** differently scaled Carousel cards show the same separation
- **AND** an authored Fixed gap of zero introduces no extra spacing
- **AND** fitting a larger gap into narrow bounds keeps the visible cards inside the graphic
- **AND** reopening the project or changing the scene size uses the saved gap setting

### Requirement: Align cards vertically within each row

Designer SHALL offer Vertical alignment with Top, Center and Bottom for Side by side and Carousel.
Each row SHALL align the rendered cards by their corresponding top edges, vertical centers or
bottom edges. The alignment SHALL use the rendered card sizes, including a differently scaled
focused card in Fixed or Across cards mode, and apply with Allow overlap enabled or disabled.
Fixed-height Side by side SHALL also align the group of rows within any remaining height. New
elements SHALL store Center. Older fixed-height Side by side elements with the setting absent
SHALL keep Top and show Top in the Inspector. Other absent values SHALL resolve to Center. Saved
projects and exported templates SHALL preserve the authored alignment.

#### Scenario: Align the actual card bounds with different heights

- **WHEN** the author selects Top, Center or Bottom in Side by side or Carousel
- **THEN** each row's corresponding rendered card edges or vertical centers line up
- **AND** fixed-height Side by side aligns the full row group at that position in the available height
- **AND** the chosen alignment is maintained when focus changes the active card's scale or overlap
- **AND** reopening or exporting preserves the setting, including explicit Center
- **AND** opening an older fixed-height Side by side element without the setting keeps the rows at
  Top and shows Top in the Inspector

### Requirement: Author text direction and alignment independently for each card role

Designer SHALL provide Auto, RTL and LTR direction for the title and airtime independently. The
renderer SHALL isolate each value's bidirectional text from its frame. Changes between a Persian
phrase, a Latin value and a numeric-only time SHALL preserve the region's authored alignment and
geometry. The Carousel focused title and airtime SHALL each support overrides for the same
settings as their ordinary regions, including position, size, font family, font size, font weight,
color, alignment and direction.
Each unset focused property SHALL inherit its corresponding ordinary value. Saved projects and
exports SHALL carry the same authored values and inheritance behavior.

#### Scenario: Keep numeric and Persian airtime aligned while styling focus

- **WHEN** the author displays a Persian phrase such as `ساعت ۲` and a numeric-only value such as
  `۱۹:۳۰` in adjacent cards with matching airtime alignment
- **THEN** both times use the same authored alignment anchor and the same region geometry
- **AND** changing the title direction to RTL or the airtime direction to LTR adjusts text ordering
  within the chosen regions and leaves the other region's direction and placement unchanged
- **AND** changing a focused title or airtime setting applies it only to the active Carousel card
- **AND** an unset focused property follows the value authored for ordinary cards

### Requirement: Shape title and airtime digits independently at display time

Designer SHALL expose Digits for the title and airtime independently in ordinary and focused cards.
The choices SHALL be Keyboard, Persian, Latin and Arabic-Indic. Keyboard SHALL preserve the digits
as typed and SHALL be used when a saved ordinary setting is absent. A focused field SHALL also
offer Inherit, which resolves its corresponding ordinary choice. Digit shaping SHALL apply only to
the rendered title or airtime. Direction, alignment and stored data SHALL retain their independent
values. Saved projects and approved Prepared exports SHALL preserve the authored digit settings and
the literal programme titles and airtimes.

#### Scenario: Choose different digit sets for ordinary and focused title and airtime

- **WHEN** the author sets ordinary Title Digits to Latin, ordinary Airtime Digits to Persian, and
  focused Title Digits to Arabic-Indic in a Carousel with mixed-digit programme text
- **THEN** each ordinary role displays its selected digits and the focused title uses Arabic-Indic
- **AND** focused airtime uses the ordinary Persian choice while set to Inherit
- **AND** Keyboard displays the original mixed digits with the authored direction and alignment
- **AND** reopening the project and playing its Prepared export preserves the visible choices and
  the raw titles and airtimes

### Requirement: Keep fixed Carousel focus in its authored slot as cards advance

Carousel SHALL let the author choose the direction of the row and a Focus behavior. Fixed SHALL
be the default for new elements and when the saved setting is absent. In Fixed mode the author
SHALL be able to choose a Start, Center or End focus slot in the logical row direction. The author
SHALL be able to set scale and opacity separately for ordinary and focused cards. During navigation
or timed advance in Fixed, the focused card SHALL remain in the chosen slot, including when the
first or last programme is focused. Displayed neighbours SHALL wrap without duplicates when cards
are available. The focused sequence SHALL follow programme order and the authored Repeat policy.
Saved projects and exported templates SHALL preserve these choices.

#### Scenario: Use the chosen direction and fixed focus slot through a list boundary

- **WHEN** the author selects a row direction and a Start, Center or End focus slot in Fixed mode
  and steps through the first and last programme in a Carousel
- **THEN** the same logical slot contains the focused card at every step and the row follows the
  configured direction
- **AND** the visible neighbours fill available slots with distinct programme occurrences
- **AND** the focused and ordinary cards use their separately authored sizes and opacity
- **AND** advancing after the last item follows the authored Repeat policy

### Requirement: Move Carousel focus across stationary cards in the same group

Carousel SHALL offer Across cards as a Focus behavior. Across cards SHALL show consecutive groups
up to the authored visible card count. Next, Previous and Automatic advance SHALL traverse the
cards inside the displayed group in programme order without moving their slot anchors. The focus
SHALL apply the separately authored scale and opacity using Focus move duration. The authored
Next effect SHALL apply when entering a different group. The final partial group SHALL use its
remaining programmes in order and the author's finite or infinite Repeat behavior SHALL continue
to apply. Video and allowed sound SHALL transfer immediately to the active focus. Saved projects
and exported templates SHALL preserve the behavior and duration.

#### Scenario: Move focus across three cards before entering the next group

- **WHEN** the author rehearses a Carousel of seven programmes with Across cards and capacity three
- **THEN** focus starts on the first card and the next two advances move it to the center and last
  card of that same group in logical row order
- **AND** the same cards retain their slot anchors while focus scale and opacity animate
- **AND** neighbouring slots retain the authored spacing and only the newly focused card can play video
- **AND** the next advance uses the Next effect to show the next group, starting at its first card
- **AND** Previous can return through an earlier group and the final group contains the last remaining
  programme without repeating earlier cards within the same pass

### Requirement: Allow the focused Carousel card to overlap its neighbours

Designer SHALL offer Allow overlap independently of Focus behavior, defaulting to off for new and
older elements. With Allow overlap off, the Carousel SHALL keep adjacent cards disjoint while
scaling. With Allow overlap on, the focused card SHALL be allowed to scale over adjacent cards
while their slot anchors stay fixed. The focused card SHALL appear above its neighbours where
their bounds intersect. Saved projects and exported templates SHALL preserve the choice.

#### Scenario: Scale a focused card above its neighbours independently of focus behavior

- **WHEN** the author enables Allow overlap in Fixed or Across cards and increases the focused scale
  enough for the visible bounds to intersect
- **THEN** the focused card appears above its neighbours and their slot anchors stay in place
- **AND** setting Allow overlap off keeps the card bounds disjoint
- **AND** reopening an older project with these options absent uses Fixed focus with overlap disabled

### Requirement: Apply the updated design and English examples to new elements

New Upcoming Programs elements SHALL receive the updated broadcast card appearance with separate
media, title and airtime regions. Creation SHALL keep the established drop placement, three-card
Carousel, Fixed Center focus, Allow overlap off, four-second Automatic dwell and one pass. The
Next effect SHALL slide the incoming page from the left and the outgoing page to the right
simultaneously. Designer SHALL seed seven editable English titles and airtimes. Opening or importing
a saved project or template SHALL preserve its existing appearance, authored rows, ordering and
legacy fallback settings. An intentionally empty saved list SHALL remain empty.
The built-in examples SHALL use generated artwork in Designer Rehearsal when author media is absent.
Prepared preview and exported playback SHALL show only assigned media and the configured fallbacks.

#### Scenario: Create the new default and reopen an existing design

- **WHEN** the author creates Upcoming Programs at a chosen position and opens Preview
- **THEN** Designer places the element there and shows the updated design in a three-card Carousel
  with separate media, title and airtime regions
- **AND** Rehearse advances automatically after four seconds with simultaneous left/right slides
  and ends paging after one pass
- **AND** the editor lists seven editable English titles and airtimes
- **AND** unassigned examples show built-in artwork during Designer Rehearsal and hide it in Prepared
- **AND WHEN** the author reopens a project with a saved appearance and custom or empty rows
- **THEN** the element uses that saved appearance and those rows

### Requirement: Author Next effects for paged Upcoming Programs layouts

Sequential and Carousel SHALL offer authored Next effects using the shared Sequence transition
controls. The new Carousel creation preset SHALL use its authored slide effect, while older
elements with no transition settings SHALL keep Cut. The author SHALL be able to adjust the entry
and exit effects, their sequencing and the duration for effects that animate. Designer rehearsal
SHALL apply the selected effect when manual navigation or automatic dwell changes the displayed
page. Across cards uses Focus move duration for movement within a group and Next effect when the
group changes. Saving and exporting SHALL preserve the effect and duration alongside the separate
dwell setting.

#### Scenario: Rehearse the authored Next effect in Sequential and Carousel

- **WHEN** the author selects an animated Next effect and duration and advances Sequential in
  Manual rehearsal
- **THEN** the card change uses the authored effect and duration
- **AND WHEN** dwell advances the Carousel in Automatic rehearsal
- **THEN** the authored effect runs and ends with the new card in focus
- **AND** changing the effect duration leaves the authored dwell unchanged

### Requirement: Author an Entrance and Exit for the entire visible card group

Designer SHALL offer independent Entrance and Exit effect and duration settings for the Upcoming
Programs group. The Entrance SHALL apply once when the visible card group first appears on a new
run. Next and Previous SHALL use the authored page or focus transition and preserve the Entrance's
settled state during navigation and Carousel focus changes. Normal Out and finite content completion SHALL
play the group's configured Exit once. The composition SHALL continue to manage its authored
Outro through its existing lifecycle, including Content-driven completion. Designer Rehearse
SHALL let the operator use normal Out or the existing quick Stop. Stop SHALL keep its quick
content-clear path. When a setting is absent, the corresponding group effect SHALL be disabled.
New elements using the supplied Push right page effect SHALL also start with both group effects
disabled. Saved projects and exported templates SHALL preserve each authored effect and duration.

#### Scenario: Rehearse one group entrance and an independent normal Out

- **WHEN** the author selects different Entrance, Exit and Next effects and plays the graphic in Rehearse
- **THEN** the first visible cards enter as one group with its Entrance effect and duration
- **AND** turning a page uses the Next effect and moving focus in place uses its own animation,
  with the Entrance remaining settled throughout navigation
- **AND** Out applies the Exit effect and its own duration to the current group once
- **AND** quick Stop clears the group without waiting for its Exit effect
- **AND** a new run starts with a fresh Entrance

#### Scenario: Finish a finite run through the group Exit and composition Outro

- **WHEN** the opted-in Upcoming Programs group finishes its finite run in a Content-driven composition
- **THEN** the group completes its Exit effect once before reporting completion to the composition
- **AND** the composition waits for any other enabled drivers and its Exit delay before its authored Outro
- **AND** an Out that arrives as the group is closing leaves one Exit in flight
- **AND** an existing graphic without an authored group effect and a new default Push right graphic
  use their original timing and page effects until the author sets Entrance or Exit

### Requirement: Repeat the selected programmes for an authored number of passes

Sequential and Carousel SHALL offer Infinite repeat and Fixed passes. Fixed passes SHALL accept a
positive whole Pass count. A new element SHALL be authored with one pass, and older elements with
an absent setting SHALL retain Infinite. A pass SHALL follow the full selected list in order.
Carousel SHALL complete a pass as focus reaches the end of the list. The setting SHALL persist as
the element's authored content timing default. In finite mode, the last dwell or manual advance
of the final pass SHALL end paging through the shared completion path. The Repeat setting SHALL
leave the active playlist event's own duration unchanged.

#### Scenario: Rehearse finite and infinite repeats

- **WHEN** the author sets a finite repeat count of two in Sequential or Carousel and runs the
  graphic through the seven sample programmes
- **THEN** the graphic completes two full passes and stops paging after the final card completes
- **AND WHEN** the author enables infinite repeat and rehearses past the last card
- **THEN** the list starts its next pass at the first card
- **AND** Single and Side by side keep their static layout behavior

### Requirement: Allow Upcoming Programs to complete the composition's Content-driven Hold

Designer SHALL allow the author to opt the element into Content-driven Hold. The saved opt-in
SHALL use the existing Auto-out and Loop cycle playback modes and completion coordinator. With
Content-driven Hold and an opted-in visible element with populated data, Single and Side by side
SHALL complete after one authored Dwell. Sequential and Carousel SHALL complete after their
configured finite passes, finishing the last page after its final dwell or manual advance. The
composition SHALL start its authored Outro after all enabled drivers complete and any authored Exit
delay elapses. A new Hold SHALL start with fresh timing. The composition's mode and Hold source
SHALL remain Designer-owned.

#### Scenario: Start the whole composition Outro after finite Upcoming Programs

- **WHEN** an opted-in Upcoming Programs element runs in a Content-driven composition
- **THEN** Single or Side by side completes after one Dwell
- **AND** Sequential or Carousel with Fixed passes finishes its last page after the final dwell or in
  response to the final manual advance
- **AND** the composition starts its own authored Outro after all enabled content and any Exit delay
  have finished
- **AND** a fresh rehearsal starts the list and timing again from the beginning

### Requirement: Preserve operator exit and older composition timing

An opted-in Sequential or Carousel with Infinite repeat SHALL hold until an explicit Out or the
scheduled boundary. The explicit Out SHALL use the normal composition Outro. Without opt-in,
the element SHALL retain its existing display behavior and SHALL leave the composition's timing
unchanged. A hidden or empty element SHALL be ineligible. The composition SHALL honor its original
Manual or Timed behavior, including the ordinary Timed fallback when the last eligible Content-driven
source is absent or excluded.

#### Scenario: Preserve Out for infinite content and existing timing for old projects

- **WHEN** an opted-in paged graphic runs with Infinite repeat in a Content-driven composition
- **THEN** wrapping to a new pass leaves the graphic in Hold, and an operator Out starts its authored Outro
- **AND** completion that arrives after Out leaves the already-started Outro unchanged
- **AND WHEN** the author opens a project saved without the opt-in or there is no eligible programme data
- **THEN** it uses the composition's normal timing and effective-driver fallback

### Requirement: Edit and rehearse local programme entries and media

Designer SHALL seed a new element with seven editable English programme examples. The author SHALL
be able to add, remove and reorder test entries, edit each entry's title and display airtime, and
choose or clear a Project image or video for each row. The add, remove and reorder actions SHALL
use compact icons with accessible names. The stored project SHALL retain the authored ordered
list and distinct row identities. Designer Canvas
and Rehearse SHALL display private test rows locally. With the media frame enabled, Rehearse SHALL
display each selected image, still or video in the authored frame according to the focus rule. The
graphic SHALL retain readable mixed-direction text and the authored formatting.

#### Scenario: Edit, save and rehearse local media and text

- **WHEN** the author opens a new Upcoming Programs element and sets up local test entries
- **THEN** seven English sample titles and airtimes appear
- **AND** the author can add, remove and reorder rows and independently change title and airtime
- **AND** manually stepping shows the authored order and reveals the assigned image and video in
  their authored frames, with motion on the active card
- **AND** Automatic Sequential advances after the authored dwell with one card visible at a time
- **AND** reopening the project restores the custom entries, their order and selected Project media

### Requirement: Pick existing Project images and videos for a test entry

Test media SHALL open an existing-style modal picker for images and videos already in Project
Assets. The empty picker SHALL point to the normal Project Assets import workflow. All media file
import and video trim SHALL remain in that workflow. Confirming an existing image or video SHALL
assign it to the test entry that opened the picker. On video selection, Designer SHALL use its
existing poster decode path to create an image from the selected conformed clip and retain it as
a reusable derivative linked to that video. Cancelling the picker SHALL preserve the test entry
and its previous media. The selected media and generated poster SHALL follow the publication state
of their list.

#### Scenario: Choose Project media and generate a poster for the selected video

- **WHEN** the author opens Test media in a project without any images or videos
- **THEN** an empty modal identifies the normal Project Assets import path
- **AND WHEN** the author imports media through Project Assets and returns to the modal
- **THEN** the existing images and videos are selectable for the initiating test entry
- **AND** confirming a video assigns that asset and links a generated poster from its conformed clip
- **AND** Rehearse plays the video when its card is active and shows the generated poster when the
  card is among the surrounding cards
- **AND** cancelling the modal preserves the prior media choice

### Requirement: Show one video asset with its linked poster in Designer

Designer SHALL store stable metadata linking a generated poster to its source video. Project Assets
and project-backed asset pickers, including Test media, SHALL display the source video as one
selectable item and use the linked poster for its thumbnail and selection preview when ready.
The generated image SHALL be absent as a separate catalogue entry while it is used solely as a
poster. Previously linked generated posters SHALL follow the same rule. A poster independently
referenced by the project as an image SHALL stay available for that use. The visibility rule SHALL
preserve each asset's bytes and existing references. The linked poster SHALL remain available to
still cards in Rehearse and Prepared playback and SHALL be included with its approved video in
Prepared export.

#### Scenario: Display the source video as one asset with its linked poster

- **WHEN** a Project video has a generated poster and the author opens Project Assets or the
  Test media picker
- **THEN** the source video appears as one item with its poster available as the thumbnail and preview
- **AND** the generated image remains packaged and visible on still cards as appropriate to its source
- **AND** reopening a project with an older linked poster keeps the catalogue free of the duplicate
  while preserving the stored image and all references
- **AND** a generated image referenced independently remains visible as an image

### Requirement: Play video only for the active or focused programme card

Designer Rehearse and supported Prepared playback SHALL allow video motion only on the current
Single or Sequential card, or on the focused Carousel card. Surrounding Carousel cards and all
Side by side cards SHALL show stills. A video source with a linked generated poster SHALL display
that poster. When a video lacks a poster, including a legacy asset, use a decoded fixed frame or a
text fallback. An outgoing card SHALL pause its video and silence any enabled sound as soon as it
loses focus, including when its page remains visible during a simultaneous transition. The incoming
card SHALL play its video when focused and ready.

#### Scenario: Transfer motion to the focused card during page changes

- **WHEN** several entries contain video and the author runs Single, Sequential, Carousel and
  Side by side in Designer Rehearse or Prepared playback
- **THEN** only the current Single or Sequential card or the focused Carousel card plays video
- **AND** surrounding Carousel cards and every Side by side card display the generated poster
  when assigned a video with a linked poster
- **AND** legacy video without a generated poster displays a decoded fixed frame or text
- **AND WHEN** a simultaneous Next effect changes the active or focused entry
- **THEN** the outgoing video and enabled sound stop advancing immediately and any visible outgoing
  picture is still
- **AND** only the newly active card can acquire motion and enabled sound

### Requirement: Audition the focused video with a separately imported local sound

Designer Project video import SHALL continue to strip audio. The author SHALL be able to assign
or clear a separately imported Project Sound as Test sound for a test entry. Audition focused video
SHALL default to off. When audition is enabled and a video is playing in Rehearse, only the focused
video's assigned sound in Single, Sequential or Carousel SHALL play locally. Side by side SHALL
remain silent. Pause, focus or entry change, and Out SHALL stop the affected audition sound. Local
audition SHALL leave programme audio and mixer levels unchanged.

#### Scenario: Audition and silence the focused programme in Designer

- **WHEN** the author assigns Test sound to a local video and starts Rehearse
- **THEN** the video plays silently until the author enables Audition focused video
- **AND** enabling audition plays only the focused entry's assigned sound in Single, Sequential or Carousel
- **AND** Side by side stays silent regardless of the audition setting
- **AND** Pause, switching away from the entry and Out stop its assigned sound

### Requirement: Keep rehearsal rows and their assets private by default

Designer SHALL preserve the typed element, layout, appearance, motion and lifecycle configuration
when exporting `.vcg` or single-file HTML. The initial data source of a new element and of an older
element without a source setting SHALL be rehearsal-only. This includes the supplied creation
preset and its seven editable examples. In rehearsal-only mode, Designer SHALL omit the local
rows and their sole-use media from the exported runtime payload. Production assets referenced
independently elsewhere in the project SHALL remain available to their owning elements. Without
an authorised source, exported playback SHALL have no rehearsal cards, audio or navigation.

#### Scenario: Export and play without test rows or assets

- **WHEN** the author exports a rehearsal-only graphic using custom titles, Project images or videos,
  and Test sound
- **THEN** the authored display and lifecycle settings are carried in both export formats
- **AND** those formats contain no test rows or sole-use rehearsal media and sound references or bytes
- **AND** the exported graphic remains free of rehearsal cards, media and navigation until a runtime
  programme source supplies approved data

### Requirement: Publish a curated list as the Designer Prepared source

Designer SHALL let the author explicitly select Prepared to publish the current programme list
from the existing authoring editor. The `.vcg` and single-file HTML SHALL carry the approved typed
rows in order, including their titles, display airtimes and selected Project images, videos or
sounds. The exports SHALL include the referenced Project posters for the approved clips. A Prepared
graphic SHALL use the approved list and bundled visual assets in supported playback. The preview
audition setting SHALL remain local. The operator and output engine SHALL
apply their separate on-air media and audio readiness rules. If the author returns the element to
rehearsal-only, its local list SHALL remain editable and a new export SHALL omit the rows and
sole-use assets. An empty or invalid Prepared source SHALL follow the configured fallback and
SHALL leave rehearsal data private.

#### Scenario: Publish a prebuilt show's list and selected media explicitly

- **GIVEN** the designer has prepared an ordered list with custom titles, display airtimes and media
- **WHEN** the designer selects Prepared and exports the graphic
- **THEN** the export includes the approved rows, their order, each referenced media asset and its
  linked video poster when present
- **AND** supported playback shows those titles, airtimes and visual media with the authored layout
- **AND WHEN** the designer returns to rehearsal-only and exports again
- **THEN** the package leaves those rows and sole-use assets private while the project retains them

### Requirement: Compose reusable text and media cards for both air roles

Designer SHALL support authored text-only cards and cards with framed media. A layout SHALL be
usable in a full-screen composition or an overlay composition with the same runtime programme
inputs. Each composition SHALL apply its authored card design to the supplied programme data.

#### Scenario: Reuse the programme inputs in two authored compositions

- **WHEN** an author prepares a full-screen composition and an overlay with smaller media frames
- **THEN** each composition retains its own appearance and framing
- **AND** both accept the same programme title, display airtime and prepared media values
- **AND** a text-only variant remains legible when the operator takes it as the prepared fallback
