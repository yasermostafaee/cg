# The multi-frame group stops DECLARING its sources; the list is derived from the plates (`B-188`)

## Why

`LookGroupSchema.sources` was a list of `{routeKey, dynamic}` the author maintained by hand in the
Looks panel, and every plate in every look had to reference one of its entries or be refused by the
export preflight with `look-source-undeclared`.

**It stored a fact the plates already carried**, and the refusal was the price of storing it twice —
golden rule 6's shape, one schema up.

### The measurement that decided it

The export had ALWAYS reduced the declaration to the used set. `collectLookCarrier` dropped any
declared source with no rect in any look, and rects were only recorded for plates whose key WAS
declared, so `used ⊆ declared`:

| declared            | exported carrier                                     |
| ------------------- | ---------------------------------------------------- |
| `l1,l2,l3`          | `["l1","l2","l3"]`                                   |
| `l1,l2,l3,`**`l9`** | `["l1","l2","l3"]` — 🔴 `l9` DROPPED                 |
| `l3,l9,l1,l2`       | `["l3","l1","l2"]` — declaration order, minus unused |

⇒ **carrier ≡ used ≡ the derived set.** The operator and the bridge have always consumed a
derivation; `lookGroups` appears **nowhere** in `apps/runtime/src` or `tools/caspar-bridge/src`
(zero hits, re-verified). The declaration's only surviving downstream contribution was list ORDER.

### The three fields, and what became of each

- **`routeKey`** — derivable, and now derived (`deriveLookSources`).
- **`dynamic`** — **inert end to end.** One reader in the whole tree (`live-sources.ts`, the carrier
  pass-through); the carrier's copy had zero readers; its docstring named a bridge consumer that
  does not exist. Deleted with the declaration. Its latent asymmetry went too: the groupless path
  computed the carrier's flag from field bindings while the group path hardcoded `false`, so **both
  paths now compute it the same way, from the plate element.**
- **`expectedAspect`** — the owner rejected `B-179`'s premise that an aspect is a per-FEED fact that
  must be declared once: _"aspect and fit are per-plate right now and have nothing to do with the
  source — which I think is correct."_ It is the author's intention for the BOX, and the real feed
  wins when known (`resolvePlateAspect`: source `format` → source `aspect` → element
  `expectedAspect` → `assumed`). Read off the plate element now, which **fixes `B-179`**: that field
  had zero writers, so every look-group template exported no aspect at all and the take's
  aspect-mismatch refusal could not fire for the product's flagship feature.

## What Changes

- **`LookSourceSchema` is deleted**, and with it `LookGroupSchema.sources` and the schema's
  duplicate-declaration refusal. `z.object` strips unknown keys, so a stored scene or `.vcg`
  carrying the old array simply loses it at load — `B-178`'s precedent, applied to the whole
  declaration, under `P-031`'s compatibility floor.
- **`deriveLookSources(scene)`** is the ONE definition of the group's source list: the distinct
  `routeKey`s the plates carry, in document order of first use. Both the exported carrier and the
  Designer's surfaces call it.
- **`look-source-undeclared` is deleted** — the condition it tested cannot arise. ⚠
  `live-source-unset` (a plate pointed at nothing, DOCUMENT scope) and `look-source-duplicate` (two
  PLATES on one key in one look) both survive untouched; neither is about a list.
- **The Looks panel's source list becomes read-only** — a mirror of the plates, with no `+ Source`
  field and no remove button.
- **The Inspector's source control is ONE control, the free-text box**, with the keys already in use
  offered through a datalist. A picker could only ever offer what other plates had already chosen,
  so under a derived model there would be no way to create the first source at all. **Typing a new
  key is how a source comes into existence.**
- **A near-miss WARNING replaces the typo error** — `B-188` condition (c), accepted explicitly by
  the owner. Never an error, never blocking.
- `B-179` is answered and closed by consequence; `B-187`'s two-half rule collapses to one.

## Impact

- Affected specs: `designer-live-source`
- Affected code: `@cg/shared-schema` (`looks.ts`, new `look-sources.ts`), `@cg/vcg-format`
  (`live-sources.ts`), `@cg/designer` (`slices/looks.ts`, `live-source-preflight.ts`,
  `LooksSection.tsx`, `StyleSection.tsx`, `controls.tsx`)
- **Format change.** Under `P-031` no shim is owed before first delivery. Nothing already imported
  into CG Control breaks: it holds `TemplateInfo.sources` from import time, and a re-import produces
  a set IDENTICAL IN CONTENT (carrier ≡ used ≡ derived), possibly different in ORDER. Assignments
  are keyed on `{templateId, plateId}`, never on index, so a reorder loses no mapping.
- 🔴 **Product source and export format** — flagged per the commit policy's class 1.
