// @vitest-environment jsdom
import type { LayerShortcutBindings } from '@cg/shared-ipc';
import { expect, it, vi } from 'vitest';
import { dispatchLayerShortcut } from '../src/renderer/features/layers/useLayerShortcuts.js';

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
