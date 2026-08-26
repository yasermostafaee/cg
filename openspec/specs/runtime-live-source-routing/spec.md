# runtime-live-source-routing Specification

## Purpose

TBD - created by archiving change stream-producer-arm. Update Purpose after archive.

## Requirements

### Requirement: A live source can be an internet STREAM, and a bad URL is refused at the config boundary

The producer union SHALL carry a fifth arm, `stream`, holding a URL — its own arm and NOT an
extension of `media`, because `media` is the one producer that needs no signal and a stream is its
opposite: it needs a signal and can drop. The bridge SHALL play it as
`PLAY <channel>-<layer> "<url>"` — the command the owner proved by hand on the plant — built at the
single AMCP construction seam with the URL quoted exactly once.

The URL's scheme SHALL be one of exactly nine — `http`, `https`, `rtmp`, `rtmps`, `rtsp`, `srt`,
`udp`, `rtp`, `mms` — a list that states WHAT THE CLIENT REQUIRES THE PRODUCT TO ACCEPT, never what
CasparCG or its linked ffmpeg supports (no source of truth for that is available); widening it is a
product decision, not a discovery. The rule SHALL be expressed ONCE, in the shared catalog
validator, so the bridge — at LOAD and at every CHANGE — and the offline mock refuse identically,
with a named refusal code whose operator sentence derives from the same wire constant.

The v1 scope is "type a URL and it plays": reconnect, stall detection and stream health are OUT of
scope, and nothing in the bridge models an alive-but-stalled stream — every arm either works or the
link to CasparCG is down. A stream SHALL require no aspect statement: with no `format`, the fit
falls through to the explicit `aspect` and then to `null`, the same branch `AUTO` lands on.

#### Scenario: An operator defines a stream and it reads as a feed, not a clip

- **WHEN** the operator picks the `stream` kind for a source **THEN** the modal offers it as a
  fifth, stream-labelled option beside the four existing kinds, and choosing it renders a URL field
- **WHEN** the source is listed **THEN** its summary reads as a stream, so a second operator reading
  the config can tell a feed from a clip

#### Scenario: A scheme outside the nine is refused at the boundary, never at take

- **WHEN** a catalog is set containing a `stream` URL whose scheme is outside the nine **THEN**
  `sources.set-config` refuses it with the named refusal code and a message naming the offending
  scheme, and nothing is persisted or reaches the wire
- **WHEN** a catalog file containing such a URL is hand-written and LOADED **THEN** the same
  validator refuses it with the same code — one spelling of the rule
- **WHEN** the refusal reaches the operator **THEN** it is a sentence derived from the shared reason
  union, never a wire identifier and never a bare code

#### Scenario: All nine accepted schemes play

- **WHEN** a `stream` URL uses any of the nine schemes, in any letter case **THEN** the catalog
  accepts it, and a take of a plate assigned to it emits `PLAY <channel>-<layer> "<url>"` with the
  URL byte-exact — `quote()`'s escape set contains no character a URL carries

#### Scenario: The ledger records what was sent

- **WHEN** a stream producer is seated **THEN** the ledger's `producer` field records the concrete
  URL argument as sent, through the same function the `PLAY` was built from

#### Scenario: A stream states no aspect unless told

- **WHEN** a `stream` source states no `format` **THEN** the fit falls through to the explicit
  `aspect` and then to `null` — the same branch `AUTO` lands on — and no new required field exists

#### Scenario: The media arm is not narrowed

- **WHEN** a URL is typed into a `media` producer's file field (the pre-C-025 workaround) **THEN**
  it still parses and still passes validation — closing the expression gap does not break configs
  that used the workaround

### Requirement: A live plate's picture is FITTED into its box by a selectable mode, and is never cut under the default

A live plate SHALL carry a FIT MODE selecting how a source whose aspect differs from its box is
placed:

- **`contain`** — the DEFAULT. The whole picture, its own aspect intact, centred on BOTH axes
  inside the box. Nothing SHALL be cropped, and the leftover margin on the short axis SHALL show
  the template's own background — never the channel behind the CG layer.
- **`cover`** — scale to COVER the box with the proportions intact and clip the overflow away,
  centred so the crop takes evenly from both edges.

The fit SHALL be computed by ONE function, from which BOTH the bridge's `MIXER FILL` / `MIXER CLIP`
and the template's mask hole are derived. Neither consumer SHALL re-derive any part of it.

The mode SHALL be resolvable from the operator's per-assignment override, then the element's
authored value, then `contain`. The aspect chain (`D-147`) is a SEPARATE concern and is unchanged:
the source outranks the author for the ASPECT, while the operator outranks the author for the MODE.

CasparCG applies NO aspect correction of its own — measured on the plant, 2026-08-25, production
2.5.0 `69e8ad5` — so the source-aspect correction in `MIXER FILL` is REQUIRED and does not
double-count.

