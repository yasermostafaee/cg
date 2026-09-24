# Proposal — `multi-channel` (`MULTI-CHANNEL-01`)

## Why

**Owner requirement, 2026-09-23:** the Playout supplies a list of channels, and one CG Control
must be able to work on several of them and switch between them. The bridge was single-channel in
exactly the places `R-062` names: one fixed-layer bank (gap 3), and four housekeeping verbs that
could not name a channel (gap 1). Gap 2 — channel discovery — was closed by `CHANNEL-AUTHORITY-01`.
The console was built for this day (Phase 7's strip, keyed selection and per-channel tab), and the
week's auth work is already per channel (`C-038`, `B-257`, `CHANNEL-AUTHORITY-01`).

**Owner decision, 2026-09-23 — `A16`'s scope question, answered.** When the operator presses
PANIC, only the channel on screen goes silent; a separate, explicit control silences every
channel. `R-062` recorded this as a precondition of ever shipping real multi-channel.

## What changes

- **A — one bank per declared channel.** `FixedLayerBanksSchema` and `fixedLayers.banks` /
  `set-banks` / `banks-changed`; `config` / `set-config` stay as the one-bank view. The persisted
  file reads v1 as a one-entry list and keeps writing ONE bank as the v1 object, byte for byte.
  `#declaredChannels()` answers every bank's channel, so every door reads the plural through the
  one predicate. `MockRuntime.load()` writes `item.slot` first, so the mock can hold two channels.
- **B — the four housekeeping verbs take an optional channel**; a bare call is byte-identical.
- **C — PANIC per channel is a NEW verb**, `stack.silence-channel-live-plates` (operator,
  channel-scoped). `silenceAllLivePlates` is untouched and becomes the separate every-channel
  control, placed in the header beside the channel strip.
- **D — switching.** Everything per channel follows the channel on screen; the selection is
  session-only and a reload opens on the lowest declared channel.
- **E — first-run picks one or more channels**; **M — Change channel… edits the channel SET**, and
  the Channel pane's legend says what is true for the principal.
- **F — a lock-covered channel's view presents as locked, its verbs absent.**
- **G — the playout tab is split by channel. H — Station setup's subtitle names the channel as the
  Playout does.**
- **I — every Station setup pane shows values, not inputs, below `station-admin`. J — the demo
  gains `cg-admin-ch2`, its own station-admin.**
- **K — `B-263`: Persian in both apps' chrome is drawn in Vazirmatn; Latin keeps its font.**
- **L — a channel's messages stay in its view; other channels signal on the strip.**

## Capabilities

- **Modified:** `runtime-caspar-bridge`, `runtime-ui`, `designer-shell`.

## Impact

- **On-air / product source:** what reaches CasparCG changes for every verb called WITH a channel,
  and new refusal conditions are added (the per-channel scoping, a removal of a channel holding our
  air, a load that names no channel on a two-channel station). Every bare call is byte-identical.
- **Persisted key:** the bank file gains a plural shape; a one-channel station's file is unchanged.
- **Shared config:** the CI `e2e` job cap and the Runtime suite's CI budget (`pr.yml`,
  `apps/runtime/playwright.config.ts`).
- **Out of this change:** two CG Control installations on one channel; per-channel band layouts
  beyond the standard three; the Playout's layer band 1–49; the bridge as a Windows service,
  auto-update, code signing, `B-262`.
