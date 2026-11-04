import { repeaterRowLimit, type ListItem, type RepeaterElement } from '@cg/shared-schema';
import { sampleTransition, type SequenceEdge } from './sequence-motion.js';
import type { RuntimeClock } from './types.js';

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
  /** The visual node inside the clipped cell; D-197 entrances move/fade this node. */
  motion: HTMLElement;
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
  /** Injectable animation clock for deterministic timing and teardown tests. */
  clock?: RuntimeClock | undefined;
}

export class RepeaterDriver {
  private readonly o: RepeaterDriverOptions;
  /** The latest known list — authored at construction, then live-updated. */
  private effectiveItems: ListItem[];
  private rows: RepeaterRowHandle[] = [];
  private running = false;
  private paused = false;
  private destroyed = false;
  private frameHandle: number | null = null;
  /** Completed active time before the current running segment. */
  private elapsedMs = 0;
  private segmentStartedAt = 0;
  private readonly now: () => number;
  private readonly raf: (cb: (timestamp: number) => void) => number;
  private readonly cancel: (handle: number) => void;

  constructor(options: RepeaterDriverOptions) {
    this.o = options;
    this.now = options.clock?.now ?? (() => Date.now());
    this.raf = options.clock?.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = options.clock?.cancel ?? ((handle) => cancelAnimationFrame(handle));
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
    this.cancelEntranceFrame();
    this.running = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.restamp();
    this.restoreRows();
  }

  start(): void {
    if (this.destroyed) return;
    this.running = true;
    this.paused = false;
    this.beginEntrance();
  }

  pause(): void {
    if (!this.running || this.paused || this.destroyed) return;
    this.elapsedMs = Math.min(this.entranceTotalMs(), this.currentElapsedMs());
    this.paused = true;
    this.cancelEntranceFrame();
    this.paintEntrance(this.elapsedMs);
  }

  resume(): void {
    if (!this.running || !this.paused || this.destroyed) return;
    this.paused = false;
    if (this.elapsedMs >= this.entranceTotalMs()) {
      this.restoreRows();
      return;
    }
    this.segmentStartedAt = this.now();
    this.scheduleEntranceFrame();
  }

  stop(): void {
    this.cancelEntranceFrame();
    this.running = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.restoreRows();
  }

  destroy(): void {
    this.cancelEntranceFrame();
    this.teardown();
    this.running = false;
    this.paused = false;
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
    // A row re-shown during the build adopts the pose for its authored index. The timeline does not
    // restart and the child scope has never stopped, preserving D-030's live-value semantics.
    this.paintEntrance(this.currentElapsedMs());
    // A LONGER list cannot grow mid-hold (no mid-run scope creation in v1) —
    // the extra items take effect at the next fresh play.
  }

  // — internals ————————————————————————————————————————————————————————

  private entranceEdge(): SequenceEdge {
    return this.o.element.itemEntrance ?? 'none';
  }

  private transitionMs(): number {
    const value = this.o.element.itemTransitionMs;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 400;
  }

  private staggerMs(): number {
    const value = this.o.element.itemStaggerMs;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  private entranceTotalMs(): number {
    if (this.entranceEdge() === 'none' || this.rows.length === 0) return 0;
    return (this.rows.length - 1) * this.staggerMs() + this.transitionMs();
  }

  private beginEntrance(): void {
    this.cancelEntranceFrame();
    this.elapsedMs = 0;
    const total = this.entranceTotalMs();
    if (total <= 0) {
      this.restoreRows();
      return;
    }
    this.segmentStartedAt = this.now();
    this.paintEntrance(0);
    this.scheduleEntranceFrame();
  }

  private currentElapsedMs(): number {
    if (!this.running || this.paused || this.elapsedMs >= this.entranceTotalMs()) {
      return this.elapsedMs;
    }
    return Math.min(
      this.entranceTotalMs(),
      this.elapsedMs + Math.max(0, this.now() - this.segmentStartedAt),
    );
  }

  private scheduleEntranceFrame(): void {
    if (this.frameHandle !== null || this.destroyed || this.paused) return;
    this.frameHandle = this.raf(() => {
      this.frameHandle = null;
      if (!this.running || this.paused || this.destroyed) return;
      const now = this.now();
      this.elapsedMs = Math.min(
        this.entranceTotalMs(),
        this.elapsedMs + Math.max(0, now - this.segmentStartedAt),
      );
      this.segmentStartedAt = now;
      this.paintEntrance(this.elapsedMs);
      if (this.elapsedMs < this.entranceTotalMs()) this.scheduleEntranceFrame();
      else this.restoreRows();
    });
  }

  private cancelEntranceFrame(): void {
    if (this.frameHandle === null) return;
    this.cancel(this.frameHandle);
    this.frameHandle = null;
  }

  private paintEntrance(elapsedMs: number): void {
    const edge = this.entranceEdge();
    if (edge === 'none') {
      this.restoreRows();
      return;
    }
    const transitionMs = this.transitionMs();
    const staggerMs = this.staggerMs();
    for (let i = 0; i < this.rows.length; i += 1) {
      const row = this.rows[i];
      if (row === undefined) continue;
      const rowElapsed = elapsedMs - i * staggerMs;
      if (rowElapsed < 0) {
        row.motion.style.visibility = 'hidden';
        row.motion.style.opacity = '0';
        row.motion.style.transform = '';
        continue;
      }
      if (rowElapsed >= transitionMs) {
        restoreRow(row);
        continue;
      }
      const frame = sampleTransition(
        {
          inEdge: edge,
          outEdge: 'none',
          timing: 'simultaneous',
          transitionMs,
          box: {
            width: cssPixels(row.cell.style.width),
            height: cssPixels(row.cell.style.height),
          },
        },
        rowElapsed,
      );
      row.motion.style.visibility = frame.in.visible ? 'visible' : 'hidden';
      row.motion.style.opacity = String(frame.in.opacity);
      row.motion.style.transform = `translate(${String(frame.in.offset.x)}px, ${String(frame.in.offset.y)}px)`;
    }
  }

  private restoreRows(): void {
    for (const row of this.rows) restoreRow(row);
  }

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
    // `B-106` — the limit is `repeaterRowLimit`'s, the ONE reading the build-time stamp
    // (`clampRowCount`) and the Designer's row editor share; this used to spell it itself.
    const limit = repeaterRowLimit(this.o.element);
    const clamped =
      limit !== undefined ? this.effectiveItems.slice(0, limit) : [...this.effectiveItems];
    this.rows = this.o.stampRows(clamped);
  }
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function restoreRow(row: RepeaterRowHandle): void {
  row.motion.style.visibility = '';
  row.motion.style.opacity = '';
  row.motion.style.transform = '';
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
