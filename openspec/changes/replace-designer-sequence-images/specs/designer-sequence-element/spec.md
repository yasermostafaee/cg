## ADDED Requirements

### Requirement: Authors can replace a Sequence's pictures in Designer

Designer SHALL offer replacement from picture files and from a folder in the Inspector and Pages manager when a Sequence contains pictures.

#### Scenario: A new folder replaces the old picture pages

- **WHEN** the author selects a folder or picture files through a replacement action
- **THEN** the new pictures take the old picture slots in natural file order
- **AND** any extra pictures append, and any empty picture slots are removed
- **AND** text and composition items retain their relative order and remain authored
- **AND** one Undo restores the previous Sequence

#### Scenario: Replacement is not completed

- **WHEN** the author cancels, there are no supported pictures, or importing a selected picture fails
- **THEN** the existing Sequence stays intact
