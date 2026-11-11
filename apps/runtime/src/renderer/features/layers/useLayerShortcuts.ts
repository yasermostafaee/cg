import { useEffect } from 'react';
import type { FixedLayerBank, LayerShortcutVerb } from '@cg/shared-ipc';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import { layerShortcutChord } from '../fixedLayers/layer-shortcuts.js';

const verbs = ['play', 'stop', 'clear'] as const satisfies readonly LayerShortcutVerb[];
const editor = 'input, textarea, select, [role="textbox"], [role="combobox"], [role="spinbutton"]';

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest(editor) !== null)
  );
}

export function dispatchLayerShortcut(
  event: KeyboardEvent,
  bank: Pick<FixedLayerBank, 'channel' | 'shortcuts'>,
  root: Document,
): void {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    isEditing(event.target) ||
    isEditing(root.activeElement) ||
    root.querySelector('[aria-modal="true"], dialog[open], [role="menu"]') !== null
  ) {
    return;
  }
  const chord = layerShortcutChord(event);
  if (chord === null || bank.shortcuts === undefined) return;

  for (const [layer, shortcuts] of Object.entries(bank.shortcuts)) {
    const verb = verbs.find((action) => shortcuts[action] === chord);
    if (verb === undefined) continue;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      `[data-shortcut-row="${String(bank.channel)}:${layer}"] [data-verb-block] > button[data-verb-tone="${verb}"]`,
    );
    const button = buttons[0];
    if (buttons.length !== 1 || button === undefined || button.disabled) return;

    event.preventDefault();
    // Invoke the row button so its in-flight guard, confirmation and refusal stay shared.
    button.click();
    return;
  }
}

export function useLayerShortcuts(): void {
  const { bank, canOperateSelected } = useSelectedChannel();
  useEffect(() => {
    if (bank?.shortcuts === undefined || !canOperateSelected) return;
    const onKeyDown = (event: KeyboardEvent): void => dispatchLayerShortcut(event, bank, document);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bank, canOperateSelected]);
}
