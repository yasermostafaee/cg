## Context

The existing `allowFileSource` grant gives the operator a Chromium file picker backed by a local
`FileSystemFileHandle`. That is correct for operator-owned files but cannot name a file on the CG
Bridge machine, cannot be authored into a template, and offers no way to remove manual input or file
replacement. The live newsroom file changes after template export, so embedding a snapshot would be
incorrect.

## Goals / Non-Goals

**Goals:** two independent authored policies; current file bytes on every explicit reload; a safe
relative path resolved by CG Bridge; unchanged staged/Update behaviour; unchanged legacy templates.

**Non-goals:** automatic filesystem watching (R-026), writing files, arbitrary absolute-path access,
browsing a Bridge-only filesystem that is not also shared to Designer, or silently updating an
on-air item on read.

## Decisions

### 1. One optional policy object lives only on file-capable fields

Text, multiline and text-list variants gain (an image page-list is not a text source):

```ts
fileSource?: {
  inputMode?: 'operator-choice' | 'file-only';
  bridgePath?: string;
  lockFile?: true;
  delimiter?: string; // text-list fields only
}
```

The object is absent by default. `lockFile` is valid only with a non-empty safe relative
`bridgePath`. The existing `allowFileSource` remains accepted; a policy object also implies the grant
so there is no state where an authored policy is silently ignored. Canonical shared helpers answer
grant, effective input mode, path and lock state; UI surfaces do not re-derive them.

### 2. The template stores a path, never file bytes or an absolute location

Designer opens the native Windows file picker and the author chooses one text file directly inside
the shared folder configured as CG Bridge `textSourceRoot`. The Tauri shell owns that dialog so it
can return the full Windows/UNC path for author verification; Designer stores only the safe filename
relative to the root. It reads the selected share file only to preview its current content; neither
the absolute path nor preview bytes enter the project or `.vcg`. Files over the Bridge's 1 MiB ceiling
are refused. Reopening a project preserves the relative filename and asks the author to choose the
shared file again when a fresh-session preview is needed. Nested
subfolders require a future shared root-mapping contract; this picker deliberately does not guess or
store their UNC path.

The author may record a bridge path without locking it: CG Control starts from that source but may
replace/detach it. Locking requires that path and turns it into an author-owned fact. A text-list may
also carry an authored delimiter; presence enables splitting and seeds CG Control with that value,
while the operator may still adjust the split controls only when the file is unlocked. Lock file
locks the split mode and delimiter with the path.

Designer keeps its offered delimiter catalogue as a local authoring preference. It starts from the
shared shipped list and is managed from **Edit → Manage delimiters…**, where entries can be added,
renamed, changed, removed or reset. A field stores the literal delimiter value, never a catalogue id,
so changing the catalogue cannot reinterpret an existing template.

After Browse reads the selected file, Designer applies the canonical Runtime file transform to a
session store shared by the canvas, Dynamic/Data and composition Preview. Dynamic/Data keeps the
Inspector compact: one button opens a large modal that owns the full native path, raw content,
delimiter selection, a direct delimiter-management action and interpreted rows. The installed shell
returns and labels the complete Windows/UNC path; browser fallback can only show the filename and says
that limitation explicitly. A list is re-split immediately when its authored delimiter changes.
Selection changes do not discard the store. While present it overrides authored fallback
values on those preview surfaces and hides the duplicate element Items/Rows editor; neither bytes nor
the transient value is written into the field default, project or `.vcg`. Without a current file
preview, Items/Rows follows Filter so Dynamic/Data remains the final Inspector section.

Reload reuses the session selection: the shell remembers canonical paths selected by its native
picker and refuses every other path, then returns freshly read bounded UTF-8 content. Designer runs
that content through the same delimiter transform and preview store. This preserves the arbitrary
absolute-path boundary while avoiding a second Browse whenever newsroom software saves the file.
Browser mode prefers a File System Access handle and calls `getFile()` for each Reload; retaining
only an `<input type=file>` `File` snapshot is not sufficient because Chromium may later revoke it,
especially for Windows network files. The compatibility fallback reports that Browse must be used
again rather than exposing the browser's raw permission exception.

### 2.1 Fixed locked sources use one internal field, not a second authored Data key

