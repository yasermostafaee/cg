import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A — **A LIST THAT DRAWS ONLY WHAT IS IN VIEW.** The Playout's media
 * library runs to thousands of items (`.111` has 86 today; the contract was measured at 50,000), and
 * a picker that mounted a row per item would stall the console it is part of. The console had no
 * such list (§0.6), so this is the ONE, in `renderer/ui/`.
 *
 * ── WHAT IT OWNS AND WHAT IT DOES NOT ───────────────────────────────────────────────────
 *
 * It owns the SCROLL (a fixed row height, a spacer, and the rows in view plus a margin), the
 * ARIA of a `listbox` and its `option`s, the pointer (a press on an option picks it) and keeping
 * the ACTIVE row in view. The KEYS are its caller's: a picker drives the active row from a search
 * field as often as from the list, so the one key handler lives there and is handed in.
 *
 * A row is an OPTION or a HEADING. A heading is a group's label (`Recent`, `All media`): shown,
 * never active, never picked.
 *
 * ⚠ jsdom has no layout, so the rows in view are computed from the `height` PROP, never measured —
 * which is also what makes the first screen deterministic in a real browser before a scroll.
 */

export interface VirtualRow {
  readonly kind: 'option' | 'heading';
  /** A stable key — the option's value, or the heading's label. */
  readonly key: string;
  readonly content: ReactNode;
  /** Use a stable option name when its auxiliary reading changes over time. */
  readonly ariaLabel?: string;
  readonly ariaDescription?: string | undefined;
  /** A separate action in a grid, or a decorative slot alongside a listbox option. */
  readonly trailing?: ReactNode;
  readonly trailingAccessible?: boolean;
  /** An option that cannot be picked: shown, with its reason in `title`. */
  readonly disabled?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly title?: string | undefined;
  /** Extra attributes a finder reads (`data-*`). */
  readonly data?: Readonly<Record<`data-${string}`, string>> | undefined;
}

export interface VirtualListHandle {
  /** Bring one row into view. */
  scrollToIndex(index: number): void;
  focus(): void;
  columnCount(): number;
}

