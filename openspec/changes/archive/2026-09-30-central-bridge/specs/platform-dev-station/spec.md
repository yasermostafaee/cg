## ADDED Requirements

### Requirement: The dev station SHALL stop nothing, and SHALL name what holds its ports

`pnpm dev:station` SHALL never stop, ask to stop, or kill another process. `CENTRAL-BRIDGE-01`: the
`cg-bridge.exe` that may hold its ports is CG Bridge, a Windows service — on a Playout machine the plant's
bridge — which Windows starts again five seconds after its process dies, so ending it is both useless and
harmful. Every program on one of the station's ports SHALL be NAMED, one line each, and the start SHALL
refuse; a port held by `cg-bridge.exe` SHALL be named as CG Bridge, with how to stop it by hand
(`Stop-Service CGBridge` in an administrator PowerShell, or closing an older CG Control). A process that
holds no station port — CG Control, a console now — SHALL never be in the way. The dev station's state
folder SHALL overlap neither CG Control's (`%APPDATA%\CG Control`) nor CG Bridge's
(`%ProgramData%\CG Bridge`), and a dev run SHALL write nothing in either.

#### Scenario: CG Bridge holds 5280

- **WHEN** `cg-bridge.exe` holds a station port **THEN** the start refuses with the one CG Bridge line
  naming the port, the process and `Stop-Service CGBridge` **AND** that process is still alive afterwards

#### Scenario: CG Control is running

- **WHEN** `cg-control.exe` runs and holds no station port **THEN** nothing is said about it and the start
  goes on — control: the same list with a port holder refuses

#### Scenario: The two installed folders

- **WHEN** a dev run ends **THEN** CG Control's and CG Bridge's folders are byte-identical to before, and
  the dev station's own folder holds its state

### Requirement: The dev station SHALL run the fake Playout alone for a CG Bridge installed on the same machine

`pnpm dev:station --fake --caspar <this machine's core> --playout-only` SHALL start ONLY the fake
Playout shaped from this machine's own CasparCG — no bridge, no console and no state folder — on a fixed
loopback port: `8080`, where an installed CG Bridge looks for its Playout when its installer is given no
`/PLAYOUT=`, unless `--playout-port <port>` names another. It SHALL print the Playout's address and the
station admin who signs in, and SHALL stop on Ctrl+C. `CENTRAL-BRIDGE-01`: the station runs instead of CG
Bridge (the two bind the same ports), so without this a machine testing the installed service had no
Playout at all. `--playout-only` SHALL go with `--fake --caspar` only, and `--playout-port` with
`--playout-only` only; a misuse SHALL be refused in one line.

#### Scenario: The fake Playout where CG Bridge looks for it

- **WHEN** the station is started with `--playout-only` and a port **THEN** the fake Playout answers on
  that port — control: started without one, it takes another

#### Scenario: Misuse

- **WHEN** `--playout-only` is given without `--fake --caspar`, or `--playout-port` without
  `--playout-only`, or a port that is not one **THEN** the start is refused in one line
