// @vitest-environment jsdom
import type { LayerShortcutBindings } from '@cg/shared-ipc';
import { expect, it, vi } from 'vitest';
import { dispatchLayerShortcut } from '../src/renderer/features/layers/useLayerShortcuts.js';
import { panelWindow } from '../src/renderer/ui/PanelDocument.js';

it.each([
  ['Space', { key: ' ', code: 'Space' }],
  ['Alt+Shift+F1', { key: 'F1', code: 'F1', altKey: true, shiftKey: true }],
] as const)('leaves %s to the media picker while its modal is open', (chord, key) => {
  const host = document.createElement('div');
  host.innerHTML = `
    <div data-shortcut-row="1:96">
      <div data-shortcut-verbs><button data-verb-tone="play">PLAY</button></div>
    </div>
    <div role="dialog" aria-modal="true" aria-label="Choose a source">
      <section aria-label="Media preview"></section>
    </div>
  `;
  document.body.append(host);
  try {
    const play = vi.fn();
    host.querySelector('button')?.addEventListener('click', play);
    const bindings: LayerShortcutBindings = { '96': { play: chord } };
    const whileOpen = new KeyboardEvent('keydown', { ...key, cancelable: true });
    expect(dispatchLayerShortcut(whileOpen, 1, bindings, document)).toBe(false);
    expect(whileOpen.defaultPrevented).toBe(false);
    expect(play).not.toHaveBeenCalled();

    host.querySelector('[aria-modal="true"]')?.remove();
    const afterClose = new KeyboardEvent('keydown', { ...key, cancelable: true });
    expect(dispatchLayerShortcut(afterClose, 1, bindings, document)).toBe(true);
    expect(afterClose.defaultPrevented).toBe(true);
    expect(play).toHaveBeenCalledOnce();
  } finally {
    host.remove();
  }
});

it('uses the Layers document across panels and leaves editing and modal keys alone', () => {
  const main = document.createElement('div');
  const pane = document.createElement('iframe');
  const layers = document.createElement('iframe');
  document.body.append(main, pane, layers);
  try {
    const event = pane.contentDocument;
    const layerDocument = layers.contentDocument;
    if (event === null || layerDocument === null) throw new Error('Panel document missing');
    const row = `
      <div data-shortcut-row="1:96">
        <div data-shortcut-verbs><button data-verb-tone="play">PLAY</button></div>
      </div>
    `;
    main.innerHTML = row;
    layerDocument.body.innerHTML = row;
    const stalePlay = vi.fn();
    const livePlay = vi.fn();
    main.querySelector('button')?.addEventListener('click', stalePlay);
    layerDocument.querySelector('button')?.addEventListener('click', livePlay);
    const bindings: LayerShortcutBindings = { '96': { play: 'Space' } };
    const documents = { event, workspace: [document, event, layerDocument] };
    const key = () =>
      new (panelWindow(event).KeyboardEvent)('keydown', {
        key: ' ',
        code: 'Space',
        cancelable: true,
      });

    const input = event.createElement('input');
    event.body.append(input);
    input.focus();
    expect(dispatchLayerShortcut(key(), 1, bindings, layerDocument, documents)).toBe(false);
    input.remove();

    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    main.append(modal);
    expect(dispatchLayerShortcut(key(), 1, bindings, layerDocument, documents)).toBe(false);
    modal.remove();

    const allowed = key();
    expect(dispatchLayerShortcut(allowed, 1, bindings, layerDocument, documents)).toBe(true);
    expect(allowed.defaultPrevented).toBe(true);
    expect(livePlay).toHaveBeenCalledOnce();
    expect(stalePlay).not.toHaveBeenCalled();
  } finally {
    main.remove();
    pane.remove();
    layers.remove();
  }
});
