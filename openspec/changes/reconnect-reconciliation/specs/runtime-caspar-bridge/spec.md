# runtime-caspar-bridge (reconnect reconciliation — B-038 follow-up + B-048)

## MODIFIED Requirements

### Requirement: Live connection is never silently downgraded

A connection chosen as live SHALL NOT be silently replaced by the mock. A
mid-session loss of the bridge SHALL surface as a visible disconnected state with
rejected commands, never as on-air or mock activity. On reconnect the renderer
SHALL FIRST re-deliver every retained template (`{ template, html }` over
`templates.import`) and THEN re-pull the full snapshot (stack / health / lock),
so a load issued after the reconnect resolves against a populated bridge
registry.

#### Scenario: Bridge drops mid-session

- **WHEN** the WebSocket to a previously-connected bridge drops **THEN**
  `WebSocketRuntime` enters a visible DISCONNECTED/reconnecting state and
  take / update / out are rejected with a clear error (NOT shown as on-air, NOT
  routed to a mock)
- **AND** on reconnect the renderer first re-delivers each retained template,
  then re-pulls a full snapshot (stack / health / lock) to resync

#### Scenario: Command issued while disconnected

- **WHEN** the operator issues take / update / out while the bridge is down
  (disconnected/reconnecting) **THEN** the command is rejected with a visible
  error and is never shown optimistically as on-air

#### Scenario: A re-delivery failure does not abort the resync

- **WHEN** one template's re-delivery fails on reconnect **THEN** the failure
  surfaces as a visible error **AND** the remaining re-deliveries and the
  snapshot re-pull still run

### Requirement: The bridge retains delivered template HTML keyed by id

The bridge's in-memory template registry SHALL store the delivered HTML keyed by
`templateId` alongside the `TemplateInfo` it already holds. Re-importing the same
id SHALL replace the stored HTML (and info). The registry SHALL expose the stored
HTML by id so a later phase can serve it over HTTP (`GET /template/<id>`) and
resolve the `CG ADD` URL to it. The registry holds the HTML only — it does **not**
serve it in this phase. The store is in-memory (empty on bridge restart); the
browser retains each delivered payload for the life of the page and re-delivers
it on reconnect (see "The browser re-delivers retained templates on reconnect"),
so a bridge restart no longer requires a manual re-import while the page stays
open. A restart of BOTH the bridge and the page still requires a manual
re-import — persisting the `.vcg` bytes via `@cg/storage` is the documented
follow-up.

#### Scenario: Import retains the HTML by template id

- **WHEN** a `templates.import` for id `X` arrives over the WebSocket **THEN** the
  bridge stores the HTML so the registry returns exactly that HTML for id `X`, and
  `templateGet` / `templateList` still surface its `TemplateInfo`

#### Scenario: Re-import replaces the stored HTML

- **WHEN** a second `templates.import` for the same id `X` arrives with different
  HTML **THEN** the registry returns the new HTML for id `X` (the prior HTML is
  replaced, not duplicated)

#### Scenario: Unknown id has no stored HTML

- **WHEN** the registry is queried for the HTML of an id that was never imported
  **THEN** it returns nothing (null), with no error

### Requirement: Template resolution is validated, not blind-acked

