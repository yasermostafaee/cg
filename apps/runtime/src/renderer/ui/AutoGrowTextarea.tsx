import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * A `<textarea>` that SIZES ITSELF to its content.
 *
 * Why this exists. The Inspector's list-item editors were fixed at
 * `rows={min(max(lineCount, 2), 8)}` — a count of NEWLINES. That is the wrong
 * measure: a Persian headline with no newline in it at all still wraps to three or
 * four VISUAL lines inside a narrow box, and the control stayed two rows tall with
 * the rest hidden behind an inner scrollbar. Newlines are not lines; wrapped height
 * is, and only the browser knows it — hence `scrollHeight`.
 *
 * It grows AND shrinks, so deleting text gives the space back rather than leaving a
 * tall empty box. `MAX_H` caps it so one pathological item cannot take the whole
 * panel; past the cap the textarea scrolls internally.
 *
 * `resize: none` (via `cg-field--autogrow`) is deliberate and is NOT a loss of
 * control: a manual drag would be silently undone by the next keystroke, since this
 * re-measures on every value change. A handle that quietly stops working is worse
 * than no handle. The cap plus internal scrolling covers the long-content case.
 */

/** Growth ceiling, ~9 lines at the field's line-height. Beyond this it scrolls. */
const MAX_H = 200;

export function AutoGrowTextarea({
  value,
  className,
  ...rest
}: {
  value: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'rows'>): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // `useLayoutEffect`, not `useEffect`: the height must be right in the SAME frame
  // the new text paints, or every keystroke that adds a line shows a one-frame
  // clipped box. Keyed on `value` so it re-measures on external re-seeds too — a
  // push, a Discard, an apply, or a from-file load, none of which are keystrokes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    // Collapse first: `scrollHeight` never reports LESS than the current height, so
    // without this the box could only ever grow.
    el.style.height = 'auto';
    el.style.height = `${String(Math.min(el.scrollHeight, MAX_H))}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={['cg-field', 'cg-field--autogrow', className].filter(Boolean).join(' ')}
      value={value}
      // Two rows is the FLOOR (a one-line item still reads as a text area, not an
      // input); the effect above decides the real height from here.
      rows={2}
      {...rest}
    />
  );
}
