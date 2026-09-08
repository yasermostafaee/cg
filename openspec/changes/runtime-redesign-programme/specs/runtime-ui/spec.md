## ADDED Requirements

### Requirement: A redesign never deletes a surface merely because the reference omits it

The Runtime SHALL keep every operator surface it has today that the approved design reference does
not draw, each still rendering under the condition that raises it. A visual reference is a design
for the console WORKING; the surfaces at risk exist because something has gone wrong, so a
prototype has no reason to draw one and a redesign that ships only what is drawn deletes all of
them at once.

The set is enumerated in this change's `design.md` §3, built from the source tree rather than from
any list supplied with the reference. Each entry SHALL name where the surface lives now, what it
becomes after the redesign, and a test.

An entry SHALL NOT be discharged by a test that merely renders the component. The test SHALL assert
that the surface APPEARS under its own condition, and — where the surface has a silent state — that
it renders NOTHING when the condition is absent. Presence-only assertions pass against an
implementation that renders the thing and means nothing by it.

#### Scenario: An alarm still fires after the surface is re-dressed

- **WHEN** the condition that raises a guarded alarm holds — a reconnect that took air away, an
  unowned lit layer, a bridge older than the page, a declared output that is not running, a
  configured raster contradicting the server, a link that is not live, a restore that came back
  short **THEN** that alarm renders, carrying the same claim it carried before the redesign

#### Scenario: A guarded surface stays silent when its condition is absent

- **WHEN** a guarded surface's condition does not hold **THEN** it renders nothing at all, and no
  reassuring or placeholder variant is rendered in its place

#### Scenario: A footer pill is not accepted as a full-width alarm

- **WHEN** the link is not live **THEN** the not-live state is stated by a full-width alert and not
  by a status pill alone, because a pill beside a healthy-looking pill is the failure `R-006`
  records

#### Scenario: Every guarded surface names a test that runs

- **WHEN** the programme's final phase is reported **THEN** each entry in `design.md` §3 cites a
  test that exists in the tree and asserts that entry's condition, and no entry cites a test that
  only constructs the component

### Requirement: The console lock keeps its own chrome and its no-exit contract

The lock screen SHALL NOT be built on the shared modal primitive, and SHALL offer no dismissal path
other than a correct PIN. A lock with a way out is not a lock. The reference draws its own lock as a
dialog inside the Station-setup shadow root; that is a property of a prototype whose lock guards
nothing, and it SHALL NOT be read as an argument to move the product's lock onto a primitive that
closes on Escape, on a backdrop click, or on a dismiss control.

While engaged, the lock SHALL contain the keyboard as well as the pointer, and on release SHALL
hand the keyboard back to the application.

#### Scenario: The lock cannot be dismissed except by its PIN

- **WHEN** the console is locked and the operator presses Escape, clicks outside the card, or
  reaches for a close control **THEN** the lock stays engaged and no close control exists to reach

#### Scenario: The keyboard cannot leave the lock

- **WHEN** the console is locked and focus is on the last control inside the lock and Tab is
  pressed **THEN** focus returns to the first control inside the lock rather than moving to any
  element of the application behind it

### Requirement: The layers table takes its geometry from the token home and is measured in a real engine

The Runtime SHALL render the layers table's geometry — a row's padding, the box of each of its six
verbs, the gap between them, the verb glyph and the Graphics-beds band — from the `--r-row-*`
tokens declared in the token home, and the column model SHALL do its arithmetic on the same
declared numbers rather than on a second spelling. The values SHALL be those the approved reference
PAINTS in a browser, not the first rules its stylesheet happens to contain; a token transcribed
from a rule the reference does not render is corrected, not applied.

The six verbs SHALL keep a fixed place and size on every row, under the header words `Item`,
`Play`, `On PVW`, `Next`, `Stop` and `Clear` in that order. The sticky header's ground SHALL be one
on which the muted column labels clear the 4.5:1 AA text floor, and the ink SHALL NOT be re-tuned
to reach it.

Every geometry claim about this table SHALL be verified in a real layout engine. A jsdom assertion
about a box, an edge or a height compares zeros and is not evidence.

#### Scenario: A row is what the token home declares

