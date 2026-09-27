# runtime-playout-sources Specification

## Purpose

TBD - created by archiving change playout-sources. Update Purpose after archive.

## Requirements

### Requirement: The bridge SHALL take the station's inputs from the Playout and keep the last good list

The bridge SHALL read the Playout's input list (D10, `GET /api/cg/inputs`) at sign-in, then at most every 30 s
with `If-None-Match`, and on demand when a picker opens and the last read is older than 5 s, with the signed-in
operator's bearer checked at use; the read SHALL never be in a verb's path. A `404`, a `401`, a timeout and a body
it cannot read are failed reads, and a failed read or a `304` SHALL change nothing. The last good list SHALL be
persisted and SHALL stay in force across a Playout outage and a bridge restart.

#### Scenario: A Playout outage keeps the bindings resolving

- **WHEN** the Playout stops answering after a good read **THEN** every binding still resolves from the persisted
  list and a take of it plays
- **AND** on a fresh station that has never read a list, nothing resolves and the existing unassigned refusal
  fires (the control)

#### Scenario: A restart while the Playout is down keeps the list

- **WHEN** the bridge restarts while the Playout is down **THEN** the persisted list is in force

#### Scenario: CG switched off on the Playout is a failed read

- **WHEN** D10 answers `404` **THEN** nothing changes
- **AND** a `200` without an input marks that input unavailable (the control)

### Requirement: The bridge SHALL search the Playout's media on the Playout's side and store only what is bound

The bridge SHALL answer `sources.media-search { q, sort?, cursor?, limit? }` from D11 (`GET /api/cg/media`) with
`type=video,still`, `limit` 50 and a 5 s bound, answering `{ items, total, nextCursor }` as received or a named
failure (`playout-unreachable`, `playout-refused`). A cursor SHALL only ever be sent with the query that produced
it. The bridge SHALL persist only the media items that are bound, and SHALL re-read them by `ids=` (at most 100 per
call) every 30 s while signed in, at sign-in and when a picker opens, so a `clip` that moved is played from its new
path.

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

### Requirement: What the Playout stops offering SHALL become unavailable and SHALL never be deleted

An entry the Playout stops offering SHALL become `unavailable` — an input a successful D10 read no longer lists, or
a bound media id a successful `ids=` read leaves out — and every binding to it SHALL be kept and shown tagged. A take or a look switch that would
seat it SHALL be refused before any AMCP with `source-unavailable` and one sentence on the row, and what is already
on air SHALL be untouched. A later read that lists it again SHALL clear the tag. Nothing SHALL ever be deleted
because of a Playout read; only an operator action removes a binding.

#### Scenario: An input the Playout removed

- **WHEN** the Playout removes `Studio 1` and the next read succeeds **THEN** it reads unavailable, the binding is
  kept, a take is refused with `… “Studio 1” is not in the Playout's input list.` and nothing is sent, and a row
  already on air with it is untouched
- **AND** when the Playout lists it again, the take plays (the control)

#### Scenario: No prune across a restart

- **WHEN** the bridge restarts after that removal **THEN** the assignment is still in the store

### Requirement: A media PLAY answered 404 SHALL get one fresh read and at most one retry

A media `PLAY` answered `404` inside a take or a look switch SHALL trigger ONE `ids=` read bounded at 1.5 s; if the
item's `clip` changed, that `PLAY` SHALL be retried once with the fresh path, and otherwise the verb SHALL fail all
or nothing, undoing only what it added. It is the only Playout read inside a verb, and only on its failure path.

#### Scenario: The retry lands

- **WHEN** the server answers `404` for a stale path **THEN** the bridge reads `ids=` once, retries once with the
  fresh path, and the take plays
- **AND** when the fresh read returns the same path, the take fails all or nothing with exactly one retry, never
  two (the control)

### Requirement: The NDI producer SHALL be sent as `[NDI] "<source>"`, and every other arm SHALL be unchanged

The `ndi` producer SHALL be sent as `PLAY <ch>-<L> [NDI] "<source>"`, the form the Playout's core accepts. A plate
bound to a Playout input SHALL send byte for byte the AMCP a hand-made entry with the same producer sent before —
through a real take for `media` and `stream`, and at `producerArgument` for `route` and `decklink`.

#### Scenario: The NDI take

- **WHEN** an NDI plate is taken on channel 2 **THEN** the line is `PLAY 2-60 [NDI] "STUDIO-PC (Cam 1)"`
- **AND** no `NDI NAME` spelling remains anywhere in the bridge (the control)

### Requirement: A stream URL SHALL never reach the console, and its credentials SHALL never reach the log or the audit

A `stream` URL SHALL never be displayed in the console; in the AMCP log, the audit and every line the bridge prints,
`scheme://user:pass@` SHALL be written `scheme://***@`. Nothing the bridge reads from OSC that can carry a path or
URL SHALL be logged, stored, published or shown; the fact that a producer is present SHALL still reach every place
that shows it.

#### Scenario: A credentialed stream

