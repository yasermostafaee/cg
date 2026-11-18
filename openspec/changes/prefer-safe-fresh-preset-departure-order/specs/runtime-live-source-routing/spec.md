## ADDED Requirements

### Requirement: Fresh preset seats prefer safe departure stacking

Before an item owns any live seats, the Bridge SHALL optionally allocate an ordinary
picture used in a strict subset of authored presets below pictures retained in every
preset of that subset. Only supported single-plate authored departure groups SHALL
establish this preference. Generated Control Focus looks SHALL NOT affect normal preset
membership. Aliases, copies, masks, reveals and fragment groups SHALL NOT be guessed.
Existing authored overlap/reveal order and foreground placement SHALL remain authoritative;
if the optional constraints cannot coexist, allocation SHALL retry the unchanged hard order.
Any already-held item SHALL keep its existing producer coordinates. The higher-layer
crossing guard SHALL remain in force, and switching SHALL NOT replay, swap or add spare
producers to satisfy this preference.

#### Scenario: A fresh three-up bottom picture exits upward behind two retained pictures

- **GIVEN** a fresh three-up layout with nonoverlapping top-left, top-right and bottom-center plates and a two-up subset retaining the top plates
- **WHEN** the item is taken and switched to the two-up preset with Slide up and fade
- **THEN** the departing bottom picture has a lower native layer than both retained pictures
- **AND** its native FILL, CLIP and OPACITY animate without PLAY, LOADBG, CLEAR, SWAP or additional seats

#### Scenario: Existing stacking or authored overlap cannot accept the preference

- **GIVEN** an item already owns its seats or authored overlap contradicts the optional order
- **WHEN** a preset is planned or a revised template is imported
- **THEN** existing coordinates and hard authored order remain authoritative
- **AND** the existing crossing guard may retain the safe stationary fade