- **WHEN** the table is rendered in a browser **THEN** a row's padding equals `--r-row-pad`, its
  height equals the padding above plus the verb height plus the padding below plus its rule, each
  of its six verbs is `--r-row-icon-btn-w` by `--r-row-icon-btn-h` in a six-column grid gapped by
  `--r-row-verb-gap`, and the Graphics-beds band is `--r-bed-divider-h` tall

#### Scenario: The header's labels clear AA on the header's ground

- **WHEN** the sticky header is rendered **THEN** the contrast of its label ink against its ground,
  computed from the colours the browser resolved, is at least 4.5:1

#### Scenario: Hover and selection are distinct and honest

- **WHEN** the pointer rests on a loaded row **THEN** the row lifts to the raised surface; **WHEN**
  it rests on an empty row **THEN** the row does not react; **WHEN** a row is selected **THEN** it
  carries the selection wash and a two-pixel inset frame in the interactive accent

#### Scenario: The top bar's bulk verbs hover to their own colours and a refused one does not light

- **WHEN** the pointer rests on STOP ALL or CLEAR ALL while they are enabled **THEN** each takes
  its own verb colour; **WHEN** REMOVE ALL is withheld because a row is on air **THEN** it does not
  take the remove colour under the pointer

### Requirement: A row's looks are the template's own declaration, and nothing is invented from a frame count

The Runtime SHALL offer, on a row whose template declares looks, exactly the looks that template
declares — read from the template's carrier (`TemplateLiveSources.looks`, the export of the
scene's authored look group) — in authored order, each labelled by its authored name and each
carrying its own frames (the rects the look itself places over the scene). Frame count, look count
and look id are three different things: the Runtime SHALL NOT derive a look from the template's
number of frames, number looks by position, or read a frame count out of a look id. A template
declaring an irregular look set — six frames, five looks of one, two, three, four and six frames,
with word ids whose membership is irregular — SHALL render exactly those five and no sixth. A
template with no look group SHALL show no picker and be refused nothing.

The look strip's geometry — the button's height, its width floor, its padding, radius and text
size, the frame thumbnail's box, and the gaps between label, strip and buttons — SHALL come from
the `--r-look-*` tokens in the token home, and those SHALL be the values the approved reference
PAINTS in a browser; every such claim SHALL be verified in a real layout engine.

#### Scenario: An irregular look set renders exactly its own looks

- **WHEN** a six-frame template declaring looks `solo` (one frame), `pair` (frames two and five),
  `trio` (three frames), `quad` (four frames) and `panel` (six frames) is loaded onto a row **THEN**
  the row's picker shows those five segments in that order, labelled by their authored names, each
  segment's thumbnail holds that look's own frames — one, two, three, four and six cells, `pair`'s
  being frames two and five — no segment declares five frames, and the authored default is the
  one segment marked current

#### Scenario: A look's frame count is its own, not the template's

- **WHEN** a segment's tooltip is read **THEN** it states that look's frame count in the operator's
  words (`1 frame`, `2 frames`) and the authored id, and never the template's total

#### Scenario: The strip is what the token home declares

- **WHEN** a look-bearing row is rendered in a browser **THEN** each look button is
  `--r-look-btn-h` tall with a `--r-look-btn-min-w` floor, padded `--r-look-btn-pad`, cornered
  `--r-look-btn-radius`, set in `--r-look-btn-text`, its thumbnail `--r-look-thumb-w` by
  `--r-look-thumb-h`, the buttons gapped `--r-look-strip-gap` and the label column
  `--r-look-ctx-min-w` wide, gapped `--r-look-ctx-gap` from the strip

#### Scenario: Switching a look on the console preserves the source on its frame

- **WHEN** a row rehearsing on PVW has one frame of its current look bound, for that look only, to
  a source other than the template's default, and the operator switches the row to a look placing
  none of the current frames and back **THEN** every placeholder PVW drew before the round trip is
  drawn again with the same source name in the same box, the bound frame on its bound source

### Requirement: The selection, the PVW set and the monitors' visibility are three independent things

The Runtime SHALL keep three facts about the workspace independent of one another: which row is
SELECTED, which rows are IN PVW, and whether the monitors are SHOWN. Each SHALL be read and
written by its own control and by nothing else: selecting or deselecting a row SHALL neither enter
nor leave PVW and SHALL neither show nor hide the monitors; putting a row on PVW or taking it off
SHALL neither select nor deselect any row and SHALL neither show nor hide the monitors; showing or
hiding the monitors SHALL neither select nor deselect any row and SHALL leave the PVW set exactly
as it was. The PVW set is the bridge's rehearse state and is judged from the bridge, never from a
badge.

