# Operator Guide

The Runtime is the on-air control surface. This guide assumes the Runtime is already installed and connected to one or both CasparCG servers — for installation see the deployment guide bundled with the installer.

## Daily flow

1. **Boot.** The Runtime connects to both CasparCG instances on launch. The StatusBar shows `PRIMARY A HEALTHY · BACKUP B HEALTHY · mirror-sync` when both servers are reachable. If a server is missing, that pill turns red — fix the link before going to air.
2. **Pre-show check.** Drop tonight's `.vcg` templates into the watched folder. They appear in the Library once verified. A failed verify shows a red pill in the Library — the file is rejected, never auto-corrected.
3. **Load + Take.** Single-click a Library item to load it onto a row; the row goes `LOADED`. Click `TAKE` to put it on air. The row turns `ON-AIR`. The Inspector on the right exposes any declared fields — edit a value and the change goes live without a re-take.
4. **Out + Remove.** `OUT` plays the template's exit animation, then `REMOVE` frees the slot.

## Fixed layers

If the install declares a **fixed bank** (a run of operator-designated layers, default
70–79 on one channel), a FIXED LAYERS panel appears above the stack with one **permanent
row per layer** — the row exists whether or not anything is on the layer. Each row shows
its optional alias (e.g. "CLOCK") and its layer number, plus what the server currently
reports for that layer:

- **`occupied — <kind> producer`** — the layer is carrying something; the kind is reported
  verbatim (`html` is a graphic, `ffmpeg`/`decklink` and friends are video). An `html`
  producer can be CLEARed from the row — confirm-gated, since whatever is there goes off
  air.
- **`empty`** — the server is reporting and the layer has nothing on it.
- **`no signal — occupancy unknown`** — the monitoring feed (OSC) is silent, so the
  Runtime **does not know** what is on the layer. Unknown is never shown as empty: silence
  is not emptiness.
- **`not connected — occupancy unknown`** — the Runtime's link to its bridge is down, so
  even a previously reported state can no longer be trusted. Reconnect first.

### After a bridge restart

**Your rows come back on their own layers.** An item that was on layer 72 returns to layer
72 or does not return at all — it is never re-homed onto some other layer, because the row
IS the promise ("layer 72 is the clock"). If the graphic was still on air when the bridge
died, it is adopted exactly where it is and nothing is sent to the server at all.

**One row state is worth knowing:** **BLOCKED**. It means the item is back on its row, but
the layer is carrying a producer that is **not ours** — another system put something there
while the bridge was down. Nothing was cleared and nothing was put on air: destroying
somebody else's live feed is not something the Runtime will do on its own. The row shows
what the server reports (e.g. "a decklink producer on 1-72") beside the item that is
waiting, and the air verbs are held, because sending one would command that other
producer.

There are exactly two ways out, and both are safe:

- **You clear it.** Press CLEAR on the row — it asks first and names what it is about to
  destroy — and then PLAY. Two deliberate steps, never one button that does both.
- **It clears itself.** The moment the other producer leaves, the Runtime puts your
  template back on the layer by itself.

A row that reads BLOCKED for longer than you expect is a question for whoever owns the
other system, not a fault of the Runtime.

The header's **Configure** opens the bank settings: **aliases** and each row's
**visibility** tick can change live. The channel, the start layer and the COUNT are all
fixed at install and cannot change mid-session — the set of candidate layers is an
agreement with whoever else uses the machine, so it is not something to renegotiate during
a show. A refused change tells you the rule it broke and the specific layers involved. A
row cannot be hidden while it is occupied, or while the Runtime cannot see whether it is:
unknown fails closed, because hiding a row that may be on air would leave you no surface
for a live graphic.

### One CasparCG, one bank — everywhere

**Every station sharing one CasparCG MUST declare the SAME fixed bank.** The bank is an
agreement that those layers are operator-managed territory — "layer 72 is the clock,
whoever loaded it". If station A's fixed layer is station B's dynamic or Live Source
layer, one station's Clear can destroy a layer another system owns and must immediately
re-establish — on air. The Runtime cannot detect a divergent bank on another station
(stations share only the CasparCG wire, which carries no config), so this is an
**installation requirement**, the same class of contract as pointing the server's OSC at
the bridge: check it when you set up or change any station's config.

### Artwork over the live picture is its own row

A template that carries live boxes is composited **below** the live pictures: nothing drawn
inside it — its background, a frame, a title bar — can appear over a picture, and there is no
setting that makes it. **Anything that must draw over the picture is a separate template on its
own bank row**, above the live band: the logo bug, the lower-third name super, the news bar, the
title bar. Load it on its row and take it; it draws over every plate-bearing template beneath,
and it switches, holds and clears on its own trigger, independent of the look switch. This is
how the station's set is already authored — one package carries the boxes, and the logo, lower
third, news bar and interstitial are their own rows.

