import { useCallback, useEffect, useState } from 'react';

/**
 * Observe an element's content width. Returns a ref CALLBACK to attach and the
 * measured width (`null` until first measured).
 *
 * The Layers table degrades on the width of its own PANEL, not the viewport's,
 * and those are different numbers: the operator drags the Inspector divider and
 * the viewport never changes. A viewport media query would have missed the case
 * the review actually reported — a panel dragged small, clipping its verb block
 * at a perfectly wide screen size.
 *
 * A REF CALLBACK, NOT A `RefObject`, and this is the whole reason the hook looks
 * like this. The first version took a `RefObject` and observed `ref.current` in a
 * `useEffect` keyed on `[ref]`. That effect runs ONCE, and the element it wanted
 * did not exist yet: the layer list renders only once the bank snapshot has
 * arrived from the bridge, so on the first commit `ref.current` was null, the
 * effect bailed, and — because a ref object's identity never changes — nothing
 * ever re-ran it. The table therefore stayed at its widest density forever, which
 * measured as a clipped verb block at every width below ~1000px: exactly the
 * defect the density model was written to fix, reintroduced by the plumbing.
 *
 * A callback ref makes the element a piece of STATE, so appearing (or being
 * swapped) re-runs the effect by construction.
 */
export function useElementWidth<T extends HTMLElement>(): {
  ref: (el: T | null) => void;
  width: number | null;
} {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  // Stable across renders, so attaching it does not detach/reattach every commit.
  const ref = useCallback((node: T | null) => setEl(node), []);

  useEffect(() => {
    if (el === null) {
      setWidth(null);
      return;
    }
    // Absent in jsdom (unit tests render without layout). Leaving the width null
    // keeps the caller on its own default density rather than crashing a render.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      // `contentRect` excludes padding and border, which is exactly the box the
      // grid columns have to fit inside.
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return { ref, width };
}