The monitors SHALL be shown or hidden by ONE toggle that carries `aria-expanded` and names the
strip it controls. Its state is session state: it SHALL NOT be persisted, and the persisted shell
layout SHALL keep its existing shape. The strip SHALL default to shown, and the layout reset SHALL
bring it back. A fullscreen monitor is a different axis and SHALL still show through a hidden
toggle; a fullscreen layer list SHALL still hide the strip.

Each of the three pairs SHALL be proved by test in BOTH directions, because a single-direction
test passes against a coupling that runs the other way.

#### Scenario: Selecting a row leaves the PVW set and the monitors alone

- **WHEN** row A is on PVW and the operator selects row B, then row A, then deselects row A
  **THEN** the bridge's rehearse set still holds exactly row A throughout, and the monitors are
  still in whichever state they were in — shown, or hidden

#### Scenario: Putting a row on PVW leaves the selection and the monitors alone

- **WHEN** row A is selected and the operator puts row B on PVW and then takes it off **THEN** row A
  is still the selection and its Inspector is still open, row B is never selected, and the
  monitors are still in whichever state they were in

#### Scenario: Hiding the monitors leaves the selection and the PVW set alone

- **WHEN** row A is selected and rows A and B are on PVW and the operator hides the monitors and
  shows them again **THEN** row A is still the selection with its Inspector open, and the rehearse
  set still holds exactly rows A and B, with each row's own verb still reading OFF PVW

#### Scenario: The toggle folds the strip away and the reset brings it back

- **WHEN** the operator hides the monitors **THEN** the strip and its resize divider are gone, the
  layer list takes the height, nothing is written to the persisted layout for it, and the layout
  reset control shows the strip again

### Requirement: Every kind of staged edit survives a selection round trip

The Runtime SHALL keep each row's draft — its staged field values, plate assignments, per-look
inputs AND its unapplied on-air position, anchor and offsets as typed — for the session, keyed by
the row, so that selecting another row and coming back shows the draft exactly as it was left. A
draft is session state: no persisted key, file or schema carries it. The position draft has its
own lifecycle — its own dirty mark and its own `Apply position` — and is NOT read by the row's
UPDATE verb or dropped by DISCARD, because UPDATE does not send the position and a chip that lit
for an edit UPDATE would not apply would be a control whose word lies. A draft for a row that has
left the stack SHALL be swept with the rest.

#### Scenario: A position draft survives deselect and reselect

- **WHEN** the operator moves a row's anchor and types an in-progress offset, selects another row,
  and selects the first row again **THEN** the anchor is where they left it, the offset reads
  exactly what they typed, the position's dirty mark is up, and nothing was sent

### Requirement: The Inspector's geometry is the reference's as rendered, measured in a real engine

The Inspector SHALL keep its Update button pinned at the foot of the panel at every panel height,
with content shorter and longer than the panel and at every scroll position of the field list. Its
two position inputs SHALL align — same top, same height, same width, growing with the panel and
staying equal — with `Apply position` on their baseline. An input's focus SHALL draw ONE ring: the
browser's outline is off wherever a ring is drawn, exactly one shadow is drawn, and no ancestor
draws a ring of its own. Subtitle items SHALL reorder by their grip handle under a pointer drag as
well as by the keyboard.

Its column default, body padding, section heading, field box, position box, footer padding,
button floor and hint SHALL be the values the approved reference PAINTS in a browser, held in the
token home as `--r-insp-*` and read from there. Every such claim SHALL be verified in a real
layout engine; a jsdom assertion about a box, an edge or a pinned footer compares zeros and is not
evidence.

#### Scenario: The foot is pinned at more than one panel height

- **WHEN** the Inspector is rendered at three viewport heights with a field list longer than the
  panel, scrolled to its top and to its bottom each time **THEN** the foot's bottom edge is the
  panel's bottom edge and Update is inside the foot and inside the viewport every time

#### Scenario: X and Y align

- **WHEN** the position section is rendered docked and then fullscreen **THEN** X and Y share a
  top, a height and a width, `Apply position` shares their baseline, and at fullscreen both have
  grown and are still equal

