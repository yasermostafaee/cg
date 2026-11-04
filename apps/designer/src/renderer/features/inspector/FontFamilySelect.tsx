import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Select } from '../../ui/Select.js';
import { useSharedFonts } from '../sharedLibrary/useSharedFonts.js';

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
  const sharedFonts = useSharedFonts();
  const sharedFamilies = new Set(sharedFonts.map((font) => `asset-${font.assetId}`));
  const projectFonts = sceneFonts.filter((font) => !sharedFamilies.has(font.family));
  return (
    <Select
      className={className}
      value={value}
      onChange={(e) => {
        const family = e.target.value;
        const shared = sharedFonts.find((font) => `asset-${font.assetId}` === family);
        if (shared !== undefined) {
          designerStore.addSceneFont({
            family,
            displayName: stripExt(shared.filename),
            assetId: shared.assetId,
          });
        }
        onCommit(family);
      }}
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
      {projectFonts.length > 0 && (
        <optgroup label="Project fonts">
          {projectFonts.map((f) => (
            <option key={f.family} value={f.family}>
              {f.bundledPath ?? f.family}
            </option>
          ))}
        </optgroup>
      )}
      {sharedFonts.length > 0 && (
        <optgroup label="Shared Library fonts">
          {sharedFonts.map((font) => (
            <option key={font.assetId} value={`asset-${font.assetId}`}>
              {stripExt(font.filename)}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}
