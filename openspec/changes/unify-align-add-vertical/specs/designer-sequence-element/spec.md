# designer-sequence-element

## ADDED Requirements

### Requirement: Vertical alignment of the items

The sequence SHALL expose a `verticalAlign` (top / middle / bottom) that positions the item text vertically within the single grid cell via grid `align-items` (top → `start`, middle → `center`, bottom → `end` — the grid keywords, NOT the flex `flex-start`/`flex-end` forms), independently of its existing horizontal `align` (which stays on `justify-items`). It SHALL default to `'middle'` so a sequence authored before this change renders vertically centred exactly as today (non-breaking, no migration). `verticalAlign` SHALL NOT be keyframe-able.

#### Scenario: Vertical align positions the items via grid

- **WHEN** a sequence's `verticalAlign` is set to top or bottom
- **THEN** the item text is placed at that vertical edge of the cell using the grid keywords (`align-items` `start` / `end`) while its horizontal `align` (`justify-items`) is unaffected

#### Scenario: A pre-D-045 sequence stays vertically centred

- **WHEN** a sequence authored before this change (no `verticalAlign`) is loaded or rendered
- **THEN** `verticalAlign` defaults to `'middle'` and the items render vertically centred exactly as today
