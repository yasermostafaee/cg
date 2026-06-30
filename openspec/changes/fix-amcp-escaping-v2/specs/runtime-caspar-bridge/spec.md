# runtime-caspar-bridge (B-041 take 2 — AMCP escaping inverts CasparCG's real un-escape)

## MODIFIED Requirements

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / play / update / clear for HTML
producers) behind a small command-construction seam, with the verified sequence
`load → CG ADD` (play-on-load OFF), `take → CG PLAY`, `update → CG UPDATE`,
`out → CLEAR` (ADR 0006).

Every AMCP string argument SHALL be quoted by a **single canonical quoter** applied
exactly once. The quoter SHALL produce a data argument that, after **CasparCG
2.3.x's actual quoted-string un-escape** — which converts `\n` (backslash-n) to a raw
newline and processes backslash escapes (so backslashes are NOT literal; the #245
"quotes-only" assumption is disproven by hardware) — reproduces the original
`JSON.stringify` payload **byte-exact** at the template's `JSON.parse`, for values
containing `"`, `\` (odd AND even counts), and a newline (Persian intact). The
canonical quoter SHALL NEVER emit a raw control character (`0x0A`/`0x0D`) to the
wire (which would break AMCP line framing). The exact escaping SHALL be determined
empirically against real CasparCG 2.3.2 (an escape-matrix harness) and re-validated
on hardware before B-041 closes.

#### Scenario: Special-character payload round-trips through CasparCG's real un-escape

- **WHEN** a field value containing `"`, a backslash (odd or even count), or a
  newline is sent via `CG ADD` / `CG UPDATE` **THEN** after CasparCG 2.3.x un-escapes
  the quoted argument the template's `JSON.parse` receives the original value
  byte-exact — in particular a newline arrives as a valid JSON string (no raw `0x0A`
  inside the string literal, no `SyntaxError`)

#### Scenario: The wire carries no raw control characters

- **WHEN** the canonical quoter encodes any value **THEN** the emitted argument
  contains no raw `0x0A`/`0x0D` (newlines are carried as an escape sequence that
  survives CasparCG's un-escape), so AMCP line framing is never broken

### Requirement: Template resolution is validated, not blind-acked

`tools/amcp-mock` SHALL stop blind-acking `CG ADD` (resolve the template arg; `404`
on an unresolvable reference) and SHALL expose the `CG ADD` / `CG UPDATE` data
payload. It SHALL decode quoted arguments by **real CasparCG 2.3.x rules**
(independently of the bridge's escaper) AND SHALL detect a decoded payload that
contains a raw control character or fails `JSON.parse`, so a framing/JSON-breaking
payload is caught rather than silently passed. Integration tests SHALL `JSON.parse`
the decoded data argument and assert it equals the original object across the full
special-character matrix.

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
