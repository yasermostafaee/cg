## ADDED Requirements

### Requirement: The check's lines SHALL name the Playout as the console was given it

The console SHALL say the check's answer back in the address it was given whenever it asked CG Bridge's
check for the Playout by the address CG Bridge knows it by (`B-317`: CG Bridge's own loopback, in place of
the host the console reaches CG Bridge at) (`B-321`). In the lines about the Playout and CasparCG (`api`,
`cors`, `playout-version`, `amcp`), the host and the origin it asked by SHALL read as the host and the
origin it was given, so the sign-in gate's one line names the host on its card. Lines CG Bridge words about
its own machine (`route`, `proxy`) SHALL keep CG Bridge's words. A check the console asked as it was given
SHALL be shown as CG Bridge answered it. Whether a sign-in can work SHALL still be decided by the lines'
status alone.

#### Scenario: The owner's gate

- **WHEN** CG Bridge at `192.168.21.93` names its Playout `http://127.0.0.1:8080`, nothing listens there,
  and an unsigned console's gate shows `http://192.168.21.93:8080` **THEN** its one line reads
  `192.168.21.93 answers, but nothing listens on port 8080.` **AND** never names `127.0.0.1`

#### Scenario: Asked as given

- **WHEN** the console asked the check by the address it was given **THEN** every line reads as CG Bridge
  wrote it

#### Scenario: CG Bridge's own machine

- **WHEN** the console asked by CG Bridge's name **THEN** the `route` line still reads
  `CG Bridge's route to 127.0.0.1 …` as CG Bridge wrote it
