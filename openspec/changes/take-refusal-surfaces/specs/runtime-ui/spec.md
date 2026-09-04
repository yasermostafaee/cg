# runtime-ui — delta for take-refusal-surfaces

## ADDED Requirements

### Requirement: The audit log is read in the operator's terms

The Audit log panel SHALL show each entry's time as the console's LOCAL wall-clock time to the
second, with the record's own UTC stamp available on hover, and SHALL show the local date once
per day as a band where it changes down the list rather than on every row. It SHALL name the
layer an entry concerns as the Layers table names that row (the configured alias, else the
default `Layer N` / `Bed N`), or — for a layer outside the declared bank — as CasparCG names it
with the fact that it is not a row stated, and SHALL name the template as the picker names it.
The item id and the template id SHALL remain on the row: shortened for display, complete in the
element's title, and copyable to the clipboard. The record on disk SHALL be unchanged, and the
sentence qualifying the console name ("a LABEL you typed, not a verified sign-in") SHALL be
unchanged.

#### Scenario: The incident stamp reads as the control room clock

- **WHEN** an entry stamped `2026-09-04T12:18:47.561Z` is shown on a console in `Asia/Tehran`
  **THEN** its time cell reads `15:48:47` and its title carries the UTC stamp

#### Scenario: The date appears once per local day

- **WHEN** the list holds entries from two local days **THEN** exactly two date bands appear,
  each above the first entry of its day, and no row carries a date

#### Scenario: The row and the template are named

- **WHEN** an entry names layer 9 in a bank whose beds are 1–9 and the template whose file was
  `3ghab.vcg` **THEN** the row reads `Bed 1 · 3ghab`

#### Scenario: A layer no row shows is named as CasparCG names it

- **WHEN** an entry names layer 60 outside every half of the bank **THEN** the row reads
  `layer 60 (not a row)`

#### Scenario: The ids are kept, shortened and copyable

- **WHEN** an entry is shown **THEN** its item id and template id appear shortened with the full
  id in the title, and a copy control writes the full id to the clipboard

#### Scenario: A refused command is shown beside its code

- **WHEN** an entry carries `errorCode: amcp-404` and a recorded `command` **THEN** the row shows
  the code and the command line

### Requirement: The in-use refusal names where each item is and offers the way there

When a template deletion is refused because stack items still use it, the refusal SHALL name
each item's place — a declared row by the name the Layers table gives it, a layer outside the
bank as CasparCG names it with the fact that it is not a row stated, or "no layer bound" — and
SHALL NOT mention Remove All. For each item on a declared row the picker SHALL offer a control
that closes the picker, scrolls the Layers table to that row, focuses it and selects it. For
each item on no row the picker SHALL offer a confirm-gated removal of that one item, naming its
layer and stating that removal takes it off air if it is on air.

#### Scenario: A row-bound item is named and can be shown

- **WHEN** the deletion is refused because an item is on the row `Bed 1` (layer 9) **THEN** the
  refusal reads "on the row “Bed 1” (layer 9)" and a `Show Bed 1` control closes the picker and
  leaves that row selected

#### Scenario: An item no row shows gets a targeted removal

- **WHEN** the deletion is refused because an item holds CasparCG layer 60, which is not a row
  **THEN** the refusal says so, a `Remove item` control opens a confirm naming layer 60, and
  confirming removes exactly that item and nothing else

#### Scenario: Remove All is not the offered remedy

- **WHEN** a deletion is refused as in-use **THEN** neither the sentence nor the controls mention
  Remove All

### Requirement: The layer table's tally says what it counts

The Layers table header SHALL show the number of rows this console believes are on air or
unsettled as `(N on air)` in the air colour, derived from each item's reconciled status through
the same on-air-or-unsettled predicate the Server settings gate uses, and SHALL show the number
of rows whose last command was refused as `(N in error)` in the error colour. The two numbers
SHALL never be added, and neither SHALL be shown when it is zero. STOP ALL SHALL keep its own
predicate, which offers STOP to a row that may be showing something.

#### Scenario: Two refused rows are not two on air

- **WHEN** two rows are in `error` and no row is on air **THEN** the header shows `(2 in error)`
  and no air count

#### Scenario: One on air from elsewhere, two refused here

- **WHEN** one row is `on-air` and two are in `error` **THEN** the header shows `(1 on air)` and
  `(2 in error)`

#### Scenario: The unverifiable grey is kept

- **WHEN** CasparCG cannot be reached and one row is believed on air **THEN** `(1 on air)` is
  shown greyed with the unverifiable marker, as before
