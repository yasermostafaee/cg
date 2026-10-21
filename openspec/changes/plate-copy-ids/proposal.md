# A duplicated or pasted plate gets the next free `live-N` (RUN-NEXT-VERSION-02 Q5)

## Why

`B-187` gave a plate DRAWN with the canvas tool the next free `live-N` in its look, marked auto. A plate DUPLICATED
or PASTED kept its original's id (`cloneElementWithNewIds` deep-cloned it), so two plates named one source in one look:
the export refuses that (`live-source-repeated`), and the author had to rename each copy by hand.
`REPORT-RUN-NEXT-VERSION-01` Q5 asked whether a copy should get the next free id; the owner accepted, marked auto.

## What Changes

- Every duplicate and paste (`duplicateElement`, `duplicateSelection`, `pasteElements`) gives each plate in the copy —
  a container's plates too — the next free `live-N` where it lands (`nextAutoSourceId`, the active composition's look),
  marked `routeKeyAuto` until the author confirms it, exactly as a drawn plate is. A plate with no id stays without one.
  Several plates in one act get different ids.

## Impact

- **Specs:** `designer-live-source` (ADDED × 1).
- **Code:** the Designer's elements slice and `auto-source-id.ts` (an `alsoTaken` set). No schema change: the id and
  the flag exist.
