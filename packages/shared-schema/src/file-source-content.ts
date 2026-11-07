import type {
  FieldValue,
  FileSourceCapableField,
  FileSourceListFormat,
  ListItem,
  ListItemField,
} from './fields.js';
import {
  numberFieldAllowedValuesText,
  numberFieldValueError,
  numberFieldValueFromAlias,
} from './fields.js';

/** How a text file becomes a list field value. */
export interface FileSourceSplitConfig {
  split: boolean;
  /** Stored as typed: `\\n` and `\\t` are resolved only while reading content. */
  delimiter: string;
  /** Absent/`text` is the legacy whole/split text-list path. */
  format?: FileSourceListFormat;
  /** Optional child-derived schema for typed CSV/JSON cells. */
  itemFields?: readonly ListItemField[];
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

function rowId(value: unknown, index: number): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>)['id'];
    if (typeof id === 'string' && id !== '') return id;
  }
  return fileItemId(index);
}

function itemFieldFor(
  key: string,
  fields: readonly ListItemField[] | undefined,
): ListItemField | undefined {
  if (fields === undefined) return undefined;
  const byId = fields.find((field) => field.id === key);
  if (byId !== undefined) return byId;
  const byLabel = fields.filter((field) => field.label === key);
  return byLabel.length === 1 ? byLabel[0] : undefined;
}

function typedCell(value: unknown, field: ListItemField | undefined): unknown {
  if (field === undefined || value === null || value === undefined) return value;
  switch (field.type) {
    case 'number': {
      const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : NaN;
      const number =
        typeof value === 'number'
          ? value
          : Number.isFinite(numeric)
            ? numeric
            : typeof value === 'string'
              ? (numberFieldValueFromAlias(field, value) ?? NaN)
              : NaN;
      if (!Number.isFinite(number)) {
        const choices = numberFieldAllowedValuesText(field);
        throw new Error(
          choices === undefined
            ? `“${String(value)}” is not a number for ${field.id}.`
            : `“${String(value)}” is not a valid choice for ${field.id}. Choose one of: ${choices}.`,
        );
      }
      const error = numberFieldValueError(field, number);
      if (error !== undefined) throw new Error(`${error} (${field.id})`);
      return number;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      throw new Error(`“${String(value)}” is not true/false for ${field.id}.`);
    case 'image':
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const assetId = (value as Record<string, unknown>)['assetId'];
        if (typeof assetId === 'string' && assetId !== '') return { assetId };
      }
      if (typeof value === 'string' && value !== '') {
        // Generated workbooks expose the human filename/label, never an opaque package id. Accept
        // either spelling on import and store the canonical asset id used by Preview/playout.
        const option = field.assetOptions?.find(
          (candidate) => candidate.assetId === value || candidate.label === value,
        );
        return { assetId: option?.assetId ?? value };
      }
      return value;
    case 'text':
    case 'multiline':
    case 'color':
    case 'select':
      return typeof value === 'string' ? value : String(value);
  }
}

function defaultCell(field: ListItemField): unknown {
  if (field.type === 'image') {
    return field.defaultAssetId === undefined ? undefined : { assetId: field.defaultAssetId };
  }
  return field.default;
}

