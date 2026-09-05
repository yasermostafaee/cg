# Design — `pgm-output-alarm` (C-029)

Session brief `PGM-OUTPUT-ALARM-01`, 2026-09-04. Every number below was measured on the wire
this session; the plant is `192.168.21.114:5250` (`2.5.0 69e8ad5 Stable`), the dev host's own
2.5.0 is `D:\programs\casparcg-server-v2.5.0-stable-windows` (no DeckLink drivers), and the
fixture — the config naming a card the server does not have — was left in place on both.

## 1. The alarm — what is read, how it is judged, when it clears, what it says when blind

### 1a. Evidence: two AMCP documents, verbatim shapes

**What RUNS** — `INFO <channel>` → `201 INFO OK` + one XML chunk. CasparCG builds it from the
channel's monitor state, where each consumer sits at `output/port/<index>/consumer` with its own
`name()`; the XML writer prefixes digit-only nodes, so the plant answers:

```xml
<output><port>
  <port_500><consumer>system-audio</consumer></port_500>
  <port_600><consumer>screen</consumer><screen>…</screen></port_600>
</port></output>
```

A running DeckLink reads `<port_23487313><consumer>decklink</consumer>` — its index is
`300 + device` (`decklink_consumer.cpp:1109`), so the "earlier dump's `port_23487313`" the brief
cites is the OLD card (`23487013`) running, not a second card and not a corrupted digit.

**What is DECLARED** — `INFO CONFIG` → `201 INFO CONFIG OK` + the server's parsed
`casparcg.config` written back: `<channels><channel><consumers><decklink><device>23487013</device>
<embedded-audio>true</embedded-audio><keyer>default</keyer></decklink><screen/><system-audio/>`.

Both parsers are targeted extractions (`packages/shared-ipc/src/channels/outputs.ts`), not XML
parses, for `parseVideoModeFromInfo`'s reason, and both plant captures are pinned in
`outputs.test.ts`. Kinds compare by identical token: the config element name and the running
consumer's `name()` are the same word for every consumer 2.5.0 ships.

### 1b. Absent versus present-but-unhappy — different alarms, only one is visible

- **Absent** (declared, not running): visible, and it is THE fixture. A consumer that throws in
  `initialize` is never emplaced in `output::consumers_`, so it never appears in `<output>`.
  Remedy: fix the declaration on the playout machine, restart CasparCG.
- **Present but unhappy**: `INFO` reports a consumer's existence and its configuration, never
  its health (`decklink_consumer_proxy::state()` is `get_state_for_config`, static). A DeckLink
  that lost its reference or drops frames says so in the server log and nowhere the bridge
  reads. Remedy would be the cable, the reference, the downstream — a different action, so it
  IS a different alarm, and the honest position is that this change does not raise it. Stated
  in the banner's header and the operator guide.
- A third, already-covered state: present, then the CHANNEL stops ticking — `R-058`'s chip, on
  the OSC axis.

### 1c. Cadence, latches, and what clears

| read                         | when                                                                                                                     | latch                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `INFO CONFIG`                | first sweep tick after the session is live; retried per tick only while it has not answered                              | any `201` — an unparseable reply is `declared: null`, latched |
| `INFO <ch>` (running)        | rides the `R-030` mode read's own reply — **no extra send**                                                              | `#outputReadAt` armed by the first ingest                     |
| slow re-read                 | every 60 s (`OUTPUT_RECHECK_MS`) while reachable                                                                         | stamped at send time                                          |
| reconnect                    | `to === 'healthy' && from !== 'degraded'` clears the declaration, the mode latch and the creation attempt for that label | —                                                             |
| after the bridge's own `ADD` | immediately                                                                                                              | —                                                             |

The verdict (`#outputChecks`) is recomputed whenever either half lands and PUBLISHED only when
its content changes; the stderr line fires on the transition into `missing` and once when it
clears. It CLEARS by a re-read that finds the consumer running: the operator's real remedy
(config fix + CasparCG restart) arrives through the reconnect reset within one sweep tick, a
hand-typed `ADD` through the 60 s re-read.

**Why not every tick.** CasparCG logs every command and its full reply at `info`; an `INFO 1`
every 5 s is ~50 MB/day of log on the plant for no information. And the bridge's integration
harness treats the first tick's `INFO` as the only ambient traffic — its quiescence control
(`awaitChannelModeRead`) now also waits for the check's first latch, so a baseline taken after
it is exact until the 60 s re-read, which no test body reaches.

**Why not OSC.** `/channel/1/output/port/600/consumer` does travel over OSC, and reading it
would clear instantly — but OSC is the axis that may legitimately be silent (`B-094`, `B-101`),
and "is the consumer running" is a question `INFO` answers on the axis it is asked on. Left as a
possible refinement, not built.

### 1d. When the bridge itself cannot reach CasparCG

