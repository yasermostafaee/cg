# Live Source routing — the re-banded layer map

## ADDED Requirements

### Requirement: The three role bands SHALL have ONE definition, and a guard SHALL hold the map to it

The layer bands — graphics BED, live PLATE and TEMPLATE — SHALL be defined in exactly one place,
named for their roles rather than their numbers, and every allocator SHALL read that definition.
No band bound SHALL be restated as a constant, a bare literal, or a coordinate string anywhere
else.

A guard SHALL refuse a map in which any band allocates below the floor, in which two bands
overlap, or in which the bands are not in composition order (bed strictly below plate strictly
below template). The guard SHALL run at module load, because the failure it exists to catch has
no error of its own: CasparCG composites exactly as instructed, so a bed placed at or above its
own plates draws its background OVER the live pictures and nothing anywhere reports a fault.

#### Scenario: The shipped map is the owner's cut

- **WHEN** the layer map is read
- **THEN** the bed band is 50–59, the plate band is 60–79 and the template band is 80–99
- **AND** layers 1–49 are in no band at all

#### Scenario: A bed at or above its own plates is refused

- **WHEN** the bed band is renumbered so that it reaches the plate band
- **THEN** the map refuses to load, naming both bands and what the collision would do on air

#### Scenario: A band below the floor is refused, and the refusal names the free span

- **WHEN** any band is renumbered to start below layer 50
- **THEN** the map refuses to load
- **AND** the message says that 1–49 is left free for the playout server

#### Scenario: Disjoint bands in the wrong order are still refused

- **WHEN** the bed band is placed above the template band with no overlap between them
- **THEN** the map refuses to load, because disjointness is a weaker property than order

### Requirement: Nothing this product allocates SHALL land below layer 50

Layers 1–49 SHALL be left to the playout system and anything else on the channel. No default
allocation range, bank or band that this product ships SHALL place a graphic there, because a
graphic of ours on a playout layer is indistinguishable from the playout system's own on the
wire — OSC reports producer kind, not identity — so such a collision is discovered on air or not
at all.

Type-keyed dynamic allocation SHALL ship with NO ranges. A deployment that wants a graphic placed
by its `templateType` SHALL declare its own ranges, and a guard SHALL refuse any declared range
that begins below the floor.

#### Scenario: The shipped dynamic policy is empty

- **WHEN** the bridge boots with nothing configured
- **THEN** no `templateType` resolves to a dynamic range
- **AND** a load through the dynamic verb is refused rather than placed on a guessed layer

#### Scenario: A policy that would allocate below the floor is refused

- **WHEN** a dynamic range beginning below layer 50 is declared
- **THEN** the guard refuses it, naming the free span

### Requirement: A fixed-layers file written under the OLD map SHALL be refused by name

An old-map bank SHALL be refused at boot. That is a persisted bank whose operator rows begin
below the template band, or whose graphics-bed rows begin below the bed band.

The refusal SHALL name what the file says, name the map in force, and give the remedy: move the
file aside — renaming it, never deleting it — let the built-in default apply, and re-enter the
aliases and ticks against the new rows.

The two maps SHALL NOT be mixed. Ignoring such a file would silently discard an operator's
aliases and ticks and boot on a bank they did not declare; rewriting it would require guessing
which old rows map onto which new ones, and a wrong guess is a named row pointing at a different
layer, discovered on air.

#### Scenario: An old-map bank is refused at boot

- **WHEN** the bridge starts with a fixed-layers file declaring the pre-re-cut bank
- **THEN** the boot fails, naming both maps and the remedy
- **AND** the file is left exactly as it is

### Requirement: A retained row with no usable coordinate SHALL be answered by whether it may be re-seated

A restore SHALL honour a retained coordinate exactly and SHALL NOT invent one. Where no usable
coordinate exists, the outcome SHALL be decided by the one canonical predicate for whether a
restore may put a producer back on the row's layer.

A row that MAY be re-seated SHALL be skipped, visibly, with a reason distinct from an exhausted
range: nothing is exhausted, and telling the operator to free a layer would send them to clear a
row that would not help.

A row that may NOT be re-seated — one the operator cleared, or one that errored and never had a
producer — SHALL come back with NO LAYER, and SHALL come back wearing the same state and the same
reason it had before the restart. A row that returns silently clean is the same loss as one that
vanishes: the operator never learns it was broken.

#### Scenario: An errored row comes back visibly broken and on no layer

- **WHEN** a bridge restarts and a retained row that errored before the restart is restored
- **THEN** the row is on the stack with its error state and its original reason
- **AND** it carries no layer, and nothing is sent on its behalf on any layer

#### Scenario: A re-seatable row with no free coordinate is skipped with its own reason

- **WHEN** a retained on-air row's coordinate is already taken by another restored row
- **THEN** the row is skipped rather than re-homed onto a layer nobody chose
- **AND** the skip reason tells the operator to declare a row for it
- **AND** the row that already held the coordinate is untouched

## MODIFIED Requirements

### Requirement: A plate-bearing package composites BELOW its plates, on its own declared bank

A template that declares live plates SHALL have its page placed on a layer BELOW every live-source
layer, so the plates composite OVER it and no hole is ever needed. A template that declares none
SHALL keep today's placement, on the operator bank above the live band, so the furniture it carries
still draws over the pictures.

The low placement SHALL be a SECOND DECLARED BANK — **the BED band, layers 50–59 by default** —
and NOT an item whose slot differs from its row. The row SHALL remain the layer, unchanged,
because retention, occupancy, the fixed binding and every AMCP target read that one coordinate,
and two places holding it is the drift this project has already rejected once.

**The bed band SHALL NOT begin below the floor.** It was 1–9 until 2026-09-14, which is the span
now left to the playout server; the schema SHALL bound a declared bed range to the band.

**Classification SHALL be automatic at import**, derived from whether the package declares plates,
and SHALL NOT be an operator choice: a flag someone forgets to set is a silent fault on air.

**Loading onto the wrong bank SHALL be REFUSED with a message naming the reason and the bank that
would accept it.** A plate-bearing page on a high row renders above its own plates, which — with the
mask retired — is every plate covered by its own backdrop.

#### Scenario: The default bed bank sits in the bed band

- **WHEN** a station with no fixed-layers file boots
- **THEN** its graphics-bed rows are the whole bed band, 50–59
- **AND** its operator candidate rows are the whole template band, 80–99

#### Scenario: A bed range below the band is refused by the schema

- **WHEN** a bank declares graphics-bed rows beginning below the bed band
- **THEN** the bank does not parse, and the bridge does not boot on it
