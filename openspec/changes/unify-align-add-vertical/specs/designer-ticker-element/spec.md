# designer-ticker-element

## ADDED Requirements

### Requirement: Vertical alignment of the crawl text within the band

The ticker SHALL expose a `verticalAlign` (top / middle / bottom) that positions the crawl text within the band height, applied identically to BOTH the static authoring row (the Designer canvas) and the live crawl item nodes (the runtime driver) so authoring and playout match. It SHALL default to `'middle'` (the prior hardcoded centring) so a ticker authored before this change renders vertically centred exactly as today (non-breaking, no migration). The ticker SHALL NOT have a horizontal-align control — it is a crawl. `verticalAlign` SHALL NOT be keyframe-able.

#### Scenario: Vertical align positions both the authoring row and the crawl

- **WHEN** a ticker's `verticalAlign` is set to top or bottom
- **THEN** the static authoring row AND each live crawl item node position the text at that vertical edge of the band (top → `flex-start`, bottom → `flex-end`), so the canvas and the running crawl match

#### Scenario: A pre-D-045 ticker stays vertically centred

- **WHEN** a ticker authored before this change (no `verticalAlign`) is loaded, rendered, or played
- **THEN** `verticalAlign` defaults to `'middle'` and the crawl renders vertically centred exactly as today
