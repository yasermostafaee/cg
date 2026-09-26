/**
 * 🔴 `UI-POLISH-01` E — **THE CHECKBOX, the one allowed home of `<input type="checkbox">`.**
 *
 * A native checkbox, nothing more: its keyboard behaviour (Space toggles), its label association
 * (a click anywhere on a wrapping `<label>` toggles it) and its form semantics are the browser's.
 * Its paint is the app's one checkbox rule in `controls.css` (`input[type='checkbox']`, tokens
 * only — sky when ticked, never the on-air green), so this component adds no appearance of its
 * own and adopting it moves no pixel.
 *
 * ⚠ THE PROPS ARE A CLOSED LIST, and `style` is not on it: a checkbox restyled at its call site is
 * the defect `cg/raw-control` exists to refuse, and a prop that does not exist cannot be misused.
 * Its `className` is for the rare caller that must NAME it in a selector, never to re-skin it.
 */
export function Checkbox({
  checked,
  onChange,
  disabled,
  id,
  className,
  ...rest
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  'aria-label'?: string | undefined;
  'aria-describedby'?: string | undefined;
  'data-channel-box'?: string | undefined;
}): JSX.Element {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        onChange(e.currentTarget.checked);
      }}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(id !== undefined ? { id } : {})}
      {...(className !== undefined ? { className } : {})}
      {...rest}
    />
  );
}
