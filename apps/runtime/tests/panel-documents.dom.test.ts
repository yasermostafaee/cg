// @vitest-environment jsdom
import { createElement, Fragment, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Modal } from '../src/renderer/ui/Modal.js';
import { PanelDocumentProvider, panelWindow } from '../src/renderer/ui/PanelDocument.js';
import { Popover } from '../src/renderer/ui/Popover.js';
import { Tooltip } from '../src/renderer/ui/Tooltip.js';

let root: Root;
let pane: Document;

beforeEach(() => {
  const main = document.createElement('div');
  const frame = document.createElement('iframe');
  document.body.append(main, frame);
  const child = frame.contentDocument;
  if (child === null) throw new Error('Panel document was not created');
  pane = child;
  root = createRoot(main);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

function modal(title: string, onClose: () => void): JSX.Element {
  return createElement(Modal, {
    title,
    ariaLabel: title,
    onClose,
    footer: createElement('button', { type: 'button' }, title + ' action'),
  });
}

function press(owner: Document, key: string, shiftKey = false): KeyboardEvent {
  const event = new (panelWindow(owner).KeyboardEvent)('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    owner.activeElement?.dispatchEvent(event);
  });
  return event;
}

it('routes modal Escape and Tab independently in each document', async () => {
  const closeMain = vi.fn();
  const closePane = vi.fn();
  await act(async () => {
    root.render(
      createElement(
        Fragment,
        null,
        modal('Main', closeMain),
        createPortal(
          createElement(PanelDocumentProvider, {
            document: pane,
            children: modal('Panel', closePane),
          }),
          pane.body,
        ),
      ),
    );
  });

  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Main');
  expect(pane.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Panel');
  const paneButtons = pane.querySelectorAll<HTMLButtonElement>('[role="dialog"] button');
  expect(paneButtons).toHaveLength(2);
  paneButtons[1]?.focus();
  expect(press(pane, 'Tab').defaultPrevented).toBe(true);
  expect(pane.activeElement).toBe(paneButtons[0]);

  document.querySelector<HTMLButtonElement>('[role="dialog"] button')?.focus();
  press(document, 'Escape');
  expect(closeMain).toHaveBeenCalledTimes(1);
  expect(closePane).not.toHaveBeenCalled();
  paneButtons[0]?.focus();
  press(pane, 'Escape');
  expect(closeMain).toHaveBeenCalledTimes(1);
  expect(closePane).toHaveBeenCalledTimes(1);
});

function PaneOverlays(): JSX.Element {
  const [open, setOpen] = useState<'modal' | 'popover' | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  return createElement(
    Fragment,
    null,
    createElement('button', { type: 'button', onClick: () => setOpen('modal') }, 'Open modal'),
    createElement(
      'button',
      { ref: anchor, type: 'button', onClick: () => setOpen('popover'), title: 'Pane tip' },
      'Open popover',
    ),
    open === 'modal' && modal('Docked modal', () => setOpen(null)),
    open === 'popover' &&
      createElement(Popover, {
        anchor,
        onClose: () => setOpen(null),
        id: 'pane-popover',
        'aria-label': 'Pane popover',
        minWidth: 200,
        maxHeight: 300,
        children: createElement('button', { type: 'button' }, 'Popover action'),
      }),
    createElement(Tooltip),
  );
}

it('uses the main window for a docked modal and keeps pane popovers and tooltips local', async () => {
  vi.useFakeTimers();
  await act(async () => {
    root.render(
      createPortal(
        createElement(PanelDocumentProvider, {
          document: pane,
          modalDocument: document,
          children: createElement(PaneOverlays),
        }),
        pane.body,
      ),
    );
  });
  const [openModal, openPopover] = pane.querySelectorAll<HTMLButtonElement>('button');
  expect(openModal).toBeDefined();
  expect(openPopover).toBeDefined();
  await act(async () => {
    openModal?.focus();
    openModal?.click();
  });
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
    'Docked modal',
  );
  expect(pane.querySelector('[role="dialog"]')).toBeNull();
  press(document, 'Escape');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(pane.activeElement).toBe(openModal);

  await act(async () => {
    openPopover?.dispatchEvent(new (panelWindow(pane).Event)('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(450);
  });
  expect(pane.querySelector('[role="tooltip"]')?.textContent).toBe('Pane tip');
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => openPopover?.click());
  expect(pane.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Pane popover');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  press(pane, 'Escape');
  expect(pane.querySelector('[role="dialog"]')).toBeNull();
});
