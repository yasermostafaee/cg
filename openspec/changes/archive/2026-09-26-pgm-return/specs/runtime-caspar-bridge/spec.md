# runtime-caspar-bridge — delta (the programme return: the Playout's `pgm` feed, read and relayed, C-016)

## ADDED Requirements

### Requirement: The bridge reads a channel's programme return as a well-behaved client of the Playout's `pgm` feed

The bridge SHALL read programme channel _n_'s return from the Playout's host on port
`9250 + n − 1`, computed by ONE function (`pgmPort`) that is the only place the number is written,
and SHALL NEVER address `9350 + n − 1`, which is that channel's PREVIEW. The host SHALL be the
Playout's host as the bridge's other Playout-bound traffic reaches it: the configured Playout
host's one pinned IPv4 (`DESKTOP-APPS-01-C` C6), or — with no Playout configured — server A's
configured host through the same address the AMCP session dials.

Because the feed's server runs inside the playout core and is not hardened, the bridge SHALL
behave exactly as a well-behaved reader does: on each connection it SHALL write exactly
`GET / HTTP/1.1\r\nHost: <host>\r\n\r\n` and SHALL write nothing after it; it SHALL split parts by
their `Content-Length`, never by scanning for the boundary; it SHALL bound what it buffers; and
it SHALL NEVER change, or ask anyone to change, the Playout's PGM settings. A channel ≥ 21, whose
port lies outside the Playout's firewall rule for these feeds (9250–9269), SHALL NOT be dialled;
its state SHALL be `unavailable` and the bridge log SHALL name the port and the rule.

#### Scenario: The request is exact, and nothing follows it

- **WHEN** the relay connects to a fake feed that records every byte it receives
- **THEN** the fake received exactly `GET / HTTP/1.1\r\nHost: <host>\r\n\r\n`, and nothing more
  arrives after it however long the connection stays up — and the fake did receive that request
  (the positive control)

#### Scenario: Parts are framed by Content-Length

- **WHEN** the fake sends a JPEG whose bytes contain `--apasaipgm` in the middle of its data,
  between ordinary frames
- **THEN** that JPEG arrives whole and byte-identical, as do the ordinary frames either side of it

#### Scenario: The preview port is never addressed

- **WHEN** `pgmPort(n)` is computed for every channel from 1 to 20
- **THEN** none lies in 9350–9369, and `pgmPort(2)` is `9251`

#### Scenario: A channel outside the firewall rule is not dialled

- **WHEN** a console watches channel 21
- **THEN** no connection is attempted, its state is `unavailable`, and the bridge log names port
  9270 and the 9250–9269 rule

### Requirement: The bridge pulls the programme return only while it is watched, with one upstream per channel

The bridge SHALL hold a channel's upstream connection only while at least one console is attached
to that channel's relay, SHALL close it within 2 s of the last console detaching, and SHALL hold
at most ONE upstream connection per channel however many consoles watch it.

#### Scenario: Nothing is pulled while nothing is watched

- **WHEN** the bridge runs and no console is attached to any channel's relay
- **THEN** the fake feed sees no connection; and when a console then attaches it does see one
  (the positive control), and when that console detaches the connection is closed within 2 s

#### Scenario: Two consoles on one channel share one upstream

- **WHEN** two consoles watch the same channel
- **THEN** the fake sees exactly one connection, and both consoles receive its frames; and two
  consoles on two different channels give two connections (the positive control)

### Requirement: The bridge reports the return's state and reconnects with increasing backoff

The bridge SHALL publish each watched channel's state — `connecting`, `live`, `stalled` or
`unavailable` — on `pgmReturn.status-changed` and answer it on `pgmReturn.status`. A connection
that delivers no frame within 2 s SHALL be `stalled`; a connection with no frame for 8 s SHALL be
closed; and after any close or failure the bridge SHALL reconnect after an increasing delay, never
in a tight loop, resetting the delay only after a connection has delivered frames for a while.

#### Scenario: A stall is reported and clears when frames resume

- **WHEN** the fake stops sending frames on a live connection
- **THEN** the channel's state becomes `stalled`; and when frames resume it becomes `live` again

#### Scenario: A closed feed is reconnected with a growing backoff

- **WHEN** the fake closes every connection as soon as it is made
- **THEN** the bridge reconnects each time, and each gap between attempts is longer than the one
  before it until the cap

### Requirement: The bridge relays the programme return same-origin, loopback only, bytes untouched

The console server SHALL answer `GET /pgm/<n>` as `multipart/x-mixed-replace`, relaying each JPEG
the upstream delivered byte for byte in its own part, SHALL refuse any client whose socket address
is not loopback, and SHALL add no route to the template origin.

#### Scenario: A non-loopback client is refused

- **WHEN** a client whose address is not loopback requests `/pgm/1`
- **THEN** it is answered `403` and nothing is attached; and a loopback client is served the
  stream (the positive control)

## MODIFIED Requirements

### Requirement: The bridge serves the console on its own loopback origin

The bridge SHALL serve the Runtime's built console, when given `--console-dir`, on a listener of
its own bound to `127.0.0.1` (port 5174 by default): the directory's files, `index.html` for any
path that names no file extension, a 404 for a missing asset, nothing outside the directory,
`GET /__cg/health` answering `{ app: "cg-caspar-bridge", pid, execPath }`, and `GET /pgm/<channel>`
relaying that channel's programme return to loopback peers only (`C-016`). It SHALL never serve
the console on the template origin, and SHALL refuse a console port equal to the control or
template port. The listener SHALL start only after the control socket listens.

#### Scenario: The console and its fallback are served

- **WHEN** `/` or a client-side route is requested **THEN** `index.html` is answered, uncached
- **WHEN** a fingerprinted asset is requested **THEN** it is answered with its own type, immutable
- **WHEN** a missing asset or a path outside the directory is requested **THEN** the answer is 404

#### Scenario: The health route names the process

- **WHEN** `GET /__cg/health` is requested **THEN** the answer carries the app identity, the pid
  and the executable running the bridge

#### Scenario: The programme return route answers only a channel path

- **WHEN** `/pgm/1` is requested from loopback **THEN** the answer is a `multipart/x-mixed-replace`
  stream; **WHEN** `/pgm/0`, `/pgm/01`, `/pgm/abc` or `/pgm/1/audio.wav` is requested **THEN** the
  answer is 404 and nothing is attached
