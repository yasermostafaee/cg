# Restore the picker for unlocked file-only text fields

Designer and the exported template already clear the authored path and lock while preserving
File only and the list delimiter. CG Control reconciles the removed path out of the row's source
state. Use the existing browser picker when an unlocked plain text field has no source, and allow
detaching a plain text source so that the operator can pick another. Keep manual editing governed
by the field's input mode. Discard an in-flight read when its source has been replaced or detached.
Recheck the automatic read when source restoration completes after the Inspector has opened.
