import { LayerShortcutChordSchema } from '@cg/shared-ipc';

export function layerShortcutChord(event: KeyboardEvent): string | null {
  if (event.isComposing || event.getModifierState('AltGraph')) return null;
  const chord = [
    ...(event.ctrlKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    ...(event.metaKey ? ['Meta'] : []),
    event.code,
  ].join('+');
  return LayerShortcutChordSchema.safeParse(chord).success ? chord : null;
}

export function layerShortcutLabel(chord: string): string {
  return chord.replace(/\b(?:Key|Digit)(?=[A-Z0-9])/g, '').replace('Numpad', 'Num ');
}
