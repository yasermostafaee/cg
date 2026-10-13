import {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
}

/** The option id for a row, for a field's `aria-activedescendant`. */
export function optionId(listId: string, index: number): string {
  return `${listId}-opt-${String(index)}`;
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
    data,
  },
  ref,
): JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const nearEndFired = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex(index: number): void {
        const el = viewport.current;
        if (el === null) return;
        const top = index * rowHeight;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + rowHeight > el.scrollTop + height) el.scrollTop = top + rowHeight - height;
        setScrollTop(el.scrollTop);
      },
      focus(): void {
        viewport.current?.focus();
      },
    }),
    [rowHeight, height],
  );

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  // The next page: once per approach to the end, re-armed when the list grows.
  useEffect(() => {
    nearEndFired.current = false;
  }, [rows.length]);
  useEffect(() => {
    if (onNearEnd === undefined || nearEndFired.current) return;
    const lastInView = Math.ceil((scrollTop + height) / rowHeight);
    if (rows.length - lastInView <= nearEndRows) {
      nearEndFired.current = true;
      onNearEnd();
    }
  }, [scrollTop, height, rowHeight, rows.length, nearEndRows, onNearEnd]);

  const pickFrom = (target: EventTarget | null): number | null => {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-vlist-index]') : null;
    if (el === null) return null;
    const index = Number(el.dataset['vlistIndex']);
    const row = rows[index];
    if (row === undefined || row.kind !== 'option' || row.disabled === true) return null;
    return index;
  };

  return (
    <div
      ref={viewport}
      id={id}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      {...(activeIndex !== null ? { 'aria-activedescendant': optionId(id, activeIndex) } : {})}
      className="cg-vlist"
      {...(data ?? {})}
      style={{ height, maxHeight: height }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      onPointerMove={(e) => {
        const index = pickFrom(e.target);
        if (index !== null && index !== activeIndex) onActiveChange(index);
      }}
      onClick={(e) => {
        const index = pickFrom(e.target);
        if (index !== null) onPick(index);
      }}
    >
      <div className="cg-vlist-spacer" style={{ height: rows.length * rowHeight }}>
        {rows.slice(first, last).map((row, offset) => {
          const index = first + offset;
          const style = { top: index * rowHeight, height: rowHeight };
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
          return (
            <div
              key={`o:${row.key}`}
              id={optionId(id, index)}
              role="option"
              aria-selected={row.selected === true}
              aria-disabled={row.disabled === true}
              className={`cg-vlist-option${active ? ' is-active' : ''}`}
              style={style}
              data-vlist-index={String(index)}
              {...(row.title !== undefined ? { title: row.title } : {})}
              {...(row.data ?? {})}
            >
              {row.content}
            </div>
          );
        })}
      </div>
    </div>
  );
});
