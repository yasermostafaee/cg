import type { FieldValue, FileSourceCapableField, ListItem } from './fields.js';

/** How a text file becomes a list field value. */
export interface FileSourceSplitConfig {
  split: boolean;
  /** Stored as typed: `\\n` and `\\t` are resolved only while reading content. */
  delimiter: string;
}

/**
 * Resolve the printable delimiter notation shared by Designer and CG Control.
 * Other characters and multi-character delimiters are matched literally.
 */
export function parseFileDelimiter(raw: string): string {
  return raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

/** Split, trim and omit empty rows exactly as the Runtime file reader does. */
export function splitFileSourceContent(content: string, delimiter: string): string[] {
  const parts = delimiter === '' ? [content] : content.split(delimiter);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function fileItemId(index: number): string {
  return `file-${String(index + 1)}`;
}

/**
 * The canonical file-content transform used by both authoring preview and playout.
 * Scalar fields keep every byte of decoded text. Lists either keep the whole file
 * as one item or split it with deterministic item ids.
 */
export function fileSourceContentToFieldValue(
  content: string,
  kind: FileSourceCapableField['type'],
  config: FileSourceSplitConfig,
): FieldValue {
  if (kind !== 'list') return content;
  if (!config.split) {
    const single: ListItem[] = [{ id: fileItemId(0), text: content }];
    return single;
  }
  const items: ListItem[] = splitFileSourceContent(
    content,
    parseFileDelimiter(config.delimiter),
  ).map((text, index) => ({ id: fileItemId(index), text }));
  return items;
}
