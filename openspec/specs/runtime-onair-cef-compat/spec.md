# runtime-onair-cef-compat Specification

## Purpose

TBD - created by archiving change persian-onair-cef-compat. Update Purpose after archive.

## Requirements

### Requirement: The served runtime bundle runs on the CEF baseline

Every CasparCG-facing JS artifact SHALL run on the CEF baseline —
**Chromium 71** (CasparCG 2.3 LTS, the declared support floor): no
newer-than-baseline built-in METHODS (e.g. `String.prototype.replaceAll`,
`String/Array.prototype.at`, `findLast`/`findLastIndex`, `Object.hasOwn`,
`Object.fromEntries`, `structuredClone`, `Promise.allSettled`/`any`,
`matchAll`) and no newer-than-baseline SYNTAX. Because esbuild `target`
lowers syntax only, method compatibility SHALL be enforced by guards of
its own: a bundle-artifact scan over the exact emitted bundle strings
(covering bundled dependencies) and a source-level compat lint on the
CasparCG-facing packages, sharing one curated banned list. Every
CasparCG-facing esbuild target SHALL be pinned to the baseline for syntax.

#### Scenario: The emitted bundles contain no banned built-ins

- **WHEN** the runtime bundles (ESM and IIFE) are emitted **THEN** a scan
  of the exact artifact text finds ZERO occurrences of the banned
  post-baseline built-ins — including inside bundled dependencies

#### Scenario: A reintroduced banned method fails the gate

- **WHEN** a call to a banned built-in (e.g. `replaceAll`) is introduced
  in a CasparCG-facing source package **THEN** the compat lint flags the
  offending line AND the bundle scan fails

#### Scenario: Placeholder replacement is CEF-safe and semantics-preserving

- **WHEN** a text binding replaces a placeholder that occurs multiple
  times **THEN** every occurrence is replaced (literal replace-all)
- **WHEN** the placeholder contains regex-special characters **THEN** it
  is still treated as a literal (no regex interpretation)

### Requirement: The served page boots on CEF, defines the CasparCG entrypoints, and surfaces boot failure visibly

The page CasparCG loads (the exported/served single-file HTML) SHALL, on a
CEF-baseline engine, complete its boot without throwing and define the
bare CasparCG entrypoints `window.play`, `window.update`, `window.stop`,
and `window.next`, such that a CasparCG-delivered `update(json)` reaches
the runtime and renders the field values (Persian included). If the boot
DOES fail, the page SHALL surface the failure visibly on the output (the
"cg boot error" surface) — never a silent blank page whose only trace is
"update is not defined" in the CEF log. The AMCP verb sequence is
unchanged: `CG ADD`/`CG PLAY`/`CG UPDATE` per ADR-0006 (hardware-validated;
`CG INVOKE`/`CALL` remain rejected as hardware-disproven).

#### Scenario: Boot completes and the entrypoints exist without replaceAll

- **WHEN** the boot sequence runs on an engine WITHOUT
  `String.prototype.replaceAll` (the CEF-71 emulation) against a Persian
  template with field defaults **THEN** no error is thrown, the bare
  `window.play/update/stop/next` are all defined, and a simulated
  `update('{"field":"<Persian>"}')` renders the Persian value

#### Scenario: A boot failure is visible on the output

- **WHEN** the served page's boot throws **THEN** the page renders a
  visible "cg boot error" message on the output (the produced HTML carries
  the try/catch + error surface)

### Requirement: Persian field payloads survive byte-exact to the CG ADD wire

Field values SHALL keep their exact Unicode codepoints end-to-end: from a
packed `.vcg`'s Persian field defaults through unpack and template
delivery, through the bridge's load, into the `CG ADD` data payload as
decoded by CasparCG's two un-escape layers — with ZERO `?` substitution
characters introduced anywhere on the path. This is UTF-8 INTEGRITY
coverage only — the B-041 escape rule (`quote()`) is unchanged and remains
the single canonical AMCP quoter.

#### Scenario: A packed .vcg's Persian defaults survive delivery

- **WHEN** a `.vcg` whose field default is Persian text is packed and then
  imported (unpack → delivery) **THEN** the delivered field default and
  the served scene literal carry the exact original codepoints

#### Scenario: The CG ADD payload decodes to exact Persian, zero "?"

- **WHEN** an item with a Persian field value is loaded through the bridge
  **THEN** the mock's two-layer decode of the sent `CG ADD` data yields
  the exact Persian codepoints and contains no `?` where the Persian was
