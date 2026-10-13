# platform-dev-station Specification

## Purpose

TBD - created by archiving change dev-local-caspar. Update Purpose after archive.

## Requirements

### Requirement: The local-core mode reaches this machine only

`pnpm dev:station --fake --caspar <host:port>` SHALL accept only this machine — `127.0.0.1`, `::1` or
`localhost`, on port 5250 — and SHALL refuse every other host, naming the test Playout's machine
(`192.168.21.111`) and the plant's CasparCG (`192.168.21.114`), in one line and before it probes, builds
or starts anything. Every accepted spelling SHALL be dialled as `127.0.0.1`, the one address a 2.5.0
core answers AMCP on, and port 5250 SHALL be the only one, because first-run connects the station on it.

#### Scenario: Control — this machine is accepted

- **WHEN** the owner types `--fake --caspar 127.0.0.1:5250` (or `localhost:5250`, `[::1]:5250`, `::1`)
- **THEN** the station's reads, D4's host and the fake admin's grants all name `127.0.0.1:5250`

#### Scenario: The test Playout's machine is refused by name

- **WHEN** the owner types `--fake --caspar 192.168.21.111:5250`
- **THEN** the launcher exits 2 with the one line "192.168.21.111 is the test Playout's machine —
  --caspar never connects there. …", having probed, built, started and created nothing

#### Scenario: The plant is refused by name

- **WHEN** `--caspar` names `192.168.21.114`, on any port
- **THEN** the one line names it the plant's CasparCG, and nothing starts

#### Scenario: Any other host, or another port, is refused

- **WHEN** `--caspar` names a host that is not one of the three spellings of this machine (a LAN
  address, `127.0.0.2`, a name) or a port other than 5250
- **THEN** it is refused in one line saying why, and nothing starts

#### Scenario: `--caspar` goes with `--fake`

- **WHEN** `--caspar` is given without `--fake`
- **THEN** it is refused in one line, on any Node, and nothing starts

### Requirement: The fake Playout is shaped from the local core

In the local-core mode the dev station SHALL start no CasparCG stand-in and no programme feed, and
SHALL shape the fake Playout from the core: D4 SHALL list the core's channels from `INFO`, named
`CH n · local`, on `127.0.0.1`, with `output: unknown`; D10 SHALL be empty; D11 SHALL list the core's
`CLS` library, each clip at its absolute, `/`-separated path under the media folder `INFO PATHS` names
(the start folder joined to a relative `media-path`), with its length from the scanner's frames and time
base.

#### Scenario: D4 names the core's channels

- **WHEN** the fake admin signs in on a station whose core reports channels 1 and 2
- **THEN** `channels.list` names them `CH 1 · local` and `CH 2 · local`, `output` `unknown`, both declared
  and permitted

#### Scenario: D10 is empty

- **WHEN** the bridge reads D10 at the sign-in
- **THEN** the Playout lists no input, and the catalogue holds no input source

#### Scenario: D11 is the core's library

- **WHEN** the core's scanner lists clips with spaces and Persian letters in sub-folders, a still and an
  audio file
- **THEN** each clip is the media folder + its scanner ID (absolute, `/` only, no backslash), its folder
  is the ID's folder (`''` at the top), its length is `frames × num / den`; the still has no length;
  the audio file is never offered to a plate

#### Scenario: Search, sort and paging work as on the fake

- **WHEN** the Media tab searches in lower case, in Persian or by folder, sorts by recent, or pages two
  at a time
- **THEN** the upper-cased scanner names are found, the newest comes first, and the pages repeat and
  skip nothing

#### Scenario: A take plays the clip by its absolute path, inside the send guard

- **WHEN** a clip is bound to plate 2 of a two-box template on CH 1 and taken
- **THEN** the core receives `PLAY 1-<60–79> "<media folder><ID>"`, nothing reaches channel 2, and every
  line the core received touches layers 50–99 only, with no `CLEAR <ch>`, `MIXER <ch> CLEAR`,
  `SET … MODE` or consumer `ADD`/`REMOVE`

