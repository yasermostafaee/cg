import { forwardRef, type InputHTMLAttributes, type KeyboardEvent } from 'react';

/**
 * THE SHARED TEXT FIELD — every plain text and password input in the Runtime renders
 * through here. `NumericInput` is its sibling for values that are a NUMBER;
 * `AutoGrowTextarea` for prose. One `<input>`, `.cg-field` first in its class list.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────────
 *
 * `cg/raw-control` (`apps/runtime/eslint.config.mjs`) refuses a raw `<input>` outside
 * `renderer/ui/`, and the sites the renderer already carried are frozen per file as a
 * ratchet that can only ever SHRINK. A new surface therefore cannot be added to that list —
 * it takes this primitive, which is the route the rule deliberately leaves open by ignoring
 * this directory.
 *
 * ── NO `style` PROP, AND THE TYPE IS WHERE THAT IS ENFORCED ──────────────────────────
 *
 * There is no `style` on this type, for the same reason there is no `onClick` on `Tag`: a
 * control restyled at its call site stops looking like the rest of the console, and a
 * comment beside a defect does not prevent it — this tree has paid for that more than once.
 * Appearance belongs to `.cg-field` in `controls.css`, which owns the ground, the edge, the
 * radius, the hover, the one focus ring, disabled and invalid. A surface that needs
 * different METRICS names itself in that stylesheet and passes `className`; it never carries
 * a declaration here.
 *
 * ── `onChange` HANDS OVER THE STRING, NOT THE EVENT ──────────────────────────────────
 *
 * Every call site in this tree wants the value. Unwrapping `e.target.value` at each one is a
 * fresh chance to read the wrong field off the event, or to store the event itself, and the
 * compiler catches neither in a `useState` setter typed `string`.
 *
 * ── PERSIAN / RTL ────────────────────────────────────────────────────────────────────
 *
 * `dir` defaults to UNDEFINED — the field INHERITS the document's direction. This component
 * must never force `ltr`: a Persian value typed into a field pinned to `ltr` has its
 * punctuation and neutrals placed by the wrong base direction. `dir="auto"` is the option
 * for a field holding operator DATA whose language is unknown when the field is authored;
 * an explicit `ltr` is a caller's statement that the CONTENT is a machine token (a host, a
 * URL), never a styling choice.
 *
 * ⚠ `autoFocus` LOSES INSIDE A `Modal`, so do not reach for it there. React applies it
 * during the commit and the dialog primitive's focus-on-open effect runs after it — `B-230`,
 * written up at the `data-modal-autofocus` site in `useDialog.tsx`. Inside a dialog, `Modal`
 * is the one thing that places focus.
 */
export interface TextInputProps {
  value: string;
  /** Receives the field's VALUE on every change — never the event. */
  onChange: (value: string) => void;
  /**
   * A CLOSED union, not the HTML `type` attribute. `checkbox`, `range`, `number` and `file`
   * are different controls wearing one attribute's name; each has its own primitive or none,
   * and `number` in particular silently drops Persian digits before `onChange` ever fires
   * (see `NumericInput`, which exists because of it).
   */
  type?: 'text' | 'password' | undefined;
  id?: string | undefined;
  name?: string | undefined;
  autoComplete?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  /**
   * This value is WRONG RIGHT NOW. Renders `aria-invalid`, which is both the assistive
   * announcement and the CSS hook — `.cg-field[aria-invalid='true']` paints the danger ink
   * on the field's own edge, where the operator's focus already is. The SENTENCE saying what
   * is wrong is the caller's, beside the field and pointed at by `aria-describedby`.
   */
  invalid?: boolean | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;
  'aria-label'?: string | undefined;
  'aria-describedby'?: string | undefined;
  /** See the RTL paragraph above. Undefined means INHERIT, and that is the default. */
  dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  autoFocus?: boolean | undefined;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number | undefined;
  /**
   * APPENDED AFTER `cg-field`, never replacing it. A caller names its own surface here
   * (`cg-field--mono`, `cg-setup-field`'s child, …) and the shared skin stays underneath;
   * there is no spelling of this prop that takes the skin off.
   */
  className?: string | undefined;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    value,
    onChange,
    type = 'text',
    id,
    name,
    autoComplete,
    placeholder,
    disabled,
    invalid,
    onKeyDown,
    dir,
    autoFocus,
    inputMode,
    maxLength,
    className,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
  },
  ref,
): JSX.Element {
  return (
    <input
      ref={ref}
      // `cg-field` FIRST and unconditional — the caller's class extends the skin, never
      // replaces it. Same idiom as `AutoGrowTextarea`.
      className={['cg-field', className].filter(Boolean).join(' ')}
      type={type}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      id={id}
      name={name}
      autoComplete={autoComplete}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={invalid}
      onKeyDown={onKeyDown}
      dir={dir}
      // The caller's decision to make; the header says why a field inside a `Modal` must
      // not make it.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      inputMode={inputMode}
      maxLength={maxLength}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    />
  );
});
