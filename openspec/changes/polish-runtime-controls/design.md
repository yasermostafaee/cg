# Design — Runtime control styling + interaction feedback (R-007)

## The root cause (verified)

Every Runtime component styles itself with an inline `const styles = {…}` object
and spreads it onto elements (`style={styles.button}`). Inline styles set only
the resting appearance — the CSS pseudo-classes that communicate interaction
(`:hover`, `:active`, `:focus-visible`, `:disabled`, attribute selectors like
`[aria-busy]`) cannot be expressed inline at all. That is the entire reason the
controls feel dead. The fix is not "more inline styles" — it is a styling layer
that can carry state.

## Mechanism decision: a global class stylesheet + CSS custom properties (no dependency)

**Chosen: a single global `controls.css` of component classes, driven by CSS
custom properties mirrored from `theme.ts`; behavior-bearing controls wrapped in
small React primitives.** Argument:

- It unlocks exactly the missing capability — pseudo-class and attribute-selector
  states — with **zero new dependencies** (Vite already processes `.css`; the app
  already imports `@cg/ui/theme.css` at the entry point). The task forbids a new
  UI/styling dependency without asking; this needs none, so no ask is required.
- The repo precedent for the Designer is `theme.ts` + vanilla-extract, but the
  Runtime has **no** `ui/` dir and no vanilla-extract wiring; adding
  vanilla-extract here would be a new build dependency and a larger blast radius
  than the problem warrants. A hand-authored global stylesheet keyed off custom
  properties is the minimal, idiomatic-for-CSS choice and keeps the DOM/roles/
  aria identical (so the Playwright hooks stay stable).
- Custom properties fed from `theme.ts` keep a single source of truth: `theme.ts`
  holds the token values (for the few TS consumers like `airStateVisual`), and
  `controls.css` `:root` declares the matching `--r-*` variables. The mapping is
  documented and the values are asserted equal by a small token test.

Rejected: (a) styled-components / vanilla-extract / any CSS-in-JS lib — a new
dependency for no capability gain; (b) keeping inline styles and toggling them
from JS `onMouseEnter`/`onFocus` — reinvents the browser's pseudo-classes badly,
misses `:focus-visible` heuristics, and bloats every component.

## Tokens (theme.ts extension + controls.css `:root`)

Added to `theme.ts` (and mirrored as `--r-*` in `controls.css`):

- **Color roles** (semantic, on top of the chrome + sacred air-state palette):
  `surface` / `surfaceRaised` / `surfaceSunken`, `borderSubtle` / `borderStrong`,
  `accent` (sky, the interactive/secondary hue), `onAir` (sacred red — PLAY +
  ON AIR only), `caution` (amber — Out/EXIT/UNCONFIRMED/dirty), `danger`
  (deep red — Remove), `success` (emerald — ack/healthy), `dirty` (amber — the
  R-003 marker). Air-state colors are unchanged and stay the only reds besides
  `danger`.
- **Spacing** scale (`--r-space-1..8`, 4px base), **radii** (`sm/md/lg/full`),
  **type scale** (`--r-text-xs..xl` + weights), **borders/elevation**
  (`--r-border`, `--r-shadow-1/2`, focus-ring width), **motion**
  (`--r-dur-fast` 120ms, `--r-dur-med` 200ms; a `--r-spin` duration).

## Control state matrix (every interactive kind)

| State          | Visual (all controls)                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| default        | resting fill/border per variant                                              |
| hover          | +brightness / border-strong; cursor pointer                                  |
| active-pressed | inset translate (1px) + darkened fill — instant, no delay                    |
| focus-visible  | 2px accent ring via `box-shadow` (reserved space; no layout shift)           |
| disabled       | reduced opacity, `cursor: not-allowed`, no hover/active                      |
| busy           | `aria-busy`, disabled interaction, spinner-or-dots after 150ms (held ≥300ms) |
| success-flash  | brief success-tint outline (~600ms) then back to default                     |
| error          | danger-tint outline + an inline `role="alert"` message beside the control    |

No layout shift between states: the focus ring is a `box-shadow` (outside the box
model), the spinner occupies a reserved leading slot, and success/error are
outline/tint only.

## The async-feedback contract (`AsyncButton`)

A `renderer/ui/AsyncButton.tsx` primitive owns one button's request lifecycle:

- Props: `run: () => Promise<{ accepted: boolean; errorCode?: string }>`,
  `variant`, `children`, plus pass-through `aria-label` / `disabled`.
- **Double-fire guard**: while a run is in flight, further clicks are ignored and
  the button is `disabled` + `aria-busy`.
- **Instant press**: `:active` gives the pressed look with zero JS latency.
- **Busy, debounced**: on click, start the run and a 150ms timer; only if the
  promise is still pending at 150ms show the spinner, and once shown keep it for
  ≥300ms (a `shownAt` floor) so a fast local ack doesn't flicker.
