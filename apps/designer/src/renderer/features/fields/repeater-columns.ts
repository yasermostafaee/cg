import type { DynamicField } from '@cg/shared-schema';

/**
 * D-030 — the columned items-editor surface for a repeater: one column per
 * child-composition field. Pure module so the derivation is unit-testable
 * and shared by the inspector section and the preview field form (the same
 * editor both places). The editor renders a number input for numeric child
 * fields and a text input otherwise (the kinds it already distinguishes).
 */
export interface ListItemColumn {
  /** The item key — the child composition's field id. */
  key: string;
  /** Column header / accessible-name part (the field label, else the id). */
  label: string;
  /** Input flavour where the editor distinguishes; defaults to text. */
  kind?: 'text' | 'number';
}

/** Derive the editor columns from a child composition's fields. */
export function columnsForFields(fields: readonly DynamicField[] | undefined): ListItemColumn[] {
  return (fields ?? []).map((f) => ({
    key: f.id,
    label: f.label !== '' ? f.label : f.id,
    ...(f.type === 'number' ? { kind: 'number' as const } : {}),
  }));
}
