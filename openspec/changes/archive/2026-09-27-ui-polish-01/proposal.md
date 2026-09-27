# ui-polish-01 — the channel tabs, the picker's divider, retiring `Manage` and the Import dialog, channel checkboxes, a calm pass-green, and an on-air dot on every channel name

Prompt `UI-POLISH-01` (v5), from the owner's first-run check of 2026-09-26 on `dev:station --fake`.

## Why

- **A.** The header's channel tabs look unfinished: a rule runs under both, and the active tab is a
  fill one unit off the header's ground (`#141b25` on `#121b26`) — the active channel is hard to
  tell at a glance.
- **B.** In `Load onto Layer N` with one template, the line between the list and the details stops
  a short way down: `.cg-tpl-body` is content-sized, so the layout under it has nothing to grow
  into.
- **C.** The owner (2026-09-26): `Manage` is an extra view. Its one act — delete from the station —
  belongs on the template's own row.
- **D.** The owner (2026-09-26): the separate Import dialog was wanted for CHECKING a file before
  import (`design.md` §21.9, "the import wizard"). That was never built, so the dialog is one extra
  click. `Import a .vcg` opens the file chooser directly.
- **E.** First-run's channel pills do not say that more than one can be picked, and a picked pill is
  hard to tell from an unpicked one.
- **F.** The owner: a passing connection-check line's ✓ should be green — which a recorded rule
  forbids for the ON-AIR green. Both are kept: a quieter green, in its own token.
- **G.** The owner: a dot on each channel name telling playing from stopped, and a PROGRAM head that
  follows the same state. The Playout's `2.8.58` D4 gives two facts — `output` (the colour) and
  `playlist` (information only) — so a stopped playlist during a multi-box live segment never makes
  a channel look off air.

## What changes

- **A.** The outer `TabStrip` level is styled by class (`.cg-tab--outer`), with no rule under the
  strip; the active tab is a filled box in the reference switcher's own colours; arrows move focus
  between tabs.
- **B.** `.cg-tpl-body` fills the modal body, so the aside's border runs from under the tools row to
  the footer whatever the list's length.
- **C.** A small neutral delete icon on each picker row, through the SAME removal path, gate,
  refusal and confirmation `Manage` used; `Manage`, its view and its dead code are removed.
- **D.** `Import a .vcg` opens the OS chooser; a `.vcg` dropped on the list imports; a refusal is one
  line in the picker; the Import dialog is removed. The pipeline's own checks (verify, unpack, the
  runtime-version guard, render) are kept.
- **E.** A shared `Checkbox` primitive in `renderer/ui/`; each channel is a row with a checkbox in
  first-run AND in Station setup → `Change channel…` (one component — they already share
  `ChannelStep`).
- **F.** A `checkPass` token, only on the pass icon; `onAir` stays reserved for air.
- **G.** The bridge reads D4 at most every 5 s (one named constant, `If-None-Match`) and publishes
  `output` / `playlist` beside each channel's name; a dot before every channel name, a PROGRAM head
  whose colour follows `output`, a neutral playlist tag, and an amber alarm for `unlicensed`.

## What does NOT change

- Every refusal CONDITION: template removal's gate (the bridge refuses while any row references the
  template), the channel-set authz and lock refusals, and the "already on air" warning.
- Import loads nothing onto any row (`fixedSlotLoad.test.ts`'s flat invariant).
- The link / bridge indicators: the dot never means our own connection.
- No persisted key. The IPC `channels.changed` row gains two OPTIONAL fields.

## Impact

- `apps/runtime` renderer (tabs, picker, first-run, Station setup, monitors, theme, controls.css).
- `tools/caspar-bridge` (`playout-catalogue.ts`, the station-channels join, the fake Playout).
- `packages/shared-ipc` (`StationChannelsSchema` row: optional `output`, `playlist`).
- `docs/integration/playout/` — the Playout's V13-STATE response copied in.
- Specs: ADDED `runtime-ui` and `runtime-caspar-bridge` requirements here; the pending
  `runtime-redesign-programme` requirements on `Manage` and the two dialogs are amended IN PLACE
  (a second delta on the same header would collide at archive).
