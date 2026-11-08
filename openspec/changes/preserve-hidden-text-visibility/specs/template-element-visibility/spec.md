# template-element-visibility Specification

## ADDED Requirements

### Requirement: Authored hidden state SHALL survive element-specific layout

After shared base styles apply an element's authored visibility, later type-specific layout SHALL
NOT make an authored-hidden element visible. A layout that requires flex or grid SHALL use that
display only while the element is authored visible.

#### Scenario: Hidden vertically-aligned text

- **WHEN** a fixed text element has `visible: false` and a vertical alignment
- **THEN** its rendered host remains `display:none` on Canvas, in Preview and in output

#### Scenario: Hidden gradient text

- **WHEN** a text element has `visible: false` and a gradient glyph fill
- **THEN** its gradient glyph node is built normally but its rendered host remains `display:none`
