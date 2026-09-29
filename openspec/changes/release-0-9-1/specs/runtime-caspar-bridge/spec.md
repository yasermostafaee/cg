# runtime-caspar-bridge

## ADDED Requirements

### Requirement: The bridge SHALL give the console the page it serves CasparCG

A read-class `templates.page` request naming a template and optionally a channel SHALL answer the HTML the
bridge stores for the version that channel lists (with no channel, the station-wide reading's version) —
the same bytes its template server returns for `/template/<id>~<version>` — or a refusal saying why: the
channel's list does not hold the template (`not-listed`), or it does and the store has no file for that
version (`no-file`). It SHALL write nothing and send nothing to CasparCG.

#### Scenario: Listed

- **WHEN** CH 1 lists a template **THEN** `templates.page` for it on CH 1 answers exactly the bytes its serve
  path returns

#### Scenario: Not listed, or no file

- **WHEN** CH 2 does not list it **THEN** the answer is `not-listed`
- **WHEN** CH 1 lists it but its version's file is gone **THEN** the answer is `no-file`

### Requirement: A bank no operator has applied SHALL be brought to the five-row rule once

An unapplied all-shown bank SHALL be brought once to the five-row rule (the highest five rows of each band
shown, the rest hidden) as soon as the channel's occupancy is KNOWN. Such a bank is one that no operator
has applied since first-run declared it with every row shown — every row of its template band carries an
explicit `true` in its visibility, a shape an operator's Apply never writes. A row the channel reads
occupied SHALL stay shown,
and while the occupancy is unknown nothing SHALL change. The change SHALL go through the same validated
door as any bank change (a row is hidden only while it reads empty), SHALL be abandoned for that round if
the banks changed meanwhile, SHALL be persisted, and SHALL be announced on the bridge's log. A bank of any
other shape SHALL never be changed by it.

#### Scenario: An old bank at start

- **WHEN** the bridge starts with such a bank and the channel reads empty except layer 90 **THEN** the
  bank shows 99–95, 90 and 59–55, and the file holds it
- **AND** the next start changes nothing

#### Scenario: Unknown, or applied

- **WHEN** the channel's occupancy cannot be read **THEN** the bank and its file are unchanged
- **WHEN** the bank carries any `false` key **THEN** it is never changed by this

### Requirement: A layer of ours that CasparCG reports empty SHALL leave ON AIR

The bridge SHALL treat OSC silence on a layer it holds on air as a QUESTION, never as "still playing".
CasparCG 2.5 erases a cleared layer from its stage, and its OSC for that layer simply stops
(`stage.cpp` `clear`); it never reports it `empty`. So for a layer this bridge holds on air — an item's
page or a plate seat — whose OSC has stopped for about 1 s, while the channel's own OSC still arrives, the
bridge SHALL send ONE `INFO <channel>-<layer>` read for it (never a channel-wide
poll, one read per silence) and, if CasparCG's answer has no such layer in its stage, SHALL take that item
or seat off air through its reconcile, raise the notice `Layer <n> on CH <c> was cleared outside CG
Control`, re-send nothing and put nothing back. An answer that still carries the layer, or no answer,
SHALL change nothing. Whole-channel OSC silence SHALL never trigger the read.

#### Scenario: A foreign clear of a page and one plate

- **WHEN** a second AMCP client clears the page layer and one plate layer of a multi-box row on air
  **THEN** within 2 s both read off air and the notice names each layer
- **AND** the row's other plates, and another item on the channel, stay ON AIR (the control)

#### Scenario: A quiet channel is not a cleared layer

- **WHEN** the whole channel's OSC stops **THEN** no `INFO` is sent and nothing leaves ON AIR

### Requirement: The AMCP mock SHALL model a cleared layer and `INFO` as CasparCG 2.5 does

`@cg/amcp-mock` SHALL stop reporting a cleared layer on OSC — never `producer "empty"` — while a stopped
layer keeps reporting `empty`, and SHALL keep the layer's mixer state across the `CLEAR`, as the core
keeps its transforms. `INFO <channel>` and `INFO <channel>-<layer>` SHALL both answer `201 INFO OK` and
the whole channel's XML, each live layer as `<stage><layer><layer_N>` with its `foreground` and
`background` producers, and no `<stage>` when no layer is live.

#### Scenario: Cleared and stopped

- **WHEN** a layer is cleared **THEN** no OSC for it follows and `INFO` carries no `layer_N` for it
- **WHEN** a layer is stopped **THEN** it goes on reporting `producer "empty"`

## MODIFIED Requirements

### Requirement: Orphaned layer occupancy is swept, surfaced, and operator-clearable

The bridge SHALL periodically compare server-side layer occupancy against the
layers it owns and surface every mismatch as an orphan: a layer whose
foreground producer is non-empty on the CURRENT PRIMARY, observed fresh, and
whose (channel, layer) is not owned by the bridge (not a reserved slot).
Occupancy SHALL be sourced from a passive tap on the already-parsed OSC
producer stream — upstream of the interest filter, adding no events to the
OSC pipeline and no AMCP traffic — so the interest set, rate limiter, and
change tracker (the B-044 firehose protections) remain untouched. (CORRECTED
by `RELEASE-091-01`: AMCP `INFO <channel>` on 2.5.0 DOES carry per-layer
stage data — `<stage><layer><layer_N>` — measured on the plant's core; the
sweep still reads OSC, and `INFO` is read only as the one-layer question a
silent layer of ours raises.)

The sweep SHALL run on a bounded periodic cadence, query only the current
primary (following it across failover and reconfiguration), and skip while
the primary session is not healthy — existing warnings freeze rather than
falsely resolve while disconnected. Surfacing SHALL be debounced (an orphan
appears after consecutive sightings; it resolves on the first sweep that
observes the layer empty or no longer reported) and published only when the
orphan set changes. The sweep timer SHALL be disposed with the runtime.

The orphan set SHALL be pullable (`layers.orphans`) and pushed on change
(`layers.orphans-changed`), each orphan carrying the observed producer kind.

A `layers.clear` request SHALL send an urgent `CLEAR <channel>-<layer>` ONLY
for a layer whose foreground producer the current primary's occupancy tap has
OBSERVED FRESH, and ONLY when that producer is `html`, or the layer lies inside
CG's bands (50–99) — where every producer, `html` or not, may be this system's
own or one left there by another station (`RELEASE-091-01`, DELTA B B3). It
SHALL refuse, sending nothing:

- `reason: 'owned'` — any layer the bridge owns (clearing owned layers is
  Out/Remove's job, and a plate its ledger holds is owned), refused before
  any occupancy check;
- `reason: 'foreign'` — any layer below CG's bands whose fresh observation
  reports a non-`html` producer kind (a video there is PROVABLY not ours), any
  unrecognised kind there ("not html" fails safe), and any layer with NO fresh
  observation at all (silence is evidence of nothing and cannot license a
  CLEAR — including the B-094 AMCP-alive/OSC-dead install and entries aged past
  the staleness bound).

The bridge SHALL never touch slots or interest it does not own; a CLEAR
executed on the current primary counts as layer adoption. It SHALL never send
a channel-wide `CLEAR`. The warning resolves only on the next sweep's observed
empty — never optimistically, and the bridge SHALL NEVER clear a layer without
an explicit operator request.

#### Scenario: A foreign producer surfaces within the sweep cadence

- **WHEN** a producer exists on a layer the bridge does not own (e.g. left by
  a dead bridge session) and the primary session is healthy **THEN** within
  two sweep cycles the layer is surfaced as an orphan, named by
  channel-layer with its observed producer kind, and published to connected
  clients

#### Scenario: Owned layers never surface; idle is quiet

- **WHEN** every non-empty layer maps to a bridge-owned slot **THEN** no
  orphan is surfaced and nothing is published (no idle noise, no per-tick
  logging)

#### Scenario: Operator Clear of an html orphan resolves on observed empty

- **WHEN** the operator invokes `layers.clear` on a surfaced layer whose
  fresh observation reports an `html` producer **THEN** the bridge sends
  `CLEAR <ch>-<layer>` (urgent) and the warning resolves on the next sweep
  that observes the layer empty or gone silent
- **WHEN** `layers.clear` names a layer the bridge owns **THEN** the request
  is refused with `reason: 'owned'` and nothing is sent

#### Scenario: A layer left in our band can be cleared

- **WHEN** `layers.clear` names layer 61 carrying an `ffmpeg` producer that no
  ledger record holds **THEN** the bridge sends `CLEAR <ch>-61` and the
  warning resolves on observed empty
- **WHEN** it names a plate layer this bridge's ledger holds **THEN** it is
  refused `owned` and nothing is sent (the control)

#### Scenario: A video below our bands can never be cleared

- **WHEN** `layers.clear` names a layer below 50 whose fresh observation
  reports a non-`html` producer (e.g. `ffmpeg` on 1-5) **THEN** the request is
  refused with `reason: 'foreign'` and NO `CLEAR` reaches the wire
- **WHEN** `layers.clear` names a layer the occupancy tap has NO fresh
  observation for (never observed, aged out, or the tap is blind) **THEN**
  it is refused with `reason: 'foreign'` and nothing is sent

#### Scenario: The sweep follows the primary and freezes when it is down

- **WHEN** a failover or runtime reconfiguration switches the primary
  **THEN** subsequent sweeps read the new primary's occupancy
- **WHEN** the primary session is not healthy **THEN** the sweep skips and
  previously surfaced warnings persist unchanged (absence of knowledge never
  resolves a warning)
