# runtime-ui — delta (R-031, startup splash screen)

## ADDED Requirements

### Requirement: The Runtime shows a startup splash from the first paint until it is ready

The Runtime SHALL present a startup splash screen — the APASAI company mark, the **CG CONTROL**
product wordmark, a named phase readout, and a progress rail — that is painted on the FIRST
FRAME, before any application JavaScript has run, and that stays on screen until the application
is genuinely ready.

The splash markup and its critical CSS SHALL live inline in the application's HTML document so
that neither the JavaScript bundle nor any network request is required to paint it. A build in
which the splash element is absent SHALL boot normally: every call into the splash from
application code is null-safe.

The splash SHALL remove itself from the DOM after dismissing, so no full-screen overlay outlives
it.

All splash copy SHALL be English. The splash SHALL NOT use red anywhere: red is the Runtime's
sacred air-state colour and decorative red is already forbidden across this UI, so the splash
accent is the existing sky accent.

#### Scenario: The splash paints before application JavaScript

- **WHEN** the Runtime page is opened **THEN** the splash is visible on the first painted frame,
  with no dependency on the JavaScript bundle, a network fetch, or a web font

#### Scenario: The splash removes itself once dismissed

- **WHEN** the splash has faded out **THEN** its element is removed from the DOM and the operator
  surface beneath it is fully interactive

#### Scenario: No red on the first frame

- **WHEN** the splash is rendered **THEN** no part of it is red — not the mark, the rail, the
  readout, or the frame

### Requirement: The phase readout names real boot steps and advances by completed phase

The splash SHALL show a named phase for each REAL step of the Runtime's boot — initialization,
the bridge probe, and interface start — advanced by the application at the point that step
actually occurs, never on a simulated schedule. Each label SHALL name the work happening NOW.

There SHALL be exactly THREE labels for three work steps, and NO TERMINAL "READY" LABEL. When
boot completes the label SHALL FADE OUT (opacity only, ~350 ms), leaving the left side of the
readout empty; the step counter carries the remaining hold alone. A terminal label is forbidden
because a fast cold boot completes roughly a second in while the hold keeps the door shut until
5000 ms — so "READY" would be the thing on screen for most of the splash at exactly the moment
the operator still cannot use the app.

The progress rail SHALL advance by COMPLETED PHASE (three phases → 33 / 67 / 100 %), and the
readout SHALL show a STEP COUNTER (e.g. `2 / 3`). It SHALL NOT show a percentage, which would
claim measured progress that nothing here measures.

#### Scenario: Each phase is announced when it happens

- **WHEN** the application begins probing for the bridge **THEN** the readout names that step, and
  **WHEN** the bridge selection resolves and the interface starts **THEN** the readout names that
  step in turn

#### Scenario: The rail advances by completed phase, with a step counter

- **WHEN** two of the three phases have completed **THEN** the rail is at 67 % and the readout
  shows `2 / 3` — never a percentage

#### Scenario: The label leaves when boot completes

- **WHEN** boot completes **THEN** the phase label fades out and the readout's left side is empty,
  while the rail stays at 100 % and the step counter remains for the rest of the hold

#### Scenario: No terminal label exists anywhere

- **WHEN** the splash's markup, styles and script are inspected **THEN** the word `READY` does not
  appear in any of them

### Requirement: The splash hold has a cold floor, a warm floor, and a hard ceiling

The splash SHALL be dismissed at `min(max(firstPaint + floor, bootDone), firstPaint + 20000 ms)`,
where the floor is **5000 ms on a cold start** and **600 ms on a warm reload**.

Cold versus warm SHALL be decided by a `sessionStorage` marker — absent means cold — because
session storage survives a reload in the same tab and is empty in a new tab or new browser. It
SHALL NOT be decided by a wall-clock timestamp heuristic. A browser that refuses session storage
SHALL be treated as a cold start rather than failing boot.

Boot-done SHALL be defined narrowly as **bridge selection resolved** — `live`, `offline-mock` and
`disconnected` ALL count as resolved — **plus the first React commit of the application shell**.
Snapshot pulls (stack, health, lock) SHALL NOT be part of the gate.

The 20000 ms ceiling is ABSOLUTE: at the ceiling the splash dismisses regardless of boot state, so
that a stuck boot never leaves the operator without a door into the application. Signalling
boot-done more than once SHALL be idempotent.

#### Scenario: A cold start holds for at least five seconds

- **WHEN** the Runtime is opened in a browser context with no session marker **THEN** the splash
  remains visible for at least 5000 ms from first paint, even if boot completed sooner

#### Scenario: A warm reload dismisses quickly

- **WHEN** the page is reloaded in the same tab and boot completes quickly **THEN** the splash
  dismisses once boot completes and no earlier than 600 ms from first paint — well under the cold
  floor

#### Scenario: A slow boot extends the hold

- **WHEN** boot completes AFTER the applicable floor has elapsed **THEN** the splash stays until
  boot completes — it never hides a boot that is still running

#### Scenario: The ceiling dismisses a boot that never completes

- **WHEN** 20000 ms have elapsed since first paint and boot has not completed **THEN** the splash
  dismisses anyway and the application's own DISCONNECTED / error surface is shown

#### Scenario: A refused bridge still reaches the operator surface

- **WHEN** the bridge connection is refused **THEN** the splash still dismisses and the application
  shows its own NOT CONNECTED surface — the splash is never permanent

#### Scenario: Boot-done twice is idempotent

- **WHEN** boot completion is signalled more than once **THEN** the dismissal is scheduled from the
  first signal only, and the later signals change nothing

### Requirement: The splash carries one build stamp from a single source

The splash SHALL display a build stamp identifying the running build exactly — the short commit
SHA and the build date — in the form `sha · YYYY-MM-DD`.

The stamp SHALL be computed ONCE at build time and fed to BOTH consumers from that one value: the
HTML document (which the splash paints from, before the bundle exists) and a compile-time global
for any later in-application surface. Computing the SHA SHALL NEVER fail the build: when the git
metadata is unavailable the stamp falls back to a literal marker.

The stamp SHALL NOT print a version number while the project's package version is a placeholder.

#### Scenario: The stamp identifies the running build

- **WHEN** the splash is shown **THEN** its foot reads the short commit SHA and the build date, and
  those values are the same ones any in-application build surface would read

#### Scenario: A build without git metadata still builds

- **WHEN** the application is built from a source tree with no git metadata **THEN** the build
  succeeds and the stamp reads the fallback marker in place of a SHA

### Requirement: The splash can be bypassed by an init-script global, never by a URL

The Runtime SHALL skip the splash entirely when `window.__CG_SPLASH_DISABLED__` is set before
application JavaScript runs — the splash element is removed immediately and no hold is applied.

The bypass SHALL NOT be reachable through a URL query parameter, which an operator can reach by
bookmark or typo. When the global is absent the splash behaves normally.

#### Scenario: The automated suite is not taxed by the hold

- **WHEN** the test harness sets the bypass global before application JavaScript **THEN** no splash
  is shown and boot is not delayed

#### Scenario: The bypass is off by default

- **WHEN** no bypass global is set **THEN** the splash appears and holds normally

### Requirement: The splash honours reduced motion

The splash SHALL respect `prefers-reduced-motion: reduce`: no entrance animation, no rail
transition, and no fade — the splash appears in its settled state and is removed without a
transition.

#### Scenario: Reduced motion renders the settled splash

- **WHEN** the operator's system requests reduced motion **THEN** the splash renders with its mark,
  wordmark, rule, company line, tagline, rail and foot all fully visible and unanimated
