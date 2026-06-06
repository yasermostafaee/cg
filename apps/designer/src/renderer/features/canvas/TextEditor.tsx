import { useEffect, useRef } from 'react';
import type { TextElement } from '@cg/shared-schema';
import { detectDirection, ZWNJ } from '@cg/text-shaping';
import { designerStore } from '../../state/store.js';
import * as s from './TextEditor.css.js';

interface Props {
  element: TextElement;
  scale: number;
  onCommit: () => void;
}

/**
 * Inline text editor overlaid on the canvas — the operator double-clicks
 * a text element to enter edit mode; this component takes focus, renders
 * a contenteditable div in the same position, and commits on blur or
 * Escape.
 *
 * RTL behavior (Phase 4 §5 / Phase 6 §13):
 *   - `dir="rtl"` when the element's `direction` is `'rtl'` OR when
 *     `direction === 'auto'` and the text scans RTL via
 *     `@cg/text-shaping/detectDirection`. The caret then moves
 *     right-to-left and Backspace deletes the rightmost code point.
 *   - **Shift+Space** inserts ZWNJ (U+200C) at the caret. Persian
 *     keyboards typically bind this to Shift+Space; the operator
 *     guide notes it.
 *
 * Stylistic note: we intentionally use a system-rendered native
 * contenteditable rather than a custom caret. Browser caret handling
 * is the closest thing to the production CEF's behavior (Phase 4 §5),
 * so what the operator sees here is what they'll see on air.
 */
export function TextEditor({ element, scale, onCommit }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { transform, font, color, align, direction } = element;
  // Caret direction follows auto-detected RTL content so backspace
  // deletes the rightmost code point in Persian — but this is *not*
  // the same as the container direction the on-air runtime uses,
  // which only flips to RTL when the element explicitly opts in.
  const effectiveDir =
    direction === 'auto' ? (detectDirection(element.text) === 'rtl' ? 'rtl' : 'ltr') : direction;
  // Alignment must match what the operator sees on the canvas, where
  // the runtime treats `direction: 'auto'` as LTR for container
  // purposes. Resolving start/end to explicit left/right against the
  // runtime's effective direction keeps the editor's layout in sync —
  // otherwise an end-aligned Persian element appeared right on the
  // canvas and left in the inline editor.
  const runtimeDir: 'ltr' | 'rtl' = direction === 'rtl' ? 'rtl' : 'ltr';
  const resolvedTextAlign: 'left' | 'right' | 'center' | 'justify' =
    align === 'start'
      ? runtimeDir === 'rtl'
        ? 'right'
        : 'left'
      : align === 'end'
        ? runtimeDir === 'rtl'
          ? 'left'
          : 'right'
        : align;

  // Mount/focus the editor + select every character so an immediate
  // keystroke replaces the existing label outright (the operator
  // usually double-clicks a placeholder to overwrite it, not to
  // append).
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  function commitText(): void {
    const next = ref.current?.innerText ?? '';
    if (next !== element.text) {
      // setElementText also syncs a Data-key field's default so a bound
      // element's edit shows on the canvas instead of snapping back.
      designerStore.setElementText(element.id, next);
    }
    onCommit();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCommit();
      return;
    }
    if (e.shiftKey && e.key === ' ') {
      e.preventDefault();
      insertZwnjAtCaret();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
  }

  const w = transform.size.w * transform.scale.x * scale;
  const h = transform.size.h * transform.scale.y * scale;
  const x = transform.position.x * scale;
  const y = transform.position.y * scale;

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={commitText}
      onKeyDown={onKeyDown}
      dir={effectiveDir}
      className={s.editor}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        color,
        fontFamily: font.family,
        fontWeight: font.weight,
        fontStyle: font.style,
        fontSize: font.size * scale,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
        textAlign: resolvedTextAlign,
        transform:
          transform.rotation === 0 ? undefined : `rotate(${String(transform.rotation)}deg)`,
      }}
    >
      {element.text}
    </div>
  );
}

function insertZwnjAtCaret(): void {
  const sel = window.getSelection();
  if (sel === null || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(ZWNJ);
  range.insertNode(node);
  // Move caret after the inserted ZWNJ.
  range.setStartAfter(node);
  range.setEndAfter(node);
  sel.removeAllRanges();
  sel.addRange(range);
}
