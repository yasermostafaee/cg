## ADDED Requirements

### Requirement: One source on several plates is refused in a template without looks

The export preflight SHALL refuse, as an error, a template WITHOUT a look group in which more
than one rendered plate names the same source id (`live-source-repeated`), whether the plates
are copies of one composition instanced more than once or separate plates set to one source.
Every plate in such a template is on air at once, and one source is one seat, so all but one of
the plates would stay empty on air. The refusal SHALL name every copy in the author's words —
a copy of a composition by its instance's name (or, unnamed, by where it sits), a separate plate
by its own name — SHALL name the composition when the copies are of one composition, and SHALL
say what to do instead. Each copy SHALL be marked on the canvas. A template WITH a look group is
judged per look by `look-source-duplicate` instead, where the same source in different looks is
legitimate. The code SHALL NOT be the bridge's `live-source-duplicate`.

#### Scenario: Two copies of one box composition are refused, naming both

- **WHEN** a template without a look group instances one composition holding a plate on
  `guest-1` twice, as "Box left" and "Box right"
- **THEN** export is refused with one error per copy, each reading: Source "guest-1" is shown in
  2 places — "Box left" and "Box right", copies of composition "Guest box". One source is ONE
  seat, so only one of them can get the picture and the others stay empty on air. Make one
  composition per box, each plate with its own source id.
- **AND** both copies are marked on the canvas

#### Scenario: Two separate plates on one source are refused the same way

- **WHEN** two separate plates in a template without a look group are both set to `guest-1`
- **THEN** export is refused naming both plates, ending "Give each plate its own source id."
- **AND** setting the second plate to `guest-2` clears the refusal and both marks

#### Scenario: One instance is not refused

- **WHEN** a template has one instance of a box composition
- **THEN** nothing is refused for its source

#### Scenario: Two different compositions with distinct sources are not refused

- **WHEN** two different compositions each hold a plate with its own source id
- **THEN** nothing is refused, because that is the correct authoring shape
