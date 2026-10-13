## MODIFIED Requirements

### Requirement: CG Control SHALL ask where the Playout is before it connects anywhere

CG Control SHALL load its own bundled console (`http://tauri.localhost`) and SHALL find CG Bridge on the
Playout's host, port 5280, or at a separate server's address this console was given. With no station
record it SHALL show ONE question — the Playout's address, and CG Bridge's for a separate server — and
connect nowhere until it is answered; the answer SHALL be saved in this console's station record
(`cg.runtime.station.v1`), never over the control socket and never as CG Bridge's configuration. A
station admin SHALL be able to change both addresses in Station setup. When the console cannot reach
the CG Bridge it names, it SHALL say where it looked and why nothing answered, and inside CG Control it
SHALL offer `Set up again`, which forgets this console's station and asks again. Inside CG Control the
Playout sign-in gate SHALL offer the same `Set up again` (`B-320`): always, whatever its check says, and
never locked with its fields — a CG Bridge that answers can still be the wrong station, and Station setup
lies behind a sign-in over it. Pressing it SHALL send nothing to CG Bridge or CasparCG. Signing in, the
gate's place above the lock, its focus trap and its refusal conditions SHALL be unchanged, and in a
browser the gate SHALL have no such control.

#### Scenario: The first question

- **WHEN** CG Control opens with no station record **THEN** it asks for the Playout's address and opens
  no socket — control: given `192.0.2.20` it dials `ws://192.0.2.20:5280` and saves
  `http://192.0.2.20:8080`

#### Scenario: A separate server

- **WHEN** a CG Bridge address `192.0.2.30:5281` is given beside the Playout's **THEN** the console dials
  `ws://192.0.2.30:5281` and never the Playout's host

#### Scenario: The way back

- **WHEN** CG Bridge is not reachable at the address **THEN** the line names it —
  `CG Bridge not reachable at <host>:<port>` — with the reason **AND** `Set up again` forgets the record
  and shows the question — in a browser there is no such control

#### Scenario: A CG Bridge that answers, with no Playout behind it

- **WHEN** the station record names a CG Bridge that answers with `auth: playout` and whose Playout does
  not answer **THEN** the sign-in gate shows the check's one line and locks its fields **AND** offers
  `Set up again` under `Sign in` **AND** pressing it forgets the record, sends nothing, and shows the
  question **AND** a good Playout address typed there connects
- **WHEN** the same gate is shown in a browser **THEN** it has no `Set up again`

#### Scenario: Signing in is unchanged beside it

- **WHEN** the gate's check says a sign-in can work and the operator signs in **THEN** the typed pair goes
  to the Playout as before **AND** nothing is forgotten
