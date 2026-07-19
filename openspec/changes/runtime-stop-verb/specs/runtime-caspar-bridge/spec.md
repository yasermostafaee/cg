# runtime-caspar-bridge Specification (delta)

## ADDED Requirements

### Requirement: A graceful stop leaves the producer resident

The operator SHALL be able to take an item off air GRACEFULLY — letting the template play its own
exit animation — as an action distinct from the hard clear that destroys the producer. The two
SHALL reach different end states: after a graceful stop the layer still holds the item's producer,
and after a hard clear it does not.

A graceful stop SHALL be issued as the playout server's own stop verb for the item's layer. It
SHALL NOT be implemented as a clear, and SHALL NOT re-load the template — both would destroy the
resident producer that is the entire point of the action.

Because the producer survives, the bridge's record that a live producer exists on the slot SHALL be
retained across a graceful stop. A subsequent take SHALL therefore resume the item directly, with
no re-load. A graceful stop SHALL NOT be treated as evidence that the layer is clear, because it
leaves a producer there.

The item SHALL come to rest in the state that means "a producer is resident and it is not playing",
and its play evidence SHALL be retracted. This is load-bearing rather than cosmetic: the observation
channel continues to report a producer on the layer indefinitely after a stop, so an item that kept
its play evidence would derive a confident on-air claim forever, from real observations, with
nothing able to correct it.

The bridge SHALL NOT wait for, chase, or time out the template's exit animation. The command's
acknowledgement means the server accepted the stop, NOT that the animation completed; completion is
not observable from the bridge, and a mechanism that assumed otherwise would either hang or invent
a duration it cannot know.

A graceful stop affects what is on air, so it SHALL be refused when no declared server is reachable,
exactly as the other on-air-affecting commands are, and its refusal SHALL be reported through the
same operator feedback channel. It SHALL be refused for an item that holds no layer.

The hard clear's behaviour SHALL be unchanged, and SHALL remain available for a stopped item so the
operator can still destroy a resident producer.

#### Scenario: A graceful stop uses the stop verb, not a clear or a reload

- **WHEN** the operator gracefully stops an on-air item
- **THEN** the server receives the stop verb for that item's layer, and receives neither a clear for
  that layer nor a fresh load of the template

#### Scenario: The producer survives, and a take resumes it

- **GIVEN** an item has been gracefully stopped
- **WHEN** the operator takes it again
- **THEN** it resumes without the template being re-loaded

#### Scenario: A stopped item rests as resident-not-playing and claims nothing on air

- **WHEN** an item has been gracefully stopped
- **THEN** it rests in the resident-not-playing state — not the cleared state, and not any on-air
  claim — even though the observation channel keeps reporting a producer on its layer

#### Scenario: The exit animation is not waited on

- **WHEN** a graceful stop is acknowledged by the server
- **THEN** the item settles on that acknowledgement, and no timer or observation is used to detect
  when the animation finished

#### Scenario: A hard clear still destroys a stopped item's producer

- **GIVEN** an item has been gracefully stopped
- **WHEN** the operator clears it
- **THEN** the producer is destroyed, as it would be for any other item

#### Scenario: A graceful stop is refused when nothing can reach the server

- **WHEN** the operator gracefully stops an item while no declared server is reachable
- **THEN** the command is refused with a reason, nothing is sent, and the refusal reaches the
  operator through the usual feedback channel
