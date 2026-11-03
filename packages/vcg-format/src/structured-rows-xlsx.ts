import {
  numberFieldAllowedValues,
  numberFieldValueAlias,
  type ListItem,
  type ListItemField,
} from '@cg/shared-schema';
import { readZip, writeZip } from './zip.js';

export interface StructuredRowsXlsxOptions {
  readonly fields: readonly ListItemField[];
  readonly rows: readonly ListItem[];
  /** Number of editable body rows that receive validation. Defaults to at least 200. */
  readonly editableRows?: number;
}

interface Column {
  readonly field: ListItemField;
  readonly header: string;
  readonly index: number;
}

interface ChoiceColumn {
  readonly column: Column;
  readonly values: readonly (string | number)[];
  readonly name: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Decode CSV/JSON saved by Excel as UTF-8 or UTF-16 (with the standard BOM). */
export function decodeStructuredText(bytes: Uint8Array): string {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'Wrong text encoding: save the CSV or JSON file as UTF-8 or UTF-16 and try again.',
    );
  }
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let cursor = index + 1;
  let result = '';
  while (cursor > 0) {
    const digit = (cursor - 1) % 26;
    result = String.fromCharCode(65 + digit) + result;
    cursor = Math.floor((cursor - 1) / 26);
  }
  return result;
}

function inlineCell(reference: string, value: string, style: number): string {
  const preserve = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" s="${String(style)}" t="inlineStr"><is><t${preserve}>${xml(value)}</t></is></c>`;
}

function numberCell(reference: string, value: number, style: number): string {
  return `<c r="${reference}" s="${String(style)}" t="n"><v>${String(value)}</v></c>`;
}

function booleanCell(reference: string, value: boolean, style: number): string {
  return `<c r="${reference}" s="${String(style)}" t="b"><v>${value ? '1' : '0'}</v></c>`;
}

function columnsFor(fields: readonly ListItemField[]): Column[] {
  const labels = new Map<string, number>();
  for (const field of fields) labels.set(field.label, (labels.get(field.label) ?? 0) + 1);
  return fields.map((field, index) => ({
    field,
    index,
    header: field.label !== '' && labels.get(field.label) === 1 ? field.label : field.id,
  }));
}

function choicesFor(field: ListItemField): readonly (string | number)[] | undefined {
  if (field.type === 'number') {
    return numberFieldAllowedValues(field)?.map(
      (value) => numberFieldValueAlias(field, value) ?? value,
    );
  }
  if (field.type === 'select') return field.options.map((option) => option.value);
  if (field.type === 'boolean') return ['TRUE', 'FALSE'];
  if (field.type === 'image' && field.assetOptions !== undefined) {
    return field.assetOptions.map((option) => option.assetId);
  }
  return undefined;
}

function defaultValue(field: ListItemField): unknown {
  if (field.type === 'image') return field.defaultAssetId;
  return field.default;
}

function cellValue(row: ListItem, field: ListItemField): unknown {
  const value = row[field.id] ?? defaultValue(field);
  if (field.type !== 'image') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const assetId = (value as Record<string, unknown>)['assetId'];
    return typeof assetId === 'string' ? assetId : '';
  }
  return '';
}

function bodyCell(reference: string, row: ListItem, field: ListItemField): string {
  const value = cellValue(row, field);
  if (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    const alias = numberFieldValueAlias(field, value);
    if (alias !== undefined) return inlineCell(reference, alias, 2);
    return numberCell(reference, value, 2);
  }
  if (field.type === 'boolean' && typeof value === 'boolean') {
    return booleanCell(reference, value, 2);
  }
  return inlineCell(reference, value === undefined || value === null ? '' : String(value), 2);
}

function columnWidth(column: Column, rows: readonly ListItem[]): number {
  const longest = rows.reduce((max, row) => {
    const value = cellValue(row, column.field);
    const shown =
      column.field.type === 'number' && typeof value === 'number'
        ? (numberFieldValueAlias(column.field, value) ?? value)
        : value;
    return Math.max(max, shown === undefined || shown === null ? 0 : String(shown).length);
  }, column.header.length);
  return Math.min(40, Math.max(12, longest + 3));
}

function numberValidation(column: Column, endRow: number): string | null {
  if (column.field.type !== 'number' || numberFieldAllowedValues(column.field) !== undefined) {
    return null;
  }
  const reference = `${columnName(column.index)}2:${columnName(column.index)}${String(endRow)}`;
  if (column.field.min !== undefined && column.field.max !== undefined) {
    return `<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Invalid number" error="Enter a number inside the authored range." sqref="${reference}"><formula1>${String(column.field.min)}</formula1><formula2>${String(column.field.max)}</formula2></dataValidation>`;
  }
  if (column.field.min !== undefined) {
    return `<dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="Invalid number" error="Enter a number at or above the authored minimum." sqref="${reference}"><formula1>${String(column.field.min)}</formula1></dataValidation>`;
  }
  if (column.field.max !== undefined) {
    return `<dataValidation type="decimal" operator="lessThanOrEqual" allowBlank="1" showErrorMessage="1" errorTitle="Invalid number" error="Enter a number at or below the authored maximum." sqref="${reference}"><formula1>${String(column.field.max)}</formula1></dataValidation>`;
  }
  return null;
}

