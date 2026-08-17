# R-055 — three CG Control chrome corrections

## Why

Three places where a signal says something it does not mean, on a surface whose whole premise is
that colour and naming carry state.

1. **The maximised-panel toggle wore the PVW hue on hover.** Its base fill is correctly `--r-accent`
   (sky), under a comment in `controls.css` that spends ten lines on why it **may not be the
   violet**: that hue is R-022's REHEARSING state, and _"a violet chip in a panel header would be
   that claim in a place it cannot be true"_. Six lines below, the **unscoped**
   `.cg-btn--icon.is-on:hover` painted `#8b5cf6` with border `#a78bfa` — and `--r-rehearsing` IS
   `#a78bfa`. The rule that forbids the violet was defeated by a rule beneath it at higher
   specificity, because the weights were bare literals with nothing naming whose colour they were.
2. **FAILOVER wore the fault colour.** `variant="caution"` is `--r-caution` (`#f59e0b`) — the same
   hex as the `⚠ NO OSC` alarm two elements to its left, in a bar whose own header says amber means
   _"a configuration problem"_. FAILOVER is a manual ACTION, so colouring it spent the alarm colour
   on something that is not alarming and made the real alarm quieter.
3. **The `PLAYOUT` tab's name said the opposite of what it lists.** A row in it is one declared
   RESERVED layer — the fence away from a foreign owner — so the tab is about the layers the
   **station's own playout system owns**, not layers this console plays out.

## What changes

- **Three colour weights become named tokens** — `--r-rehearsing-mid`, `--r-rehearsing-deep` (the
  violet hover/press that were literals) and a new `--r-accent-lift` (the sky's hover weight, which
  did not exist, and whose absence is why the sky toggle had nowhere to lift TO). Added to
  `theme.ts`'s `cssVars` and mirrored in `controls.css`, per the existing parity contract.
- **The maximised panel gets its own scoped hover and active**, at a higher specificity than the
  unscoped `.is-on` rules, so it can never inherit the violet again.
- **FAILOVER becomes the default variant**, matching its SERVERS / SOURCES / LOG neighbours. It keeps
  its disabled state and `title`.
- **`PLAYOUT` → `STATION LAYERS`**, label and renderer-local identifiers.

## What does NOT change

- **No behaviour.** All three are colour or naming.
- **No wire name.** The IPC channels (`playoutLayers.state`, `.state-changed`, `.clear`), the
  `PlayoutLayerState` contract type and the `window.cg.playoutLayers` bridge surface are UNCHANGED —
  renaming them would churn the wire for no user-visible gain, and nothing is delivered that would
  need the churn.
- **The keyboard path, the `role="separator"` semantics and every disabled state** are untouched.

## Impact

| Area           | Effect                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/runtime` | three tokens; one scoped hover/active pair; one variant; the tab label, its id and the renderer-local identifiers; one E2E selector |

Capability: `runtime-ui` (MODIFIED).
