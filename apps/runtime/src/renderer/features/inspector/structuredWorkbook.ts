import { saveFile } from '../../ui/saveFile.js';
import { fsaTextFileSource, type TextFileSource } from './textFileSource.js';

export function structuredWorkbookFilename(name: string, fallback = 'data'): string {
  const stem = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem || fallback}-rows.sample.xlsx`;
}

/** Save generated workbook bytes and return the re-readable handle used by Reload. */
export async function saveStructuredWorkbook(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<TextFileSource | null> {
  const blob = new Blob([Uint8Array.from(bytes).buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const outcome = await saveFile(blob, suggestedName, 'Excel workbook', '.xlsx');
  return outcome.kind === 'saved' ? fsaTextFileSource(outcome.handle) : null;
}
