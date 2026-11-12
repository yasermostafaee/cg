import { useEffect, useMemo } from 'react';
import { LAYER_SHORTCUT_VERBS, type LayerShortcutBindings } from '@cg/shared-ipc';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { useLayerAltF4 } from '../fixedLayers/useLayerAltF4.js';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import {
  effectiveLayerShortcutBindings,
  layerShortcutChord,
} from '../fixedLayers/layer-shortcuts.js';

const editor = 'input, textarea, select, [role="textbox"], [role="combobox"], [role="spinbutton"]';

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest(editor) !== null)
  );
}

export function dispatchLayerShortcut(
  event: KeyboardEvent,
  channel: number,
  bindings: LayerShortcutBindings,
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
  if (chord === null) return;

  for (const [layer, shortcuts] of Object.entries(bindings)) {
    const verb = LAYER_SHORTCUT_VERBS.find((action) => shortcuts[action] === chord);
    if (verb === undefined) continue;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      `[data-shortcut-row="${String(channel)}:${layer}"] [data-shortcut-verbs] > button[data-verb-tone="${verb}"]`,
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
  const supportsNext = useAuthCapabilities()?.fixedLayerNextShortcut === true;
  const bindings = useMemo(
    () =>
      bank === null || !canOperateSelected
        ? null
        : effectiveLayerShortcutBindings(bank, supportsNext),
    [bank, canOperateSelected, supportsNext],
  );
  useLayerAltF4(
    bindings !== null &&
      Object.values(bindings).some((row) => Object.values(row).includes('Alt+F4')),
  );
  const channel = bank?.channel;
  useEffect(() => {
    if (bindings === null || channel === undefined) return;
    const onKeyDown = (event: KeyboardEvent): void =>
      dispatchLayerShortcut(event, channel, bindings, document);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, channel]);
}
