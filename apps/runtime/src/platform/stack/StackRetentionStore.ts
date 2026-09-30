import { RetainedAirStateSchema, retainedFromStackItem } from '@cg/shared-schema';
import type { RetainedStackItem, StackItemState } from '@cg/shared-schema';
import type { Workspace } from '@cg/storage';

const PATH = 'stack/retained.json';

/**
 * B-092 — this console's DISPLAY copy of the stack: the rows it shows while CG Bridge cannot be
 * reached, and across a page reload with the bridge down (`WebSocketRuntime`'s offline projection).
 *
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`): it used to be what made the stack survive a bridge restart —
 * re-delivered on every (re)connect. With one bridge serving several consoles a re-delivered copy
 * was a claim on the truth that a stale console could win, so the bridge keeps and restores its
 * stack itself now (its `bridge-stack.json`, the same record — {@link retainedFromStackItem}).
 * This store is mirrored from every published snapshot and NEVER sent.
 *
 * It is the sibling of B-085's `LibraryStore` — same file-backed `Workspace` (OPFS in the browser,
 * in-memory in tests), same "reads never throw" doctrine. It holds INTENT, not reconciled state.
 * Nothing here decides what is on air.
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

  /** The display copy, in stack order — what the offline view shows. */
  items(): readonly RetainedStackItem[] {
    return this.#items;
  }

  /**
   * Mirror a published stack snapshot into the display copy (replace-all, so a removal is a
   * removal and the order is the snapshot's). (`DESKTOP-APPS-01-D` j's kept strays went with the
   * re-delivery: the bridge persists its strays itself — `CENTRAL-BRIDGE-01`.)
   */
  async mirror(snapshot: readonly StackItemState[]): Promise<void> {
    this.#items = snapshot.map(retainedFromStackItem);
    await this.#ws.writeJson(PATH, this.#items);
  }
}
