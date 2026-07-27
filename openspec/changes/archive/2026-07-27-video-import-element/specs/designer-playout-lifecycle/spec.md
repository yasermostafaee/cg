# designer-playout-lifecycle (D-128 delta)

## MODIFIED Requirements

### Requirement: Coordinated animated exit (Out) versus immediate clear (Stop)

The runtime SHALL expose two distinct exit operations — `out()` (animated) and
`stop()` (immediate) — that BOTH settle into the cleared terminal state but differ
in how the CONTENT (tickers / clocks / sequences) leaves RELATIVE TO the
background's close (the composition's authored `[outPoint → out]` outro). For
`out()`, the content SHALL animate off FIRST / with — a sensible default short
opacity fade for content that has no authored exit (a crawling ticker, a clock) —
sequenced via a promise so the background's outro plays LAST; the background SHALL
NEVER close over fully-visible content. For `stop()`, the content SHALL be halted
and hidden IMMEDIATELY and the background's close SHALL then play. The background's
authored `[outPoint → out]` keyframes SHALL be respected in both cases, and
content-first / background-last SHALL be the DEFAULT ordering when nothing is
choreographed. This coordination SHALL live in the runtime so the preview, the
exported single-file HTML, and on-air behave identically.

An **element that OWNS an outro** — a `lottie` element with an outro segment, or a
`video` element with a marked outro (`phases.outroStart` — D-128) — SHALL
play its OWN outro instead of the default fade/hide, on EVERY exit path: `out()`,
`stop()`, AND an exit the composition triggers itself (an `auto-out` hold expiry, a
content-driven completion, a zero-length hold, or a `loop-cycle` boundary — Phase
3b-2; until then the controller-triggered exits bypassed the seam).
The runtime SHALL expose an element-outro seam: on either exit it SHALL trigger each
such element's outro (the Lottie's `[outroStart → op]` segment; the video's
`[outroStart → clip end]` span), and the background's
close SHALL play only AFTER every element outro has finished (`Promise.all`
semantics) — so `stop()` on a scene containing a Lottie or an outro-owning video is
no longer a pure hard
hide, but still clears the non-owning content immediately. An element outro SHALL
freeze and resume with the scene under `pause()`/`resume()` in lockstep, a superseding
`stop()`/`play()`/`out()` SHALL supersede an in-flight element outro, and a degenerate
or absent element outro SHALL resolve IMMEDIATELY so it never strands the background's
close. The element outro SHALL be driven at most ONCE per exit episode no matter how
many triggers reach the exit (auto-exit then `stop()`, or the runtime awaiting the
registry then cascading `stop()` into the controllers): later triggers await an
in-flight outro, never re-drive it. There SHALL be ONE outro registry/ledger spanning
every outro-owning element kind — a second, per-kind ledger is exactly the divergence
this seam exists to prevent. This models `SequenceDriver`'s element-owned exit
(`whenComplete()` resolves late) and preserves the content-first / background-last
ordering and the CLEARED settle with every driver halted.

#### Scenario: Out animates the content off before the background closes

- **WHEN** `out()` is invoked on a composition whose content is a crawling ticker /
  a clock with a background that has an authored outro
- **THEN** the content animates out first (a default fade when it has no authored
  exit), and only after the content has left does the background play its outro —
  the background never closes over fully-visible content — and the composition then
  settles into the cleared terminal state

#### Scenario: Stop removes the content immediately, then closes the background

- **WHEN** `stop()` is invoked
- **THEN** the content drivers are halted and hidden immediately (gone before the
  background moves), the background then plays its close animation, and the
  composition settles cleared

#### Scenario: An auto-exit honours the element-owned outro (Phase 3b-2)

- **WHEN** a composition ends its own hold (auto-out expiry or content completion)
  while an element that owns an outro is holding
- **THEN** that element's outro plays to completion first, the background's close
  plays after it, and the composition settles cleared — the same ordering as
  `out()`/`stop()`, with the outro driven exactly once even if an operator exit
  arrives during it

#### Scenario: Authored background outro respected; content-first is the default

- **WHEN** a template has an authored background out-transition (its
  `[outPoint → out]` keyframes) and no explicit exit choreography
- **THEN** that authored background outro is played, and the content-first /
  background-last ordering is applied by default so the two never overlap with the
  background closing over visible content

#### Scenario: A Lottie plays its own outro before the background, on Out and Stop

- **WHEN** `out()` or `stop()` is invoked on a composition containing a holding
  `lottie` element with an outro segment
- **THEN** the Lottie plays its `[outroStart → op]` outro segment, the background's
  close plays only after that outro finishes, and the composition settles CLEARED
  with every driver halted — the background never closes over the still-animating
  Lottie

#### Scenario: A video plays its own outro before the background, on Out and Stop (D-128)

- **WHEN** `out()` or `stop()` is invoked on a composition containing a holding
  `video` element with a marked outro (`phases.outroStart`)
- **THEN** the video plays its `[outroStart → clip end]` outro span through the SAME
  element-outro seam, the background's close plays only after it finishes, and the
  composition settles CLEARED with every driver halted — the background never closes
  over the still-playing video

#### Scenario: A degenerate element outro does not strand the exit

- **WHEN** `out()` or `stop()` is invoked on a composition whose `lottie` element has
  no outro segment (absent phases or `outroStart ≥ op`) — or whose `video` element
  has no marked outro (absent `phases`, or `outroStart` at/past the clip end)
- **THEN** the element outro resolves immediately, the background's close plays, and
  the composition settles CLEARED — the exit never hangs on an unresolved element outro
