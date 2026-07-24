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

The header's **Configure** opens the bank settings: the slot count can GROW (at the end,
up to layer 89) and aliases can change live; the channel and the start layer are fixed at
install and cannot change mid-session. A refused change tells you the rule it broke and
the specific layers involved.

### One CasparCG, one bank — everywhere

**Every station sharing one CasparCG MUST declare the SAME fixed bank.** The bank is an
agreement that those layers are operator-managed territory — "layer 72 is the clock,
whoever loaded it". If station A's fixed layer is station B's dynamic or Live Source
layer, one station's Clear can destroy a layer another system owns and must immediately
re-establish — on air. The Runtime cannot detect a divergent bank on another station
(stations share only the CasparCG wire, which carries no config), so this is an
**installation requirement**, the same class of contract as pointing the server's OSC at
the bridge: check it when you set up or change any station's config.

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

## Keyboard

Lockscreen `Enter` submits the PIN. The rest of the surface is mouse-driven in v1; configurable keybindings land in v1.1.