For the fully constrained case, an eligible element offers a **Use fixed file** checkbox in a pinned
section whether it is currently keyless or has an ordinary Data key. Its session intent hides
Items/Rows and reveals Browse before any incomplete policy is persisted; selecting a file then
creates the same field/binding required by Runtime under a reserved id derived from the element id,
and authors `file-only + bridgePath + lockFile`. That id is an implementation detail: Dynamic/Data
does not render it as a Data key, Variables filters it out, and the authoring action/status lives in
its own pinned **Fixed file source** Inspector section. The section remains present after selection so
the checked mode, chosen path and preview/settings action do not disappear. Unchecking clears the
session preview, removes the internal field/binding and restores Items/Rows. This avoids a second runtime protocol
while keeping the authoring model honest. A synthesized list field authors the shipped new-line
delimiter immediately; because it is not a dynamic/operator-configurable field, its picker contains
only concrete delimiter choices and never **CG Control default**. Removing the fixed source removes
that field and binding.

When the element already has a Data key, the conversion renames and reuses that field and its
binding instead of creating a second field. Runtime delivery also exposes only fields that have a
binding in their owning document. That second rule is the compatibility boundary for templates
saved by an earlier implementation that already contain an orphaned former Data-key field: the
unused field may remain in authoring data, but it is not an operator input in CG Control.

### 3. CG Bridge owns the filesystem boundary

`textSources.read` accepts a relative path and returns `{ content, name }`. It is registered with the
same authenticated request dispatcher as other Runtime channels. Bridge resolves the path below
`textSourceRoot`, whose default is `<stateHome>/text-sources` and which may be configured to a UNC
share. Resolution uses canonical/real paths and containment checks, rejects absolute/traversal and
non-file targets, reads UTF-8 with a bounded size, and returns no bytes on error.

The browser receives content through `window.cg`; renderer code never imports Node filesystem APIs.

The browser development station accepts an explicit text-source-root option and forwards it to its
fake CG Bridge. This does not copy or delete the shared folder; it only makes the development bridge
resolve authored relative paths against the same root as an installed bridge.

### 4. Authored bridge sources and operator FSA sources share one read contract

`TextFileSource` remains the Runtime's source abstraction. A bridge-backed implementation delegates
`read()` to `window.cg.textSources.read`, while the existing FSA implementation and IndexedDB
persistence stay intact. Authored defaults are derived from the resolved template field rather than
persisted as operator choices; an operator override remains persistable for an unlocked policy.

### 5. Policy changes remove capabilities, not merely disable controls

- **File only:** the manual scalar/list editor is not rendered. File controls remain.
- **Lock file:** the authored path and list delimiter are shown as labelled facts with Reload;
  choose, replace, detach and split/delimiter controls do not render.
- **Both:** only the file fact, locked delimiter fact where applicable, errors and Reload remain.
- **Neither:** the current editor, picker, detach, persistence and reload remain unchanged.

The same authority applies to Designer's composition Preview: a File-only field is displayed as a
read-only scalar or list, with no edit, add, remove, reorder or per-field Update control.

Reload reads current content and stages only this field through the existing draft path. Update is
still explicit. On read failure the current draft/applied value is retained and a field-level error
is shown.

Potentially large file bytes and parsed rows do not live in CG Control's narrow Inspector. The
Inspector keeps the selected-file fact plus Reload and a **View content…** action. That action opens
a large bounded modal with the Bridge-returned canonical Windows/UNC path, raw content and
interpreted fields side by side. The full path is verification-only and is never written back to
the template or operator state. An unlocked list's split
toggle, delimiter picker and delimiter-management link live in that modal; a locked list shows its
authored interpretation as a non-interactive fact. Opening or reloading this preview reads current
bytes for inspection only and does not stage or apply them; the Inspector's explicit Reload remains
the action that stages a fresh value for Update.

## Risks / Trade-offs

- Symlink/junction escape can defeat lexical prefix checks; realpath containment is required and is
  tested with an outside target where the host permits links.
- A missing default root must not prevent Bridge startup; it is created lazily or reports a readable
  per-file error.
- File-only fields require an available source. Designer validation and Runtime error copy make a
  missing/unreachable authored file visible without blanking the current value.

## Migration Plan

No migration. Existing `.vcg` files have no policy object and retain operator-choice behaviour.
Deployments that use authored bridge files place them under the default `text-sources` directory or
configure `textSourceRoot`. For Designer Browse/preview, expose that same root as a Windows network
share accessible to the authoring workstation and choose files directly inside it; no CG Control
filesystem permission is needed.
