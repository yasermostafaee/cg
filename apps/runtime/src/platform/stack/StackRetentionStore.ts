import { RetainedAirStateSchema, retainedStateFor } from '@cg/shared-schema';
import type { RetainedStackItem, StackItemState } from '@cg/shared-schema';
import type { Workspace } from '@cg/storage';

const PATH = 'stack/retained.json';

/**
 * B-092 — the browser-local retention of the operator's STACK INTENT, so the
 * stack survives a restart of the bridge process.
 *
 * The stack otherwise lives ONLY in the bridge's in-memory Reconciler: kill the
 * bridge and every row the operator built is gone, because the restarted
 * process boots empty and the SPA re-pulls that empty snapshot. This store is
 * the SPA's own copy of what the stack IS, mirrored from every published
 * snapshot and re-delivered to the bridge on every (re)connect
 * (`WebSocketRuntime.#resync`).
 *
 * It is deliberately the sibling of B-085's `LibraryStore` — same file-backed
 * `Workspace` (OPFS in the browser, in-memory in tests), same "the SPA owns it,
 * the bridge is a delivery target" model, same "reads never throw" doctrine.
 * The difference is what it holds: INTENT, not reconciled state. Nothing here
 * decides what is on air — the bridge does that against real OSC occupancy.
 *
 * Order matters (the stack is an ordered list), so this persists a single
 * ordered array rather than a file per item.
 */
export class StackRetentionStore {
  readonly #ws: Workspace;
  #items: RetainedStackItem[] = [];
  #hydrated = false;

  constructor(ws: Workspace) {
    this.#ws = ws;
  }

  /**
   * Load the persisted intent into memory. Idempotent. A corrupt/partial file
   * degrades to an empty stack rather than throwing — the storage doctrine.
   */
  async hydrate(): Promise<void> {
    if (this.#hydrated) return;
    this.#hydrated = true;
    try {
      const rec = await this.#ws.readJson<RetainedStackItem[]>(PATH);
      if (Array.isArray(rec)) {
        this.#items = rec.filter(
          (i) =>
            typeof i.itemId === 'string' &&
            typeof i.templateId === 'string' &&
            // B-107/B-109 — a record with no usable STATE is dropped rather than
            // given a default. The whole point of this change is that a row's state
            // is never guessed: picking a comfortable value for a record that does
            // not carry one is the exact defect, one layer down. A record written by
            // a build that predates the state field is such a record, and under the
            // compatibility-floor policy (P-031) it is not owed a conversion — the
            // cost is one stack rebuild, once, on a product that has not shipped.
            RetainedAirStateSchema.safeParse(i.state).success,
        );
      }
    } catch {
      // skip a corrupt/partial record
    }
  }

  /** The retention set, in stack order — what `#resync` re-delivers. */
  items(): readonly RetainedStackItem[] {
    return this.#items;
  }

  /**
   * Mirror a published stack snapshot into the retention set (replace-all, so a
   * removal is a removal and the order is the snapshot's).
   *
   * The caller is responsible for NOT mirroring a snapshot that may be the
   * empty one a freshly-booted bridge reports before its restore lands —
   * otherwise the bug would erase its own fix. See `WebSocketRuntime.#resync`.
   */
  async mirror(snapshot: readonly StackItemState[]): Promise<void> {
    this.#items = snapshot.map(toRetained);
    await this.#ws.writeJson(PATH, this.#items);
  }
}

/**
 * Reduce reconciled state back to INTENT: what the operator asked for, plus the
 * STATE that justified it.
 *
 * ⭐ **B-107 / B-109 — this used to reduce the row to `played: boolean`, and that
 * is the bug.** One bit cannot tell a FAILED row from a deliberately CLEARed row
 * from a genuinely pre-rolled one, so a bridge death replayed all three as the
 * same thing: an errored row came back READY, and a cleared graphic was re-ADDed
 * onto its layer unasked.
 *
 * 🔴 **The status → state map is NOT written here.** It is
 * `@cg/shared-schema`'s `retainedStateFor`, and the reason is golden rule 6: this
 * used to hold a LOCAL `isPlayed` list of statuses, and `B-107`'s own notes name
 * "two status-derivation sites that can drift" as a live hazard. There is now one
 * site. Do not inline it back.
 */
function toRetained(item: StackItemState): RetainedStackItem {
  const state = retainedStateFor(item.status);
  return {
    itemId: item.itemId,
    templateId: item.templateId,
    fields: item.fields,
    state,
    // Only an `error` state carries a code, and only its own: an `errorCode` set for
    // a different purpose (B-093's `osc-unverifiable` rides an `unverified` row)
    // must not travel as if it were a failure this row suffered.
    ...(state === 'error' && item.errorCode !== undefined && { errorCode: item.errorCode }),
    ...(item.slot !== undefined && { slot: item.slot }),
    ...(item.position !== undefined && { position: item.position }),
    // R-048 / C-015 phase 6 (6.9d) — the per-plate source override travels with
    // the row, for the same reason `position` does and with a sharper cost: a
    // momentary bridge blip that dropped it would silently revert the plate to
    // the DEAD source the operator patched around, on air, with the row still
    // showing the substitution. That is the B-107 / B-109 class exactly —
    // retention dropping state it did not model.
    ...(item.sourceOverride !== undefined && { sourceOverride: item.sourceOverride }),
    // Session BM — and the PER-LOOK composition, which is the same class again and the
    // easiest of the four to lose, because it is the only one whose loss is invisible until
    // somebody SWITCHES: the look on air keeps working, and the look the operator composed
    // silently reverts to the template assignment the moment they cut to it.
    ...(item.lookSourceOverride !== undefined && { lookSourceOverride: item.lookSourceOverride }),
    // 🔴 SESSION BP — and the FROZEN level 2, whose loss is the most consequential of the
    // six, because losing it does not merely revert a value: it re-arms the mechanism the
    // freeze exists to disable. A blip that dropped this THAWS every on-air row, and every
    // assignment edited during the show lands on air at the first reconcile after the
    // reconnect — `B-155` through the one door nobody is watching.
    ...(item.frozenAssignment !== undefined && { frozenAssignment: item.frozenAssignment }),
    // C-015 phase 6 (6.5f) — and the per-plate AUDIO INTENT, which needs this more
    // than either neighbour. A dropped position or source override shows the wrong
    // PICTURE, and somebody sees it; a dropped volume shows the RIGHT picture in
    // silence, with every console reporting the row as normal. The raise half of
    // the audio rule is nothing but memory, so losing the memory IS losing the
    // feature (B-107 / B-109).
    ...(item.plateVolumes !== undefined && { plateVolumes: item.plateVolumes }),
    // §14 (LOOKS) Stage E — and the ACTIVE LOOK. The bridge’s own map is process memory,
    // so this is the only thing that carries the operator’s choice across a blip. Dropped,
    // an adopted row leaves the picker asserting a look that is not on air, and a re-ADDed
    // one silently reverts to the authored default (B-107 / B-109).
    ...(item.activeLookId !== undefined && { activeLookId: item.activeLookId }),
  };
}