The one thing a row cannot do today is follow a particular guest box when the layout switches (a
super pinned under one box). On its own row such a graphic may arrive a frame late on a switch —
never a black hole. Ask for it as a feature rather than expecting a plate template to draw it.

### Upgrading from the old dynamic stack

Older versions placed each graphic on whatever layer was free in its template type's range,
and the Library and Stack were separate panels. This version replaces both with ONE list of
declared rows.

**Nothing is moved for you, and that is deliberate.** Items already running on old dynamic
layers keep running exactly where they are — the upgrade does not relocate a live graphic,
because moving something that is on air is an action nobody asked for and nobody is
watching. They stay until you remove them.

**What to do, at a safe moment — not mid-show:**

1. Let the current graphics play out, or CLEAR them as you normally would.
2. REMOVE each old item once it is off air. The old layer is released.
3. LOAD the template onto the row you want it on from now on, and give the row an alias
   that matches how you talk about it on air ("CLOCK", "LOWER THIRD").

From then on that template lives on that layer, survives a bridge restart on it, and is
where an operator shortcut or a rundown can point.

Until you do this, an old item shows on the list on its original layer and works normally.
There is no deadline and nothing expires; the only thing you lose by waiting is that the
graphic has no row of its own.

## Lock mode

The 🔒 LOCK button in the StatusBar engages a PIN-gated overlay. While locked, the operator cannot accidentally take or out anything — useful when stepping away from the desk during a long segment. Wrong-PIN attempts surface a counter but never lock you out; the lock is for accidents, not adversaries.

## Failover

The StatusBar shows the current `PRIMARY` and `BACKUP` labels. Auto-failover kicks in when the primary becomes unhealthy under the configured budget (ping miss, OSC silence, command-timeout burst, or 5xx burst). A red banner pins itself at the top of the window naming the swap — dismiss it once you've acknowledged.

Manual failover: click `⇄ FAILOVER` in the StatusBar. The journal is replayed to the new primary in `journal-replay` and `mirror-async` modes; `mirror-sync` swaps instantly.

## Audit

The `AUDIT` button in the StatusBar opens a tail of the NDJSON log. Filter by action (load / take / lock-engage / failover / …) or actor. The log is append-only and forensic — a clean exit is recorded; a crash leaves the file partially written but the next boot picks up where it left off.

## Telemetry

Default is `off` — the Runtime makes zero outbound network requests. Air-gapped stations should leave it at `off` (or set `air-gapped` explicitly for situational awareness). The `on` mode is reserved for future anonymized usage stats; the transport itself does not ship in v1.

## Air-critical contracts

- **Never** install an OS or app update while a row is on-air. The auto-update gate enforces this — a queued install fires only when the stack drains to idle.
- **Never** edit `.vcg` files directly. The watched folder is the only sanctioned ingress; the verify step is what guarantees the bytes that play on air match what your designer signed off on.
- **Always** acknowledge the failover banner before continuing. If you dismiss it without checking, a fresh failover later won't grab your attention the same way.
- **The Runtime STAGES its mixer changes and commits them channel-wide.** When it moves a graphic's
  live boxes it sends each `MIXER … FILL`/`CLIP` with `DEFER` and then one `MIXER <channel> COMMIT`,
  so the whole layout lands on a single video frame instead of drifting across two. On this build of
  CasparCG that staging area is **shared by every connection to the server** and a commit applies
  **everything staged on the channel, whoever staged it**. So: if any OTHER system drives the same
  CasparCG channel — a playout automation, a second control application, a hand-typed AMCP session —
  and it uses `MIXER … DEFER`, the two will interact: its commit can apply the Runtime's half-built
  layout, and the Runtime's commit can apply its. **Before pointing another AMCP client at a channel
  this Runtime controls, confirm that client does not use `DEFER`.** Clients that send ordinary,
  undeferred `MIXER` commands are unaffected — those apply as they arrive and are never swept up.

## Program output

**The red `PROGRAM OUTPUT MISSING` banner means CasparCG is up, answering, and NOT sending your
channel anywhere.** It appears when `casparcg.config` on the playout machine declares a program
output — a consumer whose picture leaves the machine: `decklink`, `bluefish`, `ndi`, `ffmpeg`,
`artnet` — and CasparCG is not running it. That is what a consumer that failed at start looks like:
the server boots, the channel runs on whatever consumers did start (the `<screen />` preview,
`<system-audio />`), every health pill reads green, and the SDI output is simply absent. Nothing
else in this console can see that — the bridge reads it by asking the server what the config
DECLARES (`INFO CONFIG`) and what the channel RUNS (`INFO <channel>`), and the banner is the
difference between the two.

