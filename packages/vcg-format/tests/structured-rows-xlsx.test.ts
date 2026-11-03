import { describe, expect, it } from 'vitest';
import { fileSourceContentToFieldValue, type ListItemField } from '@cg/shared-schema';
import {
  buildStructuredRowsXlsx,
  decodeStructuredText,
  structuredRowsXlsxToCsv,
} from '../src/structured-rows-xlsx.js';
import { readZip } from '../src/zip.js';

const decoder = new TextDecoder();

describe('buildStructuredRowsXlsx', () => {
  it('decodes Excel CSV text saved as UTF-16LE', () => {
    const text = 'City;Weather\r\nتهران;بارانی';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      bytes[2 + index * 2] = code & 0xff;
      bytes[3 + index * 2] = code >> 8;
    }
    expect(decodeStructuredText(bytes)).toBe(text);
  });

  it('explains unsupported CSV text encoding', () => {
    expect(() => decodeStructuredText(Uint8Array.from([0xff, 0xff, 0xff]))).toThrow(
      /encoding.*UTF-8.*UTF-16/i,
    );
  });

  it('distinguishes a wrong or damaged workbook from row-value errors', async () => {
    await expect(structuredRowsXlsxToCsv(Uint8Array.from([1, 2, 3]))).rejects.toThrow(
      /wrong file or damaged workbook/i,
    );
  });

  it('writes current values and schema-derived dropdown validation', async () => {
    const fields: ListItemField[] = [
      { id: 'city', type: 'text', label: 'نام شهر', default: '', required: false },
      {
        id: 'temperature',
        type: 'number',
        label: 'دمای شهر',
        default: 0,
        min: -50,
        max: 60,
        required: false,
      },
      {
        id: 'weather',
        type: 'number',
        label: 'نوع آب و هوا',
        default: 0,
        allowedValues: [0, 2, 5],
        allowedValueLabels: { '0': 'بارانی', '2': 'آفتابی', '5': 'ابری' },
        required: false,
      },
    ];
    const bytes = await buildStructuredRowsXlsx({
      fields,
      rows: [{ id: 'row-1', city: 'تهران', temperature: 20, weather: 2 }],
      editableRows: 40,
    });
    const files = await readZip(bytes);
    const data = decoder.decode(files.get('xl/worksheets/sheet1.xml'));
    const choices = decoder.decode(files.get('xl/worksheets/sheet2.xml'));
    const workbook = decoder.decode(files.get('xl/workbook.xml'));

    expect(data).toContain('rightToLeft="1"');
    expect(data).toContain('تهران');
    expect(data).toContain('type="list"');
    expect(data).toContain('sqref="C2:C201"');
    expect(data).toContain('<formula1>_cg_choice_3</formula1>');
    expect(data).toContain('type="decimal" operator="between"');
    expect(data).toContain('آفتابی');
    expect(choices).toContain('بارانی');
    expect(choices).toContain('آفتابی');
    expect(choices).toContain('ابری');
    expect(choices).not.toContain('<v>2</v>');
    expect(workbook).toContain('state="veryHidden"');
    expect(workbook).toContain("'_choices'!$A$1:$A$3");

    const importedCsv = await structuredRowsXlsxToCsv(bytes);
    expect(importedCsv).toContain('تهران,20,آفتابی');
    expect(
      fileSourceContentToFieldValue(importedCsv, 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: fields,
      }),
    ).toEqual([{ id: 'file-1', city: 'تهران', temperature: 20, weather: 2 }]);
  });
});
