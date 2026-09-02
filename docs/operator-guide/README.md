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

## Keyboard

Lockscreen `Enter` submits the PIN. The rest of the surface is mouse-driven in v1; configurable keybindings land in v1.1.
