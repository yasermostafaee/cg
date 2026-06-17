# designer-inspector

## ADDED Requirements

### Requirement: Text padding inputs render four-in-a-row

The text element's padding controls SHALL render the four inputs (top, right, bottom, left) side-by-side in a single row, each a compact number cell carrying its own keyframe diamond, matching the Loopic reference (`D-048-textpadding-0.png`) — rather than one input per row. This is a layout change only: the stored values, the commit path, and the per-input keyframe behavior are unchanged.

#### Scenario: Padding shows four inputs in one row

- **WHEN** a text element with a padding section is inspected
- **THEN** its top / right / bottom / left padding inputs appear side-by-side in one row, each with its keyframe diamond, and editing any one commits exactly as before (no value or keyframe-behavior change)

### Requirement: Inspector toggles use a neutral active state, not a blue accent

The inspector's alignment button-groups and the sizing / auto-squeeze / text-wrap toggles SHALL show their active (selected/pressed) state with a neutral fill consistent with the properties panel, NOT the blue accent color, matching the Loopic reference (`D-045-align-0/1.png`). The active state remains clearly distinguishable; only its color changes (appearance only — no behavior change).

#### Scenario: An active align/toggle button is neutral, not blue

- **WHEN** an alignment button or a sizing / auto-squeeze / text-wrap toggle is in its active state
- **THEN** it is filled with the neutral properties-panel active color (not the blue accent), and selecting options still behaves exactly as before

### Requirement: More-text-options gear opens a font settings popover

The "More text options" gear in the text element's section SHALL open a small popover housing the existing font properties — font weight (100..900) and font style (normal / italic) — styled like the Loopic reference gear popover (`D-045-align-1.png`). The popover SHALL open on clicking the gear and close on an outside click or the Escape key (the existing color/fill popover pattern). The font-weight control that previously sat inline moves into this popover; both controls write `font.weight` / `font.style` via the element-update path and are non-keyframable (no keyframe diamond). It exposes ONLY these existing font props — no decoration / transform / variant (those do not exist in the schema). No schema, renderer, or stored-value change.

#### Scenario: The gear opens the popover with weight and style

- **WHEN** the operator clicks the "More text options" gear on a text element
- **THEN** a popover opens showing a font-weight control (100..900) and a font-style control (normal / italic), reflecting the element's current values

#### Scenario: Editing weight or style writes via the element-update path

- **WHEN** the operator changes font weight or font style in the popover
- **THEN** `font.weight` / `font.style` is written via the element update (the text re-renders at that weight/style) with no keyframe track created and no keyframe diamond shown

#### Scenario: The popover closes on outside click or Escape

- **WHEN** the popover is open and the operator clicks outside it or presses Escape
- **THEN** the popover closes

#### Scenario: Only existing font props are offered

- **WHEN** the popover is open
- **THEN** it offers only font weight and font style — no text-decoration, text-transform, or font-variant controls (those are not in the schema)
