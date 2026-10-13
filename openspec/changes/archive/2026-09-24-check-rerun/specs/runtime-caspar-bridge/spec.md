## MODIFIED Requirements

### Requirement: The bridge runs the connection check

The bridge SHALL answer `setup.check` with one line per link — VPN or proxy, route, AMCP `VERSION`,
the Playout's keys, CORS for the console's origin, the station's ports, topology — each pass, fail,
warn, wait or skip with a sentence, and for a missing CORS entry the one line to give the Playout's
administrator. It SHALL always return its lines (`DESKTOP-APPS-01-C` C2): the lines SHALL run in
parallel, every probe SHALL connect within 3 s and every line SHALL finish within 5 s, and a line
that does not SHALL come back as its own line in the check's words ("No answer from `<host>` on port
`<port>`"), never as a timeout of the whole check. The typed address SHALL be normalised as the
console normalises it (C3), and the Playout host SHALL be resolved once to an IPv4 address that
every probe uses (C6); a host with no IPv4 address SHALL be one line. The AMCP line SHALL be, for a
refused or dropped connection: `wait`, "waiting for sign-in", before any `station-admin` has signed
in; `wait`, "waiting for the Playout to let this machine in", for 30 s after one; and after that a
failure naming this machine's IPv4 address as waiting for approval in the Playout, at
تنظیمات ← اتصال به CG Control, and that NAT, a proxy or a VPN is why it is not listed there (C7).
No line SHALL name a script. A verdict about sign-in SHALL need a Playout that can sign someone in,
which is what the API line reads (`CHECK-RERUN-01`): while the API line fails — no answer, or no
signing keys — the CORS line SHALL be `skip`, "Sign-in from this console: not checked — `<reason>`",
and the AMCP line SHALL NOT wait for a sign-in but SHALL be its own result, a refusal or no answer
said plainly as a failure. That rule SHALL be applied in one place, after every line has settled,
and SHALL read the API line's reading, never the words of a line.

#### Scenario: Each failure shape has its own sentence

- **WHEN** the Playout's port refuses, the Playout drops the connection, the CORS origin is wrong, or
  the key set is empty **THEN** each prints its own sentence

#### Scenario: A black-hole Playout

- **WHEN** every probe points at an address that never answers **THEN** all seven lines come back
  within the bound, the API line saying what did not answer, the CORS line not checked, and the
  AMCP line a failure
- **WHEN** every probe points at the fakes **THEN** every network line passes

#### Scenario: AMCP before the sign-in, while the Playout decides, and after

- **WHEN** no station-admin has signed in, the API answers, and AMCP is refused **THEN** the line is
  `wait`, "waiting for sign-in", never a failure
- **WHEN** a station-admin signed in less than 30 s ago and AMCP is refused **THEN** the line still
  waits, for the Playout
- **WHEN** it is still refused after that **THEN** the line names this machine's IPv4 address as
  waiting for approval in the Playout's app, and carries no command
- **WHEN** the administrator approves this machine **THEN** the line passes

#### Scenario: One fault is said once

- **WHEN** the Playout's API does not answer **THEN** the no-answer is said once, on the API line,
  **AND** the CORS line is `skip`, "Sign-in from this console: not checked — the Playout does not
  answer."
- **WHEN** the Playout answers and publishes no signing keys **THEN** the CORS line is `skip` and
  names the missing keys as the reason
- **WHEN** the API answers with a key and the CORS origin is wrong **THEN** the CORS line is
  checked and fails on its own, with the one line to add

#### Scenario: AMCP does not wait for a sign-in that cannot happen

- **WHEN** no station-admin has signed in, the API does not answer, and AMCP is refused or silent
  **THEN** the AMCP line is a failure saying so plainly, never "waiting for sign-in"
- **WHEN** the API does not answer and AMCP answers `VERSION` **THEN** the AMCP line passes

#### Scenario: A host with no IPv4 address

- **WHEN** the Playout's host has no IPv4 address **THEN** the route line says so and the AMCP, key
  set and CORS lines are not produced