- **WHEN** `دوربین خبر` (`rtsp://cam:secret@10.0.0.21/live`) is bound and taken **THEN** its URL appears nowhere
  in the console's DOM, and the log and the audit carry `rtsp://***@10.0.0.21/live`
- **AND** `Multicast`'s URL, which carries no credentials, is logged unchanged (the control)

#### Scenario: An OSC path

- **WHEN** OSC reports a `file/path` carrying `rtsp://u:p@…` **THEN** it appears in no log, store, published frame
  or DOM
- **AND** that a producer is present still reaches the places that show it (the control)

### Requirement: The bridge SHALL take a bound media item's data only from its own Playout reads

Binding a media id SHALL take the item's data only from what the bridge read from the Playout itself — its recent
search answers or an `ids=` read — and never from the console's payload; with neither, and the Playout not
answering, the bind SHALL be refused with one sentence.

#### Scenario: The console's clip is ignored

- **WHEN** a console bind carries a different `clip` for a media id **THEN** it is ignored and the bridge's own
  read decides what is played

### Requirement: An input that fails the catalogue's rules SHALL be listed as unusable and SHALL never be bound

Each Playout input SHALL pass the same rules a hand-made entry did; one that fails SHALL stay listed as `unusable`
with its reason and SHALL never be bound, not even by a hand-crafted request. Two inputs whose names still collide
SHALL both be listed and flagged, never merged.

#### Scenario: A scheme outside the list

- **WHEN** D10 lists a stream whose scheme is outside the accepted list **THEN** it is listed, disabled with its
  reason, and a hand-crafted bind to it is refused

#### Scenario: Every binding door asks the one rule

- **WHEN** a template default, a row's look binding or a swap NEWLY names an unusable entry, one the Playout no
  longer offers, or an id the catalogue does not hold **THEN** the whole request is refused with one sentence that
  names no id
- **AND** a binding already held is kept whatever became of its entry, and an edit elsewhere in the same set is
  accepted (the control)

### Requirement: The bridge SHALL parse contract v1.3's shapes and SHALL NOT seat a `route` input before ROUTE-PLATES-01

A D10 answer without `epoch` SHALL keep every input; with one, it SHALL be stored with the list. A `route` input
SHALL parse with its `channel`, required `layer`, `videoMode`, `compatibleChannels`, `available` and `reason`, and
SHALL join channels by the same rule as D4. Until `ROUTE-PLATES-01` lands, every `route` input SHALL be `unusable`
with the reason "Not supported yet." through ONE named gate, and no `PLAY … route://` SHALL be sent for one. D4's
`videoMode` (which may be `null`) and `pendingRestart` SHALL be parsed and published, and a `null`, missing or
unknown value SHALL never void a channel's row or its name.

#### Scenario: The two route inputs

- **WHEN** D10 lists `ورودی ۳` and `ورودی ۴` as `route` inputs **THEN** both parse, both read "Not supported yet.",
  binding either is refused, and no `PLAY … route://` is ever sent
- **AND** a `route` with no `layer` is unusable
- **AND** the NDI and stream inputs bind and play (the control)

#### Scenario: Old and new D10

- **WHEN** D10 carries no `epoch` **THEN** every input is kept
- **AND** a D10 with an `epoch` stores it (the control)

#### Scenario: A D4 channel the core does not have yet

- **WHEN** a D4 row carries `videoMode: null` and `pendingRestart: true` **THEN** the channel and its name are kept

### Requirement: An input SHALL be offered per channel by its compatible channels

An input whose `compatibleChannels` does not include the channel of the row being bound SHALL be shown disabled with
`Not available on CH n` in its `title`, never hidden.

#### Scenario: Channel 2

- **WHEN** a channel 2 row is bound **THEN** `ورودی ۴` is disabled with `Not available on CH 2`
- **AND** on a channel 1 row it is not disabled for that reason (the control)

### Requirement: Every plate whose source is a D10 input SHALL start silent and SHALL only be raised by a ramp

A plate whose source is a D10 input SHALL be seated at `VOLUME 0`, committed before its `PLAY`, on every seating —
take, look switch, `R-048` swap and restore, an in-place replace included. Nothing automatic SHALL raise it: the
take's `VOLUME 1` never reaches its layer and the connect sweep never covers the plate band. Every raise to its
declared volume — the operator's per-plate setting, default 0 — SHALL ramp as `MIXER <ch>-<L> VOLUME <v> 25`; a
silence, PANIC included, stays immediate. The page layer, beds and non-D10 plates SHALL be unchanged.

#### Scenario: An NDI and a stream plate

- **WHEN** an NDI plate and a stream plate from D10 are taken **THEN** each one's `VOLUME 0` is committed before its
  `PLAY`, and no `VOLUME 1` reaches their layers from the take or from the connect sweep
- **AND** an operator's raise sends `VOLUME <v> 25`
- **AND** the page layer still gets its `VOLUME 1`, and PANIC sends an immediate 0 (the control)

### Requirement: One picker SHALL bind a plate to one of the Playout's inputs or media

