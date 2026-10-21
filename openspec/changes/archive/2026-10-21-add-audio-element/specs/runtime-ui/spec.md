## ADDED Requirements

### Requirement: A row whose template makes sound SHALL show a speaker mark

A layer row SHALL show a speaker mark in its alias cell when its template makes sound
(`TemplateInfo.hasSound`, derived once at import by the one predicate `hasSoundEffects`). The mark
SHALL be a fact, not a control: it SHALL add no column and no verb. A template without sound, or one
imported before this field existed, SHALL show none.

#### Scenario: The mark

- **WHEN** a row is bound to a template that carries a sound
- **THEN** the row shows the speaker mark, outside the verb block, and the verb count is unchanged

#### Scenario: No sound, no mark

- **WHEN** a row is bound to a template without sound
- **THEN** no speaker mark is shown

### Requirement: PVW SHALL be silent

The rehearsal frame SHALL mute the template page's sound through the page's own runtime when the page
loads, before the frame reports ready, so no PLAY reaches a page that can make a sound. A page built
before sound existed SHALL be rendered unchanged.

#### Scenario: A rehearsal makes no sound

- **WHEN** a row whose template has an entrance sound is rehearsed and played in PVW
- **THEN** the page's sound switch is muted before the play
