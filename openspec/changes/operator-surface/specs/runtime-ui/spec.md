## ADDED Requirements

### Requirement: One column model governs every row surface inside a channel

Every surface presenting LAYER ROWS inside a channel SHALL lay its rows out through the single
shared column model — the LAYERS tab and the PLAYOUT tab alike — and SHALL NOT declare a grid of
its own. The model SHALL express every column as a fixed width or as an explicit
`minmax(floor, Nfr)`, never as `auto`, so that a longer alias, template name, occupant name or
state word changes nothing but its own ellipsis.

Where two surfaces genuinely carry different columns, the model SHALL expose a named COLUMN SET
per surface and SHALL keep the density arithmetic, the gaps and the row geometry shared. Two
independent grid declarations for two row surfaces are prohibited: that is one rule with two
spellings, and the spellings drift.

The model SHALL remain pure and unit-testable without a DOM.

#### Scenario: Text length never moves another element

- **WHEN** any row's alias, template name, occupant name or state text changes length on either
  the LAYERS tab or the PLAYOUT tab **THEN** no other element on any row of that surface moves
  horizontally, and the text that grew ellipsizes inside its own column

#### Scenario: A row surface cannot declare its own grid

- **WHEN** a surface renders layer rows inside a channel **THEN** its row layout resolves
  through the shared column model, and no `grid-template-columns` is spelled locally in that
  surface's own styles

#### Scenario: Narrowing drops text, never a control

- **WHEN** a row surface is dragged narrower than its widest density supports **THEN** columns
  drop in the model's declared order, the row does not wrap, no horizontal scrolling is needed
  to reach any control, and any control the surface offers keeps its full hit target

### Requirement: A per-row control joins the verb block only if it is universal

A control SHALL be admitted to the row's verb block ONLY IF it is declared for EVERY row of the
surface, and its column head SHALL be added to the header's head list in the same change that
adds the button. The verb block is a rigid grid of N columns whose sticky header prints one word
directly above each glyph, which is why admission is a rule rather than a preference.

A control whose PRESENCE varies by row SHALL NOT be placed in the verb block. Such a control
SHALL instead be reached through the Inspector, with at most an indicator on the row.

This rule exists because a misaligned head does not read as a layout defect: it puts a word
above the wrong control, and this product's STOP (graceful outro, producer resident) and CLEAR
(hard kill) are the inverse of the reference product's, so the header word is the channel that
retires that misread.

Availability that VARIES BY STATE is not presence: a verb declared for every row and rendered
DISABLED where it does not apply satisfies this requirement and is the established pattern.

#### Scenario: Every verb button has exactly one head, in order

- **WHEN** the row's verb buttons are rendered **THEN** the header emits exactly one head per
  button, in the same order the buttons are emitted, and each head sits directly above the
  control it names

#### Scenario: A conditional control is refused the verb block

- **WHEN** a control is needed on some rows and not others **THEN** it is not added to the verb
  block, and the verb block's column count is unchanged

#### Scenario: A state-varying verb keeps its column

- **WHEN** a verb does not apply to a row's current state **THEN** it is still rendered in its
  own fixed column, disabled, with a title naming why — and the column count, the head list and
  every other button's position are unchanged

### Requirement: The layer table carries table semantics, not only table appearance

The layer table SHALL expose its structure to assistive technology as a table: a table role over
the header and body, each header cell exposed as a COLUMN HEADER, and each body row exposed as a
ROW within it. A `row` role SHALL NOT be rendered without a table-role ancestor.

Each icon-only verb SHALL keep its own accessible name and its own hover/focus tooltip. Those
are complementary channels, not substitutes: the accessible name says what the control is, and
the column-header association says which column it belongs to.

Making the row itself operable SHALL NOT cost the row its table semantics.

#### Scenario: The table exposes rows and column headers

- **WHEN** the layer table is inspected through the accessibility tree **THEN** a table role
  encloses the header and the body, each header cell is a column header, and each layer row is a
  row within that table

#### Scenario: No orphan row role

- **WHEN** any element declares a `row` role **THEN** it has a table-role ancestor

#### Scenario: Icon-only verbs keep all three channels

- **WHEN** a verb is rendered icon-only **THEN** it has a visible column header naming it, an
  accessible name, and a tooltip on hover and on keyboard focus

### Requirement: An ON-AIR item cannot be REMOVEd

REMOVE SHALL be refused while a row's item is on air. The operator takes it off air first — STOP
for a graceful outro with the producer resident, or CLEAR — and only then removes the row.

The per-row affordance SHALL remain VISIBLE and DISABLED, as a button and as a context-menu
item, with a title naming the remedy; it SHALL NOT be hidden. The gate SHALL be expressed once,
in the row's single action declaration, so the button and the menu item inherit it structurally
rather than by two code paths agreeing.