**The banner is one line for the operator.** It names the channel, the declared consumer and its
device (`decklink (device 23487013)`), says CasparCG is not running it, and says the fix is on the
playout machine. Everything an engineer needs to make that fix is in **Server connection ▸ Outputs**
(the server-settings dialog, opened from the status bar): what each channel declares and runs, when
it was last checked, **which kind of number the declaration is** — a hardware persistent ID (a long
number) or a slot index (a small number such as `1`) — how CasparCG reads it, where the number comes
from, and what the bridge's own re-creation attempt answered, if the flag is on. **The next action
is on the playout machine, not in this console:** read CasparCG's own log for the reason (`Decklink
device … not found.` — the card was replaced or its persistent ID changed; `Decklink drivers not
found.` — the driver is missing), fix the `<device>` in `casparcg.config`, restart CasparCG. The
banner clears on its own within one check after the consumer is seen running. Do not power-cycle the
playout box over it — the server is UP.

**A stopped preview is not an alarm.** `<screen />` is a preview window on the playout machine's own
display and `<system-audio />` is that machine's own sound device; neither reaches air. When one of
them is declared and not running — the screen consumer closed by hand, say — **nothing lights for
the operator**: no banner, no disabled control, no failover. The fact is noted in Server connection
▸ Outputs as a preview row, and in the bridge's log as a plain line, and that is all. Any consumer
kind this console does not recognise is treated as a program output, so a new kind can only make
the console louder, never quieter.

**Where the number comes from — three lines.** CasparCG prints its DeckLink cards exactly once per
start, in its own log, and nowhere else.

1. **The file:** on the playout machine, `D:\casparcg-server-v2.5.0-stable-windows\log\caspar_<date>.log`
   — one file per day; the list is printed at every start, so the newest file after a restart has it.
2. **The search:** in a **PowerShell window on the playout machine** (not the CasparCG console window,
   not the AMCP console), type this ONE line and press Enter:
   `Select-String -Path 'D:\casparcg-server-v2.5.0-stable-windows\log\caspar_*.log' -Pattern 'Decklink devices found' -Context 0,4 | Select-Object -Last 1`
3. **What to copy:** the lines beneath the match read ` - <model> [slot] (persistent ID)`, e.g.
   ` - DeckLink SDI 4K [1] (23487013)`. The number in `[ ]` is the **slot index**; the number in
   `( )` is the **hardware persistent ID**. Put the one you choose inside `<device>…</device>` in
   `casparcg.config`, in a text editor (never in a console), and restart CasparCG. **If the search
   finds nothing, the server saw no card at all — or no driver** — and no number will help until it does.

**How CasparCG reads the number.** Both kinds go in the same `<device>` element. The server walks
its cards in order and, for each one, matches the number against the card's slot position FIRST and
its persistent ID SECOND; the number carries no marker saying which it is. In practice a small
number is a slot and a long one is a card, and that is how the banner labels it.

If the bridge loses CasparCG while the banner is up, it does not disappear: it re-labels itself
`PROGRAM OUTPUT UNVERIFIED` and says when the output was last seen missing. An alarm that goes quiet
because its own source died would read as "fixed", and this one refuses to.

**What "auto-detect" means here, and what it cannot mean.** Nothing in CasparCG's control protocol
lists the DeckLink cards a machine has (`INFO SYSTEM` is ignored; `INFO CONFIG` only echoes what you
wrote; the real list is printed once in the startup log, which the bridge does not read). So the
console cannot discover your card, cannot offer a picker, and will never choose a device for you.
What it does: **you name the device in `casparcg.config` — the slot index or the persistent ID from
the startup log (the three lines above) — and the bridge checks that the consumer you declared is
running and tells you when it is not.** Trying devices with `ADD` is not a way to find them: a
failure says nothing useful and a success puts that card on air.

**Slot index or persistent ID — the trade-off.** `<device>1</device>` means "whatever card sits in
slot 1": a card swapped in the same slot needs **no edit at all**, which is the nearest thing to
auto-detection this server offers — and, on a box with more than one card, a card that moves slots
puts a **different card's** output on air with no alarm. `<device>23487013</device>` means "this
exact card": a swap gives **no output and the red banner**, never the wrong picture, at the cost of
one edit and a restart after every swap. The recommendation for THIS plant, with its reasons, is
recorded under `C-030` in `docs/prd/caspar.md`; the choice is the owner's.

**What the check cannot see:** a consumer that is present but unhappy — a DeckLink that lost its
reference signal, or is dropping frames. The server reports a consumer's existence and settings,
never its health; that lives in the CasparCG log. A channel that WAS producing frames and stopped is
the StatusBar's `NOT PRODUCING` chip, a different signal on a different axis.

**`--create-missing-consumers` (bridge flag, OFF unless you type it).** With it on, the bridge sends
ONE `ADD` per connection for a declared DeckLink it found missing — with exactly the device and
flags the config names, never a substitute — and shows you CasparCG's answer on the banner. Useful
when a card was busy or its driver late at boot; useless when the config names a card the machine
does not have, which CasparCG refuses the same way (`403`), and that refusal is shown. The bridge's
boot log says which state it is in: `missing-consumer creation: OFF (default)` or `ON`.

## Keyboard

Lockscreen `Enter` submits the PIN. The rest of the surface is mouse-driven in v1; configurable keybindings land in v1.1.
