import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '../cx.js';
import * as s from './Textarea.css.js';

/**
 * D-118 — the design-system multi-line text input (the textarea peer of the single-line inputs).
 * A native `<textarea>` inserts a newline on Enter and does NOT submit/close, so authored `\n`
 * line breaks (rendered on air by D-117) are easy to enter. Set `dir` for RTL/mixed item text.
 * Per-site `className` may EXTEND the layout (flex/width); the resting look + multi-line sizing
 * live in the primitive.
 */
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref,
): JSX.Element {
  return <textarea ref={ref} className={cx(s.textarea, className)} {...rest} />;
});
