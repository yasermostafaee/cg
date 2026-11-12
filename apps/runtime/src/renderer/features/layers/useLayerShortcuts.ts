import { useEffect, useMemo } from 'react';
import {
  LAYER_SHORTCUT_VERBS,
  LAYER_SPACE_SHORTCUT,
  type LayerShortcutBindings,
} from '@cg/shared-ipc';
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
): boolean {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    isEditing(event.target) ||
    isEditing(root.activeElement) ||
    root.querySelector('[aria-modal="true"], dialog[open], [role="menu"]') !== null
  ) {
    return false;
  }
  const chord = layerShortcutChord(event);
  if (chord === null) return false;

  for (const [layer, shortcuts] of Object.entries(bindings)) {
    const verb = LAYER_SHORTCUT_VERBS.find((action) => shortcuts[action] === chord);
    if (verb === undefined) continue;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      `[data-shortcut-row="${String(channel)}:${layer}"] [data-shortcut-verbs] > button[data-verb-tone="${verb}"]`,
    );
    const button = buttons[0];
    if (buttons.length !== 1 || button === undefined || button.disabled) return false;

    event.preventDefault();
    // Invoke the row button so its in-flight guard, confirmation and refusal stay shared.
    button.click();
    return true;
  }
  return false;
}

export function useLayerShortcuts(): void {
  const { bank, canOperateSelected } = useSelectedChannel();
  const capabilities = useAuthCapabilities();
  const supportsNext = capabilities?.fixedLayerNextShortcut === true;
  const supportsSpace = capabilities?.fixedLayerSpaceShortcut === true;
  const bindings = useMemo(
    () =>
      bank === null || !canOperateSelected
        ? null
        : effectiveLayerShortcutBindings(bank, supportsNext, supportsSpace),
    [bank, canOperateSelected, supportsNext, supportsSpace],
  );
  useLayerAltF4(
    bindings !== null &&
      Object.values(bindings).some((row) => Object.values(row).includes('Alt+F4')),
  );
  const channel = bank?.channel;
  useEffect(() => {
    if (bindings === null || channel === undefined) return;
    let spaceHandled = false;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== LAYER_SPACE_SHORTCUT)
        dispatchLayerShortcut(event, channel, bindings, document);
    };
    // Space can activate the focused button or select the focused row. Intercept only if the
    // assigned action is available, and consume that press through key-up.
    const onSpaceDown = (event: KeyboardEvent): void => {
      if (event.code !== LAYER_SPACE_SHORTCUT) return;
      if (!event.repeat) spaceHandled = dispatchLayerShortcut(event, channel, bindings, document);
      if (!spaceHandled) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onSpaceUp = (event: KeyboardEvent): void => {
      if (event.code !== LAYER_SPACE_SHORTCUT || !spaceHandled) return;
      spaceHandled = false;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onSpaceDown, true);
    document.addEventListener('keyup', onSpaceUp, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onSpaceDown, true);
      document.removeEventListener('keyup', onSpaceUp, true);
    };
  }, [bindings, channel]);
}
