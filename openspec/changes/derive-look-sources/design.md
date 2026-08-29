# Design — deriving the multi-frame group's source list

## 1. The order rule, and why it is stated as a contract

**Document order of FIRST USE**: the scene's own layers, then each composition in array order, each
walked in authored sibling order. `deriveLookSources` in `@cg/shared-schema/look-sources.ts`.

It is **stable under APPEND and not under DELETION**, and that asymmetry is condition (b) of
`B-188`'s adoption, accepted deliberately:

- A new plate, a new look, a new key each APPEND after everything that exists, so growth never
  reorders the operator's list.
- Deleting the plate that FIRST used a key moves that key to wherever it is next used — later, or
  off the list entirely.
- 🔴 **No assignment is lost either way.** CG Control keys assignments on `{templateId, plateId}`
  (`shared-ipc`'s `sources.ts`), never on index, and `plateId` IS the source id. The cost of a
  reorder is a list the operator sees in a different sequence, not a mapping that has moved.

## 2. Why the walk is per DOCUMENT and not the instance-following flattener

`collectLookCarrier` walks `flattenElements(scene, 'document')`, which descends THROUGH composition
instances from the export root. `deriveLookSources` deliberately does not: it walks each document
once — `scene.layers` plus every composition's `layers` — which is the same enumeration the export
preflight already uses for `live-source-unset`.

Two reasons, and the first is load-bearing:

1. 🔴 **The Designer must answer this from whichever document is open.** Drill into a look to author
   it and the edit projection roots at THAT look's composition (`editSceneOf` projects
   `layers: c.layers`). An instance-following walk would then report only that look's own plates, so
   the source a sister look uses would vanish from the Inspector's suggestions exactly when the
   author reached for it.
2. **It cannot change the exported carrier**, which is what makes the wider walk free rather than a
   divergence. `collectLookCarrier` drops any key with no rect in any look
   (`if (rect === undefined) continue`), and a plate in a composition nothing instances has no rect
   anywhere. The wider set is filtered back to the reachable one downstream; only the ORDER of the
   survivors reaches the operator, and that is what this function fixes.

⚠ A `repeater` subtree is not walked, matching `flattenElements`'s own contract — a stamped plate
has no static rect to declare, and `live-source-in-stamped-scope` already refuses the export.

## 3. Why the Inspector control is a TEXT BOX and not a picker

There were two controls: a `<select>` over the group's declared sources when a group existed, and a
free-text box when it did not.

🔴 **Under a derived model a picker is incoherent.** It could only ever offer what OTHER plates had
already chosen, so on a template with a group there would be no way to create the first source, or
any subsequent one. Typing a new key IS how a source comes into existence — that is the whole
mechanism the declaration used to provide.

The keys already in use are still OFFERED, through a native `<datalist>` on the same input
(`TextField`'s new `suggestions` / `datalistId` props). The common act — pointing this plate at a
source the template already uses — stays one interaction, and the offer is a suggestion rather than
a constraint, which is exactly the difference from the picker it replaces.

⚠ The `(undeclared)` label goes with the concept. A control that marks a key "not declared" on a
template that declares nothing would be a control telling a falsehood.

## 4. The near-miss warning — condition (c), and the rule it uses

The typo trade is the one real loss. `cam1` for `cam-1` used to be `look-source-undeclared`: an
exact, cheap, hard error naming the plate, possible only because the declaration was a second copy
of the truth to check against. Derived, there is nothing exact to check, so this is a HEURISTIC.

🔴 **It is a WARNING and must stay one.** An error would recreate the very thing this change
deletes, this time without even the excuse of being right. `severity: 'warning'` is what keeps
`Exporter.produce` (which filters on `'error'`) and `ErrorMarkOverlay` (same filter) from treating
it as a block.

**The rule:** two keys are a near miss when their NORMALISED forms — lower-cased with `-` and `_`
removed — are within ONE Damerau edit.

🔴 **Minus the numbering exclusion, which is what makes it usable.** A plain edit-distance rule
fires on `l1` vs `l2` — the owner's own scene declares `l1`, `l2`, `l3` — and a warning that shouts
at correct work is a warning authors learn to ignore. So a pair whose DIGIT-RUN SKELETONS are equal
(`cam-1` and `cam-2` are both `cam#`) and whose digits differ is a family member, never a typo, and
is silent.

Two edits are deliberately NOT covered, and the brief's "a character or two" was narrowed on
purpose: at distance 2 the false-positive rate on short symbolic ids climbs faster than the catch
rate, while separator and case differences — the commonest real slip — are already free, because
normalisation folds them out before the distance is measured. Distance 0 after normalisation always
warns; distance 1 warns only when the longer form is at least 4 characters, so `a` and `b` are left
alone.

## 5. What was verified before anything was deleted

- **`lookGroups` has ZERO hits** in `apps/runtime/src` and `tools/caspar-bridge/src` — re-verified.
- 🔴 **Shared identity survives derivation, read rather than assumed.** `B-188` flagged that
  `live-look-bindings.ts` had not been opened. It has been now: `resolveLookBindings` iterates
  `input.carrier.sources` — the EXPORTED carrier, already a derivation — keys `plateId` from
  `declaration.sourceId`, and dedupes seats on `producerArg = argumentOf(source)`, the WIRE
  argument. The declaration appears nowhere in that file. Two looks whose plates share a key
  produce ONE carrier entry, both looks' `rects` contain it, both frames resolve through the same
  `plateId` to the same catalog id to the same `producerArg` ⇒ **one seat.**
- The five readers `B-188` enumerated were confirmed complete: the `+ Source` list, the Inspector
  picker, `look-source-undeclared` and its message, the schema's duplicate refusal, and the
  exporter.

## 6. Two traps met while deleting, recorded because neither is obvious

1. 🔴 **`look-source-duplicate`'s `?? ''` bucket.** The B.2 loop read
   `routeKey ?? ''` and grouped every UNASSIGNED plate under one empty key. That was harmless only
   because the loop then required the key to be DECLARED, and `''` never was. Deleting the
   declaration deleted that guard, so two unassigned plates in one look would have been reported as
   _"source “” appears 2 times"_ — `B-183`'s exact defect, through the door the deletion opened.
   Unassigned plates are skipped instead; `live-source-unset` already refuses each by name.
2. ⚠ **Turbo `inputs` are unchanged on purpose** — no task's read set widened. The new module sits
   under `packages/shared-schema/src/**` and the new test under `tests/**`, both already hashed.

## 7. `B-179`'s disposition

Its premise is REJECTED by the owner, and the item is re-scoped rather than dropped. Findings 1 and
2 — `LookSource.expectedAspect` has zero writers, so the take's mismatch refusal is disarmed for
every look-group template — are **FIXED** here: the carrier reads the aspect off the plate element,
so the author's assertion reaches the bridge and the refusal is armed again.

Its Acceptance bullet 3 — _"WHEN two plates serving one routeKey assert DIFFERENT aspects THEN that
is named at authoring time"_ — is **deliberately not implemented**, and falls with the premise: an
aspect is per-plate, so two boxes carrying two authored intentions is not a contradiction about an
external fact. The FIRST plate in document order wins, which is the same element `elementId` already
names, so the carrier entry describes one element rather than two halves of two.
