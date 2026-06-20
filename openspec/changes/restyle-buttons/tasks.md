# Tasks — Global button restyle (D-094)

## 1. Audit (report before changing)

- [x] Locate the shared recipe (`Button.css.ts`) + tokens (`theme.ts`); list every variant
      and which rely on the border for their affordance (`secondary`, `danger`, `selected`).
- [x] Confirm the SAVE amber indicator is an independent `borderTop` override (D-089) that
      survives removing the recipe's side borders.

## 2. Remove the default border + non-border affordances (lands first)

- [x] `box`: drop the resting border — `border: 'none'` (explicit, to also suppress the
      user-agent `<button>` border).
- [x] `secondary`: raised neutral fill (`colors.border`) + `#3a3f59` hover (no outline).
- [x] `danger`: faint danger-tint resting fill + danger text + stronger hover (no outline).
- [x] `selected`: raised fill + accent label (no accent ring).
- [x] `primary` / `ghost` / `bare`: drop any resting border; keep the fill / hover / states.
- [x] Verify hover / active / focus-visible / disabled still apply to every variant, and the
      SAVE `saveCtl` / `saveCtlDirty` amber top border is unchanged.

## 3. Colour refinement (visual-approval step — STOP)

- [x] Propose 1–2 cohesive anti-blue accent options on the existing dark / RTL tokens
      (Teal vs Indigo/Violet).
- [x] Render before/after screenshots of the main button surfaces (landing, dialog, studio
      toolbar + inspector) per option; posted them and STOPPED for the owner to pick.
- [x] After the pick (**Teal**): set the final accent token in `renderer/theme.ts`
      (`accent #2DD4BF`, `accentMuted #14B8A6`, `onAccent #06121F`).

## 4. Regression + gate (after the pick)

- [x] A check that no button renders the old default border and that secondary / primary stay
      visible, with the SAVE amber preserved (`tests/e2e/button-restyle.spec.ts`).
- [x] `@cg/designer` green gate (uncached) + `pnpm test:e2e` (52 passed) +
      `openspec validate restyle-buttons --strict`.
