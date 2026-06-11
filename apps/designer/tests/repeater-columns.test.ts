import { describe, expect, it } from 'vitest';
import type { DynamicField } from '@cg/shared-schema';
import { columnsForFields } from '../src/renderer/features/fields/repeater-columns.js';

describe('repeater editor columns (D-030)', () => {
  it('derives one column per child field — labels fall back to ids, numbers flagged', () => {
    const fields: DynamicField[] = [
      { id: 'name', label: 'Team name', required: true, type: 'text', default: '' },
      { id: 'score', label: '', required: false, type: 'number', default: 0 },
      { id: 'note', label: 'Note', required: false, type: 'multiline', default: '' },
    ];
    expect(columnsForFields(fields)).toEqual([
      { key: 'name', label: 'Team name' },
      { key: 'score', label: 'score', kind: 'number' },
      { key: 'note', label: 'Note' },
    ]);
  });

  it('a field-less child yields no columns (the editor falls back to text rows)', () => {
    expect(columnsForFields(undefined)).toEqual([]);
    expect(columnsForFields([])).toEqual([]);
  });
});
