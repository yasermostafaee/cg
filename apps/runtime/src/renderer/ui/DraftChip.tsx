import { useUiText } from '../i18n/locale.js';
import { Tag } from './Tag.js';

/**
 * R-007 — the R-003 "● draft" chip: an item has staged-but-unapplied edits.
 * The exact text "● draft" is a stable Playwright hook; only the styling moves
 * to the shared `.cg-chip-draft` class.
 */
export function DraftChip({ label }: { label: string }): JSX.Element {
  const localizeUi = useUiText();
  return (
    <Tag className="cg-chip-draft" aria-label={label}>
      {localizeUi('● draft')}
    </Tag>
  );
}
