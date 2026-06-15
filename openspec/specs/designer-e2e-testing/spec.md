# designer-e2e-testing Specification

## Purpose

TBD - created by archiving change add-designer-e2e-testing. Update Purpose after archive.

## Requirements

### Requirement: The Designer runs in an E2E test mode with no native dialogs

The Designer SHALL boot the SAME shipped build in an E2E test mode when
`window.CG_E2E === true` (set before app JS by the Playwright harness, so a normal
user cannot trigger it). In test mode the platform SHALL use in-memory storage
(`MemoryWorkspace` + `MemoryKv`), fresh per page load, so runs are isolated and
deterministic and never touch OPFS or the File System Access API. The harness SHALL
neutralize native pickers (`showSaveFilePicker` / `showOpenFilePicker` /
`showDirectoryPicker`) and auto-dismiss `alert`/`confirm`, so no E2E run blocks on a
native dialog.

#### Scenario: Test mode uses isolated in-memory storage

- **WHEN** the Designer boots with `window.CG_E2E === true`
- **THEN** it uses `MemoryWorkspace` + `MemoryKv` (no OPFS / File System Access), and
  no prior run's data leaks into the new page

#### Scenario: No native dialog blocks an E2E run

- **WHEN** a test exercises a flow that would normally open a native file dialog
  (save, export to disk, connect folder, import asset)
- **THEN** the run does not block — pickers are neutralized (disk save / export fall
  back to a capturable download) and the test proceeds headless

### Requirement: Reusable Playwright fixtures for Designer actions

The harness SHALL provide a documented, stable page-object fixture exposing helpers
for the common Designer actions, so a test composes from them rather than rewriting
boilerplate. The helpers SHALL include at least: create a composition, add a text
element, set a data key, bind from canvas, open the preview modal, the preview
transport (play / pause / stop / next), add a keyframe via the diamond, drag a shape,
nest a composition instance, set playout timing, set a preview field value, and
export single-file HTML.

#### Scenario: A test composes from fixtures

- **WHEN** a new E2E test is written
- **THEN** it drives the Designer through the shared fixture helpers (e.g.
  `newComposition` → `addTextElement` → `setDataKey` → `openPreviewModal`), not
  ad-hoc selectors duplicated per test

### Requirement: E2E covers the critical Designer flows

The suite SHALL cover the critical end-to-end flow: create a composition, add a text
element with a data key, open the preview and edit the field value live, run the
lifecycle (play → hold → stop), and export a single-file HTML.

#### Scenario: Critical flow passes end to end

- **WHEN** the critical-flow E2E runs
- **THEN** a composition is created, a text element with a data key is added, the
  preview reflects a live field edit, play/hold/stop behave, and a single-file HTML
  export is produced

### Requirement: E2E regression-guards the recently-fixed bugs

The suite SHALL include E2E regressions for the recently-fixed bugs: the keyframe
diamond captures the current value; colour edits sync the display and the shape;
"Bind from canvas" adds exactly one binding and disables when bound; the data-key
input shows the selected element's own value on selection change; per-composition and
nested namespaced fields update in the parent preview; the nested-lifecycle cascade
plays/holds/stops children; and per-scope preview timing applies per scope.

#### Scenario: Recent regressions stay fixed

- **WHEN** the regression E2E specs run
- **THEN** each recently-fixed behavior is verified through the UI, so a regression
  in any of them fails the suite

### Requirement: E2E runs in CI as a required job, separate from the fast unit gate

E2E SHALL run in CI as a SEPARATE required job (install + cache the browser, build,
then `pnpm test:e2e`) and SHALL NOT be folded into the fast per-change unit gate
(format / typecheck / lint / unit test / build). It SHALL also be runnable locally
via `pnpm test:e2e`.

#### Scenario: CI runs E2E in its own required job

- **WHEN** CI runs for a pull request
- **THEN** the E2E suite runs in its own job (kept out of the fast unit gate) and must
  be green for the PR

### Requirement: New user-facing behavior must add an E2E test mapping its scenarios

Every change that adds user-facing Designer behavior SHALL add an E2E test that maps
its OpenSpec `#### Scenario`s to Playwright steps, composed from the shared fixtures.
The CLAUDE.md working guide SHALL document this rule and the "how to add an E2E test"
pattern, so future features inherit coverage by default rather than by memory.

#### Scenario: A feature change carries its E2E test

- **WHEN** a change adds user-facing behavior with OpenSpec scenarios
- **THEN** it includes an E2E test whose steps map those scenarios, using the shared
  fixtures, and CLAUDE.md documents this as a required part of the workflow