#### Scenario: A source WIDER than its box keeps its whole picture

- **WHEN** a plate's fit mode is `contain` and the source aspect is WIDER than the box **THEN** the
  picture is scaled to the box's WIDTH, centred vertically, and the whole picture is visible — no
  crop on either axis

#### Scenario: A source TALLER than its box keeps its whole picture

- **WHEN** a plate's fit mode is `contain` and the source aspect is TALLER than the box **THEN** the
  picture is scaled to the box's HEIGHT, centred horizontally, and the whole picture is visible

#### Scenario: The mask hole is punched at the fitted rect, so the margin shows the template

- **WHEN** a plate is fitted under `contain` **THEN** the template's mask hole is punched at the
  FITTED rect, not the box rect, so the margin shows the template's own background and NEVER the
  channel behind the CG layer

#### Scenario: The wire geometry and the mask hole come from one computation

- **WHEN** the fitted rect is computed **THEN** the bridge's `MIXER FILL` / `MIXER CLIP` and the
  template's mask hole are derived from THE SAME single computation, and a test asserts the two
  agree for the same plate, in the same units

#### Scenario: `cover` is byte-identical to today

- **WHEN** a plate's fit mode is `cover` **THEN** the behaviour is byte-identical to today's: scale
  to cover, centre-crop, hole at the box rect, refusal on aspect mismatch

#### Scenario: An unknown aspect produces no fit in either mode

- **WHEN** no aspect is known for a plate — `resolvePlateAspect` returns `assumed: true` — **THEN**
  there is no fit in either mode, no refusal, and the picture fills the box exactly as today

#### Scenario: A matching aspect renders identically under both modes

- **WHEN** a plate's aspect MATCHES its box within tolerance **THEN** `contain` and `cover` produce
  the SAME rect, and it is byte-identical to today's

### Requirement: The aspect-mismatch refusal is conditional on the fit mode, and never loses its reason

A take SHALL NOT be refused for an aspect mismatch under `contain`. The refusal exists because
cropping would cut a part of the picture the author never saw; under `contain` nothing is cropped,
so that harm cannot occur.

The refusal SHALL NOT be deleted: the `cover` path still needs it, and deleting a refusal is how the
harm it guarded returns unnoticed. Under `contain` the same condition SHALL be reported as a
NON-BLOCKING warning naming the SAME facts — the plate, the author's aspect and the source's.

⚠ The warning's CONSEQUENCE clause SHALL state what is true under `contain`. The shipped sentence
_"Cropping it would cut a part of the picture the author never saw"_ is FALSE where nothing is
cropped, and repeating it verbatim would hand the operator a reason that does not apply to what they
are looking at — a way of LOSING the reason, not of keeping it. `cover` keeps its wording unchanged.

#### Scenario: `contain` warns instead of refusing

- **WHEN** a plate's fit mode is `contain` and `expectedAspect` disagrees with the source beyond
  `ASPECT_MATCH_TOLERANCE` **THEN** the take is NOT refused — at most a non-blocking warning is
  reported, because nothing is cropped
- **WHEN** that warning is reported **THEN** it names the plate and both aspects exactly as the
  refusal does, and states the consequence that is true under `contain` — the picture will not fill
  the box the author drew

#### Scenario: `cover` still refuses

- **WHEN** a plate's fit mode is `cover` and the same disagreement exists **THEN** the take is still
  refused with `LIVE_PLATE_ASPECT_MISMATCH` and the same message

### Requirement: The page is TOLD the installation facts its mask depends on

The page SHALL be TOLD the resolved source aspect and fit mode, and SHALL NOT derive them itself
while the bridge derives them from the assigned source. Both are INSTALLATION facts the scene does
not carry; two derivations of one hole is the on-air crosstalk `B-149` closed.

The bridge SHALL carry the resolved aspect and mode per plate to the page over the existing reserved
`__cg` control key on the `CG UPDATE` payload, extending it rather than minting a second transport.
The WIRE SHALL carry the two facts, never the rect: the box rect is the page's own fact, read back
from its current layout, and each side applies the one fit function to the box it holds.

Where no control payload has been received, the page SHALL fall back to the scene's own statement —
the element's `expectedAspect` and `fitMode` — so an authoring preview shows what the author
declared, and an absent aspect produces no fit at all.

#### Scenario: A plate's fit facts reach the page with the take

- **WHEN** a template is taken **THEN** the `CG ADD` payload carries each plate's resolved aspect and
  fit mode under the reserved control key
- **WHEN** the page receives them **THEN** it re-punches its holes from those facts, through the same
  function the bridge used

#### Scenario: Control data cannot be mistaken for a field value

- **WHEN** a payload carrying plate fit facts is applied **THEN** the reserved key is stripped before
  anything treats the payload as field values, exactly as it is for the active look
