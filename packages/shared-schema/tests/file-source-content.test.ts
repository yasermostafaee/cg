import { describe, expect, it } from 'vitest';
import {
  fileSourceContentToFieldValue,
  parseFileDelimiter,
  splitFileSourceContent,
} from '../src/index.js';

describe('file-source content shared by Designer and Runtime', () => {
  it('resolves printable newline/tab escapes and leaves custom strings literal', () => {
    expect(parseFileDelimiter('\\n')).toBe('\n');
    expect(parseFileDelimiter('\\t')).toBe('\t');
    expect(parseFileDelimiter('::')).toBe('::');
  });

  it('trims split list rows, omits empties and assigns stable ids', () => {
    expect(splitFileSourceContent(' one | | two ', '|')).toEqual(['one', 'two']);
    expect(
      fileSourceContentToFieldValue(' one | | two ', 'list', {
        split: true,
        delimiter: '|',
      }),
    ).toEqual([
      { id: 'file-1', text: 'one' },
      { id: 'file-2', text: 'two' },
    ]);
  });

  it('keeps scalar bytes verbatim and an unsplit list as one item', () => {
    expect(
      fileSourceContentToFieldValue('  خبر\n', 'multiline', {
        split: true,
        delimiter: '\\n',
      }),
    ).toBe('  خبر\n');
    expect(
      fileSourceContentToFieldValue('one|two', 'list', { split: false, delimiter: '|' }),
    ).toEqual([{ id: 'file-1', text: 'one|two' }]);
  });

  it('parses structured JSON rows and canonicalises typed image/number cells', () => {
    expect(
      fileSourceContentToFieldValue('[{"city":"تهران","temperature":18,"icon":"sunny"}]', 'list', {
        split: false,
        delimiter: '',
        format: 'json',
        itemFields: [
          { id: 'city', label: 'City', required: false, type: 'text', default: '' },
          {
            id: 'temperature',
            label: 'Temperature',
            required: false,
            type: 'number',
            default: 0,
          },
          {
            id: 'icon',
            label: 'Icon',
            required: false,
            type: 'image',
            accept: ['png'],
          },
        ],
      }),
    ).toEqual([
      {
        id: 'file-1',
        city: 'تهران',
        temperature: 18,
        icon: { assetId: 'sunny' },
      },
    ]);
  });

  it('parses quoted CSV with a header and reports malformed structured rows', () => {
    expect(
      fileSourceContentToFieldValue('city,temperature,icon\n"تهران, مرکز",21,rain', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: [
          { id: 'city', label: 'City', required: false, type: 'text', default: '' },
          {
            id: 'temperature',
            label: 'Temperature',
            required: false,
            type: 'number',
            default: 0,
          },
          { id: 'icon', label: 'Icon', required: false, type: 'image', accept: ['png'] },
        ],
      }),
    ).toEqual([
      {
        id: 'file-1',
        city: 'تهران, مرکز',
        temperature: 21,
        icon: { assetId: 'rain' },
      },
    ]);
    expect(() =>
      fileSourceContentToFieldValue('{"city":"تهران"}', 'list', {
        split: false,
        delimiter: '',
        format: 'json',
      }),
    ).toThrow(/array of row objects/i);
  });

  it('maps unique labels, fills optional defaults and rejects schema mistakes with row context', () => {
    const fields = [
      { id: 'city', label: 'City name', required: true, type: 'text', default: '' },
      { id: 'temperature', label: 'Temperature', required: false, type: 'number', default: 20 },
    ] as const;
    expect(
      fileSourceContentToFieldValue('City name,Temperature\nTehran,', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: fields,
      }),
    ).toEqual([{ id: 'file-1', city: 'Tehran', temperature: 20 }]);
    expect(() =>
      fileSourceContentToFieldValue('city,temperatur\nTehran,21', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: fields,
      }),
    ).toThrow(/CSV structure:.*temperatur.*expected columns: City name, Temperature/i);
    expect(() =>
      fileSourceContentToFieldValue('[{"temperature":21}]', 'list', {
        split: false,
        delimiter: '',
        format: 'json',
        itemFields: fields,
      }),
    ).toThrow(/Missing value:.*row 1.*City name.*required/i);
  });

  it('rejects structured numeric cells outside their authored choice list', () => {
    const choices = [
      {
        id: 'weather',
        label: 'Weather',
        required: true,
        type: 'number' as const,
        default: 0,
        allowedValues: [0, 2, 5],
      },
    ];
    expect(() =>
      fileSourceContentToFieldValue('Weather\n1', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: choices,
      }),
    ).toThrow(/row 1.*weather.*one of.*0, 2, 5/i);
    expect(
      fileSourceContentToFieldValue('Weather\n2', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: choices,
      }),
    ).toEqual([{ id: 'file-1', weather: 2 }]);
  });

  it('accepts numeric choice aliases from Excel CSV and stores canonical numbers', () => {
    const choices = [
      {
        id: 'weather',
        label: 'Weather',
        required: true,
        type: 'number' as const,
        default: 0,
        allowedValues: [0, 1],
        allowedValueLabels: { '0': 'بارانی', '1': 'آفتابی' },
      },
    ];
    expect(
      fileSourceContentToFieldValue('Weather\nآفتابی', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: choices,
      }),
    ).toEqual([{ id: 'file-1', weather: 1 }]);
    expect(
      fileSourceContentToFieldValue('[{"Weather":"بارانی"}]', 'list', {
        split: false,
        delimiter: '',
        format: 'json',
        itemFields: choices,
      }),
    ).toEqual([{ id: 'file-1', weather: 0 }]);
    expect(() =>
      fileSourceContentToFieldValue('Weather\nبرفی', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: choices,
      }),
    ).toThrow(/invalid value.*sheet row 2.*برفی.*بارانی.*آفتابی/is);
  });

  it('accepts Excel locale CSV separators and an optional sep directive', () => {
    const fields = [
      { id: 'city', label: 'City', required: true, type: 'text' as const, default: '' },
      {
        id: 'temperature',
        label: 'Temperature',
        required: true,
        type: 'number' as const,
        default: 0,
      },
    ];
    for (const content of [
      'City;Temperature\nTehran;20',
      'sep=;\r\nCity;Temperature\r\nTehran;20',
      'City\tTemperature\nTehran\t20',
    ]) {
      expect(
        fileSourceContentToFieldValue(content, 'list', {
          split: false,
          delimiter: '',
          format: 'csv',
          itemFields: fields,
        }),
      ).toEqual([{ id: 'file-1', city: 'Tehran', temperature: 20 }]);
    }
  });

  it('explains a wrong file structure with the actual and expected columns', () => {
    const fields = [
      { id: 'city', label: 'City', required: true, type: 'text' as const, default: '' },
      {
        id: 'temperature',
        label: 'Temperature',
        required: true,
        type: 'number' as const,
        default: 0,
      },
    ];
    expect(() =>
      fileSourceContentToFieldValue('Wrong,Temperature\nTehran,20', 'list', {
        split: false,
        delimiter: '',
        format: 'csv',
        itemFields: fields,
      }),
    ).toThrow(/CSV structure.*Wrong.*Expected columns: City, Temperature/is);
  });
});