`ServerHealth.outputs` is KEPT across a disconnect. `outputVerdictOf` — beside
`stoppedChannelsOf`, the one authority — turns a kept `missing` on an unreachable server into
`unverifiable` (last observed at T), never into silence. `R-058` returns `[]` when unreachable
because a stopped tick on a dead link is unknowable; a missing consumer is a fact about the last
time anyone could look, and hiding it would let a dead bridge→CasparCG hop read as "fixed". A
kept `ok` on an unreachable server is `unknown`: the connection surfaces own that fault.

The browser→bridge hop is different: while the link is not live, `ConnectionBanner` shouts
NOTHING CAN REACH AIR and every health reading is stale (`B-081`), so the output banner renders
nothing there — the `R-058` precedent, and not an absence.

### 1e. The surface

The in-flow, full-width, `role="alert"` strip `ConnectionBanner` and `RasterMismatchBanner`
share, mounted in the same banner region of `App.tsx`, `colors.error` for a missing AIR kind
(`decklink`, `bluefish`, `ndi`, `newtek-ivga`, `ffmpeg`, `artnet`) and `colors.pending` for a
missing MONITOR (`screen`, `system-audio` — worth saying, not "nothing reaches air"). Not
`FailoverBanner`'s fixed slab: `B-172` records the slab and its hard-coded hex as the thing to
move away from, and the owner's stated constraint there is a strip. `runtime.md:3256` argues
against a banner while the link is live; that argument was about a per-channel OSC fact fitting
a singular surface, and it predates `RasterMismatchBanner`, which already renders while the link
is live for exactly this class of fact (config contradicting reality). The brief chose the
banner; this records why the choice is consistent.

## 2. "Auto-detect" — what it can mean here and what it cannot

No AMCP query enumerates DeckLink devices (2026-08-25 Q2, re-confirmed): `INFO SYSTEM` is
ignored and answers plain `INFO`; `INFO CONFIG` echoes what the operator wrote; the device list
exists only in the startup log, which the bridge does not read (decision on record). The repo's
own doctrine is "declared, never detected" (`R-009`). So:

- **Cannot mean:** discovering the card, offering a picker, or choosing a device on the
  operator's behalf.
- **Means:** the operator names the device in `casparcg.config` (index or persistent ID —
  either is accepted, the persistent ID does not move), and the bridge VERIFIES the declared
  consumer is running and COMPLAINS when it is not, naming the device the config named.

Written into the operator guide in those words. Probing with `ADD` is not enumeration — §3d.

## 3. What `ADD` does with an unknown device — measured, nothing landed

Plant state: no program output at all (the fixture), an orphan html producer on 1-96, the
screen consumer and system audio as the only outputs — a glitch cost nothing on air. The dev
host's 2.5.0 was started for the reversibility measurements (its log is readable; the plant's is
not) and left running for the acceptance check.

