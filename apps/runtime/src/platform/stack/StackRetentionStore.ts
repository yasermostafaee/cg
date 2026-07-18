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
            typeof i.played === 'boolean',
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
 * one bit the restore cannot re-derive — whether the item had been taken to air.
 */
function toRetained(item: StackItemState): RetainedStackItem {
  return {
    itemId: item.itemId,
    templateId: item.templateId,
    fields: item.fields,
    played: isPlayed(item.status),
    ...(item.slot !== undefined && { slot: item.slot }),
    ...(item.position !== undefined && { position: item.position }),
  };
}

/**
 * Play evidence from the last published status.
 *
 * The ambiguous states resolve to TRUE on purpose. `exiting` (an out in flight
 * when the bridge died — the CLEAR may never have landed), `unconfirmed` (B-044:
 * a command whose ack never came) and `unverified` (B-086: the CasparCG link was
 * down, so the claim could not be checked) all describe an item that may well
 * still be rendering. Over-claiming is self-correcting — the bridge's occupancy
 * check demotes it to `loaded` the moment the layer proves silent — whereas
 * under-claiming would let a restore treat a LIVE layer as empty, which is the
 * error direction this codebase never takes.
 */
function isPlayed(status: StackItemState['status']): boolean {
  return (
    status === 'playing' ||
    status === 'on-air' ||
    status === 'updating' ||
    status === 'exiting' ||
    status === 'unconfirmed' ||
    status === 'unverified'
  );
}
