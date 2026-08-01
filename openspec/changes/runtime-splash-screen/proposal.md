# Startup splash screen — the Runtime's first frame (R-031)

## Why

`apps/runtime` boots into a bare `Connecting to bridge…` div. That is the product's first
frame, and it is a fragment of unstyled debug text on the machine an operator is about to put
graphics to air from.

The reason it cannot be fixed with a React component is the whole shape of this change: a
component cannot appear until the JS bundle has parsed AND `createRuntimeBridge()` has resolved
its 1500 ms probe — which is exactly the window that needs covering. Whatever fills that window
has to be in the HTML document itself.

The first frame is also where an operator confirms the right application came up on the right
machine, which is why one computed build stamp belongs on it: what they read off this screen and
repeat on the phone must identify the running build exactly.

## What Changes

A splash screen — APASAI / **CG CONTROL**, a phase readout, a progress rail — visible from the
first paint until the app is genuinely ready, with a minimum hold on a cold start.

- **Markup + critical CSS INLINE in `apps/runtime/index.html`**, inside `<body>` before `#root`,
  so it paints with no bundle and no network. A small inline script owns the clock (first paint
  is the only honest `t0`) and exposes `window.__CG_SPLASH__ = { phase, done }`.
- **`main.tsx` calls the real boot steps** — `INITIALIZING` (inline, at first paint),
  `PROBING BRIDGE` (before `createRuntimeBridge()`), `STARTING INTERFACE` (after it resolves,
  before the app render), then `done()` after the first React commit. Three labels for three
  work steps and **no terminal `READY`**: on a fast cold boot the app is ready about a second in
  while the hold keeps the door shut until 5 s, so a READY label would be on screen for most of
  the splash at exactly the moment the operator still cannot use the app. `done()` fades the
  label out instead and the counter carries the rest. Every call is null-safe, so a build without
  the splash element cannot crash boot.
- **The timing contract is a pure function** (`splashTiming.ts`), unit tested, rather than a
  tangle of `setTimeout`s: a 5000 ms cold floor / 600 ms warm floor (cold vs warm decided by a
  `sessionStorage` marker, not a wall-clock heuristic), a hold that EXTENDS to boot completion,
  and a hard 20000 ms ceiling that dismisses regardless of boot state.
- **One build stamp with one source.** A small plugin in `vite.config.ts` computes
  `{ version, sha, builtAt }` ONCE and feeds both consumers: `transformIndexHtml` (the splash
  paints before the bundle, so a `define` global is not available to it at first paint) and a
  `define` for `__CG_BUILD__` (so a later status/about surface reads the same values instead of
  re-deriving them). The foot renders `sha · builtAt` only — `0.0.0` is a placeholder, not a
  version, and printing `v0.0.0` on the first frame would be a false claim of a release identity.
- **A test bypass on an init-script global** (`window.__CG_SPLASH_DISABLED__`), set by the
  Playwright fixture — deliberately NOT a URL query parameter, which is a door an operator can
  reach by bookmark or typo.

**No red anywhere on the splash.** Red is the sacred air-state colour and decorative red is
already forbidden across this UI (`theme.ts`); a boot screen is the last place it may appear. The
accent is the existing sky. The logo and brand colours are not final — the placeholder mark is one
documented SVG slot.

This is a display gate layered ON TOP of the connection model. `createRuntimeBridge`,
`WebSocketRuntime`, `MockRuntime` and the bridge/tools code are unchanged; the live /
offline-mock / disconnected tri-state, the refuse-while-disconnected contract and the NOT
CONNECTED / TEST MODE banners all stay exactly as they are.

## Impact

- **Affected specs:** `runtime-ui` (one ADDED requirement).
- **Affected code:** `apps/runtime/index.html` (splash markup, inline CSS, boot script),
  `apps/runtime/src/renderer/main.tsx` (phase/done call sites),
  `apps/runtime/src/renderer/splashTiming.ts` (new, pure), `apps/runtime/vite.config.ts`
  (build-stamp plugin), `apps/runtime/src/renderer/theme.ts` +
  `apps/runtime/src/renderer/ui/controls.css` (splash tokens, parity kept),
  `apps/runtime/tests/e2e/fixtures/runtime.ts` (the bypass default), new unit + E2E tests.
- **Deliberately NOT affected:** `apps/designer/**`, `packages/**`, `tools/**`, and every
  bridge-selection file named above.
