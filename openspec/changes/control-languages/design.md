## Decisions

Add English, Persian and Arabic language preferences, editable locale catalogs, and live updates within CG Control.

Each console stores its two locale selections and optional JSON overrides locally. The built-in catalog directory is `apps/runtime/src/renderer/i18n/catalogs/`. General exports complete `cg-control-en.json`, `cg-control-fa.json` and `cg-control-ar.json` files. The operator edits translation values and keeps English keys and any named placeholders. The interface and feedback catalog sections are resolved independently. Console chrome follows the selected interface's writing direction. Source names, paths, technical values and input video geometry retain their own direction or physical position.

## Verification

Prove the operator path in a fresh Runtime build and preserve the station write behavior and permissions.
