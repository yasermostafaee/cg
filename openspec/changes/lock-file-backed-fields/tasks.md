# Tasks — file-only and locked live-file fields

## 1. Shared contracts

- [x] 1.1 Add the optional file-source policy only to text/multiline/list field variants, with
      canonical grant/mode/path/lock helpers and safe-relative-path validation.
- [x] 1.2 Add and export the typed `textSources.read` IPC channel and cover channel registry/schema.
- [x] 1.3 Prove legacy `allowFileSource`, policy validation and `.vcg` round trips in tests.

## 2. Designer authoring

- [x] 2.1 Extend field meta mutation/rebuild so unrelated edits preserve policy and incompatible
      field kinds drop it.
- [x] 2.2 Add File only, relative Bridge path and Lock file controls to Dynamic/Data, with lock
      unavailable until the path is valid.
- [x] 2.3 Add DOM/store tests for independent options, invalid paths and persistence.
- [x] 2.4 Replace manual path typing with native shared-file Browse, current-content preview and a
      text-list delimiter choice; store only the Bridge-relative filename.
- [x] 2.5 Add an Edit-menu delimiter catalogue with persistent custom add/edit/remove/reset choices;
      preview selected bytes through the field's canonical scalar/list transform without saving the
      bytes as its authored default.
- [x] 2.6 Keep the selected-file bytes as one Designer-session preview shared by Dynamic/Data,
      the canvas and the composition Preview; restore it after selection changes, show the native
      Windows/UNC source path, hide the duplicate Inspector Items/Rows section, and keep authored
      fallback items out of preview surfaces while a current file is selected.
- [x] 2.7 Add a direct **Use fixed file** checkbox workflow for the file-only + locked case: hide
      Items/Rows and reveal Browse immediately when checked, synthesize the
      runtime field/binding under a reserved internal id, require no authored Data key, hide that
      implementation field from Variables, seed a list with an explicit new-line delimiter instead
      of a CG Control default, keep its action/status in a visible independent Inspector section
      outside Dynamic/Data, and restore Items/Rows when unchecked.
- [x] 2.8 Redesign Manage delimiters as a legible table with aligned icon actions, a separated
      add/edit form, explicit confirmation and a quiet reset area.
- [x] 2.9 Move file content, delimiter selection and interpreted values into a large dedicated modal;
      make File-only fields read-only in composition Preview; and place ordinary Items/Rows after
      Filter and before Dynamic/Data while continuing to hide them for a current file preview.
- [x] 2.10 Link the file-preview modal directly to delimiter management and distinguish the installed
      app's full Windows/UNC path from the browser's basename-only fallback with explicit copy.
- [x] 2.11 Add modal Reload that securely re-reads only a native-picker-authorized session path,
      reapplies the current delimiter and refreshes every Designer preview surface.
- [x] 2.12 Keep a browser file-system handle when that API is available so Reload obtains a fresh
      file snapshot instead of reusing an expiring `File` reference; keep native reload unchanged
      and describe the portable saved name as belonging to CG Control in operator-facing modal copy.
- [x] 2.13 Keep the fixed-file Inspector compact: move explanatory prose behind one information
      action, use CG Control terminology in author-facing copy, and hide the reserved internal field
      id and binding while preserving that binding in exported/runtime data.
- [x] 2.14 Convert an existing Data-key connection to a fixed source in place instead of creating an
      orphaned duplicate field, and keep legacy orphaned fields out of CG Control delivery.

## 3. CG Bridge boundary

- [x] 3.1 Add `textSourceRoot` service configuration/CLI plumbing with the state-home default.
- [x] 3.2 Implement a bounded UTF-8 reader with canonical containment, traversal and non-file checks.
- [x] 3.3 Register the authenticated route and tests for current bytes, missing files, traversal,
      absolute paths, oversize and link escape.
- [x] 3.4 Let `dev:station --fake` accept and forward an explicit shared text-source root, without
      treating that external folder as disposable fake state.

## 4. Runtime bridge and source model

- [x] 4.1 Add `textSources.read` to `RuntimeBridge`, WebSocketRuntime and MockRuntime.
- [x] 4.2 Add a bridge-backed `TextFileSource`; keep FSA handles and operator persistence unchanged.
- [x] 4.3 Derive authored defaults from the resolved field and preserve operator override only when
      the policy is unlocked.
- [x] 4.4 Seed list splitting from the authored delimiter; when the file is locked, enforce the
      authored split/delimiter and remove the operator controls.

## 5. CG Control policy UI

- [x] 5.1 Remove scalar/list manual editors for File only without disabling the remaining controls.
- [x] 5.2 Render a locked path as a fact with Reload/split/error state and no choose/replace/detach.
- [x] 5.3 Keep explicit reload staged-only and retain the current value on every read failure.
- [x] 5.4 Add DOM and store/source tests for all four policy combinations and legacy behaviour.
- [x] 5.5 Move current file content, parsed fields and unlocked list delimiter controls into a large
      CG Control modal; keep locked interpretation non-interactive and the Inspector compact.
- [x] 5.6 Align the CG Control modal's Delimiter label/value with Designer and show the canonical
      Bridge file path after a successful read without persisting it.

## 6. Documentation and verification

- [x] 6.1 Document the default/configured Bridge text-source root and deployment/UNC example.
- [ ] 6.2 Run targeted package tests, Runtime/Designer local E2E and the full repository gate.
- [ ] 6.3 Record a successful Linux CI E2E job because Runtime/Designer rendering and the bridge wire
      contract change.
