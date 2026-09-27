import {
  keyboardDigits,
  writeEnteredDigits,
  type EnteredText,
  type FieldDigits,
  type FieldDigitsKind,
  type KeyboardLanguage,
} from '@cg/text-shaping';

/**
 * 🔴 `TEXT-DIGITS-01` — **WRITE THE DIGITS OF TEXT JUST ENTERED INTO A TEXT BOX, THE CARET KEPT**, so
 * what is being edited looks like what goes on air. Called from a text box's `input` handler with the
 * `input` event (React: `e.nativeEvent`), in both apps.
 *
 * - A digit set (`persian`, `latin`, `arabic-indic`): every digit of the value, a paste included.
 * - Keyboard (`as-typed`): only TYPED text (`inputType` `insertText`) changes, its digits written in
 *   the keyboard language `keyboard` answers at that moment (the one detector); a paste, a drop, an
 *   undo — anything not typed — keeps its digits, and so does a digit typed while the language is
 *   `unknown`.
 *
 * The one writer maps one character for one, so the selection indices survive the rewrite. The DOM
 * is written here, before the caller stages or commits, so a controlled re-render finds the box
 * already holding the value and leaves the caret alone. Returns the text to stage.
 */
export function writeDigitsInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  event: Event | undefined,
  digits: FieldDigits,
  keyboard: () => KeyboardLanguage,
  kind: FieldDigitsKind = 'text',
): string {
  const raw = el.value;
  const next = writeEnteredDigits(
    raw,
    enteredBy(event, el.selectionStart ?? raw.length, raw.length),
    digits,
    digits === 'as-typed' ? keyboardDigits(keyboard()) : null,
    kind,
  );
  if (next !== raw) {
    const { selectionStart, selectionEnd, selectionDirection } = el;
    el.value = next;
    if (selectionStart !== null && selectionEnd !== null) {
      el.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    }
  }
  return next;
}

/**
 * `TEXT-DIGITS-01` — {@link writeDigitsInto} for a `contentEditable` editor (the Designer's
 * double-click edit on the canvas): the same rule, over the editor's text nodes, the selection kept.
 *
 * Each text node keeps its length, so its offsets hold; the selection is still saved and put back
 * explicitly, because the DOM's own "replace data" rule moves a caret that sits inside the replaced
 * range to its start.
 */
export function writeDigitsIntoEditable(
  root: HTMLElement,
  event: Event | undefined,
  digits: FieldDigits,
  keyboard: () => KeyboardLanguage,
): void {
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  const saved =
    selection !== null && selection.rangeCount > 0
      ? {
          anchorNode: selection.anchorNode,
          anchorOffset: selection.anchorOffset,
          focusNode: selection.focusNode,
          focusOffset: selection.focusOffset,
        }
      : null;
  let changed = false;
  if (digits !== 'as-typed') {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node as Text;
      const next = writeEnteredDigits(
        text.data,
        { how: 'other', start: 0, end: text.data.length },
        digits,
        null,
      );
      if (next !== text.data) {
        text.data = next;
        changed = true;
      }
    }
  } else {
    const focus = saved?.focusNode;
    const keyboardSet = keyboardDigits(keyboard());
    if (focus instanceof Text && root.contains(focus) && keyboardSet !== null) {
      const entered = enteredBy(event, saved?.focusOffset ?? 0, focus.data.length);
      if (entered.how === 'typed') {
        const next = writeEnteredDigits(focus.data, entered, 'as-typed', keyboardSet);
        if (next !== focus.data) {
          focus.data = next;
          changed = true;
        }
      }
    }
  }
  if (changed && saved !== null && selection !== null && saved.anchorNode && saved.focusNode) {
    selection.setBaseAndExtent(
      saved.anchorNode,
      saved.anchorOffset,
      saved.focusNode,
      saved.focusOffset,
    );
  }
}

/**
 * What an `input` event entered, and where it now sits (the caret is at its end): typed text is
 * `insertText` with its `data`; everything else is `other`, the whole value.
 */
export function enteredBy(event: Event | undefined, caret: number, length: number): EnteredText {
  if (
    typeof InputEvent !== 'undefined' &&
    event instanceof InputEvent &&
    event.inputType === 'insertText' &&
    typeof event.data === 'string' &&
    event.data.length > 0
  ) {
    return { how: 'typed', start: Math.max(0, caret - event.data.length), end: caret };
  }
  return { how: 'other', start: 0, end: length };
}