| command                                    | plant (drivers, card gone)  | dev host (no drivers)                     | log                                                                                                       |
| ------------------------------------------ | --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ADD 1 DECKLINK DEVICE 99`                 | —                           | `404 ADD FAILED` (50 ms)                  | `std::invalid_argument: invalid stoll argument` — `DEVICE` is not in the grammar; then " File not found." |
| `ADD 1 DECKLINK 99`                        | `403 ADD FAILED` (6 ms)     | `403 ADD FAILED` (2 ms)                   | " Check syntax." — a `user_error` from `get_device`; nothing else                                         |
| `ADD 1 FOOBAR`                             | —                           | `404 ADD FAILED`                          | " File not found."                                                                                        |
| `INFO 1` before / after                    | byte-identical (1620 chars) | byte-identical (1095 chars)               | no consumer re-initialised                                                                                |
| `ADD 1 SCREEN 1`                           | —                           | `202 ADD OK`; `port_601` appears          | "Initialized." BEFORE the `202`                                                                           |
| `REMOVE 1 601`                             | —                           | `404 REMOVE FAILED`                       | the numeric form is `REMOVE 1-601`                                                                        |
| `REMOVE 1-601` / `REMOVE 1 SCREEN`         | —                           | `202 REMOVE OK`; gone from `INFO` at once | "Uninitialized." **13–16 ms AFTER** the `202`                                                             |
| `ADD 1 SCREEN` (index 600 already running) | —                           | `202 ADD OK`                              | new "Initialized." at +1 ms, OLD "Uninitialized." at **+28 ms** — REPLACED                                |

Source confirms the mechanism (`v2.5.0-stable`): a factory that throws is swallowed and the
registry throws `file_not_found("No match found … Check syntax.")` → 404; a `user_error` from
`initialize` (device not found, format not supported) → 403 with " Check syntax." logged;
`output::add` does `remove(index)` THEN `initialize` THEN emplace; `output::remove` erases the
map entry and the object dies on an async destruction thread.

**3a.** `403 ADD FAILED`, no text on the wire; the log says " Check syntax." — a lie for a
missing device. The brief's spelling with `DEVICE` is a grammar error and answers `404` like
`ADD 1 FOOBAR` — `B-177`'s disguise on the consumer side, filed as `B-208`.
**3b.** A failed `ADD` for an index that is not running does not disturb the channel. An `ADD`
for an index that IS running replaces it with a ~28 ms gap — that one is not a probe.
**3c.** `REMOVE` cleanly undoes an added consumer, and `INFO` reflects it immediately; the
receipt precedes the destroy by 13–16 ms, exactly `CLEAR`'s shape.
**3d.** **Probing is NOT a substitute for enumeration.** A failure says only `403`, which cannot
tell "device missing" from "drivers missing" from "format unsupported"; a success puts that
card ON AIR and, if its index was running, replaces it. Enumerating by probing would mean
putting each card to air in turn. The question closes on "not".

## 4. Creation — safe only in the shape it is built

Given §3, the bridge can act safely for exactly one case: a declared kind the check found
ABSENT, re-created with the declaration's OWN parameters. Absent means the index is free, so
`ADD` is additive and a failure leaves no trace but a log line; the device token is the
config's, so a multi-card box can never be handed a different card. Bounded to one attempt per
connection per channel (a device the server could not open at boot it usually cannot open now;
a refused `ADD` per minute would be noise), a `202` is verified by re-reading `INFO`, the
outcome travels in the health snapshot and the banner reads it back. DeckLink only — `screen`
and `system-audio` are monitors and are reported, other kinds' grammar is unmeasured.

**The flag is OFF by default**, resolved through one exported function; `output-policy.test.ts`
holds the resolver AND the shipped CLI's boot line to OFF. In one sentence: _turning it on lets
the bridge send one `ADD` per connection for a consumer `casparcg.config` declares and CasparCG
is not running, using exactly the device the config names, and tells you what CasparCG
answered._ "Repoint" (the operator naming a NEW device from the console) is not built: it needs
an operator-facing setting that does not exist, and doing it from the config file is the
existing, restart-based path.

## 6. Severity by air-criticality (`B-223`, 2026-09-05)

The alarm was built for a dead DeckLink; on 2026-09-05 it shouted at the operator over a
stopped screen consumer. The rule, decided on one principle — **does anything outside the playout
machine depend on this consumer?** — over every kind 2.5.0 can declare (`src/shell/casparcg.config`
and `src/modules/` at `v2.5.0-stable`):

| kind           | what it drives                                                             | severity | operator surface                      |
| -------------- | -------------------------------------------------------------------------- | -------- | ------------------------------------- |
| `decklink`     | SDI/HDMI out of a DeckLink — this plant's air path                         | air      | the banner, one line                  |
| `bluefish`     | SDI out of a Bluefish card                                                 | air      | the banner                            |
| `ndi`          | video over the network to whatever subscribes                              | air      | the banner                            |
| `ffmpeg`       | a stream or a recording — the console cannot tell which, and both leave    | air      | the banner                            |
| `artnet`       | DMX to a lighting rig; nobody declares Art-Net for a preview               | air      | the banner                            |
| _unknown_      | a kind this code has never seen                                            | air      | the banner — a stale list only shouts |
| `screen`       | a preview window on the playout machine's own display                      | local    | nothing; a preview row in the dialog  |
| `system-audio` | the playout machine's own sound device; this plant's air audio is embedded | local    | nothing; a local-monitor row          |

Only the LOCAL kinds are enumerated (`LOCAL_MONITOR_KINDS`), so the list that can go stale is the
one that quietens, never the one that alarms. One predicate (`outputSeverityOf` / `isAirOutputKind`
/ `checksLosingAir`) serves the banner, the dialog's Outputs section and the bridge's stderr line.

**Two surfaces, one fact each way.** The operator's banner: the headline and ONE line per channel
(what is declared, "CasparCG is not running it", "the fix is on the playout machine", "Details:
Server connection ▸ Outputs"). The technical surface (`OutputsSection`, read-only, inside the
Server connection dialog beside the hosts it is about): declared / running / checked-at per
channel, an AIR row with `C-030`'s addressing reading and rule, the startup-log recipe, the
failed-at-start paragraph and the creation outcome; a preview row for a local kind; the kept
verdict, dated, for an unreachable server. Nothing on either surface is a control: a missing
consumer of any severity disables no button, refuses no action and keys no failover — verified by
`git grep` over every reader of `outputs` / `missing` / `outputVerdictOf` / `isAirOutputKind`
(the two surfaces, `health()`, and the off-by-default `#createMissingConsumer`).

## 5. Not in scope

`B-192` term (b); the mixer `DEFER` exposure; the five orphan html layers (one was visible on the
plant at 1-96, pointing at this dev host's stale template URL — a dirty plant, not this subject);
`B-204`/`B-205` were already `[x]` (closed 2026-09-02) — the brief's "if still open" does not apply.
