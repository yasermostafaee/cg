import { describe, expect, it } from 'vitest';
import {
  formatNumberChoicesInput,
  parseNumberChoicesInput,
  suggestNumberChoiceValue,
  validateNumberChoiceRows,
} from '../src/renderer/features/inspector/number-choice-aliases.js';

describe('numeric choice aliases', () => {
  it('round-trips arbitrary numbers and optional Persian aliases', () => {
    const parsed = parseNumberChoicesInput('۰ = بارانی، 1 = آفتابی, 5');
    expect(parsed).toEqual({
      ok: true,
      values: [0, 1, 5],
      labels: { '0': 'بارانی', '1': 'آفتابی' },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(
      formatNumberChoicesInput({
        allowedValues: parsed.values,
        allowedValueLabels: parsed.labels,
      }),
    ).toBe('0 = بارانی, 1 = آفتابی, 5');
  });

  it('rejects duplicate numbers and aliases', () => {
    expect(parseNumberChoicesInput('0 = Rain, 0 = Sun')).toMatchObject({ ok: false });
    expect(parseNumberChoicesInput('0 = Rain, 1 = rain')).toMatchObject({ ok: false });
  });

  it('validates modal rows and trims optional aliases', () => {
    expect(
      validateNumberChoiceRows([
        { value: '۰', alias: ' alias1 ' },
        { value: '1', alias: '' },
      ]),
    ).toEqual({ ok: true, values: [0, 1], labels: { '0': 'alias1' } });
  });

  it('continues a numeric progression when a new row is added', () => {
    expect(
      suggestNumberChoiceValue([
        { value: '10', alias: '' },
        { value: '20', alias: '' },
        { value: '30', alias: '' },
      ]),
    ).toBe('40');
    expect(
      suggestNumberChoiceValue([
        { value: '30', alias: '' },
        { value: '20', alias: '' },
        { value: '10', alias: '' },
      ]),
    ).toBe('0');
    expect(
      suggestNumberChoiceValue([
        { value: '10', alias: '' },
        { value: '20', alias: '' },
        { value: '50', alias: '' },
      ]),
    ).toBe('51');
  });

  it('reports the exact modal row with invalid or duplicate data', () => {
    expect(validateNumberChoiceRows([{ value: '', alias: '' }])).toEqual({
      ok: false,
      error: 'Choice 1: enter a valid number.',
    });
    expect(
      validateNumberChoiceRows([
        { value: '0', alias: 'alias1' },
        { value: 'text', alias: '' },
      ]),
    ).toEqual({ ok: false, error: 'Choice 2: enter a valid number.' });
    expect(
      validateNumberChoiceRows([
        { value: '0', alias: 'alias1' },
        { value: '۰', alias: 'alias2' },
      ]),
    ).toEqual({ ok: false, error: 'Choice 2 repeats value 0.' });
    expect(
      validateNumberChoiceRows([
        { value: '0', alias: 'alias1' },
        { value: '1', alias: 'Alias1' },
      ]),
    ).toEqual({ ok: false, error: 'Choice 2 repeats alias “Alias1”.' });
  });
});
