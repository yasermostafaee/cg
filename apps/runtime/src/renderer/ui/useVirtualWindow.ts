import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **ONLY THE ROWS IN VIEW ARE IN THE DOCUMENT.**
 *
 * The Log rendered every row it held; a record the owner can scroll back through for weeks cannot be
 * held that way. This decides which slice of a list to render inside a scroller: the rows in view,
 * plus `overscanPx` above and below, with the space of the rest kept by two spacers so the scrollbar
 * stays true. Rows may differ in height (a refused line, an id chip): each rendered row is MEASURED
 * (`measureRef`) and the measurement replaces `estimate` for it from then on.
 *
 * Headless — the caller keeps its markup and its classes (a hook, as `@cg/gesture`'s are), and the
 * list stays the caller's own element.
 *
 * ⚠ A scroller with no height yet (before layout; jsdom, which has none) renders the first
 * `minRendered` rows rather than none: a list that renders nothing until it has been measured would
 * show an empty dialog on its first frame.
 */
export interface VirtualWindow {
  /** The first rendered index. */
  readonly start: number;
  /** One past the last rendered index. */
  readonly end: number;
  /** The space of the rows above `start`, in px. */
  readonly padTop: number;
  /** The space of the rows from `end` on, in px. */
  readonly padBottom: number;
  /** The ref for the element of the row keyed `key`, which is measured while rendered. */
  readonly measureRef: (key: string) => (el: HTMLElement | null) => void;
}

export function useVirtualWindow(options: {
  /** Is the list mounted? The scroller is read again each time this turns true. */
  readonly active: boolean;
  /** The scrolling element. */
  readonly scroller: RefObject<HTMLElement | null>;
  /** The element the rows are rendered in — its offset in the scroller is where row 0 starts. */
  readonly list: RefObject<HTMLElement | null>;
  /** One stable key per row, in order. */
  readonly keys: readonly string[];
  /** A row's height until it is measured. */
  readonly estimate: number;
  readonly overscanPx?: number;
  readonly minRendered?: number;
}): VirtualWindow {
  const { active, scroller, list, keys, estimate } = options;
  const overscan = options.overscanPx ?? 600;
  const minRendered = options.minRendered ?? 30;
  const heights = useRef(new Map<string, number>());
  const [measured, setMeasured] = useState(0);
  const [view, setView] = useState({ top: 0, height: 0 });

  // The scroller's position and size, as they change.
  useEffect(() => {
    const el = active ? scroller.current : null;
    if (el === null) {
      setView({ top: 0, height: 0 });
      return undefined;
    }
    const read = (): void => setView({ top: el.scrollTop, height: el.clientHeight });
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      ro?.disconnect();
    };
  }, [active, scroller]);

  // One observer for every rendered row: a row's height is learned once it has laid out.
  const keyOf = useRef(new WeakMap<Element, string>());
  const rowObserver = useMemo(
    () =>
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            let changed = false;
            for (const entry of entries) {
              const key = keyOf.current.get(entry.target);
              const h = (entry.target as HTMLElement).offsetHeight;
              if (key === undefined || h === 0 || heights.current.get(key) === h) continue;
              heights.current.set(key, h);
              changed = true;
            }
            if (changed) setMeasured((n) => n + 1);
          }),
    [],
  );
  useEffect(() => () => rowObserver?.disconnect(), [rowObserver]);

  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const elements = useRef(new Map<string, HTMLElement>());
  const measureRef = useCallback(
    (key: string): ((el: HTMLElement | null) => void) => {
      let ref = refs.current.get(key);
      if (ref === undefined) {
        ref = (el: HTMLElement | null): void => {
          const previous = elements.current.get(key);
          if (previous !== undefined && previous !== el) rowObserver?.unobserve(previous);
          if (el === null) {
            elements.current.delete(key);
            return;
          }
          elements.current.set(key, el);
          keyOf.current.set(el, key);
          rowObserver?.observe(el);
        };
        refs.current.set(key, ref);
      }
      return ref;
    },
    [rowObserver],
  );

  const offsets = useMemo(() => {
    const out = new Array<number>(keys.length + 1);
    out[0] = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] ?? '';
      out[i + 1] = (out[i] ?? 0) + (heights.current.get(key) ?? estimate);
    }
    return out;
    // `measured` is the signal that `heights` changed.
  }, [keys, estimate, measured]);

  const total = offsets[keys.length] ?? 0;
  let start = 0;
  let end = Math.min(keys.length, minRendered);
  if (view.height > 0) {
    const rowsTop = list.current?.offsetTop ?? 0;
    const top = view.top - rowsTop - overscan;
    const bottom = view.top - rowsTop + view.height + overscan;
    start = 0;
    while (start < keys.length && (offsets[start + 1] ?? 0) <= top) start++;
    end = start;
    while (end < keys.length && (offsets[end] ?? 0) < bottom) end++;
  }
  return {
    start,
    end,
    padTop: offsets[start] ?? 0,
    padBottom: Math.max(0, total - (offsets[end] ?? 0)),
    measureRef,
  };
}
