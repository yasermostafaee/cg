import type { Element } from './elements.js';
import type { Scene } from './scene.js';

/**
 * 🔴 **`B-188` — THE MULTI-FRAME GROUP'S SOURCE LIST, DERIVED FROM THE PLATES.**
 *
 * The group used to DECLARE its sources (`lookGroups[].sources`) and every plate had to
 * reference a declared one. That list stored a fact the plates already carried, and
 * `look-source-undeclared` was the price of storing it twice — golden rule 6's shape, one
 * schema up. It is deleted; this function is what replaced it.
 *
 * ── WHY DERIVING IS SAFE, MEASURED RATHER THAN ARGUED ───────────────────────
 *
 * The EXPORT already reduced the declaration to the used set. `collectLookCarrier` skipped any
 * declared source with no rect in any look, and rects were only recorded for plates whose key
 * WAS declared — so `used ⊆ declared` and the carrier was always exactly the derived set.
 * Measured before the change: declaring `l1,l2,l3` and declaring `l1,l2,l3,l9` both produced
 * the carrier `["l1","l2","l3"]`. The operator and the bridge have therefore always consumed a
 * derivation; the declaration's only surviving downstream contribution was list ORDER, which
 * is what this function now decides.
 *
 * ── THE ORDER RULE — `B-188` condition (b), and it is part of the contract ───
 *
 * **Document order of FIRST USE**: the scene's own layers, then each composition in array
 * order, each walked in authored sibling order.
 *
 * ⚠ **STABLE UNDER APPEND, NOT UNDER DELETION, and that asymmetry is deliberate rather than
 * unnoticed.** A new plate, a new look, a new key: each appends after everything that already
 * exists, so no operator's list is reordered by growth. Deleting the plate that FIRST used a
 * key moves that key to wherever it is next used — later in the list, or off it entirely.
 * **No assignment is lost either way**: CG Control keys assignments on `{templateId, plateId}`
 * (`shared-ipc`'s `sources.ts`), never on index, so the cost of a reorder is a list the
 * operator sees in a different sequence, not a mapping that has silently moved.
 *
 * ── 🔴 WHY EVERY DOCUMENT, RATHER THAN THE INSTANCE-FOLLOWING FLATTENER ─────
 *
 * It walks each document ONCE and does not descend through composition INSTANCES, which is the
 * same enumeration the export preflight uses for `live-source-unset` (`scene.layers` plus every
 * composition's `layers`). Two reasons, and the first is the load-bearing one:
 *
 * 1. **The Designer must answer this from any open document.** Drill into a look to author it
 *    and the edit projection roots at THAT look's composition; an instance-following walk would
 *    then report only that look's own plates, so the source a sister look uses would vanish
 *    from the Inspector's suggestions exactly when the author reached for it.
 * 2. **It cannot change the exported carrier**, which is what makes the wider walk free rather
 *    than a divergence: `collectLookCarrier` drops any key with no rect in any look
 *    (`if (rect === undefined) continue`), and a plate in a composition nothing instances has
 *    no rect anywhere. So the wider set is filtered back to the reachable one downstream, and
 *    only the ORDER of the survivors — which this function fixes — reaches the operator.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * An UNASSIGNED plate (`routeKey === undefined`, `B-183`) contributes nothing — it has no key
 * to contribute, and `live-source-unset` refuses the export in DOCUMENT scope so the author is
 * told by the surface built for it. A `repeater` subtree is NOT walked, matching
 * `flattenElements`'s own contract: a stamped plate has no static rect to declare, and
 * `live-source-in-stamped-scope` already refuses the export over it.
 */
export function deriveLookSources(scene: Scene): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'video-placeholder') {
        const routeKey = el.routeKey;
        if (routeKey === undefined || seen.has(routeKey)) continue;
        seen.add(routeKey);
        out.push(routeKey);
        continue;
      }
      // A composition INSTANCE is not descended: that composition is its own document and is
      // walked once, on its own turn. Descending here would visit its plates twice — harmless
      // for the SET, and a silent reordering of the list, which is the half that is contract.
      if (el.type === 'container') walk(el.children);
    }
  };

  for (const layer of scene.layers) walk(layer.children);
  for (const c of scene.compositions ?? []) for (const layer of c.layers) walk(layer.children);
  return out;
}
