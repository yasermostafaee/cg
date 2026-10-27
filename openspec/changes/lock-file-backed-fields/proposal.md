## Why

Some newsroom fields are fed by text files that another system continuously saves. Merely allowing
a file source still lets a CG Control operator type over the value, alter list rows, or attach the
wrong file, so the template author needs optional authority over both the input method and file.

## What Changes

- Add independent authored policies for **File only** and **Lock file** on file-capable fields.
- Let the Designer record a relative live-file path for CG Bridge; no machine-specific absolute path
  or file bytes are embedded in the `.vcg`.
- Let the Designer choose a text file directly from the shared root with the Windows file picker,
  preview its current content as that field's live authoring value and choose an authored delimiter
  for text-list files.
- Add a persistent Designer delimiter catalogue, managed from the Edit menu, with custom
  add/edit/remove/reset actions.
- Keep one selected-file preview across every Designer surface and selection changes, show its native
  Windows/UNC path, and redesign the delimiter catalogue into a clear management table.
- Let a keyless element choose a fixed locked file directly, or convert its existing Data-key
  connection in place; Designer creates/reuses and hides the runtime field/binding instead of
  leaving a second operator field behind.
- Add an authenticated `textSources.read` bridge channel that reads the current UTF-8 bytes below a
  configured safe root.
- Make CG Control remove manual editors for file-only fields and remove choose/replace/detach actions
  plus list delimiter controls for locked files, while retaining explicit Reload and the normal
  staged Update path.
- Keep the CG Control Inspector compact by opening current file content, parsed fields and unlocked
  list delimiter controls in a large dedicated modal.
- Expose only fields that are actually connected to a render target in CG Control, so a legacy
  orphaned field cannot appear beside its fixed-file replacement.
- Let the browser dev station point its fake CG Bridge at the same shared text-source root used by
  Designer.
- Preserve the current behaviour of older fields that carry only `allowFileSource`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `designer-dynamic-fields`: the author can define the two file-source authority policies and a
  relative bridge path.
- `runtime-ui`: CG Control honours file-only and file-lock policy without changing Update semantics.
- `runtime-caspar-bridge`: an authenticated, root-confined text-source read channel returns current
  file content.

## Impact

- `@cg/shared-schema` dynamic fields and `@cg/shared-ipc` channel registry.
- Designer Dynamic/Data controls, shared-file preview, field mutation and `.vcg` round-trip tests.
- Runtime bridge implementations, Inspector/FromFileControl and persistence compatibility.
- CG Bridge service configuration, route dispatch and secure filesystem reader.
- Installer/configuration documentation for the bridge text-source root.
