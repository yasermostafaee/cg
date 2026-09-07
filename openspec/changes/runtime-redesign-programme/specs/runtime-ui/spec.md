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
