## Context

`Import a .vcg` opens the operating-system chooser directly. The expensive work begins only after a
file is returned, and the existing `importBusy` flag merely disables one import button. The list,
search, load, delete and dialog dismissal still look available.

## Decisions

### 1. The chooser is not loading

The dialog enters the pending state only after the chooser returns a file. Cancelling the chooser
does not flash or retain a loading state.

### 2. One blocking state replaces the interactive picker body

While verification/import is pending, the picker body is replaced with a centred progress surface
that names the file. Search, selection, delete, load, repeat import, Escape, backdrop and close are
temporarily unavailable. This avoids implying that closing cancels bridge work that cannot be
cancelled safely.

### 3. Existing outcomes remain authoritative

On success the refreshed list returns with the imported template selected. On failure the existing
pinned refusal remains the only error surface. A duplicate-id question remains answerable through
its existing pinned remedies while the import operation is pending.

## Risks / Trade-offs

- A stuck bridge keeps the dialog busy; the existing import request timeout/error path remains the
  authority for ending it. Adding a second UI timeout would risk reporting failure while import
  later succeeds.
