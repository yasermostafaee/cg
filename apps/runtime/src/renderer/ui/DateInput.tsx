/** A native calendar-date control in CG Control's shared field skin. */
export function DateInput({
  id,
  value,
  onChange,
  invalid,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean | undefined;
  ariaLabel: string;
}): JSX.Element {
  return (
    <input
      id={id}
      className="cg-field"
      type="date"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      aria-label={ariaLabel}
      aria-invalid={invalid}
    />
  );
}
