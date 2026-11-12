## ADDED Requirements

### Requirement: Designer exports a representative thumbnail with each VCG

The thumbnail PNG SHALL retain transparent artwork regions as alpha.

Designer SHALL include a small PNG at `thumbnails/320.png` in the exported VCG. Designer SHALL
evaluate the authored Hold start frame when set. Otherwise it SHALL evaluate the midpoint of the
active range before Outro start, using the active range midpoint when no Outro start is set. The
preview SHALL preserve the composition aspect ratio. A fallback SHALL allow export to finish when
the browser cannot capture the composition.

Designer and CG Control's preview of older packages SHALL use the same representative artwork.
A live plate SHALL show its authored fallback in the thumbnail, including when fallback is disabled on air.
A picture Sequence SHALL show the first authored picture from its defaults or authored pages. An empty
operator-filled picture Sequence SHALL show a placeholder. For a live layout with several presets, the
preview SHALL show the main composition with the one preset that has the most visible plates. If more
than one preset has that many plates, the preview SHALL use the last one in authored order.

#### Scenario: An entrance completes at the Hold start marker

- **GIVEN** the composition has an animated entrance and a Hold start marker
- **WHEN** the author exports the composition as VCG
- **THEN** the package thumbnail depicts the artwork at Hold start
- **AND** CG Control can use it when browsing the package in Shared folder

#### Scenario: The composition has no Hold start

- **WHEN** the author exports a composition without Hold start
- **THEN** the package thumbnail uses the midpoint of its playback range before Outro start
- **AND** when no Outro start is set the active range midpoint is used

#### Scenario: The thumbnail identifies a live layout and its picture Sequence

- **GIVEN** the main composition contains a picture Sequence and presets with one, two and two plates
- **WHEN** Designer exports the template
- **THEN** the thumbnail shows the main artwork, an authored Sequence picture, and the last two-plate preset only
