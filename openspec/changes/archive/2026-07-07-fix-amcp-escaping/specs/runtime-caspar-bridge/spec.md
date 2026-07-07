# runtime-caspar-bridge (B-041 — correct AMCP string escaping)

## MODIFIED Requirements

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / play / update / clear for HTML
producers) behind a small command-construction seam, so the verified sequence is
isolated from the session / queue / reconciler. The sequence is:
`load → CG ADD` **with play-on-load OFF** (loaded, not playing), `take → CG PLAY`
(preceded by a re-issued `CG ADD` when no live producer exists on the slot),
**`update → CG UPDATE`**, `out → CLEAR`. `CG UPDATE` remains the
**hardware-validated** (CasparCG 2.3.2 `4de6d18f`, ADR 0006) way to deliver a
Persian-laden JSON payload to `window.update` intact.

Every AMCP string argument SHALL be quoted by a **single canonical quoter** (one
source of truth), applied **exactly once** per argument. Because the data argument
is already a `JSON.stringify` string (the JSON layer has escaped `"`, `\`, and
newline), the AMCP layer SHALL escape **only what CasparCG 2.3.x's quoted-string
parser requires** — a `"` → `\"` (the one escape CasparCG un-escapes) — and SHALL
NOT re-escape backslashes (which would double them and corrupt the payload). A JSON
payload containing `"`, `\` (any count), or a newline SHALL therefore survive
`CG ADD` and `CG UPDATE` byte-exact to what the template's `JSON.parse` receives.
The load/take/out/retake cycle AND the special-character payload SHALL be
re-validated on real CasparCG before B-041 closes.

#### Scenario: The verified update sequence is applied at the seam

- **WHEN** the bridge updates a playing HTML producer **THEN** it issues the
  hardware-validated `CG UPDATE` via the command-construction seam — established on
  real CasparCG 2.3.2 (ADR 0006) — without changes to `ServerSession` /
  `CommandQueue` / `Reconciler`

#### Scenario: Special characters survive the AMCP data argument

- **WHEN** a field value contains a double-quote, a backslash (odd or even count),
  or a newline **THEN** the canonical quoter (applied once over the JSON payload)
  produces a `CG ADD` / `CG UPDATE` data argument that round-trips byte-exact: the
  value reaches the template's `JSON.parse` unchanged (Persian intact), with no
  double-escaping

### Requirement: Template resolution is validated, not blind-acked

`tools/amcp-mock` SHALL stop blind-acking `CG ADD`: it SHALL resolve the template
argument (for a URL, an HTTP `GET` — `404 CG ADD FAILED` when it does not return a
page; a bare id → `404`) and SHALL expose the `CG ADD` / `CG UPDATE` data payload so
tests can assert it. The mock SHALL decode quoted arguments per **real CasparCG
2.3.x rules** (un-escape only `\"` → `"`; every other character, including `\`,
literal), **independently of the bridge's own escaper**, so a double-escaped payload
is decoded WRONG (caught) and only a correctly single-escaped payload decodes to the
original. Integration tests SHALL `JSON.parse` the decoded data argument and assert
it equals the original object.

#### Scenario: Mock 404s an unresolvable template reference

- **WHEN** `CG ADD` references a bare id or a URL the mock cannot `GET` **THEN** the
  mock returns `404 CG ADD FAILED` (matching real CasparCG)

#### Scenario: Mock decodes the data arg per real CasparCG and catches double-escaping

- **WHEN** a `CG ADD` / `CG UPDATE` data argument is decoded by the mock **THEN** it
  un-escapes only `\"`→`"` (backslashes literal) and the test `JSON.parse`s the
  result: a correctly single-escaped payload equals the original object, while the
  old double-escaped payload decodes to a different (corrupted) object — so the
  regression fails the test instead of passing silently
