import { Tag } from './Tag.js';

/**
 * R-007 — the R-003 "● draft" chip: an item has staged-but-unapplied edits.
 * The exact text "● draft" is a stable Playwright hook; only the styling moves
 * to the shared `.cg-chip-draft` class.
 */
export function DraftChip({ label }: { label: string }): JSX.Element {
  return (
    <Tag className="cg-chip-draft" aria-label={label}>
      ● draft
    </Tag>
  );
}
