# Runtime control styling + interaction feedback (R-007)

## Why

The Runtime's controls feel dead: styling today is per-component inline
`const styles` objects, and inline styles **cannot** express `:hover` /
`:active` / `:focus-visible` / `:disabled`. So a click gives no press feedback,
hover does nothing, focus has no ring, and a bridge round-trip shows no busy or
success signal — the operator can't tell a click registered, can't tell a
command is in flight, and a rejection is easy to miss (observed across the
2026-07-07/08 live sessions). The air-critical badge states (B-044 UNCONFIRMED,
R-003 dirty/`● draft`) also shipped with minimal placeholder visuals pending
this change.

## What Changes

Introduce a real design-system layer for `apps/runtime` — **renderer-only, no
behavior change** (R-003 staging semantics, the B-044 lifecycle, the AMCP verbs
and escaping all stay exactly as-is):

1. **Tokens** — extend `theme.ts` into a full set (color roles incl. on-air /
   idle / UNCONFIRMED-amber / error / dirty; a spacing scale, radii, a type
   scale, borders/elevation, motion durations), mirrored as CSS custom
   properties for the stylesheet. The sacred air-state colors stay; the look
   stays a calm dark broadcast console.
2. **Styling mechanism** — a single global stylesheet (`controls.css`) of
   component classes driven by those CSS custom properties, plus small React
   primitives. **No new UI framework or styling dependency** (argued in
   `design.md`). Classes unlock the missing pseudo-classes; DOM structure,
   roles, aria-labels, and test hooks stay stable.
3. **A state matrix for every control kind** — default / hover / active-pressed
   / focus-visible / disabled / busy / success-flash / error, with no layout
   shift between states (space reserved for rings/spinners).
4. **The async-feedback contract** — every button whose action is a bridge
   round-trip (PLAY, Update, Out, Remove, Load, Import .vcg, failover, lock,
   unlock, audit refresh): (a) instant pressed feedback; (b) busy while ITS OWN
   request is in flight — disabled + `aria-busy` + spinner-or-equivalent,
   double-fire guarded, spinner shown only if the request exceeds ~150 ms and
   held ≥300 ms once shown; (c) a brief success affordance on resolve; (d) a
   visible error near the control on rejection (never console-only). Busy is
   keyed to the request's WS ack round-trip, **decoupled** from the long-lived
   B-044 pending-update confirmation (the stack badge's job) — a fast Update ack
   may clear the button's busy while the badge is still settling, which is
   correct.
5. **Status/badge visuals as first-class** — ON AIR / READY / IDLE / UPDATING
   (transient) / UNCONFIRMED (amber "?") / ERROR / EXIT / TAKING, plus the R-003
   dirty-dot and `● draft` chip, and the link/session pills — a coherent,
   legible language, every state that exists on `main`.
6. **Keyboard + a11y** — visible `:focus-visible` rings, adequate dark-theme
   contrast, sensible hit areas, `prefers-reduced-motion` honored (static busy
   affordance instead of a spinner/transition).
7. **The TAKE → PLAY rename** — label + `aria-label` only; IPC channels and API
   names unchanged. The one deliberate test-selector change (specs updated in
   lockstep).

## Capabilities

- `runtime-ui` (ADDED): the Runtime control + interaction-feedback design
  system — the state matrix, the async-feedback contract, the badge visual
  language, a11y, and the PLAY rename.

## Impact

- `apps/runtime` renderer: `theme.ts` token extension; a new `renderer/ui/`
  primitive set (`Button`/`AsyncButton`, `StatusBadge`, `DraftChip`, `TextInput`
  / `TextArea` / `NumberField`, `Spinner`) + `controls.css`; every feature
  component reworked from inline styles to the primitives/classes, deleting the
  dead per-component style duplication.
- `applyDraft` and the `StackPanel`/`App` handlers return their promises so the
  async buttons can track their own in-flight state (no wire/behavior change).
- Playwright specs: `TAKE` → `PLAY` selector updates (badge-settle,
  stage-inspector-edits); all other hooks unchanged so R-003 / B-044 / B-040
  specs stay green. New unit tests for the async-button state machine + a
  reduced-motion/focus e2e assertion.
- No bridge / protocol / schema change. `MockRuntime` unchanged.
- R-007 stays `[ ]` → `[x]` after the operator's full-browser validation.

## Rollout

Vertical slice first (the Stack row: PLAY/Update/Out/Remove + the badge incl.
UNCONFIRMED + the `● draft` chip) for an operator browser review and direction
sign-off, THEN roll the system out to every remaining surface.
