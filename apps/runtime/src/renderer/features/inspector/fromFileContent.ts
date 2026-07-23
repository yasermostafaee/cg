import type { FieldValue, ListItem } from '@cg/shared-schema';

/**
 * R-018 — pure transforms from a text file's content to a field value. Kept
 * React-free and DOM-free so they unit-test in the node env against a fake
 * {@link import('./textFileSource.js').TextFileSource}.
 *
 * VERBATIM IS THE CONTRACT. File content is newsroom copy that goes on air:
 * it is NEVER trimmed (split mode's per-entry trim is the one documented
 * exception), never digit-normalized (`latinDigits` is for numeric INPUT
 * fields — R-020; applying it here would silently rewrite Persian digits in
 * broadcast copy), and never otherwise transformed. Whole-file mode is the
 * DEFAULT because it is the incumbent Cinegy workflow: the typist embeds the
 * separators, and the whole file IS the content.
 */

/** The field kinds a text file can feed. */
export type FromFileFieldKind = 'text' | 'multiline' | 'list';

/** How list-field content is (optionally) split into items. */
export interface SplitConfig {
  split: boolean;
  /** Delimiter as typed by the operator (escapes unparsed — see {@link parseDelimiter}). */
  delimiter: string;
}

/**
 * Delimiter suggestions offered to the operator (a free-text input with a
 * datalist). `\n` — one entry per line — is the default for split mode.
 */
export const DELIMITER_SUGGESTIONS: readonly { value: string; label: string }[] = [
  { value: '\\n', label: 'new line' },
  { value: '|', label: 'pipe' },
  { value: '،', label: 'Persian comma' },
  { value: ',', label: 'comma' },
  { value: ';', label: 'semicolon' },
];

/** The default delimiter (as typed): one entry per line. */
export const DEFAULT_DELIMITER = '\\n';

/**
 * Resolve the operator's typed delimiter: the escapes `\n` and `\t` become a
 * newline / tab (there is no other way to type them in a one-line input);
 * everything else is literal.
 */
export function parseDelimiter(raw: string): string {
  return raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

/**
 * Split `content` on the RESOLVED delimiter. Entries are trimmed, and entries
 * empty after trimming are SKIPPED. An empty delimiter cannot split (it would
 * explode into characters) — the whole content is one entry.
 */
export function splitContent(content: string, delimiter: string): string[] {
  const parts = delimiter === '' ? [content] : content.split(delimiter);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * Deterministic, position-stable item ids (`file-1`, `file-2`, …). Stability
 * matters: the ticker reconciles items by id, so a reload that changes an
 * entry's text keeps its id and the crawl updates without restarting.
 */
function fileItemId(index: number): string {
  return `file-${String(index + 1)}`;
}

/**
 * The field value a file's content becomes.
 *
 * - `text` / `multiline`: the ENTIRE content, verbatim (split does not apply).
 * - `list`, split OFF (the default): ONE item whose text is the entire content
 *   verbatim — on a ticker the crawl renders the typist's own embedded
 *   separators exactly as typed (Cinegy parity).
 * - `list`, split ON: one item per delimiter entry, trimmed, empties skipped.
 */
export function contentToFieldValue(
  content: string,
  kind: FromFileFieldKind,
  cfg: SplitConfig,
): FieldValue {
  if (kind !== 'list') return content;
  if (!cfg.split) {
    const single: ListItem[] = [{ id: fileItemId(0), text: content }];
    return single;
  }
  const items: ListItem[] = splitContent(content, parseDelimiter(cfg.delimiter)).map(
    (text, index) => ({ id: fileItemId(index), text }),
  );
  return items;
}
