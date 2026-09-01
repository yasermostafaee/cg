# Design — the single-clock look switch

## 1. 🔴 THE ONE REAL DECISION — TWO BANKS, not an item whose slot is not its row

Both shapes put the plate-bearing page below the live band. They differ in what happens to the
identity `R-021` / `R-028` are built on.

| shape                                                                                                                       | what it costs                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TWO BANKS — ADOPTED.** A second declared range, low, and a plate-bearing package may only load onto a row there.          | The operator picks a plate-bearing template from a different row group, and the bank surface shows two groups.                                     |
| Item's slot ≠ its row. The item keeps its 70–99 row for identity and gains a second slot in 1–9 that every CG verb targets. | The row/layer identity splits across **43 `#slots` sites in `caspar-runtime.ts`** plus restore, occupancy, quarantine and the fixed-state publish. |

**The invariant the adopted shape keeps** is stated in the code it would otherwise break —
`#slotForRestore`: _"R-021's acceptance is 'the item survives ON THE SAME layer', and the row IS the
promise ('layer 72 is the clock')."_ Retention stores that exact slot; `#layers.bindFixed` /
`isFixed` key the operator surface off it. Splitting it creates **two places that can drift**, and on
air a producer stranded on the wrong layer is the worst failure class available.

⚠ **That is the SAME objection this project already ruled on**, in `design.md §9b.5`, when it
rejected moving the backdrop out of the template: _"**two artifacts to coordinate instead of one.**
The backdrop's geometry and the holes' geometry would live in two places that can drift."_ The
rejected shape here is that objection applied to a layer coordinate instead of a geometry.

**The two-group bank is not a cost; it is the model becoming honest.** A plate-bearing package is the
graphics BED — one per programme, sitting under everything. The furniture rows are supers the
operator punches in and out. The operator already treats them as two different things; the bank did
not.

**Capacity is not a constraint.** `B-195` found exactly ONE of the client's twelve packages carries
plates. Nine low slots is ample, and `MAX_LIVE_SOURCE_LAYER` is 9999 if it ever is not.

**"Move the furniture instead" is closed.** Plates above the bank would put every logo and super
BELOW a guest picture. Recorded so it is not revisited.

## 2. Why 1–9

- **They are free today.** `DEFAULT_LAYER_POLICY` spans 10–69, the operator bank is 70–99, the
  playout reserved range is 60–69, and the suggested Live Source band is 10–59. Nothing in the
  product or the plant claims 1–9; the C-015 recon's own note calls 1–9 "the only free band" under
  the pre-R-028 policy, which is why it was passed over then — nine layers were too few for plates,
  and are ample for beds.
- **They are BELOW every live band a station can declare**, since `LiveSourceLayerRangeSchema` is
  validated disjoint from the bank and the reserved range and the suggested band starts at 10.
- **Layer 0 is excluded**: `0` is a legal layer number and reads as "unset" in too many places to be
  worth the ambiguity for one extra slot.

## 3. The three requirements that come with two banks

**(a) Classification is AUTOMATIC AT IMPORT.** A package either declares live plates or it does not
— the same derivation `B-195`'s audit used and the same one `collectLiveSources` already performs at
export. **It is NOT an operator checkbox**: an operator getting this wrong is an on-air fault, and a
flag someone forgets to set is this project's standing objection to guards that fail quietly
(`design.md §9a-Z`: _"a declared-backdrop flag that someone forgets to set is a silent black plate on
air"_).

**(b) The wrong bank is REFUSED, by name.** A plate-bearing package onto a 70–99 row and a furniture
package onto a 1–9 row are both refused with a message naming the reason and the bank that would
accept it. Silent acceptance is not acceptable: a plate-bearing page loaded at 95 renders ABOVE its
own plates, which is today's defect with the mask removed — every plate covered by its own backdrop.

**(c) Retention/restore — MIGRATE, and say so.** A retained item may hold a plate-bearing package
against an old 70–99 slot. **The chosen behaviour is: migrate it to a low slot on restore, and report
the migration**; refuse only when no low slot is free, with the reason. Migration is chosen over
refusal because a restore that refuses leaves the operator's rundown short a row after a bridge
restart, which `B-092` exists to prevent — and because the coordinate is the bridge's to choose for a
bed, not a promise made to the operator about a specific number. ⚠ It is reported rather than silent:
`B-108`'s rule is that every skip carries its reason, and a move is a skip's near relative.

## 4. What `C-028` requires of the reorder, and how it is proved

Under `contain` the fitted rect is smaller than the box and `FILL === CLIP`, so the producer paints
only the picture's own area — and the margin must show **the plate-bearing page below**, never black.
`B-194` §3 measured exactly this shape at the wire: layer 10 an opaque full-frame CEF page, layer 20 a
producer with `FILL 0.25 0.25 0.5 0.5` and `CLIP` the same:

```
(1800, 1000)  rgb=( 16, 64,191)   OUTSIDE the plate  -> the PAGE
( 100,  100)  rgb=(240,191,  0)   OUTSIDE, its mark  -> the PAGE
( 960,  540)  rgb=(126,126, 74)   INSIDE the plate   -> the PICTURE
```

The reorder re-proves it with a pixel probe on the real template rather than inheriting the reading.

## 5. What the export format does

**Unchanged, and this is checkable rather than asserted.** The mask was never serialised into
`.vcg`: `sceneMaskHoles` is called by `@cg/template-runtime` in the browser at build and at re-punch,
and `collectLiveSources` — the thing that DOES cross into the package — records plate rects and no
holes. `template.json`'s shape therefore does not change, and the reorder round-trips one package to
show it.

⚠ And a runtime change does not cost a re-EXPORT: `templateDelivery.ts:15-21, 202-211` rebuilds the
served HTML at IMPORT from the app's own bundled runtime, so the `cg.js` inside a package is never
served. A **re-import** is what a station does.
