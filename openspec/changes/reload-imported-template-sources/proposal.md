# Change: Reload imported templates from their original files

## Why

Operators commonly import `.vcg` packages from a shared newsroom folder and the author later saves
new versions at the same paths. CG Control currently keeps only the selected file snapshot, so the
operator must browse to every package again and cannot explicitly decide whether current row data or
the reloaded package defaults should win.

## What Changes

- Remember the original chooser-selected file per channel/template on each CG Control.
- Add a direct Templates door that does not require an empty destination row.
- Offer Reload on one template and Reload all for remembered sources in the current list.
- Ask whether existing rows keep their current data or use the reloaded package defaults.
- Refresh the page of already-bound rows in PVW and on their next explicit Take, preserving the page of a row currently on air.
- Review a changed package identity through single Reload. Bulk Reload skips files that require review.
- Report inaccessible/missing sources while leaving the current catalogue and row data usable.

## Impact

Single Reload can review a verified package whose id changed at the remembered path. It replaces the
selected catalogue entry after explicit approval. Reload all skips files that require this review.

- Affected PRD: R-108.
- Modified capability: `runtime-template-library`.
- Affected components: CG Control Templates and PVW, browser-local IndexedDB, and CG Bridge Take.
- No new Bridge protocol and no source path is synchronized between consoles.
