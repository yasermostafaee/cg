import { useEffect, useRef } from 'react';
import type { TextElement } from '@cg/shared-schema';
import { detectDirection, ZWNJ } from '@cg/text-shaping';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

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
  const effectiveDir =
    direction === 'auto' ? (detectDirection(element.text) === 'rtl' ? 'rtl' : 'ltr') : direction;

  // Mount/focus the editor + place the caret at the end.
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  function commitText(): void {
    const next = ref.current?.innerText ?? '';
    if (next !== element.text) {
      designerStore.updateElement(element.id, {
        text: next,
      } as Partial<TextElement>);
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
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        color,
        background: 'rgba(56, 189, 248, 0.08)',
        outline: `2px solid ${colors.accent}`,
        outlineOffset: 0,
        padding: 0,
        margin: 0,
        boxSizing: 'border-box',
        fontFamily: font.family,
        fontWeight: font.weight,
        fontStyle: font.style,
        fontSize: font.size * scale,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
        textAlign: align === 'start' ? 'start' : align,
        cursor: 'text',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        transform:
          transform.rotation === 0 ? undefined : `rotate(${String(transform.rotation)}deg)`,
        transformOrigin: '0 0',
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
