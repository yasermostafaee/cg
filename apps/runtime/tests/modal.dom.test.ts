// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../src/renderer/ui/Modal.js';
import { Button } from '../src/renderer/ui/Button.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * The modal primitive that replaced `window.confirm` / `window.prompt`.
 *
 * What matters in a playout console: it is the app's own surface (so it can carry the
 * consequence in the app's language), Escape and the backdrop CANCEL rather than confirm,
 * and focus cannot escape onto an on-air button sitting behind the scrim.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

async function renderModal(onClose: () => void): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          Modal,
          {
            title: 'Remove all items?',
            onClose,
            footer: createElement(Button, {
              variant: 'ghost',
              onClick: onClose,
              key: 'cancel',
              children: 'Cancel',
            }),
          },
          'This clears anything on air.',
        ),
      ),
    );
    await Promise.resolve();
  });
}

describe('Modal', () => {
  it('is a real dialog in the app, portalled out of the panel', async () => {
    await renderModal(() => undefined);

    const dialog = openDialog();
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Remove all items?');
    expect(dialog?.textContent).toContain('This clears anything on air.');
    // Portalled to the body — NOT nested inside the calling panel's container.
    expect(container?.contains(dialog ?? null)).toBe(false);
  });

  it('Escape cancels — the safe outcome, never the destructive one', async () => {
    const onClose = vi.fn();
    await renderModal(onClose);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a backdrop click cancels, but a click inside the dialog does not', async () => {
    const onClose = vi.fn();
    await renderModal(onClose);

    await act(async () => {
      openDialog()?.click();
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();

    const scrim = document.querySelector<HTMLElement>('[role="presentation"]');
    await act(async () => {
      scrim?.click();
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog on open, so the keyboard cannot drive what is behind it', async () => {
    await renderModal(() => undefined);

    const focused = document.activeElement;
    expect(focused?.tagName).toBe('BUTTON');
    expect(openDialog()?.contains(focused)).toBe(true);
  });
});