#### Scenario: One ring

- **WHEN** a position box, a text field or a subtitle item takes focus **THEN** its computed outline
  is none, its box shadow is a single shadow, and no element between it and the panel has an
  outline or a shadow

### Requirement: No surface makes a second claim about air on a row that already says what is on air

A surface SHALL NOT restate, on a row, whether that row is on air when the row's state cell
already says so — not as a label, a caption, a badge or a count. Two claims about air on one row
can disagree during a transition and the operator then has to choose which to believe. The one
qualifier the console already spells for immediacy is `· NOW` (`B-168`), and it is not a second
claim. This is why the reference's `ON AIR LOOK` / `Cut · now` look label and its `3 rows on air`
monitor caption are not adopted (owner answer A12).

#### Scenario: A row carries one air claim

- **WHEN** any row is rendered on air **THEN** exactly one element on that row states it — the
  state cell — and the look picker, the Inspector and the monitors say which look, which fields
  and which rehearsal, never whether the row is on air

### Requirement: Live plates are the seated layers, never the source catalogue

The LIVE SOURCES tab SHALL list the layers the bridge itself has seated for rows' live plates —
read from the bridge's live-layer ledger and nothing else — and SHALL NOT read, list or edit the
installation's source catalogue, which is Station setup's. A plate is a seated layer; the
catalogue is the set of inputs a plate may be pointed at. The tab SHALL say so in its own words,
and SHALL keep every disposition's sentence visible where that sentence is an alarm or a caveat
(stranded, blind, adopted-unconfirmed, held).

#### Scenario: The tab lists seats and only seats

- **WHEN** the bridge's ledger holds two seated layers for one row and the catalogue holds six
  inputs **THEN** the tab shows two rows, one per seat, each naming its coordinate, its plate
  handle, the producer actually sent and its owning row, and no input appears that is not seated

### Requirement: The plate controls and the audio dialog open by right-click and by the keyboard

The console SHALL open a row's context menu — which carries AUDIO — on a right-click on the row
and, equally, on the `ContextMenu` key or `Shift+F10` while the row (or a control inside it) has
focus. On the LIVE SOURCES tab the console SHALL open the audio dialog of a seated plate's OWNING
ROW, with that plate's fader focused, on a right-click on the plate's row and, equally, on the
same two keys while the plate's row has focus. Keyboard parity is not optional: every pointer
door SHALL have a keyboard twin that reaches the same dialog. The app-wide suppression of the
browser's own menu SHALL stay in force, with editable fields exempt (guard item 23), and a plate
that has no owner to open (stranded, blind) SHALL open nothing and SHALL NOT cancel the event.

#### Scenario: The row's menu opens by pointer and by keyboard

- **WHEN** the operator right-clicks a row, or focuses it and presses `Shift+F10` or the
  `ContextMenu` key **THEN** the row's own menu opens with AUDIO in it, the browser's menu does
  not, and AUDIO opens the row's audio dialog listing every plate the row's template declares

#### Scenario: A seated plate opens its owner's audio on that plate

- **WHEN** the operator right-clicks a seated plate on LIVE SOURCES, or focuses its row and
  presses `Shift+F10` or the `ContextMenu` key **THEN** the owning row's audio dialog opens,
  named in the operator's words with the row's ids on hover, listing every plate of that row —
  its hidden frames included, each reading `on <coordinate>` — and focus is on the fader of the
  plate pointed at

#### Scenario: A text field keeps the browser's menu

- **WHEN** the operator right-clicks inside an Inspector text field **THEN** the browser's own
  menu is not suppressed, and a right-click on chrome with no menu of its own is

### Requirement: The audio dialog says what the ledger says, and ON is full volume

