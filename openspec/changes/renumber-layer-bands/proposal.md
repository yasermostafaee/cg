# Re-band the layer map — beds 50–59, plates 60–79, templates 80–99, and 1–49 left free

## Why

The graphics beds sat at **layers 1–9**. The reasoning when that was chosen was that 1–9 is
free of everything _we_ allocate — which was true, and which is not the same question. **1–9 is
exactly where a playout server is likely to be working on a shared channel**, and a graphic of
ours landing on a playout layer is indistinguishable from the playout system's own graphic on
the wire: OSC reports producer _kind_, never identity. The collision is therefore discovered on
air, or not at all.

The owner's decision (2026-09-14) cuts the channel by ROLE and stops allocating below 50:

| Layers    | Role                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| **1–49**  | **FREE — not ours.** The playout server's, and anything else on the channel. |
| **50–59** | Graphics beds — the multi-box frame itself                                   |
| **60–79** | Live plates — the frame's inputs / live sources                              |
| **80–99** | Templates — the operator's candidate layer bank                              |

**The ordering is a REQUIREMENT, not a coincidence.** A higher CasparCG layer renders ABOVE a
lower one, and a bed is composited UNDER the plates it declares, so `bed < plate < template` is
what the composition needs. It is enforced, not remembered.

## What changes

- **ONE definition** of the three bands, named for their roles, read by every allocator:
  `packages/shared-ipc/src/layer-bands.ts`. No band bound is written anywhere else.
- **A guard over the map itself**, throwing at module load when a band allocates below the
  floor, when two bands overlap, or when they are not in composition order.
- **Dynamic, template-type-keyed allocation is RETIRED.** `DEFAULT_LAYER_POLICY` ships empty.
  Every range it carried lay in 1–49; with 50–99 cut into three role bands there is nowhere a
  type-keyed range may legally sit. A deployment that wants one declares it.
- **A fixed-layers file written under the OLD map is REFUSED at boot**, by name, saying both
  maps and the remedy. Two maps are never mixed.
- **A retained row with no usable coordinate is now answered by `isRestorable`**: a row that
  may be re-seated is SKIPPED visibly (`not-declared`); a row that may not — `cleared` or
  `error` — comes back with NO LAYER, still wearing its state and its reason.

## Impact

- Affected specs: `runtime-live-source-routing`
- Affected code: `@cg/shared-ipc` (the map, the bank schema, the suggested plate band),
  `@cg/caspar-client` (`DEFAULT_LAYER_POLICY`, `assertPolicyAboveFloor`),
  `tools/caspar-bridge` (`MAX_FIXED_LAYER`, the old-map refusal, `#slotForRestore`),
  `apps/runtime` (the offline mock's seed, the Station-setup band hint).
- **No wire, IPC-schema or persisted-key change.** `RestorePlacement` is module-local;
  `StackItemState.slot` and `RetainedStackItem.slot` were already optional.
- **Persisted state is regenerated, never migrated.** The old fixed-layers file is renamed and
  kept; nothing under `~/.cg-runtime` is deleted.
