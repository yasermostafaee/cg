# designer-multibox-arrangements

> The **authoring** half of the multi-box arrangement switch — `D-152`. The operator half is
> `runtime-multibox-layout` (`R-057`); the two are one capability split across two items on this
> repo's own `D-137` / `C-015` precedent, and each names the other.
>
> ⚠ **Vocabulary.** A **COUNT** is how many boxes (1, 2, 3, 4…). An **ARRANGEMENT** is a named
> geometry for a count. The operator never addresses a count directly — it is **derived** from how
> many source toggles are lit (`runtime-multibox-layout`) — but the count is still what SELECTS an
> arrangement, and it is what an author authors against.

## ADDED Requirements

### Requirement: An ARRANGEMENT is an ordered list of cell rects for a COUNT

An arrangement SHALL be authored as an **ordered list of cell rects** belonging to one **count**, and
its order SHALL be the order in which lit sources are seated into its cells. A template MAY declare
several arrangements for the same count.

The empty list SHALL be a valid arrangement — a **0-cell arrangement** is the background alone, which
is a real broadcast state, and it is what makes the operator's all-off case an ordinary count rather
than a special case.

Cell ORDER is the authored declared order in v1. Per-cell assignment SHALL NOT be provided: it
introduces a cell as a separately addressable identity beside the plate, and the need for it is
unproven. An author who wants a different order declares a different order.

#### Scenario: An author defines a 3-box and a 2-box arrangement

- **WHEN** the author creates a 3-box arrangement and a 2-box arrangement in one template
- **THEN** each is an ordered list of cell rects for its own count, and both are stored on the same
  template with the same plate set

#### Scenario: The empty arrangement is authorable

- **WHEN** the author creates an arrangement with no cells
- **THEN** it is accepted as the count-0 arrangement, and the runtime shows the background alone when
  no source toggle is lit

### Requirement: A BOX is a nested composition, and per-arrangement geometry lives on the INSTANCE

A box SHALL be authored as a **nested composition** holding its plate and its title (and any frame or
decoration that belongs to it). An arrangement SHALL position the box **instances**, and
per-arrangement geometry SHALL be carried on the **instance**, never on the plate element.

This keeps ONE plate element per box across every arrangement, so the `(templateId, plateId)`
assignment tuple cannot change when the arrangement does, and a source assigned to a box survives
every switch with no operator action.

A plate inside a nested composition punches its hole correctly at any nesting depth or scale, because
the flattener's instance path and the scene builder's mask key prefix are composed from the same
parts. A box SHALL NOT be authored inside a `repeater` or a `sequence` item: those are STAMPED
scopes, whose positions are computed at run time, so a plate inside one declares nothing and punches
nothing.

#### Scenario: Moving a box moves its title with it

- **GIVEN** a box composition holding a plate and its title
- **WHEN** an arrangement positions that box's instance
- **THEN** the title moves with the plate, and the author positions ONE instance rather than placing
  the plate and the title separately in every arrangement

#### Scenario: A plate inside a nested box still punches

- **WHEN** a template with boxes authored as nested compositions is exported
- **THEN** each plate declares its scene rect through its full ancestor chain, and the hole it
  punches lands in the right element's own box

#### Scenario: A box inside a stamped scope is refused

- **WHEN** an author places a Live Source plate inside a `sequence` item or a `repeater`
- **THEN** export is refused with a named error, rather than producing a template whose plate
  silently declares nothing and punches nothing

### Requirement: Each COUNT has a DEFAULT arrangement, and not every count needs one

Each count that a template authors SHALL have exactly one arrangement marked as its **default**. That
default is what the operator's toggles activate when they derive that count.

A template SHALL NOT be required to author an arrangement for every count. A count with no
arrangement is a legitimate authoring choice, and the runtime refuses reaching it (see
`runtime-multibox-layout`) rather than substituting another count.

#### Scenario: One count with two arrangements

- **GIVEN** a count with two authored arrangements
- **WHEN** the author marks one as the default
- **THEN** the operator's toggles activate that one, and the other is reachable only by an explicit
  secondary action

#### Scenario: A template that authors only some counts

- **WHEN** the author authors 1-box and 2-box arrangements and no 3-box one
- **THEN** the template exports successfully, and reaching a 3-box count is a runtime refusal rather
  than an authoring error

### Requirement: ONE shared background is the default; a per-arrangement background is OPTIONAL

A single fixed background SHALL be the default and SHALL be sufficient. A background with no
per-arrangement override is shared across every arrangement — it is shared because nothing hides it,
not because a sharing concept exists.

A per-arrangement background SHALL remain authorable, as an ordinary element visible in one
arrangement. It requires no concept beyond per-arrangement element visibility.

⚠ **The Designer SHALL make its cost visible to the author at the point of authoring.** Crossfading
two full-frame backdrops was measured at **−10 % of the CEF frame budget with a 120 ms worst frame
gap**, against **−4 %** for interpolating the plate holes — the most expensive transition path in this
feature. An author reaching for per-arrangement backgrounds must be able to learn that from the
Designer, not from a stuttering transition on air.

