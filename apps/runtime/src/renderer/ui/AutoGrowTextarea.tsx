import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { EDITOR_DIR } from './editorTextDirection.js';

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
 * ── THE RESIZE GRIP, AND WHY IT TOOK A HANDOFF TO GET RIGHT ─────────────────
 *
 * This used to be `resize: none`, on the reasoning that a manual drag would be
 * silently undone by the next keystroke — a handle that quietly stops working is
 * worse than no handle. That reasoning was sound and the conclusion was wrong:
 * the owner needs to open up one of four headline items, and the answer to "the
 * drag gets undone" is to STOP UNDOING IT, not to remove the grip.
 *
 * So the grip is back (`resize: vertical`) and a drag WINS PERMANENTLY for that
 * textarea: the first manual resize latches `manual`, and auto-sizing never runs
 * on that element again. The operator has stated a height; nothing this component
 * knows outranks that.
 *
 * The latch is per-ELEMENT and per-mount, deliberately. It is not persisted and
 * not lifted into the draft — a box height is a view preference, not field
 * content, and it must never reach the staged value or the scene. Switching stack
 * items remounts these controls (the Inspector keys them by item+path), so a fresh
 * item starts auto-sizing again, which is right: the height an operator chose for
 * one headline is not a claim about the next one.
 *
 * DETECTED, NOT INTERCEPTED. There is no resize event on a textarea drag that
 * distinguishes it from our own write, so this compares the element's height
 * against the last height WE set: if they differ, something else moved it, and the
 * only thing that can is the grip. That is why `lastSet` exists — without it we
 * cannot tell our own effect from the operator.
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
  /** The last height WE wrote — the only way to recognise a height we did not. */
  const lastSet = useRef<string | null>(null);
  /** The operator has dragged the grip. Auto-sizing is over for this element. */
  const manual = useRef(false);

  // `useLayoutEffect`, not `useEffect`: the height must be right in the SAME frame
  // the new text paints, or every keystroke that adds a line shows a one-frame
  // clipped box. Keyed on `value` so it re-measures on external re-seeds too — a
  // push, a Discard, an apply, or a from-file load, none of which are keystrokes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    // A HEIGHT WE DID NOT WRITE IS THE OPERATOR'S. Checked before the latch is
    // read, so a drag is noticed on the very next keystroke rather than a frame
    // later — otherwise that keystroke would stamp our height over theirs, which
    // is the exact "handle that quietly stops working" this design rejects.
    if (lastSet.current !== null && el.style.height !== lastSet.current) {
      manual.current = true;
    }
    if (manual.current) return;
    // Collapse first: `scrollHeight` never reports LESS than the current height, so
    // without this the box could only ever grow.
    el.style.height = 'auto';
    const next = `${String(Math.min(el.scrollHeight, MAX_H))}px`;
    el.style.height = next;
    lastSet.current = next;
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
      // AFTER `rest`, so no caller can accidentally pin a direction on an editor.
      // See `editorTextDirection` — this is presentation only and never reaches the
      // value, the scene or air.
      dir={EDITOR_DIR}
    />
  );
}
