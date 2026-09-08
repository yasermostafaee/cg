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
