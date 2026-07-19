# runtime-caspar-bridge Specification (delta)

## ADDED Requirements

### Requirement: Observed emptiness counts as evidence only from a tap that is hearing OSC

An occupancy tap that has never received OSC in the current session SHALL NOT have its silence
read as emptiness. The occupancy signal treats a silent layer as EMPTY, because real CasparCG
goes silent for a cleared layer rather than reporting `empty` — but that inference is sound ONLY
while the tap is actually receiving OSC. An unheard tap reports every layer as unoccupied —
including layers that are genuinely on air — so nothing that acts on emptiness may rely on it.

The tap SHALL therefore expose whether it has received any OSC since the session's last resync,
and that signal SHALL reset with the tap's entries, so a reconnect can never inherit a stale
affirmative and vouch for a server it has not yet heard from.

The signal SHALL be driven by OSC **traffic**, not by per-layer producer observations. A healthy
server whose layers are all empty emits no per-layer producer messages at all, so a
producer-derived signal would make a healthy-but-idle server indistinguishable from an unheard
one — and would wrongly suppress the legitimate empty-layer path.

Any decision that acts on observed emptiness SHALL consult this signal first and, when the tap
has never been heard from, SHALL take the conservative branch rather than the empty branch.

#### Scenario: An unheard tap does not report emptiness as fact

- **WHEN** an occupancy tap has received no OSC since its last reset
- **THEN** it reports that it has not been heard from, and consumers do not treat its silence as
  proof that any layer is empty

#### Scenario: An idle but healthy server is not mistaken for an unheard one

- **WHEN** a server is emitting OSC but no layer holds a producer
- **THEN** the tap reports that it HAS been heard from, and observed emptiness is trusted

#### Scenario: A reconnect never inherits a stale affirmative

- **WHEN** the session resyncs and the tap resets
- **THEN** it reports not-heard-from again until OSC arrives from the fresh session

### Requirement: A restore refuses to decide rather than act on absent evidence

When the occupancy tap has never been heard from, the bridge SHALL refuse to decide a restored
item's fate rather than guess it in either direction. Restoring retained stack intent decides per
item whether the item's layer still holds its producer; with no occupancy evidence that question
has no answer.

In that state the bridge SHALL send NOTHING for the affected items — no clear, and in particular
no re-add, because a re-add carries no play-on-load and would replace a playing producer with a
non-playing one, taking a live graphic off air. The items SHALL remain on the stack, visible, and
SHALL be published in the honest unverifiable state rather than as a confident on-air claim.

The refusal SHALL be recoverable: refused items remain pending, and the bridge SHALL decide them
for real once the tap begins receiving OSC, so a tap that comes up shortly after the link becomes
healthy cannot strand those rows permanently.

The reconnect reconciliation that resets still-on-air items whose layers have gone silent SHALL
be subject to the same rule — it MUST NOT reset an item on the strength of silence from a tap that
has never been heard from, because that would report a live graphic as idle over a healthy link.

A refusal SHALL be recorded where an operator or engineer can find it, naming what was not done
and why; an install in this state appears healthy on its command link, so the cause is not
otherwise discoverable.

#### Scenario: A blind tap over a live layer sends nothing

- **GIVEN** an item is restored onto a layer that genuinely holds a live producer
- **WHEN** the occupancy tap has never received OSC
- **THEN** no command is sent for that item — neither a clear nor a re-add — and the live
  producer is untouched

#### Scenario: The undecided row stays visible and honest

- **WHEN** a restore refuses to decide
- **THEN** the item remains on the stack and is published as unverifiable, never as a confident
  on-air claim

#### Scenario: The refusal resolves once OSC arrives

- **GIVEN** a restore refused to decide because the tap had heard nothing
- **WHEN** OSC begins arriving
- **THEN** the pending items are decided normally — adopted if their layer is occupied, re-added
  if it is genuinely silent

#### Scenario: Reconnect reconciliation does not reset on unheard silence

- **GIVEN** an item is on air and the link is healthy
- **WHEN** the occupancy tap has never received OSC
- **THEN** the item is not reset to idle on the strength of that silence

#### Scenario: Deciding normally is unchanged when the tap is heard

- **WHEN** the tap is receiving OSC
- **THEN** an occupied layer is adopted with nothing sent, and a silent layer is re-added as
  loaded, exactly as before
