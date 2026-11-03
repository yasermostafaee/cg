import {
  defaultNestedValues,
  fileSourceContentToFieldValue,
  isFieldNamespace,
  numberFieldAllowedValuesText,
  numberFieldValueAlias,
  numberFieldValueError,
  numberFieldValueFromAlias,
  type AggregatedFields,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldValue,
  type FieldValues,
  type ListItem,
  type NestedFieldValues,
} from '@cg/shared-schema';

export interface SequencePageSchema {
  readonly aggregate: AggregatedFields;
  readonly defaultValues?: NestedFieldValues | undefined;
  readonly label?: string | undefined;
}

function pageArray(content: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch (cause) {
    throw new Error(
      `JSON could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const pages =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)['pages']
      : parsed;
  if (!Array.isArray(pages)) {
    throw new Error('JSON must be an array of pages or an object with a “pages” array.');
  }
  return pages;
}

function matchingField(key: string, fields: readonly DynamicField[]): DynamicField | undefined {
  const byId = fields.find((field) => field.id === key);
  if (byId !== undefined) return byId;
  const byLabel = fields.filter((field) => field.label === key);
  return byLabel.length === 1 ? byLabel[0] : undefined;
}

function matchingGroup(
  key: string,
  groups: readonly CompositionFieldGroup[],
): CompositionFieldGroup | undefined {
  const byName = groups.find((group) => group.name === key);
  if (byName !== undefined) return byName;
  const byLabel = groups.filter((group) => group.label === key);
  return byLabel.length === 1 ? byLabel[0] : undefined;
}

function scalarValue(field: DynamicField, raw: unknown): FieldValue {
  switch (field.type) {
    case 'list': {
      if (!Array.isArray(raw)) throw new Error('must be an array of row objects.');
      const value = fileSourceContentToFieldValue(JSON.stringify(raw), 'list', {
        split: false,
        delimiter: '',
        format: 'json',
        ...(field.itemFields === undefined ? {} : { itemFields: field.itemFields }),
      });
      if (field.maxItems !== undefined && Array.isArray(value) && value.length > field.maxItems) {
        throw new Error(
          `has ${String(value.length)} rows; this page allows ${String(field.maxItems)}.`,
        );
      }
      return value;
    }
    case 'number': {
      const numeric = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN;
      const value =
        typeof raw === 'number'
          ? raw
          : Number.isFinite(numeric)
            ? numeric
            : typeof raw === 'string'
              ? (numberFieldValueFromAlias(field, raw) ?? NaN)
              : NaN;
      if (!Number.isFinite(value)) {
        const choices = numberFieldAllowedValuesText(field);
        throw new Error(
          choices === undefined
            ? `“${String(raw)}” must be a number.`
            : `“${String(raw)}” is not a valid choice. Choose one of: ${choices}.`,
        );
      }
      const error = numberFieldValueError(field, value);
      if (error !== undefined) throw new Error(error);
      return value;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === '1') return true;
      if (raw === 'false' || raw === '0') return false;
      throw new Error('must be true or false.');
    case 'image': {
      if (typeof raw === 'string' && raw !== '') return { assetId: raw };
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const assetId = (raw as Record<string, unknown>)['assetId'];
        if (typeof assetId === 'string' && assetId !== '') return { assetId };
      }
      throw new Error('must be an asset id or { “assetId”: “…” }.');
    }
    case 'color':
    case 'multiline':
    case 'select':
    case 'text':
      if (typeof raw === 'string') return raw;
      if (raw === null || raw === undefined) throw new Error('must be text.');
      return String(raw);
  }
}

function aggregateValues(
  raw: Record<string, unknown>,
  aggregate: AggregatedFields,
  context: string,
): FieldValues {
  const values: FieldValues = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = matchingField(key, aggregate.fields);
    if (field !== undefined) {
      try {
        values[field.id] = scalarValue(field, value);
      } catch (cause) {
        throw new Error(
          `${context}, field “${key}”: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
      continue;
    }
    const group = matchingGroup(key, aggregate.groups);
    if (group !== undefined) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${context}, group “${key}”: must be an object.`);
      }
      values[group.name] = aggregateValues(
        value as Record<string, unknown>,
        group.aggregate,
        `${context}, group “${key}”`,
      );
      continue;
    }
    throw new Error(`${context}, field or group “${key}”: no stable id or unique title matches.`);
  }
  return values;
}

/**
 * Parse one JSON file into independent Sequence composition-item defaults. Page and row keys may
 * use stable field ids or an unambiguous author-facing label; stored output always uses ids.
 */
export function parseSequencePageData(
  content: string,
  pages: readonly SequencePageSchema[],
): FieldValues[] {
  const input = pageArray(content);
  if (input.length > pages.length) {
    throw new Error(
      `The file has ${String(input.length)} pages, but this Sequence has ${String(pages.length)}.`,
    );
  }
  return input.map((rawPage, pageIndex) => {
    if (typeof rawPage !== 'object' || rawPage === null || Array.isArray(rawPage)) {
      throw new Error(`Page ${String(pageIndex + 1)} must be an object.`);
    }
    const schema = pages[pageIndex];
    if (schema === undefined) return {};
    return aggregateValues(
      rawPage as Record<string, unknown>,
      schema.aggregate,
      `Page ${String(pageIndex + 1)}`,
    );
  });
}

function mergeNested(base: NestedFieldValues, patch: NestedFieldValues): NestedFieldValues {
  const out: NestedFieldValues = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] =
      isFieldNamespace(current) && isFieldNamespace(value) ? mergeNested(current, value) : value;
  }
  return out;
}

function scalarSample(
  field: Exclude<DynamicField, { type: 'list' }>,
  current: unknown,
): FieldValue {
  if (field.type === 'image') {
    if (
      typeof current === 'object' &&
      current !== null &&
      !Array.isArray(current) &&
      typeof (current as Record<string, unknown>)['assetId'] === 'string' &&
      (current as Record<string, unknown>)['assetId'] !== ''
    ) {
      return current as FieldValue;
    }
    return { assetId: field.defaultAssetId ?? 'replace-with-asset-id' };
  }
  if (field.type === 'text' || field.type === 'multiline') {
    return typeof current === 'string' && current !== ''
      ? current
      : `Replace with ${field.label || field.id}`;
  }
  if (field.type === 'number') {
    const value = typeof current === 'number' ? current : field.default;
    return numberFieldValueAlias(field, value) ?? value;
  }
  if (field.type === 'boolean') return typeof current === 'boolean' ? current : field.default;
  if (field.type === 'color') return typeof current === 'string' ? current : field.default;
  return typeof current === 'string' && current !== '' ? current : field.default;
}

function listSample(field: Extract<DynamicField, { type: 'list' }>, current: unknown): FieldValue {
  const rows = Array.isArray(current) && current.length > 0 ? current : [{}];
  return rows.map((raw, index) => {
    const source =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const row: Record<string, unknown> = {
      id:
        typeof source['id'] === 'string' && source['id'] !== '' ? source['id'] : `row-${index + 1}`,
    };
    if (field.itemFields === undefined || field.itemFields.length === 0) {
      row['text'] =
        typeof source['text'] === 'string' && source['text'] !== ''
          ? source['text']
          : `Replace with ${field.label || field.id}`;
      return row;
    }
    for (const itemField of field.itemFields) {
      row[itemField.id] = scalarSample(itemField, source[itemField.id]);
    }
    return row;
  }) as FieldValue;
}

function sampleValues(
  aggregate: AggregatedFields,
  values: NestedFieldValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of aggregate.fields) {
    out[field.id] =
      field.type === 'list'
        ? listSample(field, values[field.id])
        : scalarSample(field, values[field.id]);
  }
  for (const group of aggregate.groups) {
    const groupValue = values[group.name];
    out[group.name] = sampleValues(
      group.aggregate,
      isFieldNamespace(groupValue) ? groupValue : defaultNestedValues(group.aggregate),
    );
  }
  return out;
}

function fieldGuide(field: DynamicField): Record<string, unknown> {
  return {
    id: field.id,
    title: field.label,
    type: field.type,
    required: field.required,
    ...(field.type === 'list' && field.maxItems !== undefined ? { maxItems: field.maxItems } : {}),
    ...(field.type === 'number' && field.min !== undefined ? { min: field.min } : {}),
    ...(field.type === 'number' && field.max !== undefined ? { max: field.max } : {}),
    ...(field.type === 'number' && field.step !== undefined ? { step: field.step } : {}),
    ...(field.type === 'number' && field.allowedValues !== undefined
      ? { allowedValues: field.allowedValues }
      : {}),
    ...(field.type === 'number' && field.allowedValueLabels !== undefined
      ? { allowedValueLabels: field.allowedValueLabels }
      : {}),
    ...(field.type === 'list' && field.itemFields !== undefined
      ? { rowFields: field.itemFields.map(fieldGuide) }
      : {}),
  };
}

function aggregateGuide(aggregate: AggregatedFields): Record<string, unknown> {
  return {
    fields: aggregate.fields.map(fieldGuide),
    groups: aggregate.groups.map((group) => ({
      key: group.name,
      title: group.label ?? group.name,
      ...aggregateGuide(group.aggregate),
    })),
  };
}

/**
 * Build a self-documenting, immediately loadable example for this exact Sequence. Stable ids are
 * used as data keys; the adjacent schema records the author-facing titles and all nested row fields.
 */
export function buildSequencePageDataSample(
  sequence: { readonly id: string; readonly name: string },
  pages: readonly SequencePageSchema[],
): string {
  return `${JSON.stringify(
    {
      format: 'cg.sequence-pages/v1',
      sequence: { id: sequence.id, name: sequence.name, pageCount: pages.length },
      pageSchemas: pages.map((page, index) => ({
        page: index + 1,
        title: page.label ?? `Page ${String(index + 1)}`,
        ...aggregateGuide(page.aggregate),
      })),
      pages: pages.map((page) => {
        const defaults = defaultNestedValues(page.aggregate);
        return sampleValues(
          page.aggregate,
          page.defaultValues === undefined ? defaults : mergeNested(defaults, page.defaultValues),
        );
      }),
    },
    null,
    2,
  )}\n`;
}

/** Parse one flat spreadsheet table; row order is later chunked into Repeater-sized pages. */
export function parseSequenceRowsCsv(
  content: string,
  field: Extract<DynamicField, { type: 'list' }>,
): ListItem[] {
  if (field.itemFields === undefined || field.itemFields.length === 0) {
    throw new Error('This list has no Repeater column schema for a spreadsheet import.');
  }
  const value = fileSourceContentToFieldValue(content, 'list', {
    split: false,
    delimiter: '',
    format: 'csv',
    itemFields: field.itemFields,
  });
  return value as ListItem[];
}

/** Split one operator-friendly table into the Repeater-sized pages stored by a Sequence. */
export function chunkSequenceRows(rows: readonly ListItem[], maxItems: number): ListItem[][] {
  if (!Number.isInteger(maxItems) || maxItems <= 0) {
    throw new Error('Repeater max items must be a positive whole number.');
  }
  if (rows.length === 0) return [[]];
  const pages: ListItem[][] = [];
  for (let index = 0; index < rows.length; index += maxItems) {
    pages.push(rows.slice(index, index + maxItems).map((row) => ({ ...row })));
  }
  return pages;
}

function csvCell(value: unknown): string {
  const raw =
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'assetId' in value
      ? String((value as { assetId: unknown }).assetId)
      : value === null || value === undefined
        ? ''
        : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Build a UTF-8-BOM CSV that opens cleanly in Excel, with one city/item per row. */
export function buildSequenceRowsCsvSample(
  field: Extract<DynamicField, { type: 'list' }>,
  current: readonly ListItem[],
): string {
  const itemFields = field.itemFields ?? [];
  if (itemFields.length === 0) {
    throw new Error('This list has no Repeater column schema for a spreadsheet sample.');
  }
  const labelCounts = new Map<string, number>();
  for (const itemField of itemFields) {
    labelCounts.set(itemField.label, (labelCounts.get(itemField.label) ?? 0) + 1);
  }
  const columns = itemFields.map((itemField) => ({
    field: itemField,
    header:
      itemField.label !== '' && labelCounts.get(itemField.label) === 1
        ? itemField.label
        : itemField.id,
  }));
  const seed = listSample(field, []) as ListItem[];
  const rows = current.length > 0 ? current : seed;
  const sampleCell = (itemField: (typeof itemFields)[number], value: unknown): unknown =>
    itemField.type === 'number' && typeof value === 'number'
      ? (numberFieldValueAlias(itemField, value) ?? value)
      : value;
  return `\uFEFF${[
    columns.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) =>
      columns.map((column) => csvCell(sampleCell(column.field, row[column.field.id]))).join(','),
    ),
  ].join('\r\n')}\r\n`;
}
