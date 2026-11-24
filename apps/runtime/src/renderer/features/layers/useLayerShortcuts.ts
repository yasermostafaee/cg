import { useEffect, useMemo } from 'react';
import {
  LAYER_SHORTCUT_VERBS,
  LAYER_SPACE_SHORTCUT,
  type LayerShortcutBindings,
} from '@cg/shared-ipc';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { useLayerAltF4 } from '../fixedLayers/useLayerAltF4.js';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import { panelWindow } from '../../ui/PanelDocument.js';
import {
  effectiveLayerShortcutBindings,
  layerShortcutChord,
} from '../fixedLayers/layer-shortcuts.js';

const editor = 'input, textarea, select, [role="textbox"], [role="combobox"], [role="spinbutton"]';
const overlay = '[aria-modal="true"], dialog[open], [role="menu"]';

function isEditing(target: EventTarget | null, owner: Document): boolean {
  return (
    target instanceof panelWindow(owner).HTMLElement &&
    (target.isContentEditable || target.closest(editor) !== null)
  );
}

interface ShortcutDocuments {
  event: Document;
  workspace: readonly Document[];
}

export function dispatchLayerShortcut(
  event: KeyboardEvent,
  channel: number,
  bindings: LayerShortcutBindings,
  root: Document,
  documents?: ShortcutDocuments,
): boolean {
  const eventDocument = documents?.event ?? root;
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    isEditing(event.target, eventDocument) ||
    isEditing(eventDocument.activeElement, eventDocument) ||
    (documents?.workspace ?? [root]).some((owner) => owner.querySelector(overlay) !== null)
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

/** Read keys in the workspace, but invoke only the canonical layer row's guarded control. */
export function useLayerShortcuts({
  layerDocument = document,
  panelDocuments,
}: {
  layerDocument?: Document | undefined;
  panelDocuments?: readonly Document[] | undefined;
} = {}): void {
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
    const workspace = [...new Set([document, layerDocument, ...(panelDocuments ?? [])])];
    const unsubscribe = workspace.map((owner) =>
      listenForLayerKeys(owner, (event) =>
        dispatchLayerShortcut(event, channel, bindings, layerDocument, {
          event: owner,
          workspace,
        }),
      ),
    );
    return () => {
      for (const stop of unsubscribe) stop();
    };
  }, [bindings, channel, layerDocument, panelDocuments]);
}

function listenForLayerKeys(
  owner: Document,
  dispatch: (event: KeyboardEvent) => boolean,
): () => void {
  let spaceHandled = false;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== LAYER_SPACE_SHORTCUT) dispatch(event);
  };
  // Space can activate the focused button or select the focused row. Intercept only if the
  // assigned action is available, and consume that press through key-up.
  const onSpaceDown = (event: KeyboardEvent): void => {
    if (event.code !== LAYER_SPACE_SHORTCUT) return;
    if (!event.repeat) spaceHandled = dispatch(event);
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
  owner.addEventListener('keydown', onKeyDown);
  owner.addEventListener('keydown', onSpaceDown, true);
  owner.addEventListener('keyup', onSpaceUp, true);
  return () => {
    owner.removeEventListener('keydown', onKeyDown);
    owner.removeEventListener('keydown', onSpaceDown, true);
    owner.removeEventListener('keyup', onSpaceUp, true);
  };
}
