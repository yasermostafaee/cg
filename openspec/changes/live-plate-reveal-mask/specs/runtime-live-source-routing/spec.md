## ADDED Requirements

### Requirement: An own-plate mask uses a single live input

The Bridge SHALL apply the selected look's own-plate mask to its fitted input. If the visible
region requires multiple rectangular fragments, the additional fragments SHALL route the same
producer's layer and stay muted. The Bridge SHALL check the full layer demand before seating.

#### Scenario: Revert a rectangular mask

- **GIVEN** a live plate with a Revert window wholly inside the fitted picture
- **WHEN** the row takes or switches to that look
- **THEN** the original input and its routed fragments cover the plate except for the mask window
- **AND** the input's audio is carried at most once

### Requirement: Operators can place authored mask windows in Preview

CG Control SHALL expose **Edit masks** for authored own-plate and linked-reveal windows when the
author and Bridge support it. The operator SHALL move a window by its body and resize it by a
corner inside its plate. The mask type, mode, target, and remaining windows SHALL be preserved.

#### Scenario: Draft and apply a mask window

- **WHEN** the operator moves or resizes a window in PVW
- **THEN** the effective picture updates in PVW and the row marks the change as a draft
- **AND** Discard restores the applied geometry and Update off air saves it for the next Take
- **AND** another preset keeps its own authored or applied windows

#### Scenario: Update the mask on a verified live row

- **WHEN** the proposed windows fit the same verified live input seats on the primary engine
- **THEN** Update on air applies the picture and fallback geometry on the running page
- **AND** the input's transport and audio are preserved
- **WHEN** the proposed windows require a different seat topology
- **THEN** the on-air action is refused with the current picture and draft preserved
- **AND** an off-air Update can save the edit for the next Take

#### Scenario: A template change invalidates an old mask edit

- **WHEN** a listed template changes the authored window or withdraws its editing permission
- **THEN** the old override cannot edit a different authored window

## MODIFIED Requirements

### Requirement: A linked reveal shows lower-input pixels above an upper live plate

For each valid active-look reveal, CG Bridge SHALL order the lower producer below the upper producer
and seat an additional copy of the lower producer above the upper for each visible mask. Each copy
SHALL retain the lower `FILL`, intersect its `CLIP` with its authored reveal window, remain at volume
zero and own an independent ledger seat identity. Each copy SHALL consume one live-source layer.

#### Scenario: Burned-in caption is revealed

- **GIVEN** an upper live plate linked to a lower input with a rectangular caption window
- **WHEN** the row is taken
- **THEN** the lower producer is seated below the upper producer
- **AND** a muted clipped copy of that lower producer is seated above the upper producer
- **AND** pixels outside the intersection of the lower plate and reveal window do not paint

#### Scenario: Two separate regions reveal the same lower input

- **GIVEN** an upper plate with a top mask and a bottom mask targeting the same lower input
- **WHEN** the row is taken
- **THEN** the Bridge seats a separate muted clipped copy for each of the two regions

#### Scenario: Layer capacity stays atomic

- **GIVEN** two base plates and two visible masks but a live-source band with only three available layers
- **WHEN** the row is taken
- **THEN** the take is refused before any producer or graphic reaches air
