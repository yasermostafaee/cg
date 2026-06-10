import { useDesignerSelector } from '../../state/store.js';
import { Select } from '../../ui/Select.js';

/**
 * The font-family dropdown shared by the Text and Ticker inspectors:
 * built-in families first, then the project's imported fonts (D-011),
 * with the element's current (unknown) family kept selectable.
 */
export const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Inter',
  'Vazirmatn',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Tahoma',
] as const;

export function FontFamilySelect({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (family: string) => void;
  className?: string | undefined;
}): JSX.Element {
  const scene = useDesignerSelector((s) => s.scene);
  const sceneFonts = scene?.fonts ?? [];
  return (
    <Select
      className={className}
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      aria-label="Font family"
    >
      {FONT_FAMILIES.includes(value as (typeof FONT_FAMILIES)[number]) ||
      sceneFonts.some((f) => f.family === value) ? null : (
        <option value={value}>{value}</option>
      )}
      {FONT_FAMILIES.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
      {sceneFonts.length > 0 && (
        <optgroup label="Project fonts">
          {sceneFonts.map((f) => (
            <option key={f.family} value={f.family}>
              {f.bundledPath ?? f.family}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
