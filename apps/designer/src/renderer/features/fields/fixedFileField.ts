/**
 * A fixed, locked file still needs a runtime field/binding internally, but the author should not
 * have to invent a Data key for something no operator can type. This reserved id keeps that wire
 * detail out of the Designer's Variables contract while preserving the existing runtime protocol.
 */
const PREFIX = '__fixed_file__';

export function fixedFileFieldId(elementId: string): string {
  return `${PREFIX}${elementId}`;
}

export function isFixedFileFieldId(fieldId: string): boolean {
  return fieldId.startsWith(PREFIX);
}