export interface VirtualListProps {
  id: string;
  'aria-label': string;
  rows: readonly VirtualRow[];
  /** One row's height, px — every row is this tall. */
  rowHeight: number;
  /** The viewport's height, px. */
  height: number;
  /** The active option's index (the keyboard's), or `null`. */
  activeIndex: number | null;
  onPick: (index: number) => void;
  onActiveChange: (index: number) => void;
  onKeyDown?: ((e: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  /** Called once each time the view comes within {@link nearEndRows} rows of the end. */
  onNearEnd?: (() => void) | undefined;
  nearEndRows?: number | undefined;
  /** Rows drawn beyond the view on each side. */
  overscan?: number | undefined;
  /** A finder's attributes on the listbox (`data-*`). */
  data?: Readonly<Record<`data-${string}`, string>> | undefined;
  withActions?: boolean;
  /** Lay out a short catalogue in responsive tiles. Large libraries use virtual rows. */
  tiled?: boolean;
  /** Virtualized tiles for a paged library. A heading spans the full width. */
  columns?: number;
  gap?: number;
  headingHeight?: number;
}

/** The option id for a row, for a field's `aria-activedescendant`. */
export function optionId(listId: string, index: number): string {
  return `${listId}-opt-${String(index)}`;
}

interface RowPosition {
  readonly top: number;
  readonly height: number;
  readonly column: number;
}

function layoutRows(
  rows: readonly VirtualRow[],
  rowHeight: number,
  headingHeight: number,
  columns: number,
  gap: number,
) {
  let top = 0;
  let column = 0;
  const positions = rows.map((row): RowPosition => {
    if (row.kind === 'heading') {
      if (column > 0) top += rowHeight + gap;
      column = 0;
      const position = { top, height: headingHeight, column: 0 };
      top += headingHeight;
      return position;
    }
    const position = { top, height: rowHeight, column };
    column += 1;
    if (column === columns) {
      column = 0;
      top += rowHeight + gap;
    }
    return position;
  });
  const last = positions.at(-1);
  return { positions, height: last === undefined ? 0 : last.top + last.height };
}

/** Find the viewport boundary in the sorted track positions. */
function indexAt(positions: readonly RowPosition[], at: number, edge: 'top' | 'bottom'): number {
  let start = 0;
  let end = positions.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    const position = positions[middle];
    if (position === undefined) break;
    if (edge === 'top' ? position.top < at : position.top + position.height <= at)
      start = middle + 1;
    else end = middle;
  }
  return start;
}

export const VirtualList = forwardRef<VirtualListHandle, VirtualListProps>(function VirtualList(
  {
    id,
    'aria-label': ariaLabel,
    rows,
    rowHeight,
    height,
    activeIndex,
    onPick,
    onActiveChange,
    onKeyDown,
    onNearEnd,
    nearEndRows = 10,
    overscan = 6,
    withActions = false,
    tiled = false,
    columns,
    gap = 0,
    headingHeight = rowHeight,
    data,
  },
  ref,
): JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const nearEndFired = useRef(false);

  const virtualColumns = columns ?? 1;
  const columnWidth = `calc((100% - ${(virtualColumns - 1) * gap}px) / ${virtualColumns})`;
  const layout = useMemo(
    () => layoutRows(tiled ? [] : rows, rowHeight, headingHeight, virtualColumns, gap),
    [tiled, rows, rowHeight, headingHeight, virtualColumns, gap],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex(index: number): void {
        const el = viewport.current;
        if (el === null) return;
        if (tiled) {
          const option = el.querySelector(`[data-vlist-index="${String(index)}"]`);
          (option?.closest('[data-vlist-tile-index]') ?? option)?.scrollIntoView?.({
            block: 'nearest',
          });
          return;
        }
        const position = layout.positions[index];
        if (position === undefined) return;
        const { top, height: itemHeight } = position;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + itemHeight > el.scrollTop + height) el.scrollTop = top + itemHeight - height;
        setScrollTop(el.scrollTop);
      },
      focus(): void {
        viewport.current?.focus();
      },
      columnCount(): number {
        const tiles = viewport.current?.firstElementChild;
        if (!tiled || tiles == null) return virtualColumns;
        return Math.max(1, getComputedStyle(tiles).gridTemplateColumns.trim().split(/\s+/).length);
      },
    }),
    [layout, height, tiled, virtualColumns],
  );

  const first = tiled ? 0 : Math.max(0, indexAt(layout.positions, scrollTop, 'bottom') - overscan);
  // Include the whole last visible track, even when the next item starts within the viewport.
  const lastInView = indexAt(layout.positions, scrollTop + height, 'top');
  const last = tiled ? rows.length : Math.min(rows.length, lastInView + overscan);

  // The next page: once per approach to the end, re-armed when the list grows.
  useEffect(() => {
    nearEndFired.current = false;
  }, [rows.length]);
  useEffect(() => {
    if (onNearEnd === undefined || nearEndFired.current) return;
    if (rows.length - lastInView <= nearEndRows) {
      nearEndFired.current = true;
      onNearEnd();
    }
  }, [lastInView, rows.length, nearEndRows, onNearEnd]);

  const optionAt = (target: EventTarget | null, includeActionRow: boolean): number | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>(
      includeActionRow ? '[data-vlist-index], [data-vlist-action-index]' : '[data-vlist-index]',
    );
    if (el === null) return null;
    const index = Number(el.dataset['vlistIndex'] ?? el.dataset['vlistActionIndex']);
    const row = rows[index];
    if (row === undefined || row.kind !== 'option' || row.disabled === true) return null;
    return index;
  };

  return (
    <div
      ref={viewport}
      id={id}
      role={withActions ? 'grid' : 'listbox'}
      aria-label={ariaLabel}
      tabIndex={0}
      {...(activeIndex !== null ? { 'aria-activedescendant': optionId(id, activeIndex) } : {})}
      className={tiled ? 'cg-vlist cg-vlist--tiles' : 'cg-vlist'}
      {...(data ?? {})}
      style={tiled ? { maxHeight: height } : { height, maxHeight: height }}
      onScroll={tiled ? undefined : (e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      onPointerMove={(e) => {
        const index = optionAt(e.target, true);
        if (index !== null && index !== activeIndex) onActiveChange(index);
      }}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('button, input') !== null) return;
        const index = optionAt(e.target, tiled || columns !== undefined);
        if (index !== null) onPick(index);
      }}
    >
      <div className="cg-vlist-spacer" style={tiled ? undefined : { height: layout.height }}>
        {rows.slice(first, last).map((row, offset) => {
          const index = first + offset;
          const position = layout.positions[index];
          const style =
            position === undefined
              ? undefined
              : {
                  top: position.top,
                  height: position.height,
                  ...(columns !== undefined &&
                    row.kind === 'option' && {
                      insetInlineStart: `calc(${position.column} * (${columnWidth} + ${gap}px))`,
                      insetInlineEnd: 'auto',
                      inlineSize: columnWidth,
                    }),
                };
          if (row.kind === 'heading') {
            return (
              <div
                key={`h:${row.key}`}
                role="presentation"
                className="cg-vlist-heading"
                style={style}
                data-vlist-heading={row.key}
              >
                {row.content}
              </div>
            );
          }
          const active = index === activeIndex;
          const descriptionId = `${optionId(id, index)}-description`;
          const hasTrailing = withActions || row.trailing !== undefined;
          const option = (
            <div
              key={`o:${row.key}`}
              id={optionId(id, index)}
              role={withActions ? 'gridcell' : 'option'}
              aria-label={row.ariaLabel}
              aria-describedby={row.ariaDescription === undefined ? undefined : descriptionId}
              aria-selected={row.selected === true}
              aria-disabled={row.disabled === true}
              className={`cg-vlist-option${active ? ' is-active' : ''}`}
              style={hasTrailing ? undefined : style}
              data-vlist-index={String(index)}
              {...(row.title !== undefined ? { title: row.title } : {})}
              {...(row.data ?? {})}
            >
              {row.content}
              {row.ariaDescription !== undefined && (
                <span id={descriptionId} hidden>
                  {row.ariaDescription}
                </span>
              )}
            </div>
          );
          if (!hasTrailing) return option;
          return (
            <div
              key={`o:${row.key}`}
              role={withActions ? 'row' : 'presentation'}
              className="cg-vlist-action-row"
              data-vlist-action-index={index}
              data-vlist-tile-index={tiled ? index : undefined}
              style={style}
            >
              {option}
              <div
                role={withActions ? 'gridcell' : undefined}
                aria-hidden={!withActions && row.trailingAccessible !== true}
              >
                {row.trailing}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
