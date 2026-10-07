## MODIFIED Requirements

### Requirement: The bridge runs the connection check

The bridge SHALL answer `setup.check` with one line per link — VPN or proxy, route, AMCP `VERSION`,
the Playout's keys, CORS for the console's origin, the Playout's version — each pass, fail, warn, wait or skip
with a sentence, and for a missing CORS entry the one line to give the Playout's administrator. It SHALL write
no line about the ports of the machine it runs on and no advice about where the Playout and CasparCG run
(`R-090`): a console may run on any machine, and the ports are CG Bridge's own, said by its `/health`. Every line
it writes about the machine it runs on SHALL name it as CG Bridge's machine, never "this machine". It SHALL always
return its lines (`DESKTOP-APPS-01-C` C2): the lines SHALL run in parallel, every probe SHALL connect within 3 s
and every line SHALL finish within 5 s, and a line that does not SHALL come back as its own line in the check's
words ("No answer from `<host>` on port `<port>`"), never as a timeout of the whole check. The typed address SHALL
be normalised as the console normalises it (C3), and the Playout host SHALL be resolved once to an IPv4 address
that every probe uses (C6); a host with no IPv4 address SHALL be one line. The AMCP line SHALL be, for a refused or
dropped connection: `wait`, "waiting for sign-in", before any `station-admin` has signed in; `wait`, "waiting for
the Playout to let CG Bridge's machine in", for 30 s after one; and after that a failure naming CG Bridge's
machine's IPv4 address as waiting for approval in the Playout, at تنظیمات ← اتصال به CG Control, and that NAT, a
proxy or a VPN is why it is not listed there (C7). A check that asks for it (`awaitLetIn`, sent only by the
console's one automatic re-run after a `station-admin`'s sign-in) SHALL hold its AMCP line within those 30 s
(`DELTA-MULTI-CHANNEL-01-A` A2): the bridge SHALL ask CasparCG again itself, about once a second, until it answers
or the 30 s end, and SHALL then answer with the line it has — a pass, or the approval — while every other line
runs as in any check; the console SHALL wait for such a check the 30 s and a check's own wait on top. A check that
does not ask, and any check outside those 30 s, SHALL probe AMCP once. No line SHALL name a script. A verdict
about sign-in SHALL need a Playout that can sign someone in, which is what the API line reads (`CHECK-RERUN-01`):
while the API line fails — no answer, or no signing keys — the CORS line SHALL be `skip`, "Sign-in from this
console: not checked — `<reason>`", and the AMCP line SHALL NOT wait for a sign-in but SHALL be its own result, a
refusal or no answer said plainly as a failure. That rule SHALL be applied in one place, after every line has
settled, and SHALL read the API line's reading, never the words of a line.

The VPN or proxy line (`B-318`) SHALL appear as anything but a pass only while something on CG Bridge's machine
actually intercepts: a system proxy that is on AND has a listener on its address (or names a host that is not
this machine), a tunnel adapter that is up, or a route to the Playout's or CasparCG's host that leaves through a
tunnel. A known VPN or proxy process that is merely running SHALL NOT make the line by itself. The line SHALL
name what it found — the proxy and the process and PID holding it, the adapter, and any known process with its
PID — and SHALL be a warning, and a failure only when the route to the Playout's or CasparCG's host leaves
through the tunnel.

#### Scenario: Each failure shape has its own sentence

- **WHEN** the Playout's port refuses, the Playout drops the connection, the CORS origin is wrong, or
  the key set is empty **THEN** each prints its own sentence

#### Scenario: A black-hole Playout

- **WHEN** every probe points at an address that never answers **THEN** every line comes back
  within the bound, the API line saying what did not answer, the CORS line not checked, and the
  AMCP line a failure
- **WHEN** every probe points at the fakes **THEN** every network line passes

#### Scenario: No verdict about the machine CG Bridge runs on

- **WHEN** any check runs **THEN** no line has the id `ports` or `topology` **AND** no line says "this machine"

#### Scenario: AMCP before the sign-in, while the Playout decides, and after

- **WHEN** no station-admin has signed in, the API answers, and AMCP is refused **THEN** the line is
  `wait`, "waiting for sign-in", never a failure
- **WHEN** a station-admin signed in less than 30 s ago and AMCP is refused **THEN** the line still
  waits, for the Playout
- **WHEN** it is still refused after that **THEN** the line names CG Bridge's machine's IPv4 address as
  waiting for approval in the Playout's app, and carries no command
- **WHEN** the administrator approves CG Bridge's machine **THEN** the line passes

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

#### Scenario: A held AMCP line

- **WHEN** a check asks to hold its AMCP line within 30 s of a station-admin's sign-in and the Playout lets CG Bridge's machine in a moment later **THEN** the AMCP line passes, the bridge having asked CasparCG again itself, **AND** the same check not asking only waits
- **WHEN** the Playout never lets CG Bridge's machine in **THEN** the held line answers when the 30 s end, naming the approval
- **WHEN** no station-admin has signed in, or the 30 s have passed **THEN** a check asking to hold probes AMCP once

#### Scenario: VPN or proxy, exact or not at all

- **WHEN** no known process runs, no proxy is on and no tunnel is up **THEN** the line passes
- **WHEN** v2rayN's process runs with no proxy on and no tunnel up **THEN** the line passes
- **WHEN** the proxy setting is left on with nothing listening on its address **THEN** the line passes
- **WHEN** the proxy is on and `xray.exe` (PID 9132) listens on its address while v2rayN (PID 2136) runs **THEN**
  the line is a warning naming the proxy, `xray.exe`, `9132`, `v2rayN` and `2136`
- **WHEN** a tunnel adapter is up and the route to the Playout leaves through the LAN **THEN** the line is a
  warning naming the adapter
- **WHEN** the route to the Playout leaves through the tunnel **THEN** the line is a failure

## ADDED Requirements

### Requirement: CG Bridge's `/health` SHALL name a port it cannot open, and what holds it

When CG Bridge cannot bind one of its own ports because another program holds it, its `/health` SHALL carry the
problem `port-refused` whose message names the protocol, the port, what the port is for and, when it can be read,
the holder's image name and PID — "cannot open UDP 6251 (OSC from CasparCG): held by casparcg.exe (PID 4321)."
(`R-090`). The holder SHALL be read when the bind fails, never on the `/health` request path, and no new problem
code SHALL be added for it: another CG Bridge's guard parses this `/health` (`B-313`).

#### Scenario: CG Bridge's OSC port is held

- **WHEN** another program holds CG Bridge's OSC port as it starts **THEN** `/health` lists a `port-refused`
  problem naming `UDP`, the port and the holder **AND** CG Bridge still takes consoles
