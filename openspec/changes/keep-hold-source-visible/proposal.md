# Change: keep Hold source visible and concise

## Why

The Playback Inspector hides Hold source until content already exists, which forces an authoring
order and makes a stored Content-driven choice disappear after its last effective driver is removed.
Its option labels also carry full explanations inside a narrow select.

## What Changes

- Show Hold source for every Auto-out and Loop-cycle composition, independent of current content.
- Use concise Playback mode and Hold-source option labels; move their explanations behind Info.
- Preserve an authored Content-driven choice when no effective driver exists.
- State that safe Timed fallback inline, keep the duration authorable and explain the remedy behind
  Info.
- Keep eligible but disabled drivers in the closer checklist so they can be enabled again.
- Leave Static/Manual and the canonical runtime/export Timed fallback unchanged.

## Impact

Designer Playback Inspector presentation and tests only. Stored schema, export shape and runtime
resolution do not change.