function structuredRow(
  value: unknown,
  index: number,
  fields: readonly ListItemField[] | undefined,
  context = `Row ${String(index + 1)}`,
): ListItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`File structure: ${context} must be an object.`);
  }
  const row: Record<string, unknown> = { id: rowId(value, index) };
  const supplied = new Map<string, { key: string; value: unknown }>();
  for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'id') continue;
    const field = itemFieldFor(key, fields);
    if (fields !== undefined && field === undefined) {
      throw new Error(
        `File structure: ${context}, column “${key}” does not match a template field.`,
      );
    }
    const targetKey = field?.id ?? key;
    if (supplied.has(targetKey)) {
      throw new Error(
        `File structure: ${context} maps more than one column to template field “${targetKey}”.`,
      );
    }
    supplied.set(targetKey, { key, value: cell });
  }
  if (fields === undefined) {
    for (const [targetKey, cell] of supplied) row[targetKey] = cell.value;
    return row as ListItem;
  }
  for (const field of fields) {
    const cell = supplied.get(field.id);
    const isBlank = cell === undefined || (typeof cell.value === 'string' && cell.value === '');
    if (isBlank) {
      if (field.required) {
        throw new Error(
          `Missing value: ${context}, column “${field.label || field.id}” is required.`,
        );
      }
      const fallback = defaultCell(field);
      if (fallback !== undefined) row[field.id] = fallback;
      continue;
    }
    try {
      row[field.id] = typedCell(cell.value, field);
    } catch (cause) {
      throw new Error(
        `Invalid value: ${context}, column “${cell.key}”: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
  return row as ListItem;
}

/** RFC-4180-compatible enough for newsroom CSV: quotes, escaped quotes and newlines. */
export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const withoutBom = content.replace(/^\uFEFF/, '');
  const separatorDirective = /^sep=([^\r\n])\r?\n/iu.exec(withoutBom);
  const input =
    separatorDirective === null ? withoutBom : withoutBom.slice(separatorDirective[0].length);
  let commaCount = 0;
  let semicolonCount = 0;
  let tabCount = 0;
  let countingQuoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (countingQuoted && input[index + 1] === '"') index += 1;
      else countingQuoted = !countingQuoted;
    } else if (!countingQuoted && (char === '\r' || char === '\n')) {
      break;
    } else if (!countingQuoted && char === ',') commaCount += 1;
    else if (!countingQuoted && char === ';') semicolonCount += 1;
    else if (!countingQuoted && char === '\t') tabCount += 1;
  }
  const delimiter =
    separatorDirective?.[1] ??
    (semicolonCount > commaCount && semicolonCount >= tabCount
      ? ';'
      : tabCount > commaCount && tabCount > semicolonCount
        ? '\t'
        : ',');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((part) => part.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
  row.push(cell);
  if (row.some((part) => part.trim() !== '')) rows.push(row);
  return rows;
}

function structuredFileItems(content: string, config: FileSourceSplitConfig): ListItem[] {
  if (config.format === 'json') {
    let value: unknown;
    try {
      value = JSON.parse(content.replace(/^\uFEFF/, ''));
    } catch (cause) {
      throw new Error(
        `JSON structure: the file could not be read (${cause instanceof Error ? cause.message : String(cause)}).`,
      );
    }
    if (!Array.isArray(value)) {
      throw new Error('JSON structure: expected an array of row objects.');
    }
    return value.map((row, index) => structuredRow(row, index, config.itemFields));
  }
  const rows = parseCsvRows(content);
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  if (header.length === 0 || header.some((key) => key === '')) {
    throw new Error('CSV structure: the first row must contain column names.');
  }
  if (new Set(header).size !== header.length) {
    throw new Error('CSV structure: column names in the first row must be unique.');
  }
  if (config.itemFields !== undefined) {
    const expected = config.itemFields.map((field) => field.label || field.id).join(', ');
    const mapped = header.map((key) => itemFieldFor(key, config.itemFields));
    const unknown = header.filter((_, index) => mapped[index] === undefined);
    if (unknown.length > 0) {
      throw new Error(
        `CSV structure: column${unknown.length === 1 ? '' : 's'} ${unknown.map((key) => `“${key}”`).join(', ')} ${unknown.length === 1 ? 'does' : 'do'} not match this template. Expected columns: ${expected}.`,
      );
    }
    const mappedIds = mapped.flatMap((field) => (field === undefined ? [] : [field.id]));
    if (new Set(mappedIds).size !== mappedIds.length) {
      throw new Error('CSV structure: more than one column maps to the same template field.');
    }
    const missing = config.itemFields.filter(
      (field) => field.required && !mappedIds.includes(field.id),
    );
    if (missing.length > 0) {
      throw new Error(
        `CSV structure: missing required column${missing.length === 1 ? '' : 's'}: ${missing.map((field) => field.label || field.id).join(', ')}. Expected columns: ${expected}.`,
      );
    }
  }
  return rows.slice(1).map((cells, index) => {
    if (cells.length > header.length && cells.slice(header.length).some((cell) => cell !== '')) {
      throw new Error(
        `CSV structure: data row ${String(index + 1)} (sheet row ${String(index + 2)}) has ${String(cells.length)} cells but the header has ${String(header.length)}. Check the separator and quoted values.`,
      );
    }
    const raw: Record<string, string> = {};
    header.forEach((key, column) => {
      raw[key] = cells[column] ?? '';
    });
    return structuredRow(
      raw,
      index,
      config.itemFields,
      `Data row ${String(index + 1)} (sheet row ${String(index + 2)})`,
    );
  });
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
  if (config.format === 'json' || config.format === 'csv') {
    return structuredFileItems(content, config);
  }
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
