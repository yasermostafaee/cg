import type { DynamicField } from '@cg/shared-schema';

export type FieldKind = DynamicField['type'];

export const FIELD_KINDS: readonly FieldKind[] = [
  'text',
  'multiline',
  'number',
  'color',
  'boolean',
  'image',
  'select',
] as const;

/**
 * Schema-valid defaults for each field kind. Switching kinds drops
 * the old kind's params entirely.
 */
export function defaultField(id: string, kind: FieldKind): DynamicField {
  const base = { id, label: id, required: true } as const;
  switch (kind) {
    case 'text':
      return { ...base, type: 'text', default: '' };
    case 'multiline':
      return { ...base, type: 'multiline', default: '' };
    case 'number':
      return { ...base, type: 'number', default: 0 };
    case 'color':
      return { ...base, type: 'color', default: '#FFFFFF' };
    case 'boolean':
      return { ...base, type: 'boolean', default: false };
    case 'image':
      return { ...base, type: 'image', accept: ['png', 'jpg', 'webp'] };
    case 'select':
      return {
        ...base,
        type: 'select',
        default: 'a',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      };
  }
}
