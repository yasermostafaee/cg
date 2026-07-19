# runtime-caspar-bridge — delta (occupancy-aware allocation, C-014)

## MODIFIED Requirements

### Requirement: Playout verbs are chosen from producer state (prescriptive)

The bridge SHALL choose the AMCP playout verb sequence from the **actual per-slot
producer state**, not blindly. It SHALL track, bridge-side, whether a live producer
currently exists on each stack item's slot — independent of the descriptive
`Reconciler` status — and keep that bookkeeping consistent across load / take / out /
remove and across a failover (commands fan out to both servers, so producer
existence is identical on each).

- **load** SHALL issue `CG ADD` only, with the **play-on-load flag OFF** — the
  producer is loaded, NOT playing. A load whose `templateId` is not registered
  with the bridge SHALL be rejected (`errorCode: 'unknown-template'`, nothing
  sent) — never a blind ADD of a URL the bridge cannot serve.
- **layer allocation is occupancy-aware (C-014)**: a layer whose foreground
  producer the current primary's occupancy tap has OBSERVED FRESH as
  non-`html` — R-015's discriminator: this system only places `html`
  producers, so a non-`html` kind (video, or anything unrecognised — "not
  html" fails safe) is provably another system's output — SHALL be
  QUARANTINED out of the allocatable pool: never allocated, never
  adopt-CLEARed. The quarantine set SHALL be reconciled against fresh
  occupancy on the periodic sweep AND at allocation time, SHALL freeze while
  the primary session is not healthy, SHALL release a layer once its foreign
  observation ages out or reports empty, and SHALL reset on runtime
  reconfiguration (old-server knowledge). Slots the bridge owns or that are
  pinned are never quarantined (a foreign producer under an OWNED layer is
  the B-056 warning's territory). A layer with NO fresh observation remains
  allocatable — allocation fails OPEN on silence, deliberately opposite to
  `layers.clear`'s refusal: a blind (no-OSC) install must still be able to
  play out, silence on a healthy tap genuinely means empty (B-053), and
  before this rule EVERY allocation was blind — failing open makes nothing
  worse where no evidence exists. Allocation SHALL skip quarantined layers
  to the next free layer in the range; WHEN the range is exhausted the load
  SHALL be refused with `errorCode: 'no-layer-foreign-occupied'` if any
  in-range slot was quarantined (else `'no-layer'`), the code riding both
  the item's ack and the `stack.load` response — never a silent CLEAR of a
  foreign layer.
- **layer adoption**: the FIRST `CG ADD` a bridge process issues onto a layer
  SHALL be preceded by a `CLEAR` of that layer, issued BEFORE the item's slot
  assignment and OSC interest — destroying any producer orphaned by a previous
  bridge session so the orphan's state can never route to the fresh item. Any
  bridge-issued `CLEAR` (adoption, out, remove) marks the layer adopted for the
  process's lifetime. The bridge SHALL NOT blind-clear layers at startup: an
  orphan the operator wants on air rides through a controller restart untouched
  until a load targets its layer. (An `html`-occupied layer allocates and
  adopts exactly as it always has — the C-014 quarantine governs non-`html`
  occupancy only.)
- **take** SHALL issue `CG PLAY`; but WHEN no live producer exists on the slot (e.g.
  a prior out destroyed it) it SHALL FIRST re-issue `CG ADD` (a fresh load), THEN
  `CG PLAY`.
- **out** SHALL exit + `CLEAR` (destroying the producer) and SHALL update the
  producer-existence bookkeeping so a subsequent take re-ADDs. The slot stays
  reserved to the (still-on-stack, idle) item until remove.
- **remove** SHALL fully remove the item (clear + deallocate the layer + drop the
  bookkeeping).
- **update** (B-070) SHALL issue `CG UPDATE` ONLY while a live producer exists on
  the slot — `CG UPDATE` needs a PRODUCER, not air, and real CasparCG `403`s it on
  a producerless layer. WHEN no live producer exists (a prior out destroyed it; a
  reconnect or `setConfig` rebuilt the bookkeeping), the update SHALL still COMMIT
  the operator's fields to the authoritative field-set, SHALL send NO AMCP command,
  SHALL settle its transient intent in-process, and SHALL be reported as
  `accepted` — the next take's re-ADD carries exactly those fields to air through
  `CG ADD`'s data payload. An update is NEVER gated on the item being ON AIR: a
  loaded-not-taken item has a live producer and updates on the wire like any other.

#### Scenario: Load does not auto-play

- **WHEN** the operator loads a template **THEN** the bridge issues `CG ADD` with
  play-on-load OFF and the producer is loaded but NOT playing (nothing on air until
  take)

#### Scenario: Take plays the loaded producer

- **WHEN** a loaded template is taken **THEN** the bridge issues `CG PLAY` and the
  producer plays

#### Scenario: Out destroys the producer

- **WHEN** a playing template is taken out **THEN** the bridge issues `CLEAR`, the
  producer is destroyed, and the bridge records that no producer exists on that slot

#### Scenario: Take after Out re-ADDs then plays

- **WHEN** a template that was taken out is taken again **THEN** the bridge — seeing
  no live producer on the slot — FIRST re-issues `CG ADD` (a fresh load) and THEN
  `CG PLAY`, so the template renders again (it does not `CG PLAY` an empty layer)

#### Scenario: Producer existence drives the choice, not the descriptive status

- **WHEN** the bridge decides between `CG PLAY` and re-ADD-then-`CG PLAY` **THEN** it
  uses its own per-slot producer-existence bookkeeping (not the `Reconciler` status,
  which is descriptive and does not choose verbs)

#### Scenario: First load onto a layer adopts it with a CLEAR

- **WHEN** a fresh bridge session loads a template whose allocated layer still
  hosts a producer from a dead session **THEN** the bridge issues
  `CLEAR <ch>-<layer>` before the `CG ADD` **AND** the fresh item's status is
  driven only by its own producer — it never shows `on-air` from the orphan's
  OSC before take

#### Scenario: No blind startup clear

- **WHEN** the bridge starts **THEN** it issues no `CLEAR` until a load targets a
  layer — an on-air orphan on an untargeted layer stays on air

#### Scenario: A load of an unregistered template fails fast

- **WHEN** a load references a `templateId` the bridge registry does not hold
  **THEN** the load is rejected with `errorCode: 'unknown-template'` and no AMCP
  command is sent

#### Scenario: A foreign producer inside a range is never allocated and never cleared

- **WHEN** the range's lowest free layer carries a FRESH non-`html` observation
  (e.g. another system's `ffmpeg` video) and the operator adds an item **THEN**
  allocation skips to the next free layer in the range, NO `CLEAR` is ever sent
  for the foreign coordinate, and the foreign producer stays on air untouched
- **WHEN** the observation's kind is unrecognised (neither `html` nor a known
  video kind) **THEN** it is skipped exactly as a video layer — "not html" fails
  safe, never an enumeration of video kinds

#### Scenario: html-occupied and free layers allocate exactly as before

- **WHEN** the range's lowest layer is free, or carries an `html` producer (a
  dead session's orphan) **THEN** allocation lands on it and the first-ADD
  adopt-CLEAR proceeds exactly as it always has (R-009/B-039 semantics
  unchanged)

#### Scenario: Blind tap fails OPEN for allocation

- **WHEN** the install receives no OSC at all (B-094's shape) and the operator
  adds an item **THEN** allocation proceeds exactly as before this change —
  lowest layer in range, adopt-CLEAR included — because refusing on silence
  would turn OSC loss into a total playout outage, and silence on a healthy tap
  genuinely means empty (B-053)

#### Scenario: A range exhausted by foreign producers refuses legibly

- **WHEN** every free layer in the template's range is quarantined by fresh
  non-`html` observations and the operator adds an item **THEN** the load is
  refused with `errorCode: 'no-layer-foreign-occupied'` on both the item's ack
  and the `stack.load` response, and ZERO AMCP commands are sent — never a
  silent CLEAR of a foreign layer

#### Scenario: Quarantine releases when the foreign producer leaves

- **WHEN** a quarantined layer's foreign observation ages out or reports empty
  **THEN** the layer returns to the allocatable pool and a later add may
  allocate it (with the normal first-ADD adopt-CLEAR)

#### Scenario: Update on a producerless slot commits without touching the wire

- **WHEN** the operator applies field edits to an item whose slot holds NO live
  producer (e.g. it was taken out) **THEN** the bridge commits the fields to the
  authoritative field-set, sends NO `CG UPDATE`, settles the intent, and answers
  `accepted: true` — it does not fire a `CG UPDATE` that CasparCG would `403`

#### Scenario: The committed fields reach air on the next take

- **WHEN** a producerless item whose fields were updated is then taken **THEN**
  the B-039 re-ADD's `CG ADD` data payload carries exactly those updated fields,
  so the edit made while the item was idle renders on air

#### Scenario: Update on a live producer still rides CG UPDATE

- **WHEN** the item's slot holds a live producer (loaded, or on air) **THEN** the
  update is sent as `CG UPDATE` exactly as before — the AMCP line and the
  canonical quoter are unchanged (ADR-0006)

#### Scenario: A refused update explains itself and never poisons the item

- **WHEN** CasparCG errors a `CG UPDATE` on a producer-bearing slot **THEN** the
  bridge answers `accepted: false` WITH an `errorCode` carrying the real AMCP
  reason **AND** the item's transient intent SETTLES to a terminal state — it
  never rests `pending`, so a single refused update cannot permanently block the
  item's later intents (R-011's `setPosition` refuses while `pending`)
