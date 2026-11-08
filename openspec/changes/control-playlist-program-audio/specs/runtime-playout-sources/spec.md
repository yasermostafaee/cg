## ADDED Requirements

### Requirement: Playlist programme gain SHALL not unmute the duplicated frame route

An authorized operator SHALL be able to read and set the Playlist programme output's gain through a
Playout-owned contract, at minimum while no on-air Live Source frame references that output. Every
`playlistOf` route copy on a CG-owned plate SHALL remain at zero. When the contract is unavailable,
the control SHALL be unavailable with a reason and SHALL send nothing to a Playout-owned layer.

#### Scenario: Playlist output is not used by an on-air frame

- **WHEN** the Playout gain contract is available and no on-air frame references the output **THEN**
  the authorized operator can read and set programme gain

#### Scenario: Playlist picture is used in a Live Source frame

- **WHEN** an on-air frame references the Playlist output **THEN** its route-copy volume remains zero
  and any permitted adjustment targets only the original programme path

#### Scenario: Playout does not expose gain control

- **WHEN** the read/set contract is absent or unhealthy **THEN** CG Control states that the control is
  unavailable and CG Bridge sends no speculative AMCP command
