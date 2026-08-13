# Media phases gain a third source: FOLLOW THE COMPOSITION

## Why

A Lottie or video used as a TICKER BACKDROP needs its phases to bracket the composition's own
lifecycle: intro settled by the time the content shows, still through the hold, build-off riding
the OUT segment. Authoring that today means hand-solving clip-space values against comp-space
markers — Lottie phases are ANIMATION frames, video phases are MS, and the composition runs at yet
another rate (29.97 in the owner's scene). The Inspector displays the conversion one way ("= frame
100 of this comp") but the operator's task is the INVERSE, per element, re-done after every marker
drag.

## What changes

- **Schema** (`@cg/shared-schema`, additive): Lottie `phases.source` grows `'composition'`; video
  `phases` gains an optional `source` (absent ⇒ `'manual'`-equivalent) and both kinds gain an
  optional `holdAt` (clip-native units) meaningful only under `'composition'`. Under
  `'composition'` the stored `introEnd`/`outroStart` are IGNORED but kept present, so a Detach has
  somewhere to land without a shape change.
- **One derivation** (`@cg/shared-schema` `followWindowMs`, time-space) with one thin unit adapter
  for Lottie frames (`@cg/lottie-bridge` `lottieFollowWindow`); video consumes the ms-space core
  directly. The window is a CONTINUOUS window through the clip anchored at the HOLD time `H`
  (`holdAt`, default = the entrance span, which degenerates to "play the clip from its head").
- **Driver capability**: an intro that starts at an OFFSET and an outro bounded by an END, in the
  ONE mapping function per kind (`clipPositionAt`, `expectedClipMs`) — never beside it.
- **Runtime resolution**: derivation runs where phases are resolved (`createRuntime`), so the
  canvas re-derives on every `scene-replace` (marker drags included) and preview/export/air run
  the SAME code on the same scene. No baked copies anywhere.
- **No circularity**: a `source: 'composition'` element contributes `settleOffset: null` — the
  existing marker-less rule, reused.
- **Inspector** (both kinds, same presentation): a "Follow composition" phase source, the derived
  window read-only with comp equivalents, ONE editable `hold at` input (seeded from the shared
  poster/midpoint helper), a Detach that bakes the derived values to `manual`, and an explanation
  when the composition has no lifecycle to follow.

## Impact

- `@cg/shared-schema` — `LottiePhasesSchema` / `VideoPhasesSchema` + new `follow-window.ts`.
- `@cg/lottie-bridge` — `lottieFollowWindow` unit adapter in `timing.ts`.
- `@cg/template-runtime` — `LottieDriver` / `VideoDriver` window options; `runtime.ts` resolution
  (settle pre-pass hoisted so follow anchors exist at driver construction).
- `apps/designer` — `StyleSection` (both media inspectors), `PlayoutSection` (`mediaHoldItem`
  truthfulness for followers and for the degenerate idle span found beside it).
- Specs: `designer-lottie-element`, `designer-video-element` (deltas in this change).
- PRD: D-151's open question is ANSWERED by the owner (sharpened Candidate A) — recorded in
  `docs/prd/designer.md` as part of this change's commit family; the dialog itself is a later
  session.
