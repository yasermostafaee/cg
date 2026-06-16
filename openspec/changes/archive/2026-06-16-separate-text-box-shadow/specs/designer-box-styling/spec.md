# designer-box-styling

## ADDED Requirements

### Requirement: The text element has independent text-shadow and box-shadow

The text element SHALL expose TWO independent shadows: a **text-shadow** on the glyphs (the `textShadow` field, animated by the `shadow.*` keys) and a **box-shadow** on the box (the `shadow` field, animated by the distinct `boxShadow.*` keys). The runtime SHALL render BOTH for text — `text-shadow` from `textShadow` and `box-shadow` from `shadow` — in preview and export, and the two SHALL be settable and keyframe-able INDEPENDENTLY (a text-shadow keyframe never moves the box-shadow and vice-versa). The text `shadow` field SHALL be optional and additive (scenes without it are unchanged). The shape element's box shadow SHALL be unchanged in behavior — its inspector section is relabeled "Box Shadow" (it already renders `box-shadow` from `shadow` via the `shadow.*` keys). The content-driven kinds (ticker, clock, sequence) SHALL be unaffected — they keep only their text-shadow.

#### Scenario: A text element renders both shadows independently

- **WHEN** a text element has both a `textShadow` and a box `shadow` set
- **THEN** the runtime renders `text-shadow` on the glyphs (from `textShadow`) AND `box-shadow` on the box (from `shadow`), independently, identically in preview and export

#### Scenario: The two text shadows keyframe independently

- **WHEN** a text element keyframes its text-shadow (on `shadow.*`) AND its box-shadow (on `boxShadow.*`)
- **THEN** at a given frame each animates to its own value — the text-shadow and box-shadow are driven by separate track sets and never collide

#### Scenario: The text inspector shows two shadow sections

- **WHEN** a text element is inspected
- **THEN** it shows a "Text Shadow" section (the renamed former "Drop Shadow", wired to `textShadow`) AND a "Box Shadow" section (wired to the box `shadow`)

#### Scenario: The shape shadow section is relabeled with no behavior change

- **WHEN** a shape element is inspected
- **THEN** its shadow section is titled "Box Shadow" (formerly "Drop Shadow") and behaves exactly as before — the same `shadow` field, the same `shadow.*` keys, the same `box-shadow` render

#### Scenario: Old text scenes load unchanged

- **WHEN** a text scene authored before this change (no box `shadow`) is loaded, played, and exported
- **THEN** it behaves exactly as before — only the new optional box shadow is added; the existing text-shadow is untouched