### Requirement: The library is read again when the Media tab asks after 30 s

The local-core station SHALL read `CLS` at its start, and again before it answers a D11 search once
30 s have passed since the last read. It SHALL NOT read `CLS` for an `ids=` read, SHALL share one read
between searches that arrive together, SHALL bound a re-read under the bridge's 5 s search budget, and
SHALL keep the last library when a read fails.

#### Scenario: Inside 30 s nothing is read

- **WHEN** a search arrives less than 30 s after the last read
- **THEN** it is answered from that read and the core receives no `CLS`

#### Scenario: After 30 s the core is read once

- **WHEN** a clip has been added to the media folder and a search arrives 30 s after the last read
- **THEN** the core receives one `CLS` and the search lists the new clip

#### Scenario: A take's re-check never waits on a read

- **WHEN** an `ids=` read arrives long after the last read
- **THEN** it is answered at once, and the core receives no `CLS`

#### Scenario: Two searches share one read

- **WHEN** two searches arrive together once 30 s have passed
- **THEN** the core receives one `CLS`, and both searches list what it read

#### Scenario: A failed read keeps the list

- **WHEN** the scanner has stopped and a search arrives after 30 s
- **THEN** the search lists the last library

### Requirement: The local-core station only reads the core

The local-core station SHALL send the core only `VERSION`, `INFO`, `INFO PATHS`, `INFO CONFIG` and `CLS`,
SHALL refuse any other command before a connection is opened, SHALL write no file, and SHALL leave the
bridge's send guard exactly as it is.

#### Scenario: Five reads at the start

- **WHEN** the station starts
- **THEN** the core receives exactly `VERSION`, `INFO`, `INFO PATHS`, `INFO CONFIG`, `CLS`, in that order,
  on one connection, before the Playout starts

#### Scenario: Anything else is refused before a connection

- **WHEN** the reader is asked a command outside the five
- **THEN** it refuses and opens no connection

#### Scenario: A `400` ends the asking

- **WHEN** the core answers a read with `400` (which carries the refused line after it)
- **THEN** nothing more is sent on that connection

### Requirement: The start says what the core is, and what cannot work

The dev station SHALL name the core, its version and its channels at the start, with its media folder
and how many clips it lists, and SHALL say in one line each when the core's media scanner does not
answer `CLS` or when the core's config sends no OSC to the station. It SHALL refuse in one line when
nothing answers AMCP on the core's address, or when what answers is not CasparCG, and then start nothing.

#### Scenario: The core, its version and its channels

- **WHEN** the station starts on a core reporting `2.5.0 69e8ad5 Stable` with two channels
- **THEN** the banner's CasparCG line names `127.0.0.1:5250`, `2.5.0 69e8ad5 Stable` and each channel
  with its video mode; a media line names the folder and the clip count; and a PROGRAM line says there
  is no return feed and to watch CasparCG's own window

#### Scenario: No media scanner

- **WHEN** the core answers `CLS` with `501`
- **THEN** the station starts, one note says the media scanner is not running and the Media tab is empty
  until it runs, and a search 30 s later lists the library once the scanner answers

#### Scenario: No OSC to the station

- **WHEN** the core's config sets `disable-send-to-amcp-clients`, or moves `default-port` off 6250
- **THEN** one note says no remaining time shows in this mode, and no setting was changed

#### Scenario: Nothing answers

- **WHEN** nothing listens on the core's address
- **THEN** the station refuses in one line naming the address, and no Playout is started

### Requirement: The local-core mode never ships

No part of the local-core mode SHALL be in the bridge bundle the CG Control installer ships.

#### Scenario: The installer bundle carries none of it

- **WHEN** the sidecar bundle is built exactly as CI stages the installer
- **THEN** it holds the bridge's own D4 path and send-guard code (the positive control) and none of the
  local-core marker, its loopback refusal, its D4 row id or its scanner note — all ASCII, since the
  bundle escapes every other character

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
