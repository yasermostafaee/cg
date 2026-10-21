## ADDED Requirements

### Requirement: A row whose template makes sound offers a mute beside its speaker mark

A row whose template makes sound (`TemplateInfo.hasSound`) SHALL show, beside its speaker mark, an icon toggle naming
the action — `Mute` while the sound plays, `Unmute` while it is muted — with `aria-pressed` saying which, gated by the
operate permission like every row verb. It SHALL sit with the mark, outside the verb block, so the verb count is
unchanged and the mark stays a fact. The mark SHALL state the fact: `Template sound` or `Template sound muted`.
Pressing the toggle SHALL send `stack.set-sound-muted` for that row and nothing else (no take, no update). A template
without sound SHALL show neither.

#### Scenario: Mute and unmute

- **WHEN** the operator presses the toggle on a row whose template makes sound
- **THEN** the mark reads muted and the toggle offers Unmute; pressed again, the sound is on and the toggle offers Mute

#### Scenario: No sound

- **WHEN** a row's template makes no sound
- **THEN** there is no mark and no toggle
