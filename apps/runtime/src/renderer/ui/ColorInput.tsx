/**
 * Shared Runtime colour-value input. The value is template data, not console
 * chrome, so callers supply it directly while this primitive owns the one raw
 * colour control allowed outside feature code.
 */
export function ColorInput({
  value,
  onChange,
  disabled,
  appearance,
  id,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
  /** Use the compact form swatch for editable colour settings. */
  appearance?: 'swatch';
  id?: string | undefined;
  className?: string | undefined;
  'aria-label'?: string | undefined;
}): JSX.Element {
  return (
    <input
      id={id}
      className={
        appearance === 'swatch'
          ? ['cg-field cg-field--swatch', className].filter(Boolean).join(' ')
          : className
      }
      type="color"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