#### Scenario: A template with one background

- **WHEN** the author gives a template a single background and three arrangements
- **THEN** every arrangement shows that background, no crossfade is generated, and no arrangement
  needs a background of its own

#### Scenario: Per-arrangement backgrounds carry a stated cost

- **WHEN** the author gives two arrangements different backgrounds
- **THEN** it is accepted, and the cost of the crossfade between them is surfaced where the author
  makes that choice

### Requirement: The transition MODE and DURATION are authored PER ARRANGEMENT

The transition mode and duration SHALL be a property of the **arrangement being ENTERED** — "this
arrangement is always entered with a fade" — authored in the same section as the arrangement list.

Per-template scope is refused: it cannot express the difference between arrangements, which is the
whole point of having several, and no later change can widen it without discarding what was authored.

Per-pair (ordered) scope is deferred rather than refused. Per-arrangement is a **strict subset** of
the per-pair form — a later change adds a _from_ dimension to entries that already exist, and every
authored per-arrangement value becomes that pair's row default — so the authored format SHALL be
shaped so that upgrade needs no migration.

#### Scenario: An arrangement carries its own entry mode

- **WHEN** the author sets the 2-box arrangement to be entered with a move and the 1-box arrangement
  with a cut
- **THEN** every transition into 2-box moves and every transition into 1-box cuts, whichever
  arrangement it came from

#### Scenario: The authored format survives a later per-pair upgrade

- **WHEN** the mode is authored per arrangement
- **THEN** it is stored beside that arrangement, so a later per-pair table can treat it as the row
  default without rewriting what authors have already saved

### Requirement: "Hide while the arrangement is changing" is a PER-ELEMENT flag

The option to hide an element during a transition SHALL be authored **beside the element**, not on
the arrangement. The distinction being authored is a property of the element: a box title should
leave during the move, while a logo inside the multi-box must not blink on every switch. An
arrangement-level flag would force one answer for everything the arrangement contains.

🔴 This flag is a **THIRD** per-element visibility notion, alongside the authored `visible` and
per-arrangement visibility. **Resolved visibility SHALL be computed by ONE function**, and this flag
SHALL be an INPUT to it — never a separate boolean read at the point of use. Three booleans that all
mean "is this on screen", read in three places, is precisely the shape that produces a predicate whose
name stops matching what it tests.

#### Scenario: A title leaves during the move and a logo does not

- **GIVEN** a box title with the flag set and a logo without it
- **WHEN** the arrangement changes
- **THEN** the title is hidden for the transition and the logo stays visible throughout

#### Scenario: One function decides visibility

- **WHEN** any consumer asks whether an element is visible
- **THEN** it calls the one resolved-visibility function, which takes the authored `visible`, the
  per-arrangement visibility and this flag as its three inputs

### Requirement: A title FITS its cell, decided from the RENDERED box after shaping

A text element that must fit its box SHALL have its fit decided from the **rendered box after
shaping**, never from the character count of the string.

The same title has to fit a wide 1-box cell and a narrow 4-box cell. Persian shaping means glyph
advances are not the sum of character advances — contextual forms and ligatures change the width — so
a rule based on counting characters works for Latin and fails for Persian. It looks correct in the
Designer and breaks on air with the next guest's name.

This depends on `B-147`: the schema currently offers three spellings of "make the text fit" and the
runtime implements none of them, including an `autoSqueeze` control that writes a field nothing reads.
Those three SHALL become one.

#### Scenario: A long Persian name in a narrow cell

- **GIVEN** a box title whose text is longer than a 4-box cell is wide
- **WHEN** the arrangement puts that box in a 4-box cell
- **THEN** the title fits, with the decision made from the shaped, rendered width

#### Scenario: One spelling of the fit rule

- **WHEN** an author looks for how to make text fit its box
- **THEN** there is one field that does it, and no control writes a field the runtime ignores

### Requirement: Author-time preflight — one arrangement active, and overlap checked WITHIN it

Exactly one arrangement SHALL be active while authoring, so the canvas always shows a state the
runtime can actually produce.

The `live-source-overlap` export-blocking check SHALL be applied **WITHIN** an arrangement and SHALL
NOT fire across arrangements. Two plates whose holes overlap inside one arrangement remain a fault —
overlapping holes put two live sources over the same pixels and which one shows is a z-order accident.
Two plates that occupy the same screen area in _different_ arrangements are the normal case and SHALL
be accepted.

The rule itself does not change; only the input it is evaluated over does.

#### Scenario: Overlap inside one arrangement is still refused

- **WHEN** two boxes overlap within the 3-box arrangement
- **THEN** export is blocked with the existing overlap error, reported against both elements

#### Scenario: The same screen area across two arrangements is fine

- **WHEN** the 1-box arrangement's single cell covers the area the 3-box arrangement's three cells
  occupy
- **THEN** no overlap error is raised, because they are never on air together

#### Scenario: The canvas shows one arrangement at a time

- **WHEN** the author switches which arrangement they are editing
- **THEN** the canvas shows that arrangement alone, not the union of all of them
