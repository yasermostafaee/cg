# designer-shell

## ADDED Requirements

### Requirement: A starter card carries a comparable playout badge and one line

Each starter card on the landing screen SHALL show a playout badge derived from the starter's entry
composition — stays until stopped · holds until stopped, then exits · auto-out after N s ·
content-driven hold · loop-cycle every ~N s — beside a one-line description. The badge SHALL be
computed from the scene, not authored beside it, so it cannot drift from what the template does.

#### Scenario: the five starters differ by badge

- **WHEN** the landing screen lists the five starters
- **THEN** each card shows a badge, and the Guest Title's reads "auto-out after 6 s", the Headline
  Rotator's "content-driven hold", the Logo Sting's names a loop of about 10 s
