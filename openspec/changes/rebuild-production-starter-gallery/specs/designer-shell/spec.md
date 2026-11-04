## ADDED Requirements

### Requirement: The starter gallery teaches current Persian broadcast workflows

The Designer SHALL offer production-quality Persian starter projects for the existing gallery and
for data-rich sports, weather, image-sequence, countdown-step and multibox workflows.

#### Scenario: Keep the city-card addition and remove only the new outlook

- **WHEN** the author opens the twelve-entry gallery
- **THEN** `iran-weather-pages` retains its existing four-page/up-to-eight-row design and
  `iran-weather-forecast` retains its current five-column design with equal 52 px temperatures
- **AND** their artwork and original IDs remain, with only the targeted degree-adjacency repair
- **AND** `iran-weather-cards`, «آب‌وهوای شهرها — کارت‌های تصویری», remains available
- **AND** only `iran-weather-outlook`, «پیش‌بینی پنج‌روزه — نمای تلویزیونی», is removed

#### Scenario: On-air graphics contain broadcast content only

- **WHEN** any starter is rendered on air
- **THEN** it contains no authoring instructions or explanatory training footer
- **AND** actual headings, data labels and the Azan announcement remain intact
- **AND** instructional descriptions remain available outside the rendered composition

#### Scenario: Author opens the Iran Premier League table

- **WHEN** the author chooses the Iran Premier League starter
- **THEN** a one-page standings graphic opens with Persian labels, Persian team names and complete
  editable default rows
- **AND** rank is derived from row order, never an operator-editable field
- **AND** team crests appear, alternating rows differ subtly, and rank/points have uniform styling
- **AND** all eighteen rows fit inside the restrained navy/slate/ivory panel

#### Scenario: League rows enter and leave in order

- **WHEN** the operator plays the league graphic
- **THEN** the rows enter from first to last, top to bottom
- **WHEN** the operator stops it
- **THEN** the rows exit from last to first using the explicit Repeater exit-order setting
- **AND** the still-visible stadium, panel and header backgrounds then fade through ordinary,
  visible opacity keyframes while the already-transparent scrim remains transparent

#### Scenario: The gallery retains the owner's saved league refinements

- **WHEN** the author opens the revised league starter
- **THEN** its centered heading, full-width title strip and removed competition badge match the
  owner-supplied league project
- **AND** row entrance/exit/stagger are 200/50/30 ms and the title/title-strip retain their linear
  frame-84 position keys at Y 104
- **AND** the scrim opacity keys are frame 0 → 0, 20 → 0.64, 110 → 0 with linear easing, and 200 → 0,
  without a frame-84 scrim key
- **AND** the panel gradient uses `#111B2C37` and `#172337E3` in that order
- **AND** imported asset references use bundled gallery assets without publishing personal paths

#### Scenario: A later supplied league revision replaces the earlier authored baseline

- **WHEN** the owner supplies a newer saved revision under the same league-project filename
- **THEN** the starter retains the newer document's authored layout, colors, timing and keyframes
- **AND** bundled assets are compared by bytes as well as filenames before references are normalized
- **AND** the original file is not modified and earlier captures do not count as verification of it

#### Scenario: Author inspects and changes the weather choices

- **WHEN** the author selects the condition label in a weather-card composition
- **THEN** Dynamic / Data shows its Choice-list field and opens an editable value/label dialog
- **AND** selecting the icon exposes image-swap Value rules using those exact choices
- **AND** the imported icon assets continue animating during hold without manual image selection
- **AND** the forecast contains no unexplained percentage

#### Scenario: Author opens multi-page province weather

- **WHEN** the author chooses the province-capital weather starter
- **THEN** the project opens with a Sequence containing multiple pages whose weather-card Repeaters
  are already populated
- **AND** the original template keeps four pages of 8/8/8/7 cities
- **AND** the same project shape is compatible with generated file-backed page data
- **AND** no visible page-number graphic or editable page-number field is included

#### Scenario: Province weather completes one full cycle

- **WHEN** the operator plays the province-capital weather starter without changing its timing
- **THEN** all thirty-one cities appear in alphabetical order over four pages, exactly once
- **AND** each page, including the last, receives its full authored dwell
- **AND** the last content exits before the overall background fades and the graphic closes
- **AND** this behavior is authored through one Sequence pass and content-driven auto-out

#### Scenario: Author opens a one-page forecast

- **WHEN** the author chooses the forecast starter
- **THEN** today and upcoming days fit in one composition
- **AND** five equally sized broadcast-card columns present the days in RTL order
- **AND** the repeated forecast rows do not require an outer Sequence
- **AND** the daily maximum and minimum use equal font sizes, with separate Persian labels and degree marks
- **AND** the original centered label columns and equal 52 px high/low type remain stable while
  ordinary editable numeric/degree pairs use the compact alignment described below

#### Scenario: The new city-card variant completes one full cycle

- **WHEN** the operator plays `iran-weather-cards` with its authored timing
- **THEN** four large cards occupy each of the first seven pages and three occupy the eighth
- **AND** all thirty-one capitals appear in alphabetical order exactly once
- **AND** every page receives its full dwell and the final content exits before the overall close
- **AND** this new pagination does not change the original `iran-weather-pages` template