The audio dialog SHALL state each plate's audio in the console's one vocabulary, read from the
ledger — AUDIBLE, SILENT, HIDDEN BY THIS LOOK, ARMED · HIDDEN BY THIS LOOK — and SHALL read a
plate with no seat as NOT SEATED, never as audible: a raised plate on a row that owns nothing is
a recorded intent, not sound on air. The dialog SHALL carry `ON = 100 % · OFF = 0 %` and SOLO's
scope (the row's other frames, hidden frames included, with no un-solo) on its own surface, not
behind a hover, and SHALL offer ON, OFF and SOLO per plate with no second name for OFF.

#### Scenario: A ready row's raised plate does not read as audible

- **WHEN** a plate is raised on a row that owns no seats and the dialog is opened **THEN** that
  plate reads NOT SEATED at the raised percentage, and no plate in the dialog reads AUDIBLE

#### Scenario: A held plate reads as hidden

- **WHEN** the dialog is opened on a row whose ledger holds a held seat **THEN** that plate
  reads HIDDEN BY THIS LOOK with its coordinate beside it, and its ON, OFF and SOLO stay live

### Requirement: The Inspector is headed by the selected row's operator name

The Inspector SHALL head its body with the SELECTED ROW's name in the operator's words, through
the one naming composition (`operatorRowName`) fed by the declared bank and the registry — in its
own bidi isolate, with every id the row has on the heading's `title` and never in the sentence —
and SHALL change that heading when the selection changes. The template the row carries SHALL move
to the line beneath, with its disambiguating stub when two templates share a name and its id on
hover; a row with no place in the bank SHALL be headed by its template, stub included.

#### Scenario: The heading names the row and follows the selection

- **WHEN** the operator selects a row **THEN** the Inspector's heading is exactly what the naming
  composition names that row from the bank the bridge publishes, the row's ids are on its
  `title` and absent from its text, and selecting a different row changes the heading to that
  row's name

### Requirement: A control that hides a safety surface does not persist its hidden state

A hiding control SHALL NOT persist its hidden state across a reload — that is, a control whose
effect is to HIDE a surface that shows the operator what is about to go to air or what is on it,
the monitors' `Hide monitors` first among them. The console prefers a known safe state after a
restart over a remembered one, the same call as the unpersisted rehearsal flag and reset-to-idle
on reconnect (owner answer A13, `R-060`).

#### Scenario: The monitors come back on reload

- **WHEN** the operator hides the monitors and reloads the console **THEN** the monitors are
  shown, and the shell's other persisted geometry is unaffected

### Requirement: The live plates pane and the audio dialog take their geometry from the token home, measured in a real engine

The LIVE SOURCES pane and the audio dialog SHALL take their rendered geometry — the toolbar, the
table head and rows, the fader and its readout, the verb boxes, the dialog's rows and verbs —
from `--r-plate-*` and `--r-audio-*` tokens declared in the token home from the reference as
RENDERED (`07-live-plates.html`, `08-live-audio.html` at 1280 × 800), never from a stylesheet
rule quoted from the file; every claim about a box SHALL be measured in Chromium, never in jsdom.

#### Scenario: The plates table and the dialog verbs measure to their tokens

- **WHEN** the built console shows a seated plate at 1280 × 800 and its owner's audio dialog is
  opened **THEN** the table head, the ordinary row, the fader, the `ON`/`OFF`/`SOLO` boxes and the
  dialog's rows and verbs measure to the token home's values, read back from the page

### Requirement: The channel list is a list of the channels the bridge names, and the selection is keyed by channel id

The console's channel strip SHALL render one tab per channel the bridge already publishes — the
union of the fixed bank's channel and every declared entry of the channel settings — and SHALL keep
the operator's selection as a channel id, session-only, readable by every per-channel surface. It
SHALL NOT invent a channel-discovery call, a channel name, or any persisted key to do so; where the
bridge is single-channel the gap is filed (`R-062`), not closed.

#### Scenario: Two declared channels are two tabs

- **WHEN** the bridge's channel settings declare channels 1 and 2 **THEN** the strip renders
  `CHANNEL 1` and `CHANNEL 2` in that order, and selecting the second records the choice `2`
  where Station setup can read it

#### Scenario: A choice the bridge stops naming falls back honestly

- **WHEN** the operator has chosen channel 2 and the bridge then names only channel 1 **THEN** the
  strip shows channel 1 selected, and the recorded choice is not written over

### Requirement: Station setup reports the selected channel and keeps station-wide sections station-wide

Station setup's Channel tab SHALL report exactly one channel — the console's selected channel — its
raster verdict and its outputs, and SHALL show nothing of any other channel's; the dialog SHALL
name that channel under its title. The Servers, Live sources, Text file delimiters and Layers
sections SHALL NOT read the selection: they are the station's, and render the same whatever
channel is selected.

#### Scenario: Channel 2's verdict and outputs, and none of channel 1's

- **WHEN** channels 1 and 2 are declared, channel 2's server contradicts its raster and has lost a
  program output, and the operator selects channel 2 **THEN** the Channel tab shows channel 2's
  `MISMATCH` and its AIR row, shows no block for channel 1, and the subtitle reads `Channel 2`

#### Scenario: The station-wide sections do not move with the selection

- **WHEN** the same dialog is opened under channel 1 and under channel 2 **THEN** the Servers, Live
  sources and Text file delimiters sections render identical content

### Requirement: The outputs check is a table over its engineering detail

The Channel tab's Outputs block SHALL render, per server and per checked channel, one row per
consumer `casparcg.config` declares — `Slot · Configured output · Runtime status` — with a `N of
M running` count, the verdict counted per kind exactly as the bridge's `MissingConsumer` counts
it; and SHALL keep every `B-223` sentence beneath the table: the declared and running sets, the
AIR row with its addressing reading, restart paragraph and log recipe, the creation outcome and
the local-monitor sentence. A missing PROGRAM output SHALL take the alarm word's ink; a missing
local monitor the caution.

#### Scenario: A missing DeckLink is a marked row and still the AIR row

- **WHEN** the declaration is a DeckLink, a screen and system audio and only the last two run
  **THEN** the table shows three rows, the first marked missing at air severity reading `Not
running`, the count reads `2 of 3 running`, and exactly one AIR row with the remedy stands
  beneath the table

### Requirement: Station setup takes its geometry from the token home, measured in a real engine

Station setup SHALL take its rendered geometry — the fixed frame, the head and its subtitle, the
rail and its tabs, the pane inset, the section head, the cards and the footer's floor — from
`--r-modal-*-fixed`, `--r-setup-*`, `--r-video-*` and `--r-output-*` tokens declared in the token
home from the reference as RENDERED (`09-channel-settings.html` at 1280 × 800, through its shadow
root), never from a stylesheet rule quoted from the file; every claim about a box SHALL be
measured in Chromium, never in jsdom. `--r-modal-foot-h` SHALL remain a floor.

#### Scenario: The frame, the rail, the pane and the footer measure to their tokens

- **WHEN** the built console opens Station setup at 1280 × 800 **THEN** the frame is 1140 × 736,
  the rail, a tab, the pane's inset and the footer's floor measure to the token home's values read
  back from the page, and the frame is one box on every tab with its footer's top edge still

### Requirement: A removal the reference implies is recorded with its wire evidence

A control the app had that the reference does not draw SHALL NOT be removed on the reference's
authority alone; its removal SHALL be recorded in the deletion guard with the evidence that the
surviving control reaches the same wire command and the same stores, or the control SHALL be
restored. The audio dialog's MUTE was removed on that evidence (owner question A15): OFF sends the
same `MIXER c-l VOLUME 0` through the same intent record.

#### Scenario: OFF is the one silence and reaches the wire as MUTE did

- **WHEN** OFF is pressed on a seated, audible plate **THEN** the bridge sends one `MIXER c-l
VOLUME 0` for that plate and records `0` as its intent, exactly what MUTE sent and recorded

### Requirement: The audit log records an actor, names it in its own column, and keeps the field that writes it beside that column

The audit log SHALL render an ACTOR column — headed `Actor`, second, between `Time` and `Action`
— carrying each record's actor verbatim in its own bidi isolate, whatever the approved reference
draws; a log that names nobody is the `B-143` failure with the sign flipped. The actor SHALL be
determined exactly as it is today: the console name typed into the audit panel's `This console`
field (`audit.setOperatorName`, browser-local), sent with every control request and recorded by
the bridge, `unattributed` when empty. That field SHALL stay in the audit panel — made small and
kept beside the column it qualifies, never in Station setup — in ONE strip with `B-143`'s caveat
(_"It is a LABEL you typed, not a verified sign-in — it says which console, not which person"_),
and that strip SHALL sit above the table. The caveat's wording SHALL NOT change. The actor FILTER
SHALL keep narrowing the tail on the bridge by the same column.

#### Scenario: The column and the strip are on the surface

- **WHEN** the audit log is opened with records from two consoles and an unattributed one **THEN**
  the table's head reads `Time · Actor · Action · Item / detail · Outcome`, each row's actor cell
  reads that record's actor in a `<bdi>`, and the `This console` field and the caveat are one strip
  rendered before the table, outside it

#### Scenario: The field is still the one writer

- **WHEN** the operator types a console name into the field **THEN** `audit.setOperatorName` is
  called with that value, the field is bounded by the wire's actor limit, and nothing in Station
  setup offers the same field

### Requirement: The template picker and the audit log take their geometry from the token home, and the import path is untouched

The template picker SHALL take the reference's rendered geometry — the search box, the three kind
chips, a row's padding, thumbnail and ranks, the footer sentence — from `--r-tpl-*` tokens declared
in the token home from `01-template-picker.html` as RENDERED at 1280 × 800, and the audit log SHALL
take its frame (`--r-modal-w-ledger`), tools, head, cells, tags and console strip from
`--r-audit-*` likewise from `03-audit-log.html`; every claim about a box SHALL be measured in
Chromium, never in jsdom. The picker's CONTRACT SHALL NOT change: one press on a row's load control
loads that template onto the row that opened the picker, the wrong-bank refusal is the bridge's own
predicate and is said on the row, `Delete from station` is the per-row management, and
`Import a .vcg…` opens the OS chooser. A search SHALL narrow by the name the operator sees; the
kind chips SHALL split beds from graphics by the same predicate the bridge refuses on; a search that
finds nothing SHALL say so and never claim the browser holds no templates.

The `.vcg` validation and import path SHALL be preserved exactly: `importVcgFile` → `verify` →
`unpack` → the runtime-contract guard → the render, registering nothing on refusal, proved by the
existing import tests unchanged. A package DROPPED on the picker SHALL resolve the pick with that
file and run the SAME chain; the picker SHALL check nothing itself, not even the extension — the
chain's `verify` is the one gate.

#### Scenario: The picker and the log measure to their tokens

- **WHEN** the built console opens the picker and the audit log at 1280 × 800 **THEN** the search
  box, a chip, a row's thumbnail and ranks, the footer sentence, the ledger frame, a head cell, a
  row cell, the outcome tag and the console field measure to the token home's values read back
  from the page

#### Scenario: A dropped package meets the chain's own verify

- **WHEN** bytes that are not a package are dropped on the picker opened from a row **THEN** the
  row reports `“<file>” failed verification…` through its error channel, exactly as the OS chooser's
  path would, and nothing is registered

### Requirement: The plates toolbar's panic names its scope in the operator's words

The LIVE SOURCES toolbar's panic control SHALL name its scope on its label, its accessible name and
its tooltip — every live plate the bridge has seated, on EVERY channel this bridge drives, not the
channel selected above — so that when a multi-channel plant arrives the label is the thing that
must change and cannot be forgotten. `stack.silenceAllLivePlates` SHALL stay unscoped (owner
answer A16, `R-062`): the scope question is a precondition of ever shipping real multi-channel and
is decided then, never in passing. No behaviour and no wire changes.

#### Scenario: The label says every channel

- **WHEN** the LIVE SOURCES tab is shown with a seated plate **THEN** the panic control reads
  `SILENCE ALL BOXES · EVERY CHANNEL`, its accessible name begins `Silence all boxes on every
channel`, its tooltip names every channel this bridge drives and not only the selected one, and
  one press still makes exactly one unscoped call to the bridge

### Requirement: The programme's phase state is recorded where the next session reads it

Each phase of this programme SHALL record its completion in this change's `tasks.md`, and a session
SHALL read that state before choosing a phase rather than inferring it. The phases are ordered and
the ordering is load-bearing; a later phase is not started because an earlier one looks easy.

A phase that alters what the operator surface renders SHALL cite, beside its ticked item, the URL
of a completed, green Linux `e2e` job that RAN on the commit carrying the change. A ticked item with
no URL is a claim, not a discharge.

#### Scenario: A session picks the next phase from the recorded state

- **WHEN** a session begins work on this programme **THEN** it reads the phase state in `tasks.md`
  and takes the next unfinished phase, and reports at the top of its report which phase it took and
  which remain

#### Scenario: A render phase is not reported complete on a green gate alone

- **WHEN** a phase that changes what a surface renders is reported **THEN** its evidence is a
  completed green Linux `e2e` job on the code head, cited by URL, and a green `pnpm gate` is not
  offered in its place
