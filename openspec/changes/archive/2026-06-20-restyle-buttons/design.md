# Design — global button restyle (D-094)

## Audit: variants and border reliance

The shared recipe is `apps/designer/src/renderer/ui/Button.css.ts` (`base` states, `box`
skeleton, `variant`, `size`, `icon`, `selected`) consumed by `Button.tsx` / `Control.tsx`,
on the `renderer/theme.ts` tokens. Reliance on the border for the resting affordance:

| Variant       | Resting border                 | Relies on border?                                  | Non-border affordance                                 |
| ------------- | ------------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| `secondary`\* | `1px solid colors.border`      | **Yes** — the outlined chip is the affordance      | raised neutral surface fill + hover                   |
| `primary`     | `1px solid colors.accentMuted` | No — the accent FILL is the affordance             | keep fill; drop border                                |
| `ghost`       | transparent                    | No — already borderless; hover fill is the cue     | unchanged                                             |
| `danger`      | `1px solid colors.border`      | **Yes** — outlined danger chip                     | faint danger-tint fill + danger text + stronger hover |
| `bare`        | none                           | No                                                 | unchanged                                             |
| `selected`    | `borderColor: colors.accent`   | **Partly** — accent ring is the main "pressed" cue | raised fill + accent label                            |

\* `secondary` is the DEFAULT variant (`Button` with no `variant` prop), so it is the most
common button — and the SAVE control is a `secondary` button.

The `base` focus ring is a `box-shadow` (`0 0 0 2px accent`), NOT a border, so removing the
border does not touch focus-visible. `box` also carries the `1px` resting border.

## D-089 SAVE indicator is safe

The SAVE control is a `secondary` `Button` with an extra className
`cx(saveCtl, dirty && saveCtlDirty)` where `saveCtl = { borderTop: 2px solid transparent }`
and `saveCtlDirty = { borderTop: 2px solid #ffdd40 }` (`TopToolbar.css.ts`). That `borderTop`
is an independent override applied AFTER the recipe, so removing the recipe's side borders
leaves the amber top bar intact (and actually cleaner — no competing side outline). The fix
does not touch `saveCtl` / `saveCtlDirty`.

## Borderless affordance — the neutral-surface gap

The palette steps (darkest→lightest) are `panelMuted #24273d` < `panel #272b40` <
`border #2e3247` < `menuHover #2e3346`; the top three are nearly identical, so a borderless
button needs a slightly lighter raised surface + a clearly lighter hover to read. Resting
`secondary` sits on `colors.border` (raised vs the panel) and hovers to `#3a3f59` (the value
the old outline already used for its hover edge — promoted to a fill); `active` drops to
`panelMuted`. No new neutral token was needed; only the primary label colour is extracted to
a new `onAccent` token so it pairs with the accent at the colour pick.

Removing `box`'s border is **explicit** (`border: 'none'`): merely omitting the property
re-exposes the user-agent `<button>` 2px border (previously masked by the old
`1px solid transparent`), so it must be suppressed deliberately.

## Colour options (anti-blue) — visual-approval step

The primary fill + focus ring + `selected` label all derive from `colors.accent`
(`#38BDF8`, saturated sky-blue). Two cohesive anti-blue directions on the dark / RTL chrome:

- **Option A — Teal** (`accent #2DD4BF`, `accentMuted #14B8A6`): fresh, clearly not sky-blue,
  strong contrast for the dark label on the fill.
- **Option B — Indigo / Violet** (`accent #8B5CF6`, `accentMuted #7C3AED`; label switches to a
  light text): richer and more restrained than the loud cyan.

Warm directions (amber / coral) are deliberately avoided: amber collides with the D-089
unsaved signal (`#ffdd40`) and coral with the `danger` rose (`#F87171`).

**Owner pick: Option A — Teal.** Final tokens: `accent #2DD4BF`, `accentMuted #14B8A6`,
`onAccent #06121F` (dark label on the light teal fill). The accent drives the primary fill,
the focus-visible ring, the `selected` label, and the Designer's selection / timeline /
keyframe accents — all teal now.

## Scope / non-goals

- No `@cg/ui` palette change (tokens-only package). No component moves. No schema / runtime /
  export change.
- The colour token is finalised to Teal (owner pick) in this change; the no-border +
  affordance work is colour-independent.
