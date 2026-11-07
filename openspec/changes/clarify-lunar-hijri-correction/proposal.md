## Why

The Station setup section called Calendar contains only a Lunar Hijri day correction, so its current
name suggests missing Gregorian and Solar Hijri settings.

## What Changes

- Rename the section to Lunar Hijri correction.
- Add a short explanation of when the correction is needed and when zero is correct.

## Capabilities

### Modified Capabilities

- `station-settings`

## Impact

CG Control station-settings copy and its UI tests only; the stored setting and IPC contract do not change.