The native selects that bind a plate — template defaults, look inputs and the swap — SHALL be replaced by one
`SourcePicker` that returns a choice, each call site keeping its own commit model. Closed, it SHALL look like the
field it replaces and show the kind icon, the name, a muted duration for media, an amber `Unavailable` tag, or
`None`. Open, it SHALL be an anchored panel (not a modal), at least 440 px wide and at most 480 px tall, flipping
above the field when there is no room, with the call site's special rows above two tabs, `Inputs n` and
`Media n`. Inputs SHALL appear in the Playout's order with the name only, never the kind or a URL; media SHALL be
searched as the operator types (debounced 250 ms), paged by 50 as the list nears its end in a virtualised list, with
a `Recent` group for an empty query and the current binding pinned. Media SHALL never appear under Inputs nor
inputs under Media. The picker SHALL be operable by keyboard and SHALL isolate every name in `<bdi>`. While it is
open it SHALL own the keyboard and the pointer: Escape SHALL close the panel alone and return focus to its field,
and nothing pressed, typed or right-clicked in it SHALL reach the surface beneath.

#### Scenario: Over a dialog

- **WHEN** the picker is opened from the template defaults dialog **THEN** it hangs from its field, at least
  440 px wide and at most 480 px tall, and the dialog stays open beneath it
- **WHEN** the operator presses Escape **THEN** the picker closes, the dialog stays, and focus is back on the field
- **AND** a key or a right-press inside the picker reaches no handler of the surface beneath, while one on the
  field does (the control)

#### Scenario: The two tabs

- **WHEN** the operator searches `Studio` in Media **THEN** the media `Studio 1` is a media row only, and the Inputs
  tab lists no media
- **AND** the Inputs tab lists the input `Studio 1` (the control)

#### Scenario: Empty and failed

- **WHEN** the Playout lists no inputs **THEN** the Inputs tab reads `No inputs from the Playout.`
- **WHEN** a media search fails **THEN** the tab reads `The Playout did not answer.` with `Retry`

### Requirement: A bound source SHALL be named by one label

A bound source SHALL be named by one `SourceLabel` wherever it is named — look inputs, the on-air readouts, the PVW
overlay, the swap dialog and a refusal line: its kind icon, its name and, when it is unavailable, the amber
`Unavailable` tag. No source id and no URL SHALL ever be shown.

#### Scenario: A source that went away

- **WHEN** a bound input becomes unavailable **THEN** every place that names it shows its name with `Unavailable`,
  never its id

### Requirement: Station setup SHALL list the Playout's inputs read-only, and CG Control SHALL no longer define sources

Station setup → Live sources SHALL keep the plate band editable and SHALL list the Playout's inputs read-only — name,
kind (`SDI` for a `route` or `decklink`, `NDI`, `Stream`) and format, never a URL, with `Unusable` marked — and the
time of the last successful read. The catalogue editor, its dialog and its verbs SHALL be gone; `sources.set-config`
SHALL carry only the band. Hand-made entries SHALL NOT be migrated: a plate bound to one reads as unassigned. The
tab's stated contract SHALL be the band's alone — the one thing it applies, by its own button — and nothing on it
SHALL say that anything saves as you go.

#### Scenario: The read-only list

- **WHEN** Station setup opens on the fake station **THEN** there is no Add or Edit, the band is editable, and the
  Playout's inputs are listed with their kinds and the time of the last read, with no URL anywhere

#### Scenario: The tab's contract

- **WHEN** the Live sources tab is shown to a station-admin **THEN** its tag reads `Apply separately`, its legend
  and its footer name `Apply band`, and none of them says anything saves as you go
- **AND** Text file delimiters still says it saved as you go, because it does (the control)

### Requirement: Auth off SHALL take its lists from a local provider that is never in the installed app

With auth off there is no Playout; the lists SHALL come from a local provider behind the same interface, used in
development and tests only, and the one resolution path after it SHALL be the same. The local provider SHALL never
be in the installed app, and a test SHALL say so. The offline console's mock SHALL be fed the same shapes by a test
flag and SHALL answer as the bridge does: its catalogue from the same builder, handed to the console redacted; its
three binding doors binding a media id from its own library first and asking the same rule; its media search
normalised and paged as the Playout's is.

#### Scenario: The shipped bundle

- **WHEN** the bridge is bundled for the installer **THEN** the auth-off provider is absent from the bundle
- **AND** the Playout reader is present in it (the control)

#### Scenario: The offline console

- **WHEN** an e2e seeds the mock's Playout **THEN** its catalogue is the builder's, a stream's password never
  reaches the console, and a look binding or a swap to a gated route is refused
- **AND** without a seed the mock has no sources at all (the control)

### Requirement: Media search SHALL answer a viewer, and binding SHALL keep its permission classes

`sources.media-search` and `sources.refresh` SHALL be read-class routes a `viewer` may call; binding SHALL keep its
classes — `station-admin` for template defaults, `operator` for look bindings and the swap.

#### Scenario: A viewer searches

- **WHEN** a viewer searches the media library **THEN** it is answered
- **AND** the route census still lists every route with its class (the control)
