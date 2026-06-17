# designer-clock-element

## ADDED Requirements

### Requirement: Vertical alignment of the time text

The clock SHALL expose a `verticalAlign` (top / middle / bottom) that positions the time text vertically within the box via flex `align-items` (top → `flex-start`, middle → `center`, bottom → `flex-end`), independently of its existing horizontal `align` (which stays on `justify-content`). It SHALL default to `'middle'` so a clock authored before this change renders vertically centred exactly as today (non-breaking, no migration). `verticalAlign` SHALL NOT be keyframe-able.

#### Scenario: Vertical align positions the time text via flex

- **WHEN** a clock's `verticalAlign` is set to top or bottom
- **THEN** the time text is placed at that vertical edge of the box (flex `align-items` `flex-start` / `flex-end`) while its horizontal `align` is unaffected

#### Scenario: A pre-D-045 clock stays vertically centred

- **WHEN** a clock authored before this change (no `verticalAlign`) is loaded or rendered
- **THEN** `verticalAlign` defaults to `'middle'` and the time text renders vertically centred exactly as today
