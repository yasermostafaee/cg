## ADDED Requirements

### Requirement: The fake pair SHALL give the backup engine its own channel numbers

`pnpm dev:station --fake --pair` SHALL build the backup engine the way the Playout team builds a test pair: the
backup's CasparCG stand-in SHALL serve its own channel 1 (airing its own programme), the mirrors of the primary's
channels 1 and 2 at its channels 2 and 3, and two preview channels; the backup engine's D4 SHALL publish channels
1, 2 and 3 with `mirrorOf` naming the primary engine on the two mirrors, and the primary's D4 its `videoMode` and
`mirrors`. So a line sent to the backup with the primary's number lands somewhere a test can see.

#### Scenario: The pair maps by itself

- **WHEN** the owner runs `pnpm dev:station --fake --pair` and signs CG Bridge in on both engines **THEN** the
  status bar reads `BACKUP B · 1 of 1 channels mapped` for a station on channel 1, and channel 1's view reads
  `Backup: CH 2 on 127.0.0.1`
