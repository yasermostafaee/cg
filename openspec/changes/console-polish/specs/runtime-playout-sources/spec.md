## ADDED Requirements

### Requirement: A Source default the Playout no longer lists SHALL read Unavailable wherever it is shown

A plate field whose value is its Source default (`Default (…)`) SHALL mark that default with the existing
`Unavailable` tag, its reason on the tag's `title`, whenever the entry the default names is not offered by the
Playout — kept as departed, or not in the catalogue at all — exactly as a bound source is marked. The default
SHALL be named by the catalogue's name, never its id; a default the catalogue does not know SHALL read `Default
(Not listed)`, its id on the `title`. Nothing SHALL change the binding or anything on air because of the mark.

#### Scenario: The owner's fake Playout

- **WHEN** a plate's default names the input `NDI کانالِ ۱ (APASAI)` and the Playout's input list is empty
  **THEN** the Look inputs field reads `Default (NDI کانالِ ۱ (APASAI))` with the `Unavailable` tag — control: a
  default the Playout still lists carries no tag
