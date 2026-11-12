## ADDED Requirements

### Requirement: Designer exports a representative thumbnail with each VCG

The thumbnail PNG SHALL retain transparent artwork regions as alpha.

Designer SHALL include a small PNG at `thumbnails/320.png` in the exported VCG. Designer SHALL
evaluate the authored Hold start frame when set. Otherwise it SHALL evaluate the midpoint of the
active range before Outro start, using the active range midpoint when no Outro start is set. The
preview SHALL preserve the composition aspect ratio. A fallback SHALL allow export to finish when
the browser cannot capture the composition.

#### Scenario: An entrance completes at the Hold start marker

- **GIVEN** the composition has an animated entrance and a Hold start marker
- **WHEN** the author exports the composition as VCG
- **THEN** the package thumbnail depicts the artwork at Hold start
- **AND** CG Control can use it when browsing the package in Shared folder

#### Scenario: The composition has no Hold start

- **WHEN** the author exports a composition without Hold start
- **THEN** the package thumbnail uses the midpoint of its playback range before Outro start
- **AND** when no Outro start is set the active range midpoint is used