The bridge SHALL refuse `stack.remove` for an on-air item independently of the UI, with a
legible reason, and NOTHING SHALL reach the wire — a UI-only gate is not a prohibition. Both
sides SHALL read the SAME on-air predicate; a second definition is prohibited.

A refusal SHALL reach the operator through the command toast, worded identically however it was
issued.

Nothing else changes: an item resting at `loaded` after a STOP is removable again and still
CLEARs before the row is dropped, and an item that is not on air follows exactly the path it
follows today.

#### Scenario: REMOVE is disabled and explains itself while on air

- **WHEN** a row's item is on air **THEN** its REMOVE affordance is disabled as a button AND as
  a context-menu item, both carry a title naming STOP or CLEAR as the remedy, and both are
  present rather than hidden

#### Scenario: The bridge refuses independently

- **WHEN** `stack.remove` is invoked for an on-air item by ANY caller **THEN** the bridge
  refuses with a legible reason, nothing reaches the wire, and the item stays on air

#### Scenario: The two sides agree by construction

- **WHEN** the UI's REMOVE gate and the bridge's refusal are compared for every item status
  **THEN** they resolve identically, because both read the same on-air predicate

#### Scenario: STOP restores REMOVE

- **WHEN** an on-air item is STOPped and rests at `loaded` **THEN** REMOVE is available again,
  and removing it still CLEARs the layer before dropping the row

#### Scenario: An idle row is untouched

- **WHEN** a row's item is not on air **THEN** REMOVE behaves exactly as it does today

## MODIFIED Requirements

### Requirement: Server settings panel and Remove-All

The Runtime UI SHALL provide a server settings panel (opened from the status
bar) that edits the CasparCG connection: primary host / AMCP port / OSC port,
an optional backup section (add/remove backup), the redundancy strategy, and
the auto-failover toggle. The panel SHALL load the current values from the
bridge, refresh when any client applies a new config, validate its inputs
(non-empty host, integer ports in range) before submitting, and apply via
`connections.set-config`.

Apply SHALL be pre-disabled with a visible reason while the stack indicates
anything on air or unsettled (mirroring the bridge's authoritative gate), and
the panel SHALL surface the bridge's refusal reason when a race slips
through. WHEN any entered host is non-loopback the panel SHALL show a warning
that template serving and OSC listening will use a LAN address while control
stays on `127.0.0.1`, and SHALL confirm the actual exposure from the apply
response.

The layers panel SHALL provide a Remove-All control in its header that, after an explicit
confirm, OUTs and REMOVEs every item — clearing air and emptying every row.

**Remove-All SHALL be DISABLED while anything is on air**, visible and titled with the remedy,
and `stack.remove-all` SHALL be refused bridge-side in that case with nothing on the wire. Only
the BULK action is withheld: individual idle rows remain removable while another row is on air.
Silently removing the idle rows and skipping the on-air ones is prohibited — it breaks the
action's own name and leaves the operator believing every row is empty while a graphic is live.

Remove-All SHALL stay RENDERED when it is unavailable rather than vanishing, deliberately unlike
Clear-All, whose absence when nothing is on air is honest because there is genuinely nothing to
clear. A control that disappears mid-show reads as a lost feature; a disabled one with a title
teaches the rule.

**Clear-All, not Remove-All, is the sanctioned path to unblock a blocked Apply**, because Apply
gates on the on-air COUNT rather than on an empty list. Every place that names the remedy — the
panel's own copy, the mock, and the bridge's refusal message — SHALL name Clear-All, and SHALL
NOT name a control that is disabled precisely because of the condition being reported.

#### Scenario: Apply is gated on air with the reason shown

- **WHEN** any stack item is on air or unsettled **THEN** the panel's Apply
  is disabled and shows why, naming Clear-All as the remedy
- **WHEN** nothing is on air **THEN** Apply is enabled and submits the
  edited config

#### Scenario: Remote host shows the exposure warning

- **WHEN** the operator enters a non-loopback primary or backup host **THEN**
  the panel warns about LAN exposure of template serve + OSC (control stays
  loopback) before Apply, and reports the confirmed exposure after

#### Scenario: Clear-All unblocks Apply and keeps the rows

- **WHEN** the operator invokes Clear-All and confirms while Apply is blocked **THEN** every
  on-air item comes off air, the rows REMAIN on the surface as idle, and Apply becomes available
- **WHEN** the operator cancels the confirm **THEN** nothing is cleared

#### Scenario: Remove-All is withheld while anything is on air

- **WHEN** any item is on air **THEN** Remove-All is rendered, disabled and titled with the
  remedy, and `stack.remove-all` is refused bridge-side with nothing on the wire
- **WHEN** one item is on air and four are idle **THEN** those four are still individually
  removable — only the bulk action is withheld

#### Scenario: Remove-All confirms and empties when nothing is on air

- **WHEN** nothing is on air and the operator invokes Remove-All and confirms **THEN** every
  item is REMOVEd and every row empties, exactly as today
- **WHEN** the operator cancels the confirm **THEN** nothing is removed
