## Decisions

Add English, Persian and Arabic language preferences, editable locale catalogs, and live updates within CG Control.

Each console stores its two locale selections locally. The catalogs are versioned in `apps/runtime/src/renderer/i18n/catalogs/` and the root README documents their locations. Developers edit catalog values before packaging, keeping keys and named placeholders intact. The interface and feedback sections are resolved independently. Console chrome follows the selected interface direction. Source names, paths, technical values and video geometry retain their own direction or physical position.

## Verification

Prove the operator path in a fresh Runtime build and preserve the station write behavior and permissions.
