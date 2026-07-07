# runtime-caspar-bridge (B-038 Phase 1 — shared single-file exporter)

## ADDED Requirements

### Requirement: The single-file HTML exporter is a shared, browser-importable package

The scene → self-contained-HTML single-file export SHALL live in one shared,
browser-tier package (`@cg/single-file-export`) consumed by BOTH the Designer and
the Runtime — exactly one exporter and one runtime bundle, no per-app copy. The
package SHALL contain no Node-only APIs that would break browser bundling. This is
the architectural precondition for the bridge to obtain render HTML (B-038
Phase 2+); extracting it SHALL NOT change the produced HTML.

#### Scenario: One exporter, both apps

- **WHEN** the Designer's export feature and the Runtime both need the single-file
  HTML **THEN** they import the same `@cg/single-file-export` package (one
  exporter, one bundle), and both build green

#### Scenario: Extraction preserves byte-identical export output

- **WHEN** the Designer exports a composition after the extraction **THEN** the
  produced HTML is byte-identical to before — same base64-inlined fonts and images,
  same IIFE runtime, same scene literal — as proven by the existing single-file
  export unit tests and the D-019 export E2E