`tools/amcp-mock` SHALL model real CasparCG's `CG ADD` acceptance instead of
blind-acking or over-validating: a **bare (non-URL) template reference** SHALL
fail with `404 CG ADD FAILED` (the real template-path miss), while a **URL
reference SHALL be acked `202` immediately** — real CasparCG performs no fetch
before the ack — and resolved **asynchronously**: the mock SHALL record a
per-slot fetch verdict (resolved / failed) and a producer whose page failed to
resolve SHALL be observably not rendering (mirroring the html producer's async
CEF load, where a load failure yields empty frames). Tests SHALL assert
delivery through the recorded verdict, not through a synthetic AMCP failure —
the unregistered-load case is rejected by the **bridge's own guard** before any
AMCP send. `CG UPDATE` on a layer with no producer SHALL fail `403` (real
CasparCG's expected-proxy check). The mock SHALL expose the `CG ADD` /
`CG UPDATE` data payload. It SHALL decode quoted arguments by **real CasparCG
2.3.x rules** (independently of the bridge's escaper) AND SHALL detect a
decoded payload that contains a raw control character or fails `JSON.parse`,
so a framing/JSON-breaking payload is caught rather than silently passed.
Integration tests SHALL `JSON.parse` the decoded data argument and assert it
equals the original object across the full special-character matrix.

#### Scenario: Mock 404s a bare template reference but 202s a URL

- **WHEN** `CG ADD` references a bare (non-URL) id **THEN** the mock returns
  `404 CG ADD FAILED` (matching real CasparCG's template-path miss)
- **AND WHEN** `CG ADD` references an `http(s)://` URL **THEN** the mock returns
  `202` immediately and records the asynchronous fetch verdict for the slot

#### Scenario: A dead served URL is a silent blank, caught by the verdict

- **WHEN** `CG ADD` references a URL whose `GET` does not return a page **THEN**
  the command still `202`s (as real CasparCG does) **AND** the recorded verdict
  marks the slot unresolved **AND** a subsequent `CG PLAY` renders nothing
  observable

#### Scenario: Update on an empty layer is 403

- **WHEN** `CG UPDATE` targets a layer with no producer **THEN** the mock returns
  `403` (matching real CasparCG)

#### Scenario: Mock catches a raw-newline / un-parseable payload

- **WHEN** a decoded `CG ADD` / `CG UPDATE` data argument contains a raw newline or
  does not `JSON.parse` **THEN** the mock surfaces it as a failure (not a `202`-style
  silent pass), so the regression that reached the template as a `SyntaxError` is
  caught in CI

#### Scenario: Integration asserts byte-exact round-trip across the matrix

- **WHEN** the bridge drives the hardened mock with a payload containing `"`, `\`
  (odd + even), a newline, a tab, and Persian **THEN** the mock decodes per the real
  CasparCG rule and `JSON.parse`s the data argument to a byte-exact match of the
  original object

### Requirement: Playout verbs are chosen from producer state (prescriptive)

The bridge SHALL choose the AMCP playout verb sequence from the **actual per-slot
producer state**, not blindly. It SHALL track, bridge-side, whether a live producer
currently exists on each stack item's slot — independent of the descriptive
`Reconciler` status — and keep that bookkeeping consistent across load / take / out /
remove and across a failover (commands fan out to both servers, so producer
existence is identical on each).

- **load** SHALL issue `CG ADD` only, with the **play-on-load flag OFF** — the
  producer is loaded, NOT playing. A load whose `templateId` is not registered
  with the bridge SHALL be rejected (`errorCode: 'unknown-template'`, nothing
  sent) — never a blind ADD of a URL the bridge cannot serve.
- **layer adoption**: the FIRST `CG ADD` a bridge process issues onto a layer
  SHALL be preceded by a `CLEAR` of that layer, issued BEFORE the item's slot
  assignment and OSC interest — destroying any producer orphaned by a previous
  bridge session so the orphan's state can never route to the fresh item. Any
  bridge-issued `CLEAR` (adoption, out, remove) marks the layer adopted for the
  process's lifetime. The bridge SHALL NOT blind-clear layers at startup: an
  orphan the operator wants on air rides through a controller restart untouched
  until a load targets its layer.
- **take** SHALL issue `CG PLAY`; but WHEN no live producer exists on the slot (e.g.
  a prior out destroyed it) it SHALL FIRST re-issue `CG ADD` (a fresh load), THEN
  `CG PLAY`.
- **out** SHALL exit + `CLEAR` (destroying the producer) and SHALL update the
  producer-existence bookkeeping so a subsequent take re-ADDs. The slot stays
  reserved to the (still-on-stack, idle) item until remove.
- **remove** SHALL fully remove the item (clear + deallocate the layer + drop the
  bookkeeping).
- **update** (B-070) SHALL issue `CG UPDATE` ONLY while a live producer exists on
  the slot — `CG UPDATE` needs a PRODUCER, not air, and real CasparCG `403`s it on
  a producerless layer. WHEN no live producer exists (a prior out destroyed it; a
  reconnect or `setConfig` rebuilt the bookkeeping), the update SHALL still COMMIT
  the operator's fields to the authoritative field-set, SHALL send NO AMCP command,
  SHALL settle its transient intent in-process, and SHALL be reported as
  `accepted` — the next take's re-ADD carries exactly those fields to air through
  `CG ADD`'s data payload. An update is NEVER gated on the item being ON AIR: a
  loaded-not-taken item has a live producer and updates on the wire like any other.

#### Scenario: Load does not auto-play

- **WHEN** the operator loads a template **THEN** the bridge issues `CG ADD` with
  play-on-load OFF and the producer is loaded but NOT playing (nothing on air until
  take)

#### Scenario: Take plays the loaded producer

- **WHEN** a loaded template is taken **THEN** the bridge issues `CG PLAY` and the
  producer plays

#### Scenario: Out destroys the producer

- **WHEN** a playing template is taken out **THEN** the bridge issues `CLEAR`, the
  producer is destroyed, and the bridge records that no producer exists on that slot

#### Scenario: Take after Out re-ADDs then plays

- **WHEN** a template that was taken out is taken again **THEN** the bridge — seeing
  no live producer on the slot — FIRST re-issues `CG ADD` (a fresh load) and THEN
  `CG PLAY`, so the template renders again (it does not `CG PLAY` an empty layer)

#### Scenario: Producer existence drives the choice, not the descriptive status

- **WHEN** the bridge decides between `CG PLAY` and re-ADD-then-`CG PLAY` **THEN** it
  uses its own per-slot producer-existence bookkeeping (not the `Reconciler` status,
  which is descriptive and does not choose verbs)

#### Scenario: First load onto a layer adopts it with a CLEAR

- **WHEN** a fresh bridge session loads a template whose allocated layer still
  hosts a producer from a dead session **THEN** the bridge issues
  `CLEAR <ch>-<layer>` before the `CG ADD` **AND** the fresh item's status is
  driven only by its own producer — it never shows `on-air` from the orphan's
  OSC before take

#### Scenario: No blind startup clear

- **WHEN** the bridge starts **THEN** it issues no `CLEAR` until a load targets a
  layer — an on-air orphan on an untargeted layer stays on air

#### Scenario: A load of an unregistered template fails fast

- **WHEN** a load references a `templateId` the bridge registry does not hold
  **THEN** the load is rejected with `errorCode: 'unknown-template'` and no AMCP
  command is sent

#### Scenario: Update on a producerless slot commits without touching the wire

- **WHEN** the operator applies field edits to an item whose slot holds NO live
  producer (e.g. it was taken out) **THEN** the bridge commits the fields to the
  authoritative field-set, sends NO `CG UPDATE`, settles the intent, and answers
  `accepted: true` — it does not fire a `CG UPDATE` that CasparCG would `403`

#### Scenario: The committed fields reach air on the next take

- **WHEN** a producerless item whose fields were updated is then taken **THEN**
  the B-039 re-ADD's `CG ADD` data payload carries exactly those updated fields,
  so the edit made while the item was idle renders on air

#### Scenario: Update on a live producer still rides CG UPDATE

- **WHEN** the item's slot holds a live producer (loaded, or on air) **THEN** the
  update is sent as `CG UPDATE` exactly as before — the AMCP line and the
  canonical quoter are unchanged (ADR-0006)

#### Scenario: A refused update explains itself and never poisons the item

- **WHEN** CasparCG errors a `CG UPDATE` on a producer-bearing slot **THEN** the
  bridge answers `accepted: false` WITH an `errorCode` carrying the real AMCP
  reason **AND** the item's transient intent SETTLES to a terminal state — it
  never rests `pending`, so a single refused update cannot permanently block the
  item's later intents (R-011's `setPosition` refuses while `pending`)

## ADDED Requirements

### Requirement: A refused playout command reports a machine-readable reason

Every playout channel that can refuse SHALL answer with an `errorCode` naming the
cause, so the operator sees WHY rather than a bare "not accepted". `stack.update`
SHALL carry `errorCode` alongside `accepted` (mirroring `stack.take`), and the
Runtime SHALL surface that reason at the control that was pressed.

A transient intent SHALL reach a terminal state on EVERY outcome — an OK ack, a
failed ack, or the bounded-timeout expiry. A failed ack is a SETTLEMENT (a known,
reported failure), never an indefinitely-`pending` limbo: an item may not be left
in a state where a later intent is refused because an earlier command failed.

#### Scenario: A refused update names its cause

- **WHEN** an update is refused because CasparCG errored the command **THEN** the
  response carries `errorCode` (e.g. `amcp-403`) **AND** the Runtime shows a
  reason at the Update control, not the generic "Not accepted."

#### Scenario: A failed ack settles the item

- **WHEN** any playout command's ack reports failure **THEN** the item's intent
  settles to a terminal state and `pending` clears, with the failure surfaced as
  the item's `errorCode`

#### Scenario: An errored command is not a divergence

- **WHEN** a command fails with an explicit error **THEN** the item is NOT reported
  as divergent — divergence detection is for intents left SILENTLY unconfirmed,
  and an errored command is a known, terminal failure

### Requirement: The browser re-delivers retained templates on reconnect

`WebSocketRuntime` SHALL retain, in memory for the life of the page, the exact
`{ template, html }` payload of every successful `templates.import`, keyed by
`templateId` — a re-import replaces the retained payload. On every reconnect it
SHALL re-deliver each retained payload exactly once over `templates.import`,
BEFORE re-pulling the stack/health/lock snapshot. Retention SHALL be cleared on
dispose. Scope: reconnect-without-reload — a page reload loses retention (the
bridge-side registry covers the reload-with-live-bridge case; a restart of both
requires a manual re-import until `.vcg` persistence via `@cg/storage` lands).

#### Scenario: Retain on import, replace on re-import

- **WHEN** `templates.import` succeeds for id `X` **THEN** the runtime retains
  exactly the delivered `{ template, html }` **AND** a later import of `X`
  replaces the retained payload (never duplicates)

#### Scenario: Reconnect re-delivers exactly the retained set

- **WHEN** the WebSocket reconnects after a mid-session drop **THEN** each
  retained template is re-imported exactly once, before the snapshot re-pull,
  so the bridge registry again serves every template the operator had imported

#### Scenario: A post-restart load needs no manual re-import

- **WHEN** the bridge process restarts while the page stays open **AND** the
  operator loads a previously-imported template after the link relinks **THEN**
  the load succeeds and `CG ADD` references a URL the bridge serves — no manual
  re-import

#### Scenario: Retention dies with the page

- **WHEN** the page reloads **THEN** retention is empty (no re-delivery occurs);
  with the bridge still up the library re-populates from the bridge's registry
  and loads keep working