#### Scenario: The city-card addition follows the supplied visual direction

- **WHEN** the author opens `iran-weather-cards`
- **THEN** large broadcast cards use a bright blue/white palette and prominent weather imagery
  inspired by the supplied photos/videos, without dominant yellow or turquoise surfaces
- **AND** one coherent animated icon family remains continuously moving during Hold
- **AND** the ordinary weather Choice list and image-swap Value rules remain visible and editable
- **AND** no page counter, explanatory footer or unexplained percentage appears on air
- **AND** both original weather layouts and pagination remain intact apart from the degree repair
- **AND** the separately registered `weather-broadcast-sky` uses the new `weather-sky-broadcast.png`
  background rather than replacing existing weather artwork

#### Scenario: Degree signs stay compactly adjacent in every retained weather template

- **WHEN** `iran-weather-pages`, `iran-weather-forecast` or `iran-weather-cards` displays a temperature
- **THEN** its degree sign appears beside the rendered number with a small consistent visual gap,
  using LTR/end-aligned numeric text and a separate LTR/start-aligned degree element 2–3 px after its box
- **AND** this remains true for one- and two-digit values, including negatives and Persian digits,
  within each field's existing allowed range; no range expansion or three-digit-temperature requirement applies
- **AND** numeric data, centered Persian-label columns and equal 52 px forecast high/low type remain intact
- **AND** no exact glyph-pair-centering guarantee or hidden affix feature is introduced

#### Scenario: Author explores current capability examples

- **WHEN** the author opens the image-sequence, countdown or multibox starter
- **THEN** that project visibly demonstrates folder-backed Sequence authoring, target Countdown Steps
  or a designed multi-source layout respectively
- **AND** every Quran Sequence item is one wide full-screen ornamental title or verse/translation
  image advanced manually, with no screenshot player chrome or generatively altered scripture
- **AND** the one-plate multibox preset is full-screen and the three-plate preset is two-above-one
- **AND** multibox presets have no independent per-input titles or background plates

#### Scenario: Azan countdown becomes a persistent announcement

- **WHEN** the author opens the Azan countdown starter
- **THEN** a compact bright, readable lower third occupies the lower safe area with transparency outside it
- **AND** its editable absolute date/time is a demonstration deadline, not a calculated prayer schedule
- **AND** ordinary editable Steps at 60, 30, 10, 5 and 1 minute have vivid, visibly distinct colors
- **AND** an editable Azan icon replaces the right-side «مغرب» badge
- **WHEN** the countdown reaches zero
- **THEN** ordinary Countdown Steps hide the timer and reveal «اذان مغرب به افق تهران»
- **AND** the announcement remains on air until manual Stop plays the authored closing animation
- **AND** the compact graphic uses a reusable on-air composition inside the full-frame main composition

#### Scenario: Guest-title branding shares its name background

- **WHEN** the guest-title starter is on air
- **THEN** its existing blue name plate extends beneath the APASAI image with consistent padding
- **AND** no separate logo backplate is added and the image remains replaceable with its animation

### Requirement: Starter cards honestly preview their projects

Every starter SHALL have a poster rendered from the starter scene and SHALL open as a schema-valid,
editable project with a real playout lifecycle and complete default data.

#### Scenario: Gallery is listed

- **WHEN** the landing page lists starter cards
- **THEN** every card has a project-derived poster and concise capability description
- **AND** its display title is Persian-only, without redundant English translations
- **AND** every card offers a short, silent, smooth 30 fps motion excerpt at a modest 1.15× rate on pointer hover or keyboard focus
- **AND** each lazy-loaded motion asset remains below 180 KB while preserving real frame cadence and readable graphics
- **AND** motion media is lazy-loaded, resets to the poster when interaction ends and remains static
  when the user prefers reduced motion
- **AND** no English Premier League starter is present

### Requirement: Replaceable starter branding and product attribution

Starter network marks SHALL use the official APASAI artwork as replaceable image assets, and the
Designer and CG Control SHALL expose a clear APASAI website link on their branded shell surfaces.

#### Scenario: Author replaces a starter logo

- **WHEN** the author replaces the APASAI image asset in a logo-bearing starter
- **THEN** the replacement keeps the element's authored entrance, hold and exit animation
- **AND** no separate background tile is required behind the logo

#### Scenario: The logo starter preserves the owner's saved refinements

- **WHEN** the author opens the logo starter after adopting `ارم-شبکه.cgproj`
- **THEN** its on-air composition contains the replaceable image and wordmark, without the removed
  gold separator, subtitle or subtitle data field/binding
- **AND** the wordmark is at Y 50 and its X animation contains the linear frame-44/value-28 key,
  preserving the remaining authored keys and lifecycle
- **AND** bundled asset bytes are compared before portable references are reused, without altering
  the supplied project
- **AND** its poster and motion excerpt are regenerated from the adopted scene, not the earlier design

#### Scenario: User follows product attribution

- **WHEN** the user activates the APASAI brand on the Designer landing/About surface or CG Control
- **THEN** `https://apasai.com/` opens in a separate browser tab
