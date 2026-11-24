import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Select } from '../../ui/Select.js';
import { useSharedFonts } from '../sharedLibrary/useSharedFonts.js';

/**
 * The font-family dropdown for Text, Ticker, Clock and Sequence.
 * Project fonts appear first, with the element's current family kept selectable.
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
  ariaLabel = 'Font family',
}: {
  value: string;
  onCommit: (family: string) => void;
  className?: string | undefined;
  ariaLabel?: string;
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
      aria-label={ariaLabel}
    >
      {projectFonts.length > 0 && (
        <optgroup label="Project fonts">
          {projectFonts.map((f) => (
            <option key={f.family} value={f.family}>
              {f.bundledPath ?? f.family}
            </option>
          ))}
        </optgroup>
      )}
      {FONT_FAMILIES.includes(value as (typeof FONT_FAMILIES)[number]) ||
      sceneFonts.some((f) => f.family === value) ? null : (
        <option value={value}>{value}</option>
      )}
      {FONT_FAMILIES.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
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
