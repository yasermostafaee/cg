import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import {
  UTC_OFFSET_MASK_PLACEHOLDER,
  editUtcOffsetMask,
  formatUtcOffset,
  parseUtcOffset,
} from './clock-offset.js';
import * as s from './controls.css.js';

interface ClockOffsetFieldProps {
  value: number;
  onCommit: (minutes: number) => void;
}

/** The clock's one masked, fixed-width `±HH:MM` authoring control. */
export function ClockOffsetField(props: ClockOffsetFieldProps): JSX.Element {
  const [draft, setDraft] = useState(() => ({
    text: formatUtcOffset(props.value),
    value: props.value,
    refusal: null as string | null,
  }));
  const fresh = draft.value === props.value;
  const text = fresh ? draft.text : formatUtcOffset(props.value);
  const refusal = fresh ? draft.refusal : null;
  const caret = useRef<{ element: HTMLInputElement; at: number } | null>(null);

  useLayoutEffect(() => {
    const next = caret.current;
    if (next === null) return;
    caret.current = null;
    if (next.element.ownerDocument.activeElement === next.element) {
      next.element.setSelectionRange(next.at, next.at);
    }
  });

  const apply = (nextText: string, nextRefusal: string | null): void => {
    const minutes = parseUtcOffset(nextText);
    const value = minutes ?? props.value;
    setDraft({ text: nextText, value, refusal: nextRefusal });
    if (minutes !== undefined && minutes !== props.value) props.onCommit(minutes);
  };

  const edit = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const passthrough = new Set([
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'Enter',
      'Escape',
    ]);
    if (passthrough.has(event.key)) return;
    event.preventDefault();
    const element = event.currentTarget;
    const at = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? at;
    const result = editUtcOffsetMask(text, event.key, at, end);
    caret.current = { element, at: result.caret };
    apply(result.text, result.refused ?? null);
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    const minutes = parseUtcOffset(pasted);
    if (minutes === undefined) {
      apply(text, 'Enter a valid offset as ±HH:MM.');
      return;
    }
    apply(formatUtcOffset(minutes), null);
  };

  return (
    <div className={s.row}>
      <span className={s.label}>UTC offset</span>
      <div className="cg-field">
        <input
          className={s.inputInner}
          type="text"
          aria-label="UTC offset"
          aria-invalid={refusal !== null}
          inputMode="numeric"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          placeholder={UTC_OFFSET_MASK_PLACEHOLDER}
          maxLength={6}
          value={text}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={edit}
          onPaste={paste}
          onChange={(event) => {
            // Browser/automation replacement and IME input arrive here rather than through
            // keydown. Only a complete valid mask is accepted; letters can never enter `value`.
            const minutes = parseUtcOffset(event.target.value);
            if (minutes === undefined) {
              apply(text, 'Enter a valid offset as ±HH:MM.');
              return;
            }
            apply(formatUtcOffset(minutes), null);
          }}
          onBlur={() =>
            setDraft({ text: formatUtcOffset(props.value), value: props.value, refusal: null })
          }
        />
      </div>
      {refusal !== null && (
        <span className={s.fieldRefusal} role="status">
          {refusal}
        </span>
      )}
    </div>
  );
}