function workbookXml(choices: readonly ChoiceColumn[]): string {
  const names = choices
    .map((choice, index) => {
      const letter = columnName(index);
      return `<definedName name="${choice.name}">'_choices'!$${letter}$1:$${letter}$${String(choice.values.length)}</definedName>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="_choices" sheetId="2" state="veryHidden" r:id="rId2"/></sheets>${names === '' ? '' : `<definedNames>${names}</definedNames>`}</workbook>`;
}

function dataSheetXml(
  columns: readonly Column[],
  rows: readonly ListItem[],
  choices: readonly ChoiceColumn[],
  endRow: number,
): string {
  const rtl = columns.some((column) => /[\u0590-\u08ff]/u.test(column.header));
  const columnDefs = columns
    .map(
      (column) =>
        `<col min="${String(column.index + 1)}" max="${String(column.index + 1)}" width="${String(columnWidth(column, rows))}" customWidth="1"/>`,
    )
    .join('');
  const header = columns
    .map((column) => inlineCell(`${columnName(column.index)}1`, column.header, 1))
    .join('');
  const body = rows
    .map((row, rowIndex) => {
      const cells = columns
        .map((column) =>
          bodyCell(`${columnName(column.index)}${String(rowIndex + 2)}`, row, column.field),
        )
        .join('');
      return `<row r="${String(rowIndex + 2)}" ht="22" customHeight="1">${cells}</row>`;
    })
    .join('');
  const validations = [
    ...choices.map((choice) => {
      const letter = columnName(choice.column.index);
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Invalid value" error="Choose a value from the list." sqref="${letter}2:${letter}${String(endRow)}"><formula1>${choice.name}</formula1></dataValidation>`;
    }),
    ...columns.flatMap((column) => {
      const validation = numberValidation(column, endRow);
      return validation === null ? [] : [validation];
    }),
  ];
  const lastColumn = columnName(Math.max(0, columns.length - 1));
  const lastDataRow = Math.max(1, rows.length + 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columnDefs}</cols><sheetData><row r="1" ht="26" customHeight="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${lastColumn}${String(lastDataRow)}"/>${validations.length === 0 ? '' : `<dataValidations count="${String(validations.length)}">${validations.join('')}</dataValidations>`}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

function choicesSheetXml(choices: readonly ChoiceColumn[]): string {
  const rowCount = Math.max(1, ...choices.map((choice) => choice.values.length));
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const cells = choices.flatMap((choice, columnIndex) => {
      const value = choice.values[rowIndex];
      if (value === undefined) return [];
      const reference = `${columnName(columnIndex)}${String(rowIndex + 1)}`;
      return [
        typeof value === 'number'
          ? numberCell(reference, value, 0)
          : inlineCell(reference, value, 0),
      ];
    });
    return `<row r="${String(rowIndex + 1)}">${cells.join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E6E73"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD8DEE9"/></left><right style="thin"><color rgb="FFD8DEE9"/></right><top style="thin"><color rgb="FFD8DEE9"/></top><bottom style="thin"><color rgb="FFD8DEE9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Build an Excel workbook whose dropdowns/ranges come from the authored Repeater row schema. */
export async function buildStructuredRowsXlsx(
  options: StructuredRowsXlsxOptions,
): Promise<Uint8Array> {
  if (options.fields.length === 0) {
    throw new Error('This list has no Repeater column schema for an Excel sample.');
  }
  const columns = columnsFor(options.fields);
  const rows =
    options.rows.length > 0
      ? options.rows
      : [
          Object.fromEntries([
            ['id', 'row-1'],
            ...options.fields.map((field) => [field.id, defaultValue(field)] as const),
          ]) as ListItem,
        ];
  const choices = columns.flatMap((column) => {
    const values = choicesFor(column.field);
    return values === undefined || values.length === 0
      ? []
      : [{ column, values, name: `_cg_choice_${String(column.index + 1)}` }];
  });
  const editableRows = Math.max(200, options.editableRows ?? 0, rows.length);
  const files = new Map<string, Uint8Array>();
  const add = (path: string, content: string): void => {
    files.set(path, encoder.encode(content));
  };
  add(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  );
  add(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add('xl/workbook.xml', workbookXml(choices));
  add(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  add('xl/styles.xml', stylesXml);
  add('xl/worksheets/sheet1.xml', dataSheetXml(columns, rows, choices, editableRows + 1));
  add('xl/worksheets/sheet2.xml', choicesSheetXml(choices));
  return writeZip(files);
}

function unxml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u').exec(tag);
  return match === null ? undefined : unxml(match[1] ?? '');
}

function textRuns(xmlText: string): string {
  return [...xmlText.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/gu)]
    .map((match) => unxml(match[1] ?? ''))
    .join('');
}

function sharedStrings(files: ReadonlyMap<string, Uint8Array>): readonly string[] {
  const bytes = files.get('xl/sharedStrings.xml');
  if (bytes === undefined) return [];
  const source = decoder.decode(bytes);
  return [...source.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/gu)].map((match) =>
    textRuns(match[1] ?? ''),
  );
}

function worksheetPath(files: ReadonlyMap<string, Uint8Array>): string {
  const workbookBytes = files.get('xl/workbook.xml');
  const relationBytes = files.get('xl/_rels/workbook.xml.rels');
  if (workbookBytes === undefined || relationBytes === undefined) {
    throw new Error('Excel structure: the workbook is missing its sheet index.');
  }
  const workbook = decoder.decode(workbookBytes);
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/gu)].map((match) => {
    const tag = match[1] ?? '';
    return {
      name: attribute(tag, 'name') ?? '',
      relationId: attribute(tag, '(?:r:)?id') ?? attribute(tag, 'id') ?? '',
      state: attribute(tag, 'state'),
    };
  });
  const sheet =
    sheets.find((candidate) => candidate.name.toLocaleLowerCase() === 'data') ??
    sheets.find((candidate) => candidate.state !== 'hidden' && candidate.state !== 'veryHidden');
  if (sheet === undefined || sheet.relationId === '') {
    throw new Error('Excel structure: the workbook has no visible Data sheet.');
  }
  const relationships = decoder.decode(relationBytes);
  const relation = [...relationships.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/gu)]
    .map((match) => match[1] ?? '')
    .find((tag) => attribute(tag, 'Id') === sheet.relationId);
  const target = relation === undefined ? undefined : attribute(relation, 'Target');
  if (target === undefined || target === '') {
    throw new Error('Excel structure: the Data sheet cannot be resolved.');
  }
  const normalized = target.replace(/\\/g, '/').replace(/^\//, '');
  const path = normalized.startsWith('xl/') ? normalized : `xl/${normalized}`;
  if (!files.has(path)) {
    throw new Error('Excel structure: the Data sheet is missing from the workbook.');
  }
  return path;
}

function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/iu.exec(reference)?.[0]?.toLocaleUpperCase() ?? '';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function worksheetRows(
  worksheet: string,
  strings: readonly string[],
): readonly (readonly (string | number | boolean)[])[] {
  const rows: (string | number | boolean)[][] = [];
  for (const rowMatch of worksheet.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/gu)) {
    const row: (string | number | boolean)[] = [];
    let fallbackColumn = 0;
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(
      /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/gu,
    )) {
      const tag = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const reference = attribute(tag, 'r');
      const index = reference === undefined ? fallbackColumn : columnIndex(reference);
      fallbackColumn = index + 1;
      const type = attribute(tag, 't');
      const raw = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/u.exec(body)?.[1];
      let value: string | number | boolean = '';
      if (type === 'inlineStr') value = textRuns(body);
      else if (type === 's') value = strings[Number(raw)] ?? '';
      else if (type === 'b') value = raw === '1';
      else if (type === 'str' || type === 'e') value = unxml(raw ?? '');
      else if (raw !== undefined && raw !== '') {
        const numeric = Number(raw);
        value = Number.isFinite(numeric) ? numeric : unxml(raw);
      }
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}

function csvValue(value: string | number | boolean | undefined): string {
  const raw = value === undefined ? '' : String(value);
  return /[",\r\n]/u.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/**
 * Read the visible `Data` sheet of a normal Excel workbook and return the same UTF-8 CSV contract
 * used by Designer and CG Control. Supports inline/shared strings, numbers and booleans.
 */
export async function structuredRowsXlsxToCsv(bytes: Uint8Array): Promise<string> {
  let files: Map<string, Uint8Array>;
  try {
    files = await readZip(bytes);
  } catch {
    throw new Error(
      'Wrong file or damaged workbook: the selected file is not a readable .xlsx workbook.',
    );
  }
  const path = worksheetPath(files);
  const worksheet = decoder.decode(files.get(path));
  const rows = worksheetRows(worksheet, sharedStrings(files));
  if (rows.length === 0) {
    throw new Error('Excel structure: the workbook Data sheet is empty.');
  }
  const width = Math.max(...rows.map((row) => row.length));
  return `\uFEFF${rows
    .map((row) => Array.from({ length: width }, (_, index) => csvValue(row[index])).join(','))
    .join('\r\n')}\r\n`;
}
