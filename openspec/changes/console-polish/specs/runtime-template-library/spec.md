## ADDED Requirements

### Requirement: An open template picker SHALL follow CG Bridge's list while it is open

The template picker SHALL re-read its channel's list every time CG Bridge pushes a change to the template
library while the picker is open, so a template imported, re-imported or removed on another console appears,
changes or disappears in an open picker within a second; the picker's other templates SHALL be untouched by a
change to one. CG Bridge SHALL tell every console who imported, re-imported or removed which template, on
which channel (`templates.acted`). When a template is removed on another console while it is this picker's
chosen template, or while a Load of it from this console is on the way, the picker SHALL say so in one line —
`“<name>” was removed on another console by <user>.` — each name in its own isolate, and SHALL never show the
raw refusal or the template's id; a Load refused `unknown-template` within 10 s of such a removal SHALL read
the same line. An act this console made itself SHALL never be reported as another console's.

#### Scenario: A removal on A leaves B's open picker within a second

- **WHEN** two consoles on one CG Bridge have the picker open on the same channel and A removes a template
  **THEN** B's picker no longer lists it within 1 s **AND** B's other templates are listed as before — control:
  a take from B of a template still listed works

#### Scenario: B had it chosen

- **WHEN** B's picker has the template chosen when A removes it **THEN** B reads the line naming the
  template and A's user, and no id, and no raw refusal is shown

#### Scenario: An import on A appears in B's open picker

- **WHEN** A imports a template on the channel B's open picker lists **THEN** it appears in B's picker within
  1 s

#### Scenario: A's own act is A's

- **WHEN** A removes a template from its own picker **THEN** A shows no "removed on another console" line
