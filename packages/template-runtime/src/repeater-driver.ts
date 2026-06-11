import type { ListItem, RepeaterElement } from '@cg/shared-schema';

/**
 * D-030 — the repeater / data-driven-layout driver.
 *
 * One driver owns one repeater element's rows. Liveness model B:
 * - **Row COUNT is stamped at each fresh play:** `reset()` tears down the
 *   current rows (symmetric subtree teardown via the handles the runtime's
 *   `stampRows` callback returns) and stamps from the CURRENT effective
 *   items — the bound list field's effective value when bound (a retained
 *   pre-play `update()` included; the CasparCG ADD-data → PLAY flow honors
 *   any count) else the authored items — clamped by `maxItems`.
 * - **Row VALUES update live mid-hold:** `setItems()` applies values
 *   POSITIONALLY into the stamped rows (row i ← item i; reordering values
 *   is live by construction). A SHORTER list hides the surplus row cells
 *   (display only — their scopes persist and keep lifecycle state); a later
 *   regrowth within the stamped count re-shows them; a LONGER list defers
 *   to the next fresh play.
 *
 * The driver is NOT a content source (no `whenComplete`): rows are real
 * nested scopes whose own content sources drive their OWN content-driven
 * holds — the existing per-scope lifecycle semantics, unmodified. The heavy
 * lifting (build cell + row scope, apply values, wire the subtree through
 * `wireScopeSubtree`, attach under the hosting scope's controller node)
 * lives in the runtime-supplied {@link RepeaterDriverOptions.stampRows}
 * callback, so the driver stays a pure state machine over handles.
 */

/** One stamped row, as the runtime wires it. */
export interface RepeaterRowHandle {
  /** The flow-positioned cell (hidden/re-shown for shrink/regrow). */
  cell: HTMLElement;
  /** Apply this row's values through the per-scope apply path. */
  apply(values: Record<string, unknown>): void;
  /** Paint the row's animated elements at `frame` (the scrub-parity hook). */
  applyFrame(frame: number): void;
  /** Symmetric teardown: unwire drivers + controllers, detach the cell. */
  destroy(): void;
}

export interface RepeaterDriverOptions {
  element: RepeaterElement;
  /** The clipped outer box rows are stamped into. */
  host: HTMLElement;
  /**
   * Stamp one row per item (already clamped): build + value-apply + wire +
   * attach, returning the handles in row order. Runtime-supplied.
   */
  stampRows(items: ListItem[]): RepeaterRowHandle[];
}

export class RepeaterDriver {
  private readonly o: RepeaterDriverOptions;
  /** The latest known list — authored at construction, then live-updated. */
  private effectiveItems: ListItem[];
  private rows: RepeaterRowHandle[] = [];
  private running = false;
  private destroyed = false;

  constructor(options: RepeaterDriverOptions) {
    this.o = options;
    this.effectiveItems = options.element.items.map((i) => ({ ...i }));
    // Replace the scene-builder's static authored stamp with driver-managed
    // rows immediately, so the canvas (which never plays) gets value-applied,
    // scrubbable rows and every later path goes through one stamp mechanism.
    this.restamp();
  }

  /** The currently stamped rows (the runtime's scrub tick walks them). */
  get stampedRows(): readonly RepeaterRowHandle[] {
    return this.rows;
  }

  /**
   * Fresh-play stamp: tear down the current rows and stamp from the CURRENT
   * effective items, clamped by `maxItems`. Called by `play()` BEFORE the
   * controller cascade, so the new row subtrees enter the run like authored
   * children.
   */
  reset(): void {
    if (this.destroyed) return;
    this.restamp();
  }

  start(): void {
    if (this.destroyed) return;
    this.running = true;
  }

  /** Row scopes pause via the controller/driver cascade — nothing to do here. */
  pause(): void {
    /* the rows' own controllers/drivers freeze via the cascade */
  }

  resume(): void {
    /* the rows' own controllers/drivers continue via the cascade */
  }

  stop(): void {
    this.running = false;
  }

  destroy(): void {
    this.teardown();
    this.running = false;
    this.destroyed = true;
  }

  /**
   * The `repeater-items` binding path. Mid-run: positional live VALUES into
   * the stamped rows (shorter hides, regrowth within the stamped count
   * re-shows, longer defers to the next fresh play). Outside a run (canvas
   * editing, retained pre-play update): re-stamp so the count is live too.
   */
  setItems(items: ListItem[]): void {
    this.effectiveItems = items.map((i) => ({ ...i }));
    if (this.destroyed) return;
    if (!this.running) {
      this.restamp();
      return;
    }
    for (let i = 0; i < this.rows.length; i += 1) {
      const row = this.rows[i];
      const item = this.effectiveItems[i];
      if (row === undefined) continue;
      if (item === undefined) {
        // Shorter list: hide the surplus cell — display only, the scope
        // persists (a later regrowth within the stamped count re-shows it).
        row.cell.style.display = 'none';
        continue;
      }
      row.cell.style.display = '';
      row.apply(itemValues(item));
    }
    // A LONGER list cannot grow mid-hold (no mid-run scope creation in v1) —
    // the extra items take effect at the next fresh play.
  }

  // — internals ————————————————————————————————————————————————————————

  private teardown(): void {
    // Detach the registry FIRST and survive a throwing destroy: one failed
    // row teardown must not strand its siblings' scope nodes in the hosting
    // cascade (they'd keep receiving play/stop with no owner).
    const rows = this.rows;
    this.rows = [];
    for (const row of rows) {
      try {
        row.destroy();
      } catch {
        // A row that fails to tear down is already detached from `rows`;
        // the leftover-cell sweep below still removes its DOM.
      }
    }
    // Also clear any non-driver-managed stamped cells (the scene-builder's
    // build-time authored stamp on the very first restamp).
    for (const leftover of [...this.o.host.querySelectorAll('[data-cg-repeater-row]')]) {
      leftover.remove();
    }
  }

  private restamp(): void {
    this.teardown();
    const max = this.o.element.maxItems;
    const clamped =
      max !== undefined ? this.effectiveItems.slice(0, max) : [...this.effectiveItems];
    this.rows = this.o.stampRows(clamped);
  }
}

/** Strip the reconcile `id` — the remaining keys are the child field values. */
function itemValues(item: ListItem): Record<string, unknown> {
  const { id: _id, ...values } = item as Record<string, unknown>;
  return values;
}

/**
 * Host-node → driver registry, so the bindings applier (which only sees the
 * element map) can route a `repeater-items` field value to the right driver.
 */
const registry = new WeakMap<HTMLElement, RepeaterDriver>();

export function registerRepeaterDriver(host: HTMLElement, driver: RepeaterDriver): void {
  registry.set(host, driver);
}

export function repeaterDriverFor(host: HTMLElement): RepeaterDriver | undefined {
  return registry.get(host);
}

/** Normalize a `list` field value into row items (objects only; junk → bare rows). */
export function coerceRepeaterItems(raw: readonly unknown[]): ListItem[] {
  return raw.map((v, i) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const id = typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `row-${String(i)}`;
      return { ...o, id } as ListItem;
    }
    return { id: `row-${String(i)}` } as ListItem;
  });
}
