# Design — startup splash screen (R-035)

Only the decisions that are not obvious from the proposal, each with the reason it was taken
that way rather than the alternative.

## 1. The splash is HTML, not React — and that is the whole architecture

A React splash cannot exist during the window it is for. `main.tsx` awaits
`createRuntimeBridge()`, whose probe is bounded at 1500 ms, and before that the bundle must
download and parse. So the splash markup and its critical CSS are inline in `index.html`, and the
inline script — not the bundle — owns the clock.

Consequences that follow from that and are not negotiable:

- **`t0` is first paint**, measured inside the inline script. Any clock started from module scope
  in the bundle is already late by the parse time, which is precisely the cost being hidden.
- **The bridge is the splash's CALLER, never its dependency.** `main.tsx` calls
  `window.__CG_SPLASH__?.phase(...)` / `?.done()`. Optional chaining everywhere: a build whose
  splash element is absent (or removed by the bypass) must not throw on the boot path.
- **The splash owns its own removal.** It fades (~450 ms) and then removes itself from the DOM,
  so no stale full-screen overlay can intercept an operator's click.

## 2. Cold vs warm is a `sessionStorage` marker, not a timestamp heuristic

`sessionStorage` survives F5 in the same tab and is empty in a new tab or a new browser — it IS
the cold/warm signal, exactly. A stored wall-clock timestamp would have to guess a threshold, and
would misread a machine that had been sitting idle as a cold start.

The marker (`CG_RUNTIME_SESSION`) is written on first boot, in a `try`/`catch`: a browser with
storage disabled must degrade to "treat it as cold" rather than fail boot.

## 3. The ceiling is a safety property, not a timeout

`hardCeiling = firstPaintAt + 20000 ms`, absolute. At the ceiling the splash dismisses regardless
of boot state and the app shows its own DISCONNECTED / error surface, which already exists.

On an on-air tool a stuck splash is worse than a broken app: the operator has no door into the
application at all — no banner, no settings, no way to see WHY. The existing error surfaces are
better than a spinner in every case, so the ceiling never yields to boot state.

## 4. Boot-done is defined narrowly

Boot is done when **bridge selection has resolved** — `live`, `offline-mock` AND `disconnected`
all count as resolved — **plus the first React commit of the app shell**.

Snapshot pulls (stack / health / lock) are deliberately excluded. They have their own in-app
loading states, and on a `disconnected` link they never settle: gating on them would hang the
splash until the ceiling on exactly the installs that most need to reach the UI.

## 5. Three labels, a step counter — and no terminal word

Three phases → 33 / 67 / 100. The right-hand readout shows `2 / 3`, not `%`.

A percentage claims measured progress, and nothing here measures anything — the bridge probe is a
bounded wait, not a quantity. A step counter says exactly as much as is true.

**There is no terminal `READY` label, and that is a deliberate reversal of the obvious design.**
Each of the three labels names the work happening NOW, and there is no fourth step because there
is no fourth piece of work. A terminal label would also be actively misleading: on a fast cold
boot the app is ready about a second in while the hold keeps the door shut until 5 s, so `READY`
would be the thing on screen for MOST of the splash at exactly the moment the operator still
cannot use the app — a word saying "go" over a screen that is not letting them.

So `done()` FADES THE LABEL OUT instead (350 ms, opacity only) and the left side of the readout
goes empty. The rail stays at 100 % and the counter carries the remaining hold alone. Under
`prefers-reduced-motion` the label transition is `none` like every other, so it simply
disappears.

This replaced an earlier rule that turned the `READY` label `--r-success` green on completion.
That rule is gone, and with it the last use of `--r-success` on this screen.

## 6. No red, and the accent is the existing sky

Red is the sacred air-state colour in this app, and `theme.ts`'s header already forbids
decorative red anywhere in the UI to avoid confusion with ON AIR. A boot screen is the last place
it may appear: it would teach the operator's eye "red" before they have seen a single real state.
The splash therefore uses the existing sky accent (`--r-accent` / `--r-accent-strong`) and neutral
console greys, and `READY` flashes `--r-success`.

The "no red" rule is checked, not merely asserted: `tests/splashCss.test.ts` scans every colour
literal in `index.html` and requires blue ≥ red on each — which is the machine-checkable form of
"nothing on this screen leans warm".

**The inline CSS mirrors token VALUES rather than reading `var(--r-*)`**, because `controls.css`
arrives with the bundle and the splash paints before it. That duplication is real and is
contained the only way it can be: each mirrored literal carries a comment naming its token, and a
unit test parses the inline `<style>` block out of `index.html` and asserts every mirrored value
still equals its `cssVars` entry. The same test asserts no red is reachable from the splash CSS.

## 7. One build stamp, computed once, two consumers

A Vite plugin computes `{ version, sha, builtAt }` a single time and feeds:

- `transformIndexHtml` (`order: 'pre'`) replacing a `<!-- CG_BUILD_STAMP -->` comment. A comment
  placeholder rather than `%TOKEN%` because Vite runs its own `%ENV%` replacement pass over
  `index.html` and a `%…%` token can collide with it; `order: 'pre'` keeps the transform ahead of
  that pass.
- `define: { __CG_BUILD__ }`, so a later status/about surface reads the same object rather than
  re-deriving a second stamp that can disagree with the one on screen.

`shortShaOrFallback()` NEVER fails the build: the `git rev-parse --short HEAD` child process is
wrapped, and any throw, non-zero exit, or empty output falls back to `'nogit'` — tarball builds
and Docker layers without `.git` are normal, not errors.

The foot renders `sha · builtAt`. No `v0.0.0`: `0.0.0` is a placeholder, and a version number on
the product's first frame is a claim about release identity that this project does not yet make.
One comment at the render site records where to prefix `v${version}` when it does.

## 8. The bypass is an init-script global, defaulted in the FIXTURE

`window.__CG_SPLASH_DISABLED__`, set by `page.addInitScript` — the same shape the harness already
uses for `CG_E2E` and `__CG_BRIDGE_URL__`.

- **Not a URL query parameter.** A query parameter is a door an operator can reach by bookmark or
  typo, and this project has paid for unguarded doors before.
- **Its own global, not an overload of `CG_E2E`.** One global, one meaning.
- **The default lives in the fixture, not in product code.** Every existing spec gets it for free
  (no per-spec edit, no 5 s tax); the splash's own specs opt back in by simply not setting it.
- Absent global ⇒ the splash behaves normally. Product code reads it exactly once, at the top of
  the inline script, and when it is set the splash element is removed immediately — no clock, no
  listeners, no timers armed.

## 9. Fonts — the splash must not depend on a loaded face

`index.html` links Vazirmatn from a CDN and the app self-hosts Exo 2 + Vazirmatn via
`fonts.css` (which arrives with the bundle). Neither is available at first paint, so the splash
sets its own system stack (`system-ui, …`) plus `ui-monospace, Menlo, monospace` for the readout
and foot. A webfont swap on the product's first frame is exactly the wrong first impression, and
the splash is gone before the app's real faces matter.

## 10. Scope fence

`createRuntimeBridge`, `WebSocketRuntime`, `MockRuntime` and everything under `tools/` are
untouched — asserted by `git diff --stat`, not by intention. This change adds a display gate on
top of the connection model; it does not change how the runtime selects or manages a connection.
