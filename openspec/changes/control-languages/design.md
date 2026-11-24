## Decisions

Add English, Persian and Arabic language preferences, editable locale catalogs, and live updates within CG Control.

Each console stores its two locale selections locally. The catalogs are versioned in `apps/runtime/src/renderer/i18n/catalogs/` and the root README documents their locations. Developers edit catalog values before packaging, keeping keys and named placeholders intact. The interface and feedback sections are resolved independently. Console chrome follows the selected interface direction. Source names, paths, technical values and video geometry retain their own direction or physical position.

Modal headings and operator copy inherit the interface direction. Action notices and toasts use the feedback locale as the paragraph direction. Names and interpolated values stay isolated within the sentence. A/B letters retain their own order while their position follows the direction of the source caption. PGM audio controls align at the end of the bar at all widths.

Translations keep the product name CG Control in English lettering. The shared password field uses the interface language for the visibility button's tooltip and accessible name. Both describe the action the button will perform, Show password for a masked value and Hide password for a visible value. The password input itself uses left-to-right entry.

## Verification

Prove the operator path in a fresh Runtime build and preserve the station write behavior and permissions.