- **Success**: on `accepted`, a ~600ms success-flash, then resting.
- **Error**: on `!accepted` or a rejection, an error state + an inline
  `role="alert"` message next to the button (never console-only). (The global
  `CommandErrorToast` stays for link-down context, but the primary, near-the-
  control signal is inline.)
- **Decoupled from B-044**: busy tracks only THIS request's WS ack (the `run`
  promise). The stack badge's `updating → on-air/unconfirmed` settlement is a
  separate, longer-lived signal driven by `StackItemState`. A fast Update ack
  clears the button busy while the badge is still `UPDATING` — intended, and the
  two are visually distinct (button spinner in the action, badge pill in the
  status column).

`clock`/timers are injectable for the unit test; `prefers-reduced-motion`
replaces the animated spinner with a static "···" busy glyph and drops the
success/press transitions (state still conveyed by the static tint).

To feed `AsyncButton`, the fire-and-forget handlers now RETURN their promises:
`applyDraft(item)` returns the `stack.update` promise (still clearing the sent
draft on `accepted` internally), and `StackPanel`/`App` pass
`() => window.cg.stack.take({itemId})` etc. No wire or behavior change.

## Badge + status visual language

`renderer/ui/StatusBadge.tsx` renders `airStateVisual(status, pending)` as a
pill: a state dot/icon + label, colored by role, never hue-alone (icon + word
always present). Tuned per state:

- **ON AIR** — solid on-air red, filled dot. **TAKING / UPDATING** — transient:
  caution-amber, a spinning ring glyph (static under reduced-motion). **READY** —
  accent-sky. **IDLE** — muted. **UNCONFIRMED** — caution-amber, `?` icon, a
  subtle outline to read as "attention, unknown" distinct from ON AIR. **ERROR /
  EXIT** — danger/caution. `DraftChip` (`● draft`) — dirty-amber, small, used in
  the stack row and the Inspector header; the per-field dirty-dot shares the hue.
- The link/session pills (`LinkIndicator`, `StatusBar` primary/backup) adopt the
  same pill class with role tints (LIVE/HEALTHY = success, DEGRADED/mock =
  caution, DISCONNECTED = danger).

## Surfaces + controls (the rollout inventory)

Bridge-round-trip buttons → `AsyncButton`: StackRow **PLAY** (`stack.take`),
**Update** (`applyDraft`→`stack.update`), **Out** (`stack.out`), **Remove**
(`stack.remove`); Inspector header **Update** (apply); Library **Import .vcg**
(the file-pick opens instantly, busy tracks the `importTemplateFromBytes`
round-trip) + **Load** (`stack.load`); StatusBar **Failover**
(`connections.failover`) + **Lock** (`lock.engage`); LockOverlay **Unlock**
(`lock.release`); AuditPanel **Refresh** (`audit.recent`). Pure-local controls →
the plain `Button` variant (hover/press/focus only, no busy/success): Inspector
**Discard**, list **↑/↓/×/Add item** (R-003 staging is local — they get press/
hover/focus but NOT busy), AuditPanel **Close** + filters, FailoverBanner
**Dismiss**, StatusBar **Audit**. Text controls → `TextInput` / `TextArea` /
`NumberField` classes (the `NumberField` keeps R-003's controlled raw-string
in-progress behavior verbatim — no focus/remount regression).

## Visual hierarchy (deliberate)

PLAY is the on-air PRIMARY action (solid on-air red, heaviest weight) — it must
never look like a neutral sibling. Update is SECONDARY (accent-sky, filled).
Out is CAUTION (amber outline). Remove is DANGER (danger-tint, quietest until
hover) so a destructive click reads distinctly from an on-air one. Load/Import
are secondary; ghost/icon variant for reorder ↑↓×.

## A11y

Every control keeps its role + `aria-label`; `AsyncButton` adds `aria-busy` and
an `aria-live` inline error. Focus-visible rings on all. Contrast checked on the
dark surface (labels ≥ 4.5:1). `prefers-reduced-motion: reduce` → no spin/slide;
static busy + tint only. Hit areas ≥ 28px min in the action row.

## Tests

- **Unit** (`asyncButton` state machine, injected clock): no spinner before
  150ms; spinner appears when the run is still pending at 150ms and stays ≥300ms;
  success-flash on accepted; error state + message on reject/`!accepted`;
  double-fire ignored while busy. A `theme.ts`↔`controls.css` token-parity test.
- **E2E**: the existing R-003 / B-044 / B-040 specs stay green with `TAKE`→`PLAY`
  selectors updated; a focus-ring/`aria-busy` assertion; an error-state assertion
  when a command is rejected (bridge down). Reduced-motion is asserted via the
  static busy affordance class.

## Out of scope

Bridge/protocol/schema, the B-044 lifecycle + verbs + escaping, R-003 staging
semantics, new features (R-004/005/006). Styling + the label rename + the
promise-returning handler plumbing only.
