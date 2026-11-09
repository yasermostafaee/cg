## Decisions

The fallback is an opaque graphics-bed pixel directly under the externally composited live producer. This makes loss/resume automatic: an opaque picture covers it and an empty/transparent picture reveals it, without polling or another producer layer.

The Designer uses one fallback picker for both single and multiple selection. New plates store
Bars, and the Bars choice includes its thumbnail. Existing plates keep their authored fallback.
Legacy `posterAssetId` scenes keep their picture, and an older plate without a fallback or poster
resolves to Bars.

The page cannot resolve the installed source aspect. The Bridge sends the already-resolved `{aspect, mode}` facts on take, look switch, binding update and swap; the page uses them only to size the fallback's visible rectangle. Live-picture `MIXER FILL`/`CLIP`, source availability/refusal and layer ownership remain Bridge-owned.

## Risk

This changes on-air page pixels and the Bridge control payload, so it still requires a real CasparCG/Playout pass in addition to mocks.

## PVW

The retained template page supplies the plate's fallback. The PVW marker adds a transparent outline
and labels. Its border marks assignment state, and its Crop edges label resolves the same per-channel
override and active-look fit as the Bridge. Older pages with no fallback still show the marker.
