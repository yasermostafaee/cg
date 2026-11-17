## ADDED Requirements

### Requirement: Playout owns automatic transfer authority

When linked to Playout, the Bridge SHALL disable its legacy automatic CG failover regardless of a persisted enabled setting. This policy SHALL apply at initial construction and after connection reconfiguration. Direct CasparCG stations SHALL retain their configured automatic and manual failover behavior.

#### Scenario: Legacy enabled setting on startup

- **GIVEN** a Playout station with two servers and legacy automatic CG failover enabled in stored settings
- **WHEN** the primary AMCP fixture disconnects
- **THEN** the Bridge does not select another legacy CG primary or publish a legacy failover event

#### Scenario: Legacy enabled setting after reconfiguration

- **GIVEN** the same Playout station after its connection configuration has been rebuilt
- **WHEN** the primary AMCP fixture disconnects
- **THEN** the same Playout-owned transfer policy remains in force

#### Scenario: Direct-station positive control

- **WHEN** a direct CasparCG station has enabled automatic failover and its primary disconnects
- **THEN** the configured backup becomes primary as before
