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

### 3. Reload is identity-safe

The package is verified and unpacked through the existing import chain, but before Bridge import its
template id must equal the catalogue entry being reloaded. If the path now contains another package,
Reload refuses and directs the operator to Import. This prevents an edited or replaced share file
from silently switching the row to a different template.

### 4. Row data authority is an explicit operator choice

**Keep current data** updates the package only; existing rows retain their field maps, matching the
old same-id re-import behavior. **Use file defaults** updates the package and then sends a normal
replace-mode `stack.update` for every current-channel row holding that template. This keeps the same
validation and resident/on-air update path as an ordinary operator Update.

### 5. Reload all is a sequence of honest single reloads

Reload all includes only templates in the current channel list with remembered handles. Each source
is read and imported independently so one missing share file does not discard successful reloads;
the dialog reports partial failure. Drag/drop cannot provide a durable handle in every supported
WebView, so a dropped template explains that it must be imported once through the chooser to enable
Reload.

## Risks / Trade-offs

- Windows or the WebView may ask for read permission again after restart; Reload reacquires it from
  the button gesture and refuses without changing state when permission is denied.
- File-default row replacement is not atomic with package import. A later row refusal is reported
  with the accepted count instead of pretending the package update rolled back.
- Clearing the browser profile clears remembered sources but not the Bridge catalogue.
