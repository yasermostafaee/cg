# runtime-caspar-bridge

## ADDED Requirements

### Requirement: A row's plate volumes can be set as ONE MAP, with per-plate outcomes

The bridge SHALL expose a verb that applies a **map of `plateId → volume`** for one item in a
single call, so that a cross-plate statement (SOLO, PANIC) reaches the plant as one action
rather than as a sequence a caller has to keep in order.

It SHALL apply each entry through the **existing single-plate writer**. There SHALL NOT be a
second implementation of "what volume should this layer have": the map verb composes the one
writer, and the mute rule's per-take re-assert continues to be the only thing that raises a
seated plate.

It SHALL report **one outcome per plate**, so a partial failure is visible rather than averaged
into a single boolean. A map in which some plates succeed and others are refused SHALL report
exactly that, naming the refused plates and their reasons.

The verb SHALL hold the item's **live-seat lock** for the whole map, so that no look switch,
source swap or binding transaction can interleave between the entries of one call.

#### Scenario: A map of volumes is applied in one call

- **WHEN** the operator applies `{ "guest-1": 1, "guest-2": 0 }` to an item that owns live seats
- **THEN** the bridge sends `MIXER … VOLUME 1` for `guest-1`'s layer and `MIXER … VOLUME 0` for
  `guest-2`'s layer, and records both in the item's `plateVolumes`

#### Scenario: One refused plate does not hide the plates that landed

- **WHEN** a map names one plate the template does not declare alongside two it does
- **THEN** the two declared plates are applied and reported `ok`, and the undeclared plate is
  reported refused with reason `unknown-plate`

#### Scenario: A volume outside the gain range is refused rather than sent

- **WHEN** a map carries a volume above `1`, below `0`, or `NaN`
- **THEN** it is refused before anything reaches CasparCG — the wire channel refuses the whole
  call at its boundary, and the bridge verb refuses that plate with reason `invalid-volume` —
  and no intent is recorded for it

### Requirement: Setting a plate's volume is a CONFIGURATION verb and never a playout verb

Setting a plate's volume SHALL record the intent and SHALL send **nothing to CasparCG** when the
row does not own live seats. This holds for the single-plate verb, for the map verb, and for
every operator gesture built on either of them.

"Owns live seats" SHALL be answered by the **one predicate that asks what the decision turns
on** — a row that is on air, **or** a row that is rehearsing and therefore holds its plates on
preview. It SHALL NOT be answered by the on-air status alone: a rehearsing row is deliberately
not on air and yet owns its layers.

When the row does not own live seats, the verb SHALL emit no `PLAY`, no `MIXER VOLUME`, no
`MIXER FILL` or `CLIP`, and SHALL NOT un-hold a held plate. It SHALL NOT write the layer
ledger's as-sent volume either, since nothing was sent.

The intent SHALL still be recorded, so a plate's audio can be armed **before** the take and the
take carries it.

#### Scenario: A raise on a row that owns no live seats sends nothing

- **WHEN** a plate's volume is set to `1` on a row that is neither on air nor rehearsing, even
  though the bridge still holds seated layer records for it
- **THEN** no AMCP command is sent, the layer ledger's recorded volume is unchanged, and the
  item's `plateVolumes` carries the new intent

#### Scenario: A rehearsing row still reaches its plates

- **WHEN** a plate's volume is set on a REHEARSING row
- **THEN** the volume is asserted on that plate's seated layer, because a rehearsing row owns
  its plates on preview

#### Scenario: The armed intent is carried by the next take

- **WHEN** a plate's volume is armed on an off-air row and the row is then taken
- **THEN** the take seats that plate at the armed volume, without any further operator action

### Requirement: A HELD plate records its intent and receives no wire command

A plate that is seated but **held** — the active look punches no hole in front of it — SHALL
receive **no** `MIXER … VOLUME` from any audio verb, and its intent SHALL still be recorded.

Asserting a raise onto a held layer would put a voice on air from a box that is not on screen,
and the hold's mute is a one-shot that would never take it back down. The reconcile that
un-holds the plate re-asserts its recorded intent at that moment.

#### Scenario: SOLO on a row with a held sibling

- **WHEN** SOLO raises one plate on a row whose sibling is held
- **THEN** the raised plate's layer receives `MIXER … VOLUME 1`, the held sibling's layer
  receives no command at all, and the held sibling's intent is recorded as `0`

### Requirement: SOLO is one call that raises one plate and silences its siblings

SOLO SHALL be expressed as a **single map application**: `1` for the chosen plate and `0` for
every sibling plate seated for the same item. It SHALL NOT be a sequence of single-plate calls.

SOLO SHALL NOT record what it overwrote, and SHALL offer no restore.

#### Scenario: SOLO's wire footprint on a four-plate row

- **WHEN** SOLO is applied to one plate of a row with four seated, unheld plates
- **THEN** the wire carries exactly one `MIXER … VOLUME 1` and three `MIXER … VOLUME 0`, and
  the item's `plateVolumes` records the same four values

### Requirement: The recorded audio intent survives a bridge restart for every audio verb

Every audio verb's recorded intent SHALL ride the item state the browser retains and SHALL be
restored to a fresh bridge process, so that a bridge blip cannot silently re-mute a plate the
operator deliberately raised, or re-raise one they deliberately muted.

A recorded `0` SHALL be restored as `0` and SHALL NOT be treated as an absent key.

#### Scenario: A SOLO survives a bridge restart

- **WHEN** SOLO has been applied and the bridge process is restarted and the stack re-delivered
- **THEN** the restored item carries the same `plateVolumes` map, and a take puts the soloed
  plate on air audible with its siblings silent
