# designer-shell

## ADDED Requirements

### Requirement: Persian in the Designer's chrome is drawn in Vazirmatn, and Latin keeps Exo 2

The Designer's chrome SHALL draw every Persian glyph in the self-hosted Vazirmatn (`B-263`), from a chrome-only family of Vazirmatn's Arabic faces limited by `unicode-range` to the Arabic ranges and leading both chrome stacks — the page's and `body`'s — so that any other character falls through to the stack exactly as before and Latin keeps Exo 2. It SHALL be declared outside `fonts.css`, which is inlined into every exported template, and SHALL change no authored font. This SHALL be measured in a real browser by the platform font the engine used, never by reading CSS.

#### Scenario: Persian chrome and Latin chrome

- **WHEN** a Persian label in the Designer's chrome is measured with CDP `CSS.getPlatformFontsForNode` **THEN** it is drawn in Vazirmatn, not in `Segoe UI`
- **WHEN** a Latin label is measured the same way **THEN** it is drawn in exactly the font the previous stack gives it at the same weight and size
