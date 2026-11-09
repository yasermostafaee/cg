# Restore the picker for unlocked file-only text fields

## Why

The clock ticker's exported field retains File only after Clear file. CG Control leaves the
operator without a source picker even though the author removed the path and the lock.

## What changes

Restore file selection and detaching for unlocked File-only text, multiline and unstructured
text-list fields. The existing file picker stages new content for Update.

## Impact

- PRD B-422 and the text-file portion of R-102.
- File locks still govern text-file selection. Structured Repeater and Sequence workbook ownership
  follows its existing policy.
