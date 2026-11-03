/**
 * Shared Runtime colour-value input. The value is template data, not console
 * chrome, so callers supply it directly while this primitive owns the one raw
 * colour control allowed outside feature code.
 */
export function ColorInput({
  value,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  'aria-label'?: string | undefined;
}): JSX.Element {
  return (
    <input
      className={className}
      type="color"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
