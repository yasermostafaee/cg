## Why

Operators read the Audit log in the interface language and select the calendar they use when investigating station events.

## What Changes

Localize the audit filters, result and action labels, event details and status text. Add an Audit date calendar to Settings → General with Gregorian, Jalali and Lunar Hijri choices. Use the selected calendar on screen and in date filters.

## Capabilities

- Modified capability: `runtime-ui`.

## Impact

CG Control gains a console-local calendar preference. Bridge filters still receive UTC bounds, and the audit records and copied event JSON keep their original fields.
