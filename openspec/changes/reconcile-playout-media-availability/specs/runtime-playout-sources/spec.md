## MODIFIED Requirements

### Requirement: The bridge SHALL search the Playout's media on the Playout's side and store only what is bound

The bridge SHALL answer `sources.media-search { q, sort?, cursor?, limit? }` from D11 (`GET /api/cg/media`) with
`type=video,still`, `limit` 50 and a 5 s bound, answering `{ items, total, nextCursor }` as received or a named
failure (`playout-unreachable`, `playout-refused`). A cursor SHALL only ever be sent with the query that produced
it. The bridge SHALL persist only the media items that are bound, and SHALL re-read them by `ids=` (at most 100 per
call) every 30 s while signed in, at sign-in and when a picker opens, so a `clip` that moved is played from its new
path. Each by-ID call SHALL request a limit equal to the number of requested IDs. Only a complete, valid
by-ID result SHALL establish that an omitted ID is unavailable. A positive match in any D11 result, including
a search or Recent page, SHALL refresh the matching bound entry and clear its unavailable state while keeping
its station playback settings and binding timestamp. An older overlapping read SHALL NOT replace a newer
observation for that bound ID. Unbound search results SHALL remain transient.
The Media picker SHALL use a current search match for its exact ID when the saved catalogue
still reports an older availability state.

#### Scenario: Paging through the library

- **WHEN** a console scrolls to the end of the library **THEN** every page arrives with no id repeated, and no
  audio item ever appears
- **AND** a changed query starts again without the old cursor; a stale cursor is refused by the Playout (the
  control)

#### Scenario: Search is normalised on the Playout's side

- **WHEN** the operator searches `كليپ` or `خبر 1405` **THEN** `کلیپ` and `خبر ۱۴۰۵` are found
- **AND** a term that matches nothing returns no items (the control)

#### Scenario: A clip that moved is played from its new path

- **WHEN** the Playout moves a bound item's `clip` between its cache and its original **THEN** within 30 s the next
  take plays the new path
- **AND** without the move the path is unchanged (the control)

#### Scenario: A bound clip is listed again in Recent

- **GIVEN** a complete by-ID read left a bound clip unavailable
- **WHEN** a later D11 Recent page lists that clip
- **THEN** the console offers it and the bridge saves its current available state and clip path
- **AND** the existing binding timestamp and playback settings are preserved

#### Scenario: A Bridge still reports the saved state

- **WHEN** a current Media page lists an ID whose saved catalogue entry says Unavailable
- **THEN** that exact result is offered without the stale status

#### Scenario: An incomplete or out-of-order by-ID read

- **WHEN** a by-ID page does not account for all of its results
- **THEN** valid matches refresh their bound entries and omitted IDs keep their prior availability
- **WHEN** an older by-ID read completes after a newer search observed the same ID
- **THEN** the older observation cannot overwrite the newer one
