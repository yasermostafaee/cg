# Saved broadcast preview guides

## Why

Operators need 16:9/4:3 composition references and reusable named horizontal and
vertical guides across projects. The original view-only safe-area toggle has no
ratio choice or reusable custom lines.

## What changes

- Add Auto, 16:9 and landscape 4:3 reference frames contained inside the active picture.
- Add a compact guide-settings popover beside each app's existing Safe areas toggle.
- Reuse CG Control's profile on the normal New live layout preview, with an independent
  view-only visibility switch for that surface.
- Save the ratio, broadcast-box choice and one bounded named H/V guide set per app
  across project switches and restarts. Percentages refer to the selected frame.
- Keep the master visibility toggle session-only and keep all guides preview-only.

## Impact

New validated local preference keys `cg.designer.safe-guides.v1` and
`cg.runtime.safe-guides.v1`. Absent, malformed or unsupported saved versions use
defaults; there is no old setting to migrate. Each app's own origin/profile stores
its independent guide set. No cross-app sync, scene/export/wire or programme change.
Persistence makes this a separate Full-lane feature from the original visual guide.
