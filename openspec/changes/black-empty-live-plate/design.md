## Decisions

The fallback is an opaque graphics-bed pixel directly under the externally composited live producer. This makes loss/resume automatic: an opaque picture covers it and an empty/transparent picture reveals it, without polling or another producer layer.

The Designer's existing Live Source picture picker is the one authoring surface. Its default empty choice means Bars; it also offers a solid colour and project/shared pictures. Legacy `posterAssetId` scenes therefore keep their selected picture and scenes with no new property become Bars.

The page cannot resolve the installed source aspect. The Bridge sends the already-resolved `{aspect, mode}` facts on take, look switch, binding update and swap; the page uses them only to size the fallback's visible rectangle. Live-picture `MIXER FILL`/`CLIP`, source availability/refusal and layer ownership remain Bridge-owned.

## Risk

This changes on-air page pixels and the Bridge control payload, so it still requires a real CasparCG/Playout pass in addition to mocks.
