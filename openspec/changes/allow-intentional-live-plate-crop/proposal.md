## Why

B-426 refuses Take when a plate designed for a 4:3 source uses Crop edges and is assigned a 16:9
source. The author already requested a crop. The operator should be able to frame the assigned
picture using Pan in PVW and keep that framing on Take.

## What Changes

- Treat the plate's authored Crop edges mode as consent to crop the valid assigned input.
- Use the assigned source aspect for the fit and keep PVW Pan and Take on the same geometry.
- Keep the refusal when a conflicting Crop edges override is applied to a plate whose author did
  not select Crop edges. Existing missing or invalid assignment refusals still apply.

## Capabilities

- `runtime-live-source-routing`: fit and validate intentional live-source cropping.

## Impact

CG Bridge seating and preview crop planning. No template schema or persisted-setting change.
