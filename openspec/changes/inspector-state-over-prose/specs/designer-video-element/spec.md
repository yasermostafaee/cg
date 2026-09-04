# designer-video-element

## ADDED Requirements

### Requirement: A follower with no out point is a state with a remedy

The Inspector SHALL show, for a video or Lottie element that follows the composition while the
composition has no out point, a one-line state — "Following nothing — no out point" — with the
remedy ("set one in Playout") inline and the mechanism (why there are no anchors to derive from)
behind an `i`.

#### Scenario: a video following a composition without an out point

- **WHEN** a video with `phases.source = 'composition'` sits in a composition with no lifecycle
- **THEN** the panel shows the follow state line with its remedy, and no derived window

### Requirement: `drives hold` is withheld until an out point exists

The video Inspector's `drives hold` select SHALL be disabled, with the reason as its tooltip, while
the composition has no out point — a composition with no out point holds nothing a driver could
end. It SHALL be enabled once an out point exists, whatever the mode.

#### Scenario: no out point

- **WHEN** a video sits in a composition with no out point
- **THEN** `drives hold` is disabled and its tooltip says to add an out point in Playout

#### Scenario: an out point exists

- **WHEN** the composition has an out point, in any mode
- **THEN** `drives hold` is enabled
