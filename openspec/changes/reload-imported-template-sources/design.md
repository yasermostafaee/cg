# Design: Reload imported templates from their original files

## Decisions

### 1. Management has a destination-free header door

Reload is a catalogue act, not a row Load. The main header therefore opens the current channel's
Templates dialog in management mode even when every layer is occupied. This mode has import, Reload,
remove, search and details, but no Load primary, compatibility verdict or row destination. The row's
LOAD button remains the only path that binds a template to a layer.

### 2. Keep a capability, not a stale file snapshot

The Chromium File System Access chooser returns a `FileSystemFileHandle`. CG Control stores that
structured-cloneable handle in IndexedDB under `(channel, templateId)`. Calling `getFile()` at Reload
therefore reads the latest bytes at the original local or UNC location; storing the earlier `File`
would only retain the old snapshot.

These handles remain local to the CG Control profile because paths and permissions are workstation
capabilities. CG Bridge continues to own the shared catalogue. Another console establishes its own
source by importing through its chooser rather than receiving a path it may not be able to access.

An import through Shared folder records the Bridge address, canonical Shared files root, relative
folder, and exact package name in the same browser-local store. The Bridge compares the expected root
when reading and continues to validate and bound the file under its configured root. A prior Bridge
that does not return the checked root is checked through its folder listing before and after the
read. Older imports did not retain their source folders. The operator can select the original
package and choose Update when the verified package id matches the existing entry.

### 3. Reload is identity-safe

The package is verified and unpacked through the existing import chain. The remembered package id
is distinct from the channel catalogue id, including after Add as new. An older source record falls
back to its catalogue id. If the verified package differs, single Reload presents the existing
entry and incoming package for explicit review. It then imports the exact approved bytes under the
existing catalogue id and label, recording the verified id for future Reload. Closing or cancelling
the question does not register any bytes. Bulk Reload reports the changed source for individual review.

### 4. Row data authority is an explicit operator choice

**Keep current data** retains the field maps of existing rows when the package updates.
**Use file defaults** updates the package and then sends a normal
replace-mode `stack.update` for every current-channel row holding that template. This keeps the same
validation and resident/on-air update path as an ordinary operator Update.

### 5. Reload all is a sequence of honest single reloads

Reload all includes only templates in the current channel list with remembered handles. Each source
is read and imported independently so one missing share file does not discard successful reloads;
the dialog reports partial failure. Drag/drop cannot provide a durable handle in every supported
WebView, so a dropped template explains that it must be imported once through the chooser to enable
Reload.

### 6. Bound rows adopt the new page at a safe point

The import moves the channel's catalogue pointer and keeps the immutable page held by each
producer. PVW rereads the listed HTML on catalogue changes. Take checks the row's held version
against the channel's listed version after the existing on-air interlock. If they differ and the
resident row is known off air, Take preloads the newer page with the row's applied data. The
foreground pass uses the version just held by the background, so a concurrent Reload cannot mix
the two pages. This keeps the same row, layer, and source bindings and leaves the running page alone
while Reload is registering the package.

CasparCG 2.5.0 registers the [HTML producer](https://github.com/CasparCG/server/blob/v2.5.0-stable/src/modules/html/html.cpp#L235-L242)
as non-reusable, so the [existing CG ADD path](https://github.com/CasparCG/server/blob/v2.5.0-stable/src/core/producer/cg_proxy.cpp#L125-L138)
prepares the new page on that layer without a separate Clear.

## Risks / Trade-offs

- Windows or the WebView may ask for read permission again after restart; Reload reacquires it from
  the button gesture and refuses without changing state when permission is denied.
- File-default row replacement is not atomic with package import. A later row refusal is reported
  with the accepted count instead of pretending the package update rolled back.
- Clearing the browser profile clears remembered sources but not the Bridge catalogue.
- A changed rehearsal page starts a new local rehearsal cycle; the operator can press Play in PVW
  to see it. An on-air page adopts the new package after Stop and the next explicit Take.
