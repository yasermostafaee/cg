import {
  fixedBankEnd,
  layerShortcutBindings,
  LayerShortcutChordSchema,
  type FixedLayerBank,
  type LayerShortcutBindings,
} from '@cg/shared-ipc';

export function effectiveLayerShortcutBindings(
  bank: FixedLayerBank,
  supportsNext: boolean,
): LayerShortcutBindings {
  if (!supportsNext || bank.shortcuts !== undefined || bank.nextShortcuts !== undefined) {
    return layerShortcutBindings(bank);
  }
  const defaults: LayerShortcutBindings = {};
  for (let layer = Math.min(fixedBankEnd(bank), 99); layer >= Math.max(bank.start, 88); layer--) {
    const key = `F${String(100 - layer)}`;
    defaults[layer] = { play: key, stop: `Ctrl+${key}`, clear: `Shift+${key}`, next: `Alt+${key}` };
  }
  return defaults;
}

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
