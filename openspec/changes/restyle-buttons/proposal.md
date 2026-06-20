# Global button restyle: no default border + refined colours (D-094)

## Why

Every button in the Designer reads as bordered, and the palette feels loud — and because
it's baked into the shared recipe, it repeats on every new button. The shared
`Button`/`Control` recipe (`apps/designer/src/renderer/ui/Button.css.ts` on
`renderer/theme.ts`) draws a `1px` border on the `box` skeleton, the `secondary` (default)
and `danger` variants use a `colors.border` outline as their main affordance, and the
`selected` toggle relies on an accent-coloured border ring. The `primary` fill is the
saturated sky-blue `accent` (`#38BDF8`).

Fix it at the SOURCE so all current and future buttons inherit the change.

## What Changes

- **Remove the default (visible) border** from the shared recipe — the `box` skeleton and
  the variants no longer draw a resting outline.
- **Non-border affordance for the variants that relied on the border**, so none becomes
  invisible:
  - `secondary` (default) — a raised neutral surface fill + hover, not an outline.
  - `danger` — a faint danger-tinted resting fill + danger text + a stronger hover tint.
  - `selected` (toggle pressed) — a raised fill + accent-coloured label, not an accent ring.
- **Preserve every interactive state** (hover / active / focus-visible / disabled) for
  every variant (D-022's guarantee is unchanged; the focus ring is a `box-shadow`, not a
  border, so it is unaffected).
- **Preserve D-089's SAVE unsaved indicator** — the amber `border-top: 2px #ffdd40`
  (`TopToolbar.css.ts` `saveCtl` / `saveCtlDirty`) is an independent override on top of the
  recipe and is intentionally kept.
- **Refine the primary colour away from the saturated sky-blue** (anti-blue direction): the
  owner picked **Teal** (`accent #2DD4BF`, `accentMuted #14B8A6`) from 1–2 cohesive options at
  the visual-approval step. The primary label colour is extracted to a new `onAccent` token
  (`#06121F` dark on the light teal) so it pairs with the accent. `renderer/theme.ts` tokens
  only — no new neutral surface token was needed (the secondary hover reuses the existing
  `#3a3f59`).

No `@cg/ui` palette change (tokens-only package, untouched); no component moves; no schema /
runtime / export change. This is a renderer design-system refinement.

## Impact

- New capability: `designer-controls` (the shared button/control recipe contract).
- Affected code: `apps/designer/src/renderer/ui/Button.css.ts` (`box` `border: none` +
  variant/`selected` fills) and `renderer/theme.ts` (teal accent + `onAccent` token).
  Regression: `apps/designer/tests/e2e/button-restyle.spec.ts`.
- Every button inherits the change; the SAVE amber indicator and all interactive states are
  preserved.
